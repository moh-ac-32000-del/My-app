import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/cloudDailyArchives', () => ({ loadCloudDailyArchives: vi.fn() }));
import { journalHistoryWindow } from '../data/journalHistoryWindow';
import { projectDailyJournalEvents } from '../services/dailyJournalProjection';
import type { DailyJournalSources } from '../services/dailyJournalProjection';

describe('historical journal access does not depend on a closing', () => {
  it('keeps yesterday’s cash, debts and payments readable after midnight without archives or policy', () => {
    const sources: DailyJournalSources = {
      spaceId: 'space', merchantOperations: [{ id: 'purchase', workspaceId: 'space', storeId: 'store', merchantId: 'm', merchantName: 'Merchant',
        action: 'purchase', currency: 'TRY', totalExact: '25.00', paidExact: '0.00', balanceBeforeExact: '0.00', balanceAfterExact: '25.00',
        cashDeltaExact: '0.00', createdAt: '2026-10-27T14:00:00.000Z', createdByUserId: 'u', note: 'Materials' } as never],
      customers: [{ id: 'c', storeId: 'store', name: 'Customer' } as never],
      transactions: [
        { id: 'cash-old', storeId: 'store', type: 'cash_in', amount: 50, currency: 'TRY', createdAt: '2026-10-27T20:59:59.000Z' },
        { id: 'linked', storeId: 'store', type: 'cash_in', amount: 10, currency: 'USD', createdAt: '2026-10-27T12:00:00.000Z' },
        { id: 'cash-new', storeId: 'store', type: 'cash_in', amount: 20, currency: 'TRY', createdAt: '2026-10-27T21:00:00.000Z' },
        { id: 'other-store', storeId: 'other', type: 'cash_in', amount: 999, currency: 'TRY', createdAt: '2026-10-27T12:00:00.000Z' },
      ] as never,
      debts: [{ id: 'debt', storeId: 'store', workspaceId: 'space', customerId: 'c', amount: 20, originalAmount: 30, currency: 'TRY', createdAt: '2026-10-27T10:00:00.000Z' }] as never,
      payments: [{ id: 'paid', storeId: 'store', workspaceId: 'space', customerId: 'c', amount: { amount: 10, currency: 'USD' }, direction: 'in', method: 'cash', transactionId: 'linked', paidAt: '2026-10-27T12:00:00.000Z' }] as never,
    };
    const original = JSON.stringify(sources);
    const today = new Date('2026-10-28T12:00:00.000Z');
    const yesterday = projectDailyJournalEvents('store', sources, [], today, journalHistoryWindow('2026-10-27', 'Europe/Istanbul'));
    expect(yesterday.map(row => row.id).sort()).toEqual(['transaction:cash-old', 'debt:debt', 'settlement:paid', 'merchant:purchase'].sort());
    const nextDaySources = { ...sources, merchantOperations: [] };
    expect(projectDailyJournalEvents('store', nextDaySources, [], today, journalHistoryWindow('2026-10-28', 'Europe/Istanbul')).map(row => row.id)).toEqual(['transaction:cash-new']);
    expect(JSON.stringify(sources)).toBe(original);
  });
  it.each([['2026-03-08', 23], ['2026-11-01', 25]] as const)('uses actual DST boundaries for %s', (date, hours) => {
    const window = journalHistoryWindow(date, 'America/New_York');
    expect((Date.parse(window.endAt) - Date.parse(window.startAt)) / 3_600_000).toBe(hours);
  });
  it.each(['2026-02-30', 'not-a-date'])('rejects an invalid day %s instead of silently choosing today', date => {
    expect(() => journalHistoryWindow(date, 'Europe/Istanbul')).toThrow();
  });
  it('rejects a skipped calendar day and an invalid timezone', () => {
    expect(() => journalHistoryWindow('2011-12-30', 'Pacific/Apia')).toThrow();
    expect(() => journalHistoryWindow('2026-10-27', 'Unknown/Zone')).toThrow();
  });
});
