import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/cloudDailyArchives', () => ({ loadCloudDailyArchives: vi.fn() }));
import { projectDailyJournalEvents } from '@/services/dailyJournalProjection';
import { journalEventDetails, journalEventMoney, journalEventTitle } from '@/services/journalPresentation';
import { translate } from '@/constants/i18n';
import { getLocalDateKey } from '@/services/storage';
import type { Customer, DailyArchive, Debt, Payment, Transaction } from '@/types/business';

const now = new Date('2026-10-21T12:00:00.000Z'),
  timestamp = now.toISOString();
function sources() {
  const customer: Customer = {
    id: 'customer',
    storeId: 'store',
    name: 'Test customer',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const transactions: Transaction[] = [
    {
      id: 'in',
      storeId: 'store',
      type: 'cash_in',
      amount: 100,
      currency: 'TRY',
      note: 'Sold screens for cash',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'out',
      storeId: 'store',
      type: 'cash_out',
      amount: 30,
      currency: 'TRY',
      note: 'Bought cables for cash',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'linked',
      storeId: 'store',
      type: 'cash_in',
      amount: 50,
      currency: 'USD',
      note: 'Linked settlement cash',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  const debt: Debt = {
    id: 'debt',
    storeId: 'store',
    customerId: customer.id,
    currency: 'USD',
    amount: 25,
    originalAmount: 75,
    note: '3 batteries sold on account',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const payment: Payment = {
    id: 'payment',
    storeId: 'store',
    customerId: customer.id,
    transactionId: 'linked',
    direction: 'in',
    method: 'cash',
    amount: { currency: 'USD', amount: 50 },
    note: 'Payment for invoice 42',
    paidAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { transactions, debts: [debt], payments: [payment], customers: [customer] };
}
describe('daily business details using existing source records, without new financial writes', () => {
  it.each(['ar', 'tr', 'en'] as const)(
    'preserves notes, parties, dates, amounts and separate currencies in %s',
    (language) => {
      const source = sources(),
        before = JSON.stringify(source);
      const events = projectDailyJournalEvents('store', source, [], now);
      expect(events).toHaveLength(4);
      const t = (key: Parameters<typeof translate>[0]) => translate(key, language);
      for (const [id, note] of [
        ['transaction:in', 'Sold screens for cash'],
        ['transaction:out', 'Bought cables for cash'],
        ['debt:debt', '3 batteries sold on account'],
        ['settlement:payment', 'Payment for invoice 42'],
      ]) {
        const event = events.find((row) => row.id === id)!;
        expect(journalEventDetails(event, language, t)).toContain(note);
        expect(event.occurredAt).toBe(timestamp);
        expect(journalEventMoney(event, language)).not.toBe('');
      }
      const debt = events.find((row) => row.type === 'debt')!;
      expect(debt).toMatchObject({ amount: 75, currency: 'USD', customerName: 'Test customer' });
      expect(journalEventTitle(debt, t)).toContain('Test customer');
      expect(journalEventDetails(debt, language, t)).toContain(t('merchantNoncash'));
      const cash = events.find((row) => row.id === 'transaction:in')!;
      expect(cash.currency).toBe('TRY');
      expect(journalEventDetails(cash, language, t)).not.toContain(t('merchantNoncash'));
      expect(events.some((row) => row.id === 'transaction:linked')).toBe(false);
      expect(JSON.stringify(source)).toBe(before);
    },
  );
  it('does not turn a noncash debt display into a drawer movement or count the linked settlement twice', () => {
    const source = sources(),
      before = JSON.stringify(source.transactions);
    const events = projectDailyJournalEvents('store', source, [], now);
    expect(events.filter((row) => row.type === 'settlement')).toHaveLength(1);
    expect(events.filter((row) => row.type === 'cash_in' || row.type === 'cash_out')).toHaveLength(2);
    expect(source.transactions).toHaveLength(3);
    expect(JSON.stringify(source.transactions)).toBe(before);
  });
  it('respects multiple existing closing snapshots by event ID, without rewriting notes or archives', () => {
    const source = sources(),
      events = projectDailyJournalEvents('store', source, [], now);
    const archives: DailyArchive[] = [
      {
        id: 'first',
        storeId: 'store',
        date: getLocalDateKey(now),
        closingNumber: 1,
        closedAt: timestamp,
        snapshot: events.slice(0, 2),
      },
      {
        id: 'second',
        storeId: 'store',
        date: getLocalDateKey(now),
        closingNumber: 2,
        closedAt: timestamp,
        snapshot: events.slice(2, 3),
      },
    ];
    const before = JSON.stringify(archives);
    expect(projectDailyJournalEvents('store', source, archives, now).map((row) => row.id)).toEqual([events[3].id]);
    expect(JSON.stringify(archives)).toBe(before);
  });
});
