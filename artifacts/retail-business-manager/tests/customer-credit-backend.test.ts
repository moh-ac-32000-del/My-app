import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
// Client normalizers are pure; never initialize an actual Auth/native session.
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: false, getFirebaseApp: () => ({}),
  getFirebaseAuth: () => ({ currentUser: null }) }));
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';
import { workspaceBackend, workspaceTestTime } from './fixtures/workspaceBackend';
import { customerOperationCommandHandler } from '../functions/src/customerOperationCommand';
import { buildDailyJournalEvents } from '../services/storage';
import { calculateVisibleCurrencyBalances } from '../services/storage';
import { normalizeTransactionDocument } from '../services/transactionFirestore';
import { normalizePaymentDocument } from '../services/paymentFirestore';
import { projectDailyJournalEvents } from '../services/dailyJournalProjection';

const creditPath = `spaces/s/customerCredits/${createHash('sha256')
  .update(JSON.stringify(['c', 'TRY']))
  .digest('hex')}`;
const settlement = (id = 'pay', amount = 130) => ({
  auth: { uid: 'u' },
  data: {
    spaceId: 's',
    storeId: 'store',
    customerId: 'c',
    currency: 'TRY',
    amount,
    operationId: id,
    transactionId: `cash-${id}`,
    paymentId: `payment-${id}`,
  },
});
const charge = (id = 'charge', amount = 20) => ({
  auth: { uid: 'u' },
  data: {
    action: 'create',
    spaceId: 's',
    storeId: 'store',
    customerId: 'c',
    currency: 'TRY',
    amount,
    operationId: id,
    debtId: `debt-${id}`,
  },
});

describe('customer credit trusted backend integration', () => {
  it('preserves exact remaining precision on a date-only edit from a numeric-mirror client', async () => {
    const backend = workspaceBackend();
    backend.docs['spaces/s/debts/d'].amount = 1;
    backend.docs['spaces/s/debts/d'].amountExact = '1.0000000000000000001';
    await trustedDebtCommandHandler({ auth: { uid: 'u' }, data: { action: 'update', spaceId: 's', storeId: 'store',
      customerId: 'c', debtId: 'd', operationId: 'change-date', currency: 'TRY', amount: 1, dueDate: '2026-11-01' } } as never, backend.runtime);
    expect(backend.docs['spaces/s/debts/d'].amountExact).toBe('1.0000000000000000001');
    expect(backend.docs['spaces/s/operationReceipts/change-date'].previousDebt.amountExact).toBe('1.0000000000000000001');
  });
  it('consumes excess cash on a later charge without recording new cash', async () => {
    const backend = workspaceBackend();
    await settleCustomerDebtHandler(settlement() as never, backend.runtime);
    expect(backend.docs[creditPath].creditExact).toBe('30.00');
    await trustedDebtCommandHandler(charge() as never, backend.runtime);
    expect(backend.docs[creditPath].creditExact).toBe('10.00');
    expect(backend.docs['spaces/s/debts/debt-charge']).toMatchObject({
      amount: 0,
      amountExact: '0.00',
      originalAmount: 20,
      creditAppliedExact: '20.00',
    });
    expect(Object.keys(backend.docs).filter((path) => path.startsWith('spaces/s/transactions/'))).toEqual([
      'spaces/s/transactions/cash-pay',
    ]);
  });

  it('does not reapply either credit creation or consumption on replay', async () => {
    const backend = workspaceBackend();
    await settleCustomerDebtHandler(settlement() as never, backend.runtime);
    await trustedDebtCommandHandler(charge() as never, backend.runtime);
    const writes = backend.writes.length;
    await expect(settleCustomerDebtHandler(settlement() as never, backend.runtime)).resolves.toMatchObject({
      outcome: 'replayed',
    });
    await expect(trustedDebtCommandHandler(charge() as never, backend.runtime)).resolves.toMatchObject({
      outcome: 'replayed',
    });
    expect(backend.writes).toHaveLength(writes);
    expect(backend.docs[creditPath].creditExact).toBe('10.00');
  });

  it('recomputes from committed credit after a simulated transaction conflict', async () => {
    const backend = workspaceBackend();
    await settleCustomerDebtHandler(settlement() as never, backend.runtime);
    backend.retryOnce(() => {
      backend.docs[creditPath].creditExact = '5.00';
      backend.docs[creditPath].revision += 1;
    });
    await trustedDebtCommandHandler(charge() as never, backend.runtime);
    expect(backend.docs[creditPath].creditExact).toBe('0.00');
    expect(backend.docs['spaces/s/debts/debt-charge'].amountExact).toBe('15.00');
    expect(backend.writes.filter((path) => path === 'spaces/s/debts/debt-charge')).toHaveLength(1);
  });

  it('fails closed without financial writes if stored credit is corrupt', async () => {
    const backend = workspaceBackend();
    await settleCustomerDebtHandler(settlement() as never, backend.runtime);
    backend.docs[creditPath].creditExact = '-30.00';
    const before = structuredClone(backend.docs);
    await expect(trustedDebtCommandHandler(charge() as never, backend.runtime)).rejects.toMatchObject({
      code: 'data-loss',
      details: { code: 'CUSTOMER_CREDIT_CORRUPTED' },
    });
    expect(backend.docs).toEqual(before);
  });

  it('checks fresh membership before replaying a previously valid payment', async () => {
    const backend = workspaceBackend();
    await settleCustomerDebtHandler(settlement() as never, backend.runtime);
    backend.docs['spaces/s/members/u'].role = 'viewer';
    const writes = backend.writes.length;
    await expect(settleCustomerDebtHandler(settlement() as never, backend.runtime)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(backend.writes).toHaveLength(writes);
  });
});
describe('customer save read transport only; no accounting shortcuts', () => {
const charge = { auth: { uid: 'u' }, data: { action: 'create', spaceId: 's', storeId: 'store', customerId: 'c',
  debtId: 'new-debt', operationId: 'charge', currency: 'TRY', amount: 20 } };
const settlement = { auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', customerId: 'c',
  operationId: 'pay', currency: 'TRY', amount: 30, transactionId: 'cash', paymentId: 'payment' } };
  it('loads all six initial debt documents in one transaction batch and preserves receipt replay/conflict', async () => {
    const b = workspaceBackend();
    await expect(trustedDebtCommandHandler(charge as never, b.runtime)).resolves.toMatchObject({ outcome: 'created' });
    expect(b.batches).toEqual([['spaces/s', 'spaces/s/members/u', 'spaces/s/storeProfile/profile',
      'spaces/s/customers/c', 'spaces/s/debts/new-debt', 'spaces/s/operationReceipts/charge']]);
    expect(b.reads).toHaveLength(7); // same six documents plus customer-credit state
    expect(b.docs['spaces/s/debts/new-debt']).toMatchObject({ amount: 20, amountExact: '20.00' });
    const before = structuredClone(b.docs), writes = b.writes.length;
    await expect(trustedDebtCommandHandler(charge as never, b.runtime)).resolves.toMatchObject({ outcome: 'replayed' });
    await expect(trustedDebtCommandHandler({ ...charge, data: { ...charge.data, amount: 21 } } as never, b.runtime))
      .rejects.toMatchObject({ code: 'already-exists' });
    expect(b.docs).toEqual(before); expect(b.writes).toHaveLength(writes);
  });
  it('reproduces the reported 30-to-40 payment: 60 remains, original 30 plus adjustment 10 yields cash 40 only', async () => {
    const b = workspaceBackend(); b.docs['spaces/s/debts/d'].originalAmount = 100;
    await settleCustomerDebtHandler(settlement as never, b.runtime);
    await customerOperationCommandHandler({ auth: { uid: 'u' }, data: { action: 'edit', kind: 'payment',
      spaceId: 's', storeId: 'store', customerId: 'c', targetId: 'payment', operationId: 'edit-payment',
      expectedUpdatedAt: workspaceTestTime, expectedRevision: 0, amountExact: '40.00',
      method: 'cash', operationDate: '2026-10-19', note: '' } } as never, b.runtime);
    expect(b.docs['spaces/s/debts/d'].amount).toBe(60);
    const rows = (collection: string) => Object.entries(b.docs).filter(([path]) => path.startsWith(`spaces/s/${collection}/`)).map(([, row]) => row);
    const events = buildDailyJournalEvents('store', rows('transactions') as any, [], rows('payments') as any, [], new Date(workspaceTestTime));
    expect(events.filter(row => row.type === 'settlement').map(row => row.amount)).toEqual([30]);
    expect(events.filter(row => row.type === 'cash_in').map(row => row.amount)).toEqual([10]);
    expect(events.reduce((total, row) => total + (row.type === 'cash_out' ? -row.amount : row.amount), 0)).toBe(40);
  });
  it('batches seven settlement documents while retaining the complete debt query and one atomic cash/payment pair', async () => {
    const b = workspaceBackend();
    await settleCustomerDebtHandler(settlement as never, b.runtime);
    expect(b.batches).toEqual([['spaces/s', 'spaces/s/members/u', 'spaces/s/storeProfile/profile', 'spaces/s/customers/c',
      'spaces/s/operationReceipts/pay', 'spaces/s/transactions/cash', 'spaces/s/payments/payment']]);
    expect(b.reads).toContain('spaces/s/debts');
    expect(b.docs['spaces/s/debts/d'].amount).toBe(70);
    expect(b.docs['spaces/s/transactions/cash']).toMatchObject({ type: 'cash_in', amount: 30, currency: 'TRY' });
    expect(b.docs['spaces/s/payments/payment'].amount).toEqual({ amount: 30, currency: 'TRY' });
    const before = structuredClone(b.docs), writes = b.writes.length;
    await expect(settleCustomerDebtHandler(settlement as never, b.runtime)).resolves.toMatchObject({ outcome: 'replayed' });
    expect(b.docs).toEqual(before); expect(b.writes).toHaveLength(writes);
  });
  it.each(['charge', 'settlement'] as const)('rechecks revoked membership on a transaction conflict for %s', async action => {
    const b = workspaceBackend(); const before = structuredClone(b.docs);
    b.retryOnce(() => { b.docs['spaces/s/members/u'].status = 'removed'; });
    const run = action === 'charge' ? trustedDebtCommandHandler(charge as never, b.runtime) : settleCustomerDebtHandler(settlement as never, b.runtime);
    await expect(run).rejects.toMatchObject({ code: 'permission-denied' });
    expect(b.writes).toHaveLength(0);
    delete before['spaces/s/members/u']; const after = structuredClone(b.docs); delete after['spaces/s/members/u'];
    expect(after).toEqual(before);
  });
});

describe('customer payment correction through actual client normalizers and dashboard projections', () => {
  const request = { auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', customerId: 'c',
    operationId: 'original-pay', currency: 'TRY', amount: 30, transactionId: 'original-cash', paymentId: 'original-payment' } };
  const edit = (revision = 0, amountExact = '40.00', method = 'cash') => ({ auth: { uid: 'u' }, data: {
    action: 'edit', kind: 'payment', spaceId: 's', storeId: 'store', customerId: 'c', targetId: 'original-payment',
    operationId: `edit-${revision}`, expectedUpdatedAt: workspaceTestTime, expectedRevision: revision,
    amountExact, method, operationDate: '2026-09-01', note: 'test correction',
  } });
  function dashboard(b: ReturnType<typeof workspaceBackend>) {
    const records = (collection: string) => Object.entries(b.docs)
      .filter(([path]) => path.startsWith(`spaces/s/${collection}/`));
    const transactions = records('transactions').map(([path, row]) => normalizeTransactionDocument(path.split('/').at(-1)!, row, 's'));
    const payments = records('payments').map(([path, row]) => normalizePaymentDocument(path.split('/').at(-1)!, row, 's'));
    expect(transactions.every(Boolean)).toBe(true); expect(payments.every(Boolean)).toBe(true);
    const events = projectDailyJournalEvents('store', { transactions: transactions as any, payments: payments as any,
      customers: [], debts: [], merchantOperations: [], spaceId: 's' }, [], new Date(workspaceTestTime),
      { date: '2026-10-19', startAt: '2026-10-19T00:00:00.000Z', endAt: '2026-10-20T00:00:00.000Z', timeZone: 'Europe/Istanbul' });
    return { balances: calculateVisibleCurrencyBalances(transactions as any, ['TRY']), events };
  }
  it.each(['cash', 'card', 'bank-transfer'])('keeps original cash linked when editing amount/date/method to %s', async method => {
    const b = workspaceBackend();
    await settleCustomerDebtHandler(request as never, b.runtime);
    await customerOperationCommandHandler(edit(0, '40.00', method) as never, b.runtime);
    const result = dashboard(b);
    expect(result.balances).toEqual([{ currency: 'TRY', amount: 40 }]);
    expect(result.events.filter(row => row.type === 'settlement').map(row => row.amount)).toEqual([30]);
    expect(result.events.filter(row => row.type === 'cash_in').map(row => row.amount)).toEqual([10]);
    expect(b.docs['spaces/s/debts/d'].amount).toBe(60);
  });
  it('posts a new settlement after an edit, then cancels the edited payment without losing the new cash', async () => {
    const b = workspaceBackend();
    await settleCustomerDebtHandler(request as never, b.runtime);
    await customerOperationCommandHandler(edit() as never, b.runtime);
    await settleCustomerDebtHandler({ ...request, data: { ...request.data, operationId: 'new-pay',
      transactionId: 'new-cash', paymentId: 'new-payment', amount: 20 } } as never, b.runtime);
    let result = dashboard(b);
    expect(result.balances).toEqual([{ currency: 'TRY', amount: 60 }]);
    expect(result.events.some(row => row.id === 'settlement:new-payment' && row.amount === 20)).toBe(true);
    expect(b.docs['spaces/s/debts/d'].amount).toBe(40);
    await customerOperationCommandHandler({ auth: { uid: 'u' }, data: { action: 'cancel', kind: 'payment', spaceId: 's',
      storeId: 'store', customerId: 'c', targetId: 'original-payment', operationId: 'cancel-edited',
      expectedUpdatedAt: workspaceTestTime, expectedRevision: 1 } } as never, b.runtime);
    result = dashboard(b);
    expect(result.balances).toEqual([{ currency: 'TRY', amount: 20 }]);
    expect(result.events.some(row => row.type === 'cash_out' && row.amount === 40)).toBe(true);
    expect(result.events.some(row => row.id === 'settlement:new-payment')).toBe(true);
  });
});
