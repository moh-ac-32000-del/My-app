import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debt, Payment } from '@/types/business';

const storageState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failNextSetKey: null as string | null,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storageState.values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (storageState.failNextSetKey === key) {
        storageState.failNextSetKey = null;
        throw new Error('simulated storage failure');
      }
      storageState.values.set(key, value);
    },
    removeItem: async (key: string) => {
      storageState.values.delete(key);
    },
  },
}));

import {
  calculateDebtTotals,
  createDebt,
  createPayment,
  filterPaymentsByCustomer,
  loadDebts,
  loadPayments,
  loadTransactions,
  saveDebts,
  savePayments,
  settleCustomerDebt,
  validatePaymentInput,
} from '@/services/storage';

const timestamp = '2026-08-29T12:00:00.000Z';

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-1',
    storeId: 'store-a',
    customerId: 'customer-a',
    currency: 'TRY',
    amount: 50000,
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-29T10:00:00.000Z',
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    storeId: 'store-a',
    customerId: 'customer-a',
    amount: { amount: 20000, currency: 'TRY' },
    direction: 'in',
    method: 'cash',
    paidAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('customer credit and settlements', () => {
  beforeEach(() => {
    storageState.values.clear();
    storageState.failNextSetKey = null;
  });

  it('creates home credit with customer and store isolation without a cash transaction', async () => {
    const credit = createDebt('store-a', 'customer-a', { amount: 500, currency: 'USD' }, timestamp);
    await saveDebts('store-a', [credit]);

    expect(credit).toMatchObject({
      storeId: 'store-a',
      customerId: 'customer-a',
      currency: 'USD',
      amount: 500,
    });
    await expect(loadTransactions('store-a')).resolves.toEqual([]);
  });

  it('partially settles 50,000 TRY by 20,000 TRY and leaves 30,000 TRY', async () => {
    await saveDebts('store-a', [debt()]);

    const result = await settleCustomerDebt('store-a', 'customer-a', {
      amount: 20000,
      currency: 'TRY',
    }, timestamp);

    expect(calculateDebtTotals(result.debts).TRY).toBe(30000);
    expect(result.debts[0]).toMatchObject({
      amount: 30000,
      originalAmount: 50000,
      updatedAt: timestamp,
    });
  });

  it('fully settles a debt without making its remaining amount negative', async () => {
    await saveDebts('store-a', [debt({ amount: 650, currency: 'USD' })]);

    const result = await settleCustomerDebt('store-a', 'customer-a', {
      amount: 650,
      currency: 'USD',
    }, timestamp);

    expect(calculateDebtTotals(result.debts).USD).toBe(0);
    expect(result.debts[0]).toMatchObject({
      amount: 0,
      originalAmount: 650,
      settledAt: timestamp,
    });
    await expect(loadDebts('store-a')).resolves.toEqual(result.debts);
  });

  it.each([
    ['zero', 0, 'settlementAmountInvalid'],
    ['negative', -1, 'settlementAmountInvalid'],
    ['non-numeric', Number.NaN, 'settlementAmountInvalid'],
    ['over the remaining debt', 50001, 'settlementExceedsDebt'],
  ])('rejects a %s settlement', async (_label, amount, expectedError) => {
    await saveDebts('store-a', [debt()]);

    await expect(settleCustomerDebt('store-a', 'customer-a', {
      amount,
      currency: 'TRY',
    }, timestamp)).rejects.toThrow(expectedError);
    await expect(loadPayments('store-a')).resolves.toEqual([]);
    await expect(loadTransactions('store-a')).resolves.toEqual([]);
  });

  it('settles TRY independently without changing USD debt', async () => {
    await saveDebts('store-a', [
      debt(),
      debt({ id: 'debt-2', currency: 'USD', amount: 650 }),
    ]);

    const result = await settleCustomerDebt('store-a', 'customer-a', {
      amount: 20000,
      currency: 'TRY',
    }, timestamp);
    const totals = calculateDebtTotals(result.debts);

    expect(totals.TRY).toBe(30000);
    expect(totals.USD).toBe(650);
  });

  it('creates one linked cash-in transaction and one payment for a settlement', async () => {
    await saveDebts('store-a', [debt()]);

    const result = await settleCustomerDebt('store-a', 'customer-a', {
      amount: 20000,
      currency: 'TRY',
    }, timestamp);
    const transactions = await loadTransactions('store-a');
    const payments = await loadPayments('store-a');

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      id: result.transaction.id,
      type: 'cash_in',
      amount: 20000,
      currency: 'TRY',
      storeId: 'store-a',
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      id: result.payment.id,
      storeId: 'store-a',
      customerId: 'customer-a',
      amount: { amount: 20000, currency: 'TRY' },
      transactionId: result.transaction.id,
    });
  });

  it('saves, reloads, sorts, and filters payment history by customer', async () => {
    const older = payment({ id: 'payment-older', paidAt: '2026-08-29T10:00:00.000Z' });
    const newer = payment({
      id: 'payment-newer',
      customerId: 'customer-b',
      paidAt: '2026-08-29T11:00:00.000Z',
      createdAt: '2026-08-29T11:00:00.000Z',
      updatedAt: '2026-08-29T11:00:00.000Z',
    });
    await savePayments('store-a', [older, newer]);

    const loaded = await loadPayments('store-a');
    expect(loaded.map(({ id }) => id)).toEqual(['payment-newer', 'payment-older']);
    expect(filterPaymentsByCustomer(loaded, 'customer-a')).toEqual([older]);
  });

  it('keeps payments isolated by store and preserves another store when saving', async () => {
    const storeAPayment = payment();
    const storeBPayment = payment({ id: 'payment-2', storeId: 'store-b' });
    await savePayments('store-a', [storeAPayment]);
    await savePayments('store-b', [storeBPayment]);

    await expect(loadPayments('store-a')).resolves.toEqual([storeAPayment]);
    await expect(loadPayments('store-b')).resolves.toEqual([storeBPayment]);
  });

  it('ignores invalid individual payment records while keeping valid records', async () => {
    const valid = payment();
    storageState.values.set(
      '@retail-business-manager/payments',
      JSON.stringify([valid, { ...valid, id: 'broken', amount: { amount: 0, currency: 'TRY' } }]),
    );

    await expect(loadPayments('store-a')).resolves.toEqual([valid]);
  });

  it('returns an empty payment list for corrupted JSON and refuses to overwrite it', async () => {
    storageState.values.set('@retail-business-manager/payments', '{not-json');

    await expect(loadPayments('store-a')).resolves.toEqual([]);
    await expect(savePayments('store-a', [payment()])).rejects.toThrow('corrupted');
    expect(storageState.values.get('@retail-business-manager/payments')).toBe('{not-json');
  });

  it('prevents two simultaneous full-settlement submissions from creating duplicate records', async () => {
    await saveDebts('store-a', [debt({ amount: 20000 })]);

    const results = await Promise.allSettled([
      settleCustomerDebt('store-a', 'customer-a', { amount: 20000, currency: 'TRY' }, timestamp),
      settleCustomerDebt('store-a', 'customer-a', { amount: 20000, currency: 'TRY' }, timestamp),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    await expect(loadPayments('store-a')).resolves.toHaveLength(1);
    await expect(loadTransactions('store-a')).resolves.toHaveLength(1);
  });

  it('rolls back debt and cash writes when payment persistence fails', async () => {
    const originalDebt = debt();
    await saveDebts('store-a', [originalDebt]);
    storageState.failNextSetKey = '@retail-business-manager/payments';

    await expect(settleCustomerDebt('store-a', 'customer-a', {
      amount: 20000,
      currency: 'TRY',
    }, timestamp)).rejects.toThrow('simulated storage failure');

    await expect(loadDebts('store-a')).resolves.toEqual([originalDebt]);
    await expect(loadTransactions('store-a')).resolves.toEqual([]);
    await expect(loadPayments('store-a')).resolves.toEqual([]);
  });

  it('creates valid settlement payment records with stable required relations', () => {
    const created = createPayment('store-a', 'customer-a', {
      amount: 1.5,
      currency: 'TRY',
      transactionId: 'transaction-1',
    }, timestamp);

    expect(validatePaymentInput(created)).toBeNull();
    expect(created).toMatchObject({
      id: expect.stringMatching(/^payment_/),
      storeId: 'store-a',
      customerId: 'customer-a',
      amount: { amount: 1.5, currency: 'TRY' },
      direction: 'in',
      method: 'cash',
      transactionId: 'transaction-1',
      paidAt: timestamp,
    });
  });
});