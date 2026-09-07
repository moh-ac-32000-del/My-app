import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debt } from '@/types/business';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
  },
}));

import {
  calculateDebtTotals,
  createDebt,
  filterDebtsByCustomer,
  loadDebts,
  loadReminders,
  parseLocalizedAmountInput,
  saveDebts,
  validateDebtInput,
} from '@/services/storage';

const timestamp = '2026-08-29T10:00:00.000Z';

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-1',
    storeId: 'store-a',
    customerId: 'customer-a',
    currency: 'TRY',
    amount: 500,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('customer debts', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('creates valid debts with stable unique ids and required relations', () => {
    const first = createDebt('store-a', 'customer-a', { currency: 'TRY', amount: 500 }, timestamp);
    const firstId = first.id;
    const second = createDebt('store-a', 'customer-a', { currency: 'USD', amount: 650 }, timestamp);

    expect(first).toMatchObject({
      id: expect.stringMatching(/^debt_/),
      storeId: 'store-a',
      customerId: 'customer-a',
      currency: 'TRY',
      amount: 500,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(first).not.toHaveProperty('dueDate');
    expect(first.id).toBe(firstId);
    expect(second.id).not.toBe(first.id);
  });

  it.each([
    ['zero amount', { amount: 0 }, 'amountInvalid'],
    ['negative amount', { amount: -1 }, 'amountInvalid'],
    ['non-numeric amount', { amount: '500' }, 'amountInvalid'],
    ['invalid currency', { currency: 'XYZ' }, 'currencyInvalid'],
    ['missing customer', { customerId: '' }, 'customerIdRequired'],
    ['missing store', { storeId: '' }, 'storeIdRequired'],
    ['missing id', { id: '' }, 'debtIdRequired'],
    ['invalid due date', { dueDate: '2026-02-30' }, 'dueDateInvalid'],
    ['invalid creation timestamp', { createdAt: 'not-a-date' }, 'timestampInvalid'],
    ['invalid update timestamp', { updatedAt: 'not-a-date' }, 'timestampInvalid'],
  ])('rejects %s', (_label, override, expectedError) => {
    expect(validateDebtInput({ ...debt(), ...override })).toBe(expectedError);
  });

  it('creates and persists a debt with an optional due date', async () => {
    const created = createDebt(
      'store-a',
      'customer-a',
      { currency: 'TRY', amount: 500, dueDate: '2026-09-30' },
      timestamp,
    );

    expect(created.dueDate).toBe('2026-09-30');
    await saveDebts('store-a', [created]);

    await expect(loadDebts('store-a')).resolves.toEqual([created]);
  });

  it('keeps legacy debts without due dates valid when reloaded', async () => {
    const legacyDebt = debt();
    storedValues.set('@retail-business-manager/debts', JSON.stringify([legacyDebt]));

    await expect(loadDebts('store-a')).resolves.toEqual([legacyDebt]);
    expect((await loadDebts('store-a'))[0]).not.toHaveProperty('dueDate');
  });

  it('does not add reminder fields to the debt while scheduling its due-date reminder separately', async () => {
    const created = createDebt(
      'store-a',
      'customer-a',
      { currency: 'TRY', amount: 500, dueDate: '2026-09-30' },
      timestamp,
    );

    expect(created).not.toHaveProperty('remindAt');
    expect(created).not.toHaveProperty('status');
    expect(created).not.toHaveProperty('debtId');

    await saveDebts('store-a', [created]);
    await expect(loadReminders('store-a')).resolves.toMatchObject([
      {
        debtId: created.id,
        remindAt: '2026-09-30T09:00:00',
        status: 'pending',
      },
    ]);
  });

  it('parses decimal points and decimal commas without changing their value', () => {
    expect(parseLocalizedAmountInput('1.5', 'en')).toBe(1.5);
    expect(parseLocalizedAmountInput('1,5', 'tr')).toBe(1.5);
    expect(parseLocalizedAmountInput('1,5', 'en')).toBe(1.5);
    expect(parseLocalizedAmountInput('1.5', 'tr')).toBe(1.5);
  });

  it('distinguishes locale grouping separators from decimal separators', () => {
    expect(parseLocalizedAmountInput('1,500', 'en')).toBe(1500);
    expect(parseLocalizedAmountInput('1.500', 'tr')).toBe(1500);
    expect(parseLocalizedAmountInput('1,234.5', 'en')).toBe(1234.5);
    expect(parseLocalizedAmountInput('1.234,5', 'tr')).toBe(1234.5);
  });

  it('saves and reloads debts from their independent storage key', async () => {
    const savedDebt = debt();
    await saveDebts('store-a', [savedDebt]);

    await expect(loadDebts('store-a')).resolves.toEqual([savedDebt]);
    await expect(loadDebts('store-a')).resolves.toEqual([savedDebt]);
  });

  it('returns an empty list for corrupted debt JSON without crashing', async () => {
    storedValues.set('@retail-business-manager/debts', '{not-json');

    await expect(loadDebts('store-a')).resolves.toEqual([]);
  });

  it('keeps valid debts when another stored record is invalid', async () => {
    const validDebts = [
      debt({ id: 'debt-1' }),
      debt({ id: 'debt-2', currency: 'USD', amount: 650 }),
      debt({ id: 'debt-3', currency: 'EUR', amount: 100 }),
    ];
    storedValues.set(
      '@retail-business-manager/debts',
      JSON.stringify([...validDebts, { ...debt({ id: 'broken' }), amount: 0 }]),
    );

    await expect(loadDebts('store-a')).resolves.toEqual(validDebts);
  });

  it('isolates stores and preserves another store debts when saving', async () => {
    const storeADebt = debt({ amount: 500 });
    const storeBDebt = debt({ id: 'debt-2', storeId: 'store-b', amount: 900 });

    await saveDebts('store-a', [storeADebt]);
    await saveDebts('store-b', [storeBDebt]);

    await expect(loadDebts('store-a')).resolves.toEqual([storeADebt]);
    await expect(loadDebts('store-b')).resolves.toEqual([storeBDebt]);
  });

  it('filters debts by customer id without relying on customer names', () => {
    const customerADebt = debt({ amount: 500 });
    const customerBDebt = debt({ id: 'debt-2', customerId: 'customer-b', amount: 900 });

    expect(filterDebtsByCustomer([customerADebt, customerBDebt], 'customer-a')).toEqual([customerADebt]);
  });

  it('calculates independent totals for each currency without a combined total', () => {
    const totals = calculateDebtTotals([
      debt({ id: 'debt-1', currency: 'TRY', amount: 50000 }),
      debt({ id: 'debt-2', currency: 'USD', amount: 650 }),
      debt({ id: 'debt-3', currency: 'EUR', amount: 100 }),
    ]);

    expect(totals.TRY).toBe(50000);
    expect(totals.USD).toBe(650);
    expect(totals.EUR).toBe(100);
  });
});