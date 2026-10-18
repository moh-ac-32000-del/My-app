import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
import { DEFAULT_FOLLOW_UP, followUpScopeKey, loadFollowUpPreferences, saveFollowUpPreferences } from '@/services/followUpPreferences';
import { DEFAULT_NOTIFICATION_TIME } from '@/services/preferences';
import { buildFollowUpSummary, hasFollowUpContent } from '@/services/followUpSummary';
import type { Debt, Reminder } from '@/types/business';
const scope = { uid: 'user-a', spaceId: 'space-a', storeId: 'store-a' };
const date = '2026-10-18T09:00:00';
const now = new Date(2026, 9, 18, 17);
const debt: Debt = { id: 'debt-a', workspaceId: scope.spaceId, storeId: scope.storeId, customerId: 'customer-a', amount: 70, originalAmount: 100, currency: 'TRY', dueDate: '2026-10-17', createdAt: date, updatedAt: date };
const reminder: Reminder = { id: 'reminder-a', workspaceId: scope.spaceId, storeId: scope.storeId, debtId: debt.id, remindAt: date, status: 'pending', createdAt: date, updatedAt: date };
const summary = (debts: Debt[] = [debt], reminders: Reminder[] = [reminder]) => buildFollowUpSummary(debts, reminders, scope.spaceId, scope.storeId, now);

describe('personal follow-up preferences', () => {
  beforeEach(() => vi.clearAllMocks());
  it('defaults to 17:00 without changing the separate 09:00 due-date default', async () => {
    storage.getItem.mockResolvedValue(null);
    expect(await loadFollowUpPreferences(scope)).toEqual({ time: '17:00', overdueEnabled: true, pendingEnabled: true });
    expect(DEFAULT_NOTIFICATION_TIME).toBe('09:00');
  });
  it('persists both independently configurable categories and a custom time', async () => {
    storage.setItem.mockResolvedValue(undefined);
    const preferences = { time: '18:30', overdueEnabled: false, pendingEnabled: true };
    await saveFollowUpPreferences(scope, preferences);
    const [key, json] = storage.setItem.mock.calls[0];
    expect(key).toBe(followUpScopeKey(scope));
    storage.getItem.mockResolvedValue(json);
    expect(await loadFollowUpPreferences(scope)).toEqual(preferences);
  });
  it('isolates account, workspace and store preferences', () => {
    const keys = [scope, { ...scope, uid: 'user-b' }, { ...scope, spaceId: 'space-b' }, { ...scope, storeId: 'store-b' }].map(followUpScopeKey);
    expect(new Set(keys).size).toBe(4);
  });
  it.each(['bad-json', '{"time":"25:00"}', '{"time":"17:00","overdueEnabled":"yes","pendingEnabled":true}'])('handles invalid stored preferences: %s', async (value) => {
    storage.getItem.mockResolvedValue(value);
    expect(await loadFollowUpPreferences(scope)).toEqual(DEFAULT_FOLLOW_UP);
  });
  it.each(['', '24:00', '17:60', '5:00'])('rejects invalid times before writing: %s', async (time) => {
    await expect(saveFollowUpPreferences(scope, { ...DEFAULT_FOLLOW_UP, time })).rejects.toThrow('followUpPreferencesInvalid');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('propagates storage failures rather than claiming preferences were saved', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('disk-failed'));
    await expect(saveFollowUpPreferences(scope, DEFAULT_FOLLOW_UP)).rejects.toThrow('disk-failed');
    storage.getItem.mockRejectedValueOnce(new Error('read-failed'));
    await expect(loadFollowUpPreferences(scope)).rejects.toThrow('read-failed');
  });
});

describe('two distinct follow-up sections', () => {
  it('counts overdue debts/customers and separates remaining currency totals without mutation', () => {
    const debts: Debt[] = [debt, { ...debt, id: 'b', amount: 30 }, { ...debt, id: 'usd', customerId: 'customer-b', amount: 20, currency: 'USD' }];
    const before = JSON.stringify(debts);
    expect(summary(debts)).toMatchObject({ overdueDebtIds: ['debt-a', 'b', 'usd'], overdueCustomerCount: 2, balances: [{ currency: 'TRY', amount: 100 }, { currency: 'USD', amount: 20 }] });
    expect(JSON.stringify(debts)).toBe(before);
  });
  it.each(['2026-10-18', '2026-10-19', undefined, '2026-02-30', 'invalid'])('does not classify current/future/invalid due date as overdue: %s', (dueDate) => {
    expect(summary([{ ...debt, dueDate }]).overdueDebtIds).toEqual([]);
  });
  it('only counts due pending reminders, excluding future/completed/dismissed reminders', () => {
    const records: Reminder[] = [reminder, { ...reminder, id: 'future', remindAt: '2026-10-18T18:00:00' }, { ...reminder, id: 'done', status: 'completed' }, { ...reminder, id: 'ignored', status: 'dismissed' }];
    expect(summary([debt], records).pendingReminderIds).toEqual(['reminder-a']);
  });
  it('finishing a reminder leaves the debt in the overdue summary until a real payment changes its balance', () => {
    expect(summary([debt], [{ ...reminder, status: 'completed' }])).toMatchObject({ overdueDebtIds: ['debt-a'], pendingReminderIds: [] });
    expect(summary([{ ...debt, amount: 0 }])).toMatchObject({ overdueDebtIds: [], pendingReminderIds: [] });
  });
  it('excludes other stores/spaces and orphan reminders', () => {
    const debts: Debt[] = [{ ...debt, storeId: 'other' }, { ...debt, workspaceId: 'other' }];
    expect(summary(debts)).toMatchObject({ overdueDebtIds: [], pendingReminderIds: [] });
    expect(summary([debt], [{ ...reminder, workspaceId: 'other' }, { ...reminder, storeId: 'other' }]).pendingReminderIds).toEqual([]);
  });
  it('plans no follow-up alert when there is nothing actionable or both categories are disabled', () => {
    expect(hasFollowUpContent(summary([], []), DEFAULT_FOLLOW_UP)).toBe(false);
    expect(hasFollowUpContent(summary(), { ...DEFAULT_FOLLOW_UP, overdueEnabled: false, pendingEnabled: false })).toBe(false);
    expect(hasFollowUpContent(summary(), DEFAULT_FOLLOW_UP)).toBe(true);
    expect(hasFollowUpContent(summary([debt], []), { ...DEFAULT_FOLLOW_UP, overdueEnabled: false })).toBe(false);
  });
});
