import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';
import { workspaceBackend } from './fixtures/workspaceBackend';

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
