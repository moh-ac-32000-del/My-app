import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { merchantCommandHandler } from '../functions/src/merchantCommand';
import { workspaceBackend } from './fixtures/workspaceBackend';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const balancePath = (currency = 'TRY') => `spaces/s/merchantBalances/${hash(['m', currency])}`;
const creditPath = `spaces/s/customerCredits/${hash(['c', 'TRY'])}`;
const request = (action: string, operationId: string, data: Record<string, unknown> = {}) => ({
  auth: { uid: 'u' },
  data: { action, operationId, spaceId: 's', storeId: 'store', merchantId: 'm', ...data },
});
function setup(role: unknown = 'owner') {
  const backend = workspaceBackend(role);
  backend.docs['spaces/s/merchants/m'] = {
    id: 'm',
    workspaceId: 's',
    storeId: 'store',
    name: 'Merchant',
    phone: '',
    isActive: true,
    createdAt: '2026-10-19T10:00:00.000Z',
    createdByUserId: 'u',
  };
  const command = (action: string, operationId: string, data: Record<string, unknown> = {}) =>
    merchantCommandHandler(request(action, operationId, data) as never, backend.runtime);
  return { ...backend, command };
}
const payment = { currency: 'TRY', amountExact: '800.00', source: 'cash' };
const purchase = {
  currency: 'TRY',
  paidExact: '1000.00',
  source: 'cash',
  note: 'Goods',
  lines: [
    { name: 'Screens', quantity: '5', unitPrice: '400' },
    { name: 'Batteries', quantity: '10', unitPrice: '150' },
    { name: 'Cables', quantity: '20', unitPrice: '50' },
  ],
};

describe('merchant trusted command (not deployed)', () => {
  const reverse = (targetOperationId: string) => ({
    currency: 'TRY',
    targetOperationId,
    reason: 'Correct mistaken entry',
  });

  it('offsets a mistaken cash payment with a current-period audit entry, retaining the original', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    const original = structuredClone(backend.docs['spaces/s/merchantOperations/payment']);
    await backend.command('reverse', 'correction', reverse('payment'));
    expect(backend.docs[balancePath()].balanceExact).toBe('0.00');
    expect(backend.docs['spaces/s/merchantOperations/payment']).toMatchObject({
      ...original,
      reversedByOperationId: 'correction',
    });
    expect(backend.docs['spaces/s/merchantOperations/correction']).toMatchObject({
      action: 'reverse',
      cashDeltaExact: '800.00',
      reversesOperationId: 'payment',
    });
    const cash = Object.entries(backend.docs)
      .filter(([path]) => path.startsWith('spaces/s/transactions/'))
      .map(([, data]) => data);
    expect(cash.map((data) => [data.type, data.amount]).sort()).toEqual([
      ['cash_in', 800],
      ['cash_out', 800],
    ]);
    const writes = backend.writes.length;
    await expect(backend.command('reverse', 'correction', reverse('payment'))).resolves.toMatchObject({
      outcome: 'replayed',
    });
    expect(backend.writes).toHaveLength(writes);
  });

  it('offsets the purchase and its linked cash payment together', async () => {
    const backend = setup();
    await backend.command('purchase', 'purchase', purchase);
    await backend.command('reverse', 'correction', reverse('purchase'));
    expect(backend.docs[balancePath()].balanceExact).toBe('0.00');
    expect(backend.docs['spaces/s/merchantOperations/correction'].cashDeltaExact).toBe('1000.00');
    expect(backend.docs['spaces/s/merchantOperations/purchase'].totalExact).toBe('4500.00');
  });

  it('reverses a direct payment after the resulting customer credit was used, without rewriting old debts', async () => {
    const backend = setup();
    await backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '130.00', customerId: 'c' });
    await trustedDebtCommandHandler(
      {
        auth: { uid: 'u' },
        data: {
          action: 'create',
          spaceId: 's',
          storeId: 'store',
          customerId: 'c',
          debtId: 'later',
          operationId: 'later',
          currency: 'TRY',
          amount: 50,
        },
      } as never,
      backend.runtime,
    );
    const oldDebt = structuredClone(backend.docs['spaces/s/debts/d']);
    const laterDebt = structuredClone(backend.docs['spaces/s/debts/later']);
    await backend.command('reverse', 'correction', reverse('direct'));
    expect(backend.docs[balancePath()].balanceExact).toBe('0.00');
    expect(backend.docs[creditPath].creditExact).toBe('0.00');
    expect(backend.docs['spaces/s/debts/d']).toEqual(oldDebt);
    expect(backend.docs['spaces/s/debts/later']).toEqual(laterDebt);
    const correctedDebts = Object.entries(backend.docs).filter(([path]) => path.startsWith('spaces/s/debts/'));
    expect(correctedDebts.reduce((sum, [, debt]) => sum + debt.amount, 0)).toBe(150);
    expect(correctedDebts.find(([, debt]) => debt.correctionOfMerchantOperationId === 'direct')?.[1]).toMatchObject({
      amountExact: '130.00',
      note: 'Correct mistaken entry',
      createdByUserId: 'u',
    });
    expect(Object.keys(backend.docs).some((path) => path.startsWith('spaces/s/transactions/'))).toBe(false);
  });

  it('restores preexisting customer credit when reversing new direct money', async () => {
    const backend = setup();
    backend.docs['spaces/s/debts/d'].amount = 0;
    backend.docs[creditPath] = {
      id: hash(['c', 'TRY']),
      workspaceId: 's',
      storeId: 'store',
      customerId: 'c',
      currency: 'TRY',
      version: 1,
      revision: 1,
      creditExact: '200.00',
      createdAt: '2026-10-19T10:00:00.000Z',
      createdByUserId: 'u',
    };
    await backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '300.00', customerId: 'c' });
    await backend.command('reverse', 'correction', reverse('direct'));
    expect(backend.docs[creditPath].creditExact).toBe('200.00');
    expect(backend.docs[balancePath()].balanceExact).toBe('0.00');
  });

  it('allows only one correction of an original operation under competing requests', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    const results = await Promise.allSettled(
      ['first', 'second'].map((id) => backend.command('reverse', id, reverse('payment'))),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(backend.docs[balancePath()].balanceExact).toBe('0.00');
  });

  it('rejects reversing a reversal or omitting the audit reason', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    await expect(backend.command('reverse', 'blank', { ...reverse('payment'), reason: ' ' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await backend.command('reverse', 'correction', reverse('payment'));
    await expect(backend.command('reverse', 'second', reverse('correction'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('fails closed on an inconsistent original cash link', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    const original = backend.docs['spaces/s/merchantOperations/payment'];
    backend.docs[`spaces/s/transactions/${original.transactionId}`].amount = 900;
    const before = structuredClone(backend.docs);
    await expect(backend.command('reverse', 'correction', reverse('payment'))).rejects.toMatchObject({
      code: 'data-loss',
    });
    expect(backend.docs).toEqual(before);
  });
  it('saves metadata through the existing workspace roles and preserves creator history', async () => {
    const backend = setup('editor');
    await backend.command('save', 'rename', { name: 'Renamed', phone: '123', isActive: true });
    expect(backend.docs['spaces/s/merchants/m']).toMatchObject({
      name: 'Renamed',
      createdByUserId: 'u',
      updatedByUserId: 'u',
    });
    expect(backend.docs['spaces/s/debts/d'].amount).toBe(100);
  });

  it('records a 4500 purchase with a linked 1000 cash payment atomically', async () => {
    const backend = setup();
    await expect(backend.command('purchase', 'purchase', purchase)).resolves.toMatchObject({
      balanceExact: '3500.00',
      cashDeltaExact: '-1000.00',
    });
    expect(backend.docs[balancePath()].balanceExact).toBe('3500.00');
    expect(backend.docs['spaces/s/merchantOperations/purchase']).toMatchObject({
      totalExact: '4500.00',
      paidExact: '1000.00',
      note: 'Goods',
    });
    const cash = Object.entries(backend.docs).filter(([path]) => path.startsWith('spaces/s/transactions/'));
    expect(cash).toHaveLength(1);
    expect(cash[0][1]).toMatchObject({ type: 'cash_out', amount: 1000, merchantOperationId: 'purchase' });
  });

  it('rounds each line half up using the approved precision', async () => {
    const backend = setup();
    await backend.command('purchase', 'rounded', {
      ...purchase,
      paidExact: '0.00',
      lines: [
        { name: 'A', quantity: '1', unitPrice: '0.005' },
        { name: 'B', quantity: '1', unitPrice: '0.005' },
      ],
    });
    expect(backend.docs[balancePath()].balanceExact).toBe('0.02');
    expect(
      backend.docs['spaces/s/merchantOperations/rounded'].lines.map((row: { totalExact: string }) => row.totalExact),
    ).toEqual(['0.01', '0.01']);
  });

  it('retains merchant overpayment and consumes credit on a new purchase without fresh cash', async () => {
    const backend = setup();
    await backend.command('opening', 'opening', { currency: 'TRY', amountExact: '500.00' });
    await backend.command('payment', 'payment', payment);
    expect(backend.docs[balancePath()].balanceExact).toBe('-300.00');
    await backend.command('purchase', 'purchase', {
      ...purchase,
      paidExact: '0.00',
      lines: [{ name: 'Goods', quantity: '1', unitPrice: '200' }],
    });
    expect(backend.docs[balancePath()].balanceExact).toBe('-100.00');
    expect(Object.keys(backend.docs).filter((path) => path.startsWith('spaces/s/transactions/'))).toHaveLength(1);
  });

  it('never records drawer cash for external funding', async () => {
    const backend = setup();
    await backend.command('payment', 'bank', { ...payment, source: 'external' });
    expect(backend.docs[balancePath()].balanceExact).toBe('-800.00');
    expect(Object.keys(backend.docs).some((path) => path.startsWith('spaces/s/transactions/'))).toBe(false);
  });

  it('applies customer-to-merchant payment once to both accounts without cash', async () => {
    const backend = setup();
    await backend.command('opening', 'opening', { currency: 'TRY', amountExact: '50.00' });
    await backend.command('directPayment', 'direct', {
      currency: 'TRY',
      amountExact: '130.00',
      customerId: 'c',
      note: 'Direct',
    });
    expect(backend.docs[balancePath()].balanceExact).toBe('-80.00');
    expect(backend.docs['spaces/s/debts/d'].amountExact).toBe('0.00');
    expect(backend.docs[creditPath].creditExact).toBe('30.00');
    expect(Object.keys(backend.docs).some((path) => path.startsWith('spaces/s/transactions/'))).toBe(false);
    const entries = Object.entries(backend.docs).filter(([path]) => path.startsWith('spaces/s/payments/'));
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({
      source: 'customer-to-merchant',
      merchantId: 'm',
      amount: { amount: 130, currency: 'TRY' },
    });
    const writes = backend.writes.length;
    await expect(
      backend.command('directPayment', 'direct', {
        currency: 'TRY',
        amountExact: '130.00',
        customerId: 'c',
        note: 'Direct',
      }),
    ).resolves.toMatchObject({ outcome: 'replayed' });
    expect(backend.writes).toHaveLength(writes);
  });

  it('preserves old customer credit when NEW money is paid directly to the merchant', async () => {
    const backend = setup();
    backend.docs['spaces/s/debts/d'].amount = 0;
    backend.docs[creditPath] = {
      id: hash(['c', 'TRY']),
      workspaceId: 's',
      storeId: 'store',
      customerId: 'c',
      currency: 'TRY',
      version: 1,
      revision: 1,
      creditExact: '200.00',
      createdAt: '2026-10-19T10:00:00.000Z',
      createdByUserId: 'u',
    };
    await backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '300.00', customerId: 'c' });
    expect(backend.docs[creditPath].creditExact).toBe('500.00');
    expect(backend.docs[balancePath()].balanceExact).toBe('-300.00');
  });

  it('preserves legacy fractions instead of rounding old customer debts to cents', async () => {
    const backend = setup();
    backend.docs['spaces/s/debts/d'].amount = 1.005;
    await backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '1.00', customerId: 'c' });
    expect(backend.docs['spaces/s/debts/d'].amountExact).toBe('0.005');
    expect(backend.docs['spaces/s/debts/d'].originalAmount).toBe(120);
  });

  it('serializes competing payments without losing balance updates', async () => {
    const backend = setup();
    await Promise.all([backend.command('payment', 'one', payment), backend.command('payment', 'two', payment)]);
    expect(backend.docs[balancePath()]).toMatchObject({ balanceExact: '-1600.00', revision: 2 });
  });

  it('recomputes on a simulated conflict and discards staged first-attempt writes', async () => {
    const backend = setup();
    await backend.command('opening', 'opening', { currency: 'TRY', amountExact: '500.00' });
    backend.retryOnce(() => {
      backend.docs[balancePath()].balanceExact = '600.00';
      backend.docs[balancePath()].revision += 1;
    });
    await backend.command('payment', 'payment', payment);
    expect(backend.docs[balancePath()].balanceExact).toBe('-200.00');
    expect(backend.writes.filter((path) => path === 'spaces/s/merchantOperations/payment')).toHaveLength(1);
  });

  it('rejects changed payload reuse including a note change without further writes', async () => {
    const backend = setup();
    await backend.command('payment', 'same', payment);
    const before = structuredClone(backend.docs);
    await expect(backend.command('payment', 'same', { ...payment, note: 'Changed' })).rejects.toMatchObject({
      code: 'already-exists',
      details: { code: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(backend.docs).toEqual(before);
  });

  it.each(['viewer', 'admin', 'manager', 'cashier'])('denies noncanonical writer role %s', async (role) => {
    const backend = setup(role);
    await expect(backend.command('payment', 'denied', payment)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(backend.writes).toHaveLength(0);
  });

  it('reauthorizes replay after membership removal', async () => {
    const backend = setup();
    await backend.command('payment', 'same', payment);
    backend.docs['spaces/s/members/u'].status = 'removed';
    await expect(backend.command('payment', 'same', payment)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('does not allow an opening to overwrite an existing account', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    await expect(
      backend.command('opening', 'opening', { currency: 'TRY', amountExact: '500.00' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(backend.docs[balancePath()].balanceExact).toBe('-800.00');
  });

  it('keeps currencies independent', async () => {
    const backend = setup();
    await backend.command('payment', 'try', payment);
    await backend.command('payment', 'usd', { ...payment, currency: 'USD', amountExact: '2.00' });
    expect(backend.docs[balancePath()].balanceExact).toBe('-800.00');
    expect(backend.docs[balancePath('USD')].balanceExact).toBe('-2.00');
  });

  it('rejects a customer from a different workspace without partial merchant writes', async () => {
    const backend = setup();
    backend.docs['spaces/s/customers/c'].workspaceId = 'other';
    const before = structuredClone(backend.docs);
    await expect(
      backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '130.00', customerId: 'c' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(backend.docs).toEqual(before);
  });

  it.each([
    { ...payment, amountExact: '0.001' },
    { ...payment, amountExact: '1e2' },
    { ...payment, amountExact: '-1.00' },
    { ...payment, amountExact: '90071992547409.93' },
    { ...payment, source: 'guess' },
    { ...payment, balanceExact: '999.00' },
  ])('rejects malformed or lossy payment input %j', async (data) => {
    const backend = setup();
    await expect(backend.command('payment', 'invalid', data)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(backend.writes).toHaveLength(0);
  });

  it('rejects corrupted merchant balance instead of repairing it silently', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    backend.docs[balancePath()].balanceExact = 'NaN';
    const before = structuredClone(backend.docs);
    await expect(backend.command('payment', 'second', payment)).rejects.toMatchObject({ code: 'data-loss' });
    expect(backend.docs).toEqual(before);
  });

  it('does not treat a missing stored balance as a new zero account', async () => {
    const backend = setup();
    await backend.command('payment', 'payment', payment);
    delete backend.docs[balancePath()].balanceExact;
    await expect(backend.command('payment', 'second', payment)).rejects.toMatchObject({ code: 'data-loss' });
  });

  it('does not change either party when customer credit is corrupt', async () => {
    const backend = setup();
    backend.docs[creditPath] = {
      id: hash(['c', 'TRY']),
      workspaceId: 's',
      storeId: 'other',
      customerId: 'c',
      currency: 'TRY',
      version: 1,
      revision: 1,
      creditExact: '200.00',
      createdAt: '2026-10-19T10:00:00.000Z',
      createdByUserId: 'u',
    };
    const before = structuredClone(backend.docs);
    await expect(
      backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '300.00', customerId: 'c' }),
    ).rejects.toMatchObject({ code: 'data-loss' });
    expect(backend.docs).toEqual(before);
  });

  it('rejects an oversized debt application before staging any financial write', async () => {
    const backend = setup();
    for (let index = 0; index < 450; index += 1) {
      backend.docs[`spaces/s/debts/additional-${index}`] = {
        ...backend.docs['spaces/s/debts/d'],
        id: `additional-${index}`,
        amount: 1,
      };
    }
    const before = structuredClone(backend.docs);
    await expect(
      backend.command('directPayment', 'direct', { currency: 'TRY', amountExact: '800.00', customerId: 'c' }),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(backend.docs).toEqual(before);
  });

  it('rejects unauthenticated calls before accessing Firestore', async () => {
    const backend = setup();
    await expect(
      merchantCommandHandler({ data: request('payment', 'payment', payment).data } as never, backend.runtime),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(backend.reads).toHaveLength(0);
  });
});
