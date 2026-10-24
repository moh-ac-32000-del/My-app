import { describe, expect, it } from 'vitest';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';
import { customerOperationCommandHandler } from '../functions/src/customerOperationCommand';
import { buildDailyJournalEvents } from '../services/storage';
import { workspaceBackend, workspaceTestTime } from './fixtures/workspaceBackend';
const charge = { auth: { uid: 'u' }, data: { action: 'create', spaceId: 's', storeId: 'store', customerId: 'c',
  debtId: 'new-debt', operationId: 'charge', currency: 'TRY', amount: 20 } };
const settlement = { auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', customerId: 'c',
  operationId: 'pay', currency: 'TRY', amount: 30, transactionId: 'cash', paymentId: 'payment' } };
describe('customer save read transport only; no accounting shortcuts', () => {
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
