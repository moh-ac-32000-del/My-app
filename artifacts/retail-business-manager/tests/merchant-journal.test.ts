import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/cloudDailyArchives', () => ({ loadCloudDailyArchives: vi.fn() }));
import { merchantJournalEvent, mergeMerchantJournal } from '@/data/merchantJournal';
import type { MerchantJournalSources } from '@/data/merchantJournal';
import { projectDailyJournalEvents } from '@/services/dailyJournalProjection';
import { journalEventDetails, journalEventMoney, journalEventTitle } from '@/services/journalPresentation';
import { translate } from '@/constants/i18n';
import { buildArchiveShareMessage } from '@/services/archiveSharing';
import type { MerchantOperation } from '@/types/merchant';
import type { DailyJournalEvent } from '@/types/journal';

const now = '2026-10-19T12:00:00.000Z';
const operation: MerchantOperation = {
  id: 'op',
  workspaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  merchantName: 'Merchant name',
  action: 'purchase',
  currency: 'TRY',
  totalExact: '4500.00',
  paidExact: '1000.00',
  source: 'cash',
  transactionId: 'cash',
  balanceBeforeExact: '0.00',
  balanceAfterExact: '3500.00',
  cashDeltaExact: '-1000.00',
  createdAt: now,
  createdByUserId: 'u',
  note: 'Purchased screens',
  lines: [{ name: 'Screens', quantity: '5', unitPrice: '900', totalExact: '4500.00' }],
};
const cash = {
  id: 'cash',
  workspaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  merchantOperationId: 'op',
  type: 'cash_out' as const,
  currency: 'TRY' as const,
  amount: 1000,
  amountExact: '1000.00',
  createdAt: now,
  updatedAt: now,
};
const legacy: DailyJournalEvent = {
  id: 'transaction:cash',
  storeId: 'store',
  type: 'cash_out',
  amount: 1000,
  currency: 'TRY',
  occurredAt: now,
  sourceId: 'cash',
};
function merge(op: MerchantOperation = operation, transaction: MerchantJournalSources['transactions'][number] = cash) {
  return mergeMerchantJournal('s', 'store', [op], [legacy], { transactions: [transaction], debts: [], payments: [] });
}
describe('unified merchant journal', () => {
  it('shows a purchase and its cash leg once, preserving immutable exact amounts, actor, items and notes', () => {
    const original = JSON.stringify({ operation, cash, legacy });
    expect(merge()).toEqual([
      expect.objectContaining({
        id: 'merchant:op',
        amount: 4500,
        amountExact: '4500.00',
        merchantAction: 'purchase',
        cashDeltaExact: '-1000.00',
        lines: operation.lines,
        createdByUserId: 'u',
      }),
    ]);
    expect(JSON.stringify({ operation, cash, legacy })).toBe(original);
  });
  it('keeps fine/large invoice precision in archive display, never using the numeric mirror as authoritative', () => {
    const event = merchantJournalEvent({ ...operation, totalExact: '9007199254740993.00' });
    expect(journalEventMoney(event, 'en')).toContain('9,007,199,254,740,993.00');
  });
  it.each(['ar', 'tr', 'en'] as const)(
    'renders readable parties, details, cash effect and archive share in %s',
    (language) => {
      const t = (key: Parameters<typeof translate>[0]) => translate(key, language);
      const event = merchantJournalEvent(operation);
      expect(journalEventTitle(event, t)).toBe(`${t('merchantPurchase')} — Merchant name`);
      const details = journalEventDetails(event, language, t).join('\n');
      expect(details).toContain('Purchased screens');
      expect(details).toContain('Screens · 5 × 900');
      expect(details).toContain(t('merchantCashEffect'));
      const message = buildArchiveShareMessage(
        {
          id: 'a',
          storeId: 'store',
          date: '2026-10-19',
          closedAt: now,
          closingNumber: 1,
          snapshot: [event],
          closingCashBalances: [{ currency: 'TRY', amount: -1000 }],
        },
        'Store',
        language,
        t,
      );
      expect(message).toContain('Merchant name');
      expect(message).toContain('Screens · 5 × 900');
      expect(message).toContain(t('cashBalanceAtClosing'));
    },
  );
  it.each([
    { ...operation, workspaceId: 'other' },
    { ...operation, storeId: 'other' },
    { ...operation, transactionId: 'absent' },
    { ...operation, cashDeltaExact: '1000.00' },
    { ...operation, totalExact: undefined },
    { ...operation, cashDeltaExact: '0.00' },
  ])('fails closed on an inconsistent operation %j', (op) => expect(() => merge(op)).toThrow());
  it.each([
    { ...cash, merchantOperationId: 'another' },
    { ...cash, merchantId: 'another' },
    { ...cash, createdAt: '2026-10-19T13:00:00.000Z' },
    { ...cash, currency: 'USD' as const },
    { ...cash, amount: 1001 },
    { ...cash, amountExact: '1001.00' },
  ])('does not hide inconsistent linked cash %j', (record) => expect(() => merge(operation, record)).toThrow());
  it('rejects duplicate operations or cash records rather than displaying two business events', () => {
    expect(() =>
      mergeMerchantJournal('s', 'store', [operation, operation], [], { transactions: [cash], debts: [], payments: [] }),
    ).toThrow();
    expect(() =>
      mergeMerchantJournal('s', 'store', [operation], [], { transactions: [cash, cash], debts: [], payments: [] }),
    ).toThrow();
  });
  it('waits for the canonical operation when a linked source arrives first', () => {
    expect(() =>
      mergeMerchantJournal('s', 'store', [], [legacy], { transactions: [cash], debts: [], payments: [] }),
    ).toThrow();
  });
  it('keeps new noncash purchases visible and explicitly labels their drawer effect as zero', () => {
    const op = {
      ...operation,
      source: 'external',
      paidExact: '1000.00',
      transactionId: undefined,
      cashDeltaExact: '0.00',
    };
    const [event] = mergeMerchantJournal('s', 'store', [op], [], { transactions: [], debts: [], payments: [] });
    expect(journalEventDetails(event, 'en', (key) => translate(key, 'en'))).toContain(
      translate('merchantNoncash', 'en'),
    );
  });
  it('filters canonical archived IDs only after deduplication, without bringing back linked cash', () => {
    const result = projectDailyJournalEvents(
      'store',
      { transactions: [cash], debts: [], payments: [], customers: [], spaceId: 's', merchantOperations: [operation] },
      [
        {
          id: 'a',
          storeId: 'store',
          date: '2026-10-19',
          closedAt: now,
          closingNumber: 1,
          snapshot: [merchantJournalEvent(operation)],
        },
      ],
      new Date(now),
    );
    expect(result).toEqual([]);
  });
  it('preserves old journal ordering and notes without requiring merchant sources from legacy callers', () => {
    const rows = projectDailyJournalEvents(
      'store',
      {
        transactions: [],
        payments: [],
        customers: [],
        debts: [
          {
            id: 'd',
            storeId: 'store',
            customerId: 'c',
            currency: 'TRY',
            amount: 3,
            note: 'Sold items on credit',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      [],
      new Date(now),
    );
    expect(rows[0]).toMatchObject({ id: 'debt:d', note: 'Sold items on credit' });
  });
});
