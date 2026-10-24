import { describe, expect, it } from 'vitest';
import { customerOperationCommandHandler } from '../functions/src/customerOperationCommand';
import { workspaceBackend, workspaceTestTime } from './fixtures/workspaceBackend';
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';
import { createPaymentHandler } from '../functions/src/createPayment';
import { createHash } from 'node:crypto';
const creditKey = `spaces/s/customerCredits/${createHash('sha256').update(JSON.stringify(['c','TRY'])).digest('hex')}`;
const paymentRequest = (action: string, operationId: string, amountExact = '50.00', expectedRevision = 0) => ({
  auth: { uid: 'u' }, data: { action, operationId, kind: 'payment', spaceId: 's', storeId: 'store', customerId: 'c',
    targetId: 'p', expectedUpdatedAt: workspaceTestTime, expectedRevision,
    ...(action === 'edit' ? { amountExact, operationDate: '2026-09-01', note: 'Correct payment', method: 'card' } : {}) },
});
const settlementRequest = { auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', customerId: 'c',
  operationId: 'original-settlement', transactionId: 'cash', paymentId: 'p', currency: 'TRY', amount: 80 } };
const request = (action: string, operationId: string, fields: Record<string, unknown> = {}) => ({ auth: { uid: 'u' },
  data: { action, operationId, kind: 'debt', spaceId: 's', storeId: 'store', customerId: 'c', targetId: 'd',
    expectedUpdatedAt: workspaceTestTime, expectedRevision: 0, ...(action === 'edit' ? { amountExact: '100.00', note: 'Correct note', operationDate: '2026-09-20' } : {}), ...fields } });
describe('trusted customer debt edit/cancel (source only, not deployed)', () => {
  it('edits original principal and documentary date while preserving server time and archive', async () => {
    const b = workspaceBackend();
    b.docs['spaces/s/dailyArchives/old'] = { snapshot: [{ id: 'd', amount: 120 }] };
    const before = structuredClone(b.docs['spaces/s/dailyArchives/old']);
    await customerOperationCommandHandler(request('edit', 'change') as never, b.runtime);
    expect(b.docs['spaces/s/debts/d']).toMatchObject({ amountExact: '80.00', originalAmount: 100,
      operationDate: '2026-09-20', createdAt: workspaceTestTime, updatedByUserId: 'u' });
    expect(b.docs['spaces/s/operationReceipts/change'].previousOperation).toMatchObject({ amount: 100, originalAmount: 120 });
    expect(b.docs['spaces/s/dailyArchives/old']).toEqual(before);
    expect(Object.keys(b.docs).filter(path => path.startsWith('spaces/s/transactions/'))).toHaveLength(0);
    const writes = b.writes.length;
    await expect(customerOperationCommandHandler(request('edit', 'change') as never, b.runtime)).resolves.toMatchObject({ outcome: 'replayed' });
    expect(b.writes).toHaveLength(writes);
    await expect(customerOperationCommandHandler(request('edit', 'change', { amountExact: '99.00' }) as never, b.runtime))
      .rejects.toMatchObject({ code: 'already-exists' });
    await expect(customerOperationCommandHandler(request('edit', 'same-millisecond-stale') as never, b.runtime))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('retains a cancelled debt and rejects another change or a linked merchant correction', async () => {
    const b = workspaceBackend();
    await customerOperationCommandHandler(request('cancel', 'cancel') as never, b.runtime);
    expect(b.docs['spaces/s/debts/d']).toMatchObject({ amountExact: '0.00', originalAmount: 120, cancelled: true });
    const writes = b.writes.length;
    await expect(customerOperationCommandHandler(request('edit', 'stale') as never, b.runtime)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(b.writes).toHaveLength(writes);
    const linked = workspaceBackend(); linked.docs['spaces/s/debts/d'].merchantOperationId = 'linked';
    await expect(customerOperationCommandHandler(request('edit', 'wrong-side') as never, linked.runtime)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(linked.writes).toHaveLength(0);
  });
  it('rejects Viewer, stale state, scope forgery and unsupported fields before writing', async () => {
    for (const fields of [{ expectedUpdatedAt: '2026-01-01T00:00:00Z' }, { customerId: 'other' }, { role: 'owner' }, { currency: 'USD' }]) {
      const b = workspaceBackend();
      await expect(customerOperationCommandHandler(request('edit', 'invalid', fields) as never, b.runtime)).rejects.toBeDefined();
      expect(b.writes).toHaveLength(0);
    }
    const b = workspaceBackend('viewer');
    await expect(customerOperationCommandHandler(request('cancel', 'viewer') as never, b.runtime)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(b.writes).toHaveLength(0);
  });
});

describe('payment provenance and atomic customer/cash corrections', () => {
  it('edits and then cancels an actual settlement without losing credit or changing old cash/archives', async () => {
    const b = workspaceBackend();
    await settleCustomerDebtHandler(settlementRequest as never, b.runtime);
    const oldCash = structuredClone(b.docs['spaces/s/transactions/cash']);
    await customerOperationCommandHandler(paymentRequest('edit', 'edit-payment') as never, b.runtime);
    expect(b.docs['spaces/s/payments/p']).toMatchObject({ amountExact: '50.00', operationDate: '2026-09-01',
      paidAt: workspaceTestTime, method: 'card', amendmentRevision: 1 });
    const totalDebt = () => Object.entries(b.docs).filter(([path]) => path.startsWith('spaces/s/debts/'))
      .reduce((sum,[, row]) => sum + row.amount, 0);
    const cashTotal = () => Object.entries(b.docs).filter(([path]) => path.startsWith('spaces/s/transactions/'))
      .reduce((sum,[, row]) => sum + (row.type === 'cash_in' ? row.amount : -row.amount), 0);
    expect(totalDebt()).toBe(50);
    expect(cashTotal()).toBe(50);
    expect(b.docs['spaces/s/transactions/cash']).toEqual(oldCash);
    await customerOperationCommandHandler(paymentRequest('cancel', 'cancel-payment', '0.00', 1) as never, b.runtime);
    expect(totalDebt()).toBe(100);
    expect(cashTotal()).toBe(0);
    expect(b.docs['spaces/s/payments/p']).toMatchObject({ cancelled: true, amountExact: '50.00' });
    expect(b.docs[creditKey].creditExact).toBe('0.00');
    const writes = b.writes.length;
    await expect(customerOperationCommandHandler(paymentRequest('cancel', 'cancel-payment', '0.00', 1) as never, b.runtime))
      .resolves.toMatchObject({ outcome: 'replayed' });
    expect(b.writes).toHaveLength(writes);
  });
  it('increases overpayment, then consumes returned customer credit before restoring debt on a reduction', async () => {
    const b = workspaceBackend();
    await settleCustomerDebtHandler(settlementRequest as never, b.runtime);
    await customerOperationCommandHandler(paymentRequest('edit', 'increase', '120.00') as never, b.runtime);
    expect(b.docs[creditKey].creditExact).toBe('20.00');
    await customerOperationCommandHandler(paymentRequest('edit', 'reduce', '50.00', 1) as never, b.runtime);
    expect(b.docs[creditKey].creditExact).toBe('0.00');
    expect(Object.entries(b.docs).filter(([path]) => path.startsWith('spaces/s/debts/')).reduce((sum,[, row]) => sum + row.amount, 0)).toBe(50);
  });
  it('does not assume that a generic noncash Payment reduced any customer debt', async () => {
    const b = workspaceBackend();
    await createPaymentHandler({ auth: { uid: 'u' }, data: { spaceId: 's', storeId: 'store', paymentId: 'p', operationId: 'generic',
      customerId: 'c', amount: { amount: 80, currency: 'TRY' }, direction: 'in', method: 'card', paidAt: workspaceTestTime } } as never, b.runtime);
    await customerOperationCommandHandler(paymentRequest('edit', 'generic-edit') as never, b.runtime);
    expect(b.docs['spaces/s/debts/d'].amount).toBe(100);
    expect(b.docs[creditKey]).toBeUndefined();
    expect(Object.keys(b.docs).filter(path => path.startsWith('spaces/s/transactions/'))).toHaveLength(0);
  });
  it('rejects missing provenance, shared cash, bad linked amounts and a unilateral merchant settlement edit', async () => {
    for (const corruption of ['proof','shared','cash','merchant']) {
      const b = workspaceBackend();
      await settleCustomerDebtHandler(settlementRequest as never, b.runtime);
      if (corruption === 'proof') delete b.docs['spaces/s/operationReceipts/original-settlement'];
      if (corruption === 'shared') b.docs['spaces/s/payments/shared'] = { ...b.docs['spaces/s/payments/p'], id: 'shared' };
      if (corruption === 'cash') b.docs['spaces/s/transactions/cash'].amount = 81;
      if (corruption === 'merchant') b.docs['spaces/s/payments/p'].merchantOperationId = 'merchant-payment';
      const before = structuredClone(b.docs), writes = b.writes.length;
      await expect(customerOperationCommandHandler(paymentRequest('cancel', 'unsafe') as never, b.runtime)).rejects.toBeDefined();
      expect(b.docs).toEqual(before);
      expect(b.writes).toHaveLength(writes);
    }
  });
});
