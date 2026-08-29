import { describe, expect, it, vi } from 'vitest';
import type { Customer, Debt, Payment, Transaction } from '@/types/business';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { buildDailyJournalEvents } from '@/services/storage';

const now = new Date('2026-08-29T20:00:00.000Z');

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-a',
    storeId: 'store-a',
    name: 'Ahmad',
    isActive: true,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-a',
    storeId: 'store-a',
    type: 'cash_in',
    amount: 1000,
    currency: 'TRY',
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-29T10:00:00.000Z',
    ...overrides,
  };
}

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-a',
    storeId: 'store-a',
    customerId: 'customer-a',
    amount: 3000,
    currency: 'USD',
    createdAt: '2026-08-29T11:00:00.000Z',
    updatedAt: '2026-08-29T11:00:00.000Z',
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-a',
    storeId: 'store-a',
    customerId: 'customer-a',
    transactionId: 'settlement-cash-in',
    amount: { amount: 2000, currency: 'USD' },
    direction: 'in',
    method: 'cash',
    paidAt: '2026-08-29T12:00:00.000Z',
    createdAt: '2026-08-29T12:00:00.000Z',
    updatedAt: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

describe('daily journal events', () => {
  it('combines cash in, cash out, debt, and settlement in newest-first order with customer names', () => {
    const events = buildDailyJournalEvents(
      'store-a',
      [
        transaction(),
        transaction({ id: 'cash-out', type: 'cash_out', createdAt: '2026-08-29T13:00:00.000Z' }),
      ],
      [debt()],
      [payment()],
      [customer()],
      now,
    );

    expect(events.map(({ type }) => type)).toEqual(['cash_out', 'settlement', 'debt', 'cash_in']);
    expect(events.find(({ type }) => type === 'debt')?.customerName).toBe('Ahmad');
    expect(events.find(({ type }) => type === 'settlement')?.customerName).toBe('Ahmad');
  });

  it('shows a settlement once by excluding its linked cash-in transaction', () => {
    const events = buildDailyJournalEvents(
      'store-a',
      [transaction({ id: 'settlement-cash-in', createdAt: '2026-08-29T12:00:00.000Z' })],
      [],
      [payment()],
      [customer()],
      now,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'settlement', sourceId: 'payment-a' });
  });

  it('keeps only the selected store and current local day', () => {
    const events = buildDailyJournalEvents(
      'store-a',
      [
        transaction(),
        transaction({ id: 'other-store', storeId: 'store-b' }),
        transaction({ id: 'yesterday', createdAt: '2026-08-28T10:00:00.000Z' }),
      ],
      [
        debt(),
        debt({ id: 'other-store-debt', storeId: 'store-b' }),
      ],
      [
        payment(),
        payment({ id: 'other-store-payment', storeId: 'store-b' }),
      ],
      [
        customer(),
        customer({ id: 'other-customer', storeId: 'store-b', name: 'Other' }),
      ],
      now,
    );

    expect(events.every(({ storeId }) => storeId === 'store-a')).toBe(true);
    expect(events.map(({ sourceId }) => sourceId)).toEqual(['payment-a', 'debt-a', 'transaction-a']);
  });

  it('does not cap the number of current-day events', () => {
    const transactions = Array.from({ length: 30 }, (_, index) =>
      transaction({
        id: `transaction-${index}`,
        createdAt: `2026-08-29T10:${String(index).padStart(2, '0')}:00.000Z`,
      }),
    );

    expect(buildDailyJournalEvents('store-a', transactions, [], [], [], now)).toHaveLength(30);
  });
});