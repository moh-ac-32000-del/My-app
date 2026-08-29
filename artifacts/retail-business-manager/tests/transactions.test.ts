import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashTransactionDraft, Transaction } from '@/types/business';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
    removeItem: async (key: string) => {
      storedValues.delete(key);
    },
  },
}));

import {
  calculateCurrencyNetTotals,
  calculateUsedCurrencyBalances,
  createCashTransaction,
  loadTransactions,
  saveTransactions,
  validateCashTransactionDraft,
} from '@/services/storage';

const timestamp = '2026-08-29T15:30:00.000Z';

function createDraft(overrides: Partial<CashTransactionDraft> = {}): CashTransactionDraft {
  return {
    type: 'cash_in',
    amount: 5000,
    currency: 'TRY',
    note: 'Cash received',
    ...overrides,
  };
}

describe('cash transactions', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  it('creates a cash-in transaction with positive amount and store scope', () => {
    const transaction = createCashTransaction('store-1', createDraft(), timestamp);

    expect(transaction).toMatchObject({
      storeId: 'store-1',
      type: 'cash_in',
      amount: 5000,
      currency: 'TRY',
      note: 'Cash received',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  it('creates a cash-out transaction without making the amount negative', () => {
    const transaction = createCashTransaction(
      'store-1',
      createDraft({ type: 'cash_out', amount: 250 }),
      timestamp,
    );

    expect(transaction.type).toBe('cash_out');
    expect(transaction.amount).toBe(250);
  });

  it('saves and loads transactions newest first', async () => {
    const older = createCashTransaction('store-1', createDraft(), '2026-08-29T10:00:00.000Z');
    const newer = createCashTransaction(
      'store-1',
      createDraft({ type: 'cash_out', amount: 100 }),
      '2026-08-29T12:00:00.000Z',
    );

    await saveTransactions('store-1', [older, newer]);

    await expect(loadTransactions('store-1')).resolves.toEqual([newer, older]);
  });

  it('loads every current-store transaction, including transactions beyond the first three', async () => {
    const transactions = [
      createCashTransaction('store-1', createDraft({ amount: 100 }), '2026-08-29T10:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 200 }), '2026-08-29T11:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 300 }), '2026-08-29T12:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 400 }), '2026-08-29T13:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 500 }), '2026-08-29T14:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 600 }), '2026-08-29T15:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 700 }), '2026-08-29T16:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 800 }), '2026-08-29T17:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 900 }), '2026-08-29T18:00:00.000Z'),
      createCashTransaction('store-1', createDraft({ amount: 1000 }), '2026-08-29T19:00:00.000Z'),
    ];
    const otherStoreTransaction = createCashTransaction('store-2', createDraft(), '2026-08-29T14:00:00.000Z');

    await saveTransactions('store-1', transactions);
    await saveTransactions('store-2', [otherStoreTransaction]);

    const loaded = await loadTransactions('store-1');

    expect(loaded).toHaveLength(10);
    expect(loaded.map((transaction) => transaction.id)).toEqual(
      [...transactions].reverse().map((transaction) => transaction.id),
    );
    expect(loaded).not.toContainEqual(otherStoreTransaction);
  });

  it('keeps transaction IDs stable after a storage reload', async () => {
    const transaction = createCashTransaction('store-1', createDraft(), timestamp);
    await saveTransactions('store-1', [transaction]);

    const [reloaded] = await loadTransactions('store-1');

    expect(reloaded.id).toBe(transaction.id);
  });

  it.each([
    ['zero', 0],
    ['negative', -10],
    ['non-numeric', 'not-a-number'],
  ])('rejects a %s amount', (_label, amount) => {
    expect(validateCashTransactionDraft({
      storeId: 'store-1',
      type: 'cash_in',
      amount,
      currency: 'TRY',
    })).toBe('amountInvalid');
  });

  it('rejects an unsupported currency', () => {
    expect(validateCashTransactionDraft({
      storeId: 'store-1',
      type: 'cash_in',
      amount: 100,
      currency: 'INVALID',
    })).toBe('currencyInvalid');
  });

  it('keeps two stores isolated and preserves the other store when saving', async () => {
    const firstStoreTransaction = createCashTransaction('store-1', createDraft(), timestamp);
    const secondStoreTransaction = createCashTransaction(
      'store-2',
      createDraft({ currency: 'USD', amount: 100 }),
      timestamp,
    );

    await saveTransactions('store-1', [firstStoreTransaction]);
    await saveTransactions('store-2', [secondStoreTransaction]);
    await saveTransactions('store-1', [
      firstStoreTransaction,
      createCashTransaction('store-1', createDraft({ type: 'cash_out', amount: 50 }), timestamp),
    ]);

    await expect(loadTransactions('store-2')).resolves.toEqual([secondStoreTransaction]);
    expect(await loadTransactions('store-1')).toHaveLength(2);
  });

  it('calculates TRY net independently', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ amount: 50000 }), timestamp),
      createCashTransaction('store-1', createDraft({ type: 'cash_out', amount: 10000 }), timestamp),
    ];

    expect(calculateCurrencyNetTotals(transactions).TRY).toBe(40000);
  });

  it('calculates USD net independently', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ currency: 'USD', amount: 1000 }), timestamp),
      createCashTransaction('store-1', createDraft({ type: 'cash_out', currency: 'USD', amount: 200 }), timestamp),
    ];

    expect(calculateCurrencyNetTotals(transactions).USD).toBe(800);
  });

  it('never merges totals from different currencies', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ amount: 5000 }), timestamp),
      createCashTransaction('store-1', createDraft({ currency: 'USD', amount: 100 }), timestamp),
      createCashTransaction('store-1', createDraft({ type: 'cash_out', currency: 'EUR', amount: 20 }), timestamp),
    ];

    const totals = calculateCurrencyNetTotals(transactions);

    expect(totals.TRY).toBe(5000);
    expect(totals.USD).toBe(100);
    expect(totals.EUR).toBe(-20);
  });

  it.each([
    [['TRY'], ['TRY']],
    [['USD'], ['USD']],
    [['EUR'], ['EUR']],
    [['TRY', 'USD'], ['TRY', 'USD']],
    [['TRY', 'USD', 'EUR'], ['TRY', 'USD', 'EUR']],
  ])('returns only currencies used by transactions: %j', (currencyCodes, expectedCodes) => {
    const transactions: Transaction[] = currencyCodes.map((currency, index) =>
      createCashTransaction('store-1', createDraft({
        currency: currency as CashTransactionDraft['currency'],
        amount: index + 1,
      }), timestamp),
    );

    expect(calculateUsedCurrencyBalances(transactions).map(({ currency }) => currency)).toEqual(expectedCodes);
  });

  it('does not show EUR when there is no EUR transaction', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ currency: 'TRY', amount: 100 }), timestamp),
      createCashTransaction('store-1', createDraft({ currency: 'USD', amount: 50 }), timestamp),
    ];

    expect(calculateUsedCurrencyBalances(transactions).map(({ currency }) => currency)).not.toContain('EUR');
  });

  it('keeps EUR balance independent from TRY and USD balances', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ currency: 'TRY', amount: 500 }), timestamp),
      createCashTransaction('store-1', createDraft({ currency: 'USD', amount: 300 }), timestamp),
      createCashTransaction('store-1', createDraft({ currency: 'EUR', amount: 200 }), timestamp),
    ];

    expect(calculateUsedCurrencyBalances(transactions)).toEqual([
      { currency: 'TRY', amount: 500 },
      { currency: 'USD', amount: 300 },
      { currency: 'EUR', amount: 200 },
    ]);
  });

  it('keeps a zero-balance currency visible when it has transactions', () => {
    const transactions: Transaction[] = [
      createCashTransaction('store-1', createDraft({ currency: 'USD', amount: 500 }), timestamp),
      createCashTransaction('store-1', createDraft({ type: 'cash_out', currency: 'USD', amount: 500 }), timestamp),
    ];

    expect(calculateUsedCurrencyBalances(transactions)).toEqual([
      { currency: 'USD', amount: 0 },
    ]);
  });

  it('returns an empty list instead of crashing on corrupted JSON', async () => {
    storedValues.set('@retail-business-manager/transactions', '{not-json');

    await expect(loadTransactions('store-1')).resolves.toEqual([]);
  });

  it('creates unique IDs for separate transactions', () => {
    const first = createCashTransaction('store-1', createDraft(), timestamp);
    const second = createCashTransaction('store-1', createDraft(), timestamp);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^transaction_/);
    expect(second.id).toMatch(/^transaction_/);
  });
});