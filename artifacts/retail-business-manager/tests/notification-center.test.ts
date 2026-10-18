import { describe, expect, it } from 'vitest';
import { notificationCenterItems } from '@/services/notificationCenter';
import { translate } from '@/constants/i18n';
import type { Debt, Reminder } from '@/types/business';

const date = '2026-10-18T09:00:00.000Z';
const debt: Debt = { id: 'debt-a', customerId: 'customer-a', workspaceId: 'space-a', storeId: 'store-a', amount: 70, originalAmount: 100, currency: 'TRY', createdAt: date, updatedAt: date };
const reminder: Reminder = { id: 'reminder-a', debtId: debt.id, workspaceId: 'space-a', storeId: 'store-a', remindAt: date, status: 'pending', createdAt: date, updatedAt: date };
const project = (reminders: Reminder[], debts: Debt[] = [debt]) => notificationCenterItems(reminders, debts, 'space-a', 'store-a');

describe('notification center projection', () => {
  it('shows remaining cloud debt and hides internal generated-reminder markers without mutation', () => {
    const record = { ...reminder, note: 'system:due-date' };
    const before = JSON.stringify({ record, debt });
    expect(project([record])[0]).toMatchObject({ isDueDate: true, note: undefined, debt: { amount: 70, currency: 'TRY' } });
    expect(JSON.stringify({ record, debt })).toBe(before);
  });

  it('preserves a manual reminder note', () => {
    expect(project([{ ...reminder, note: 'Call customer' }])[0]).toMatchObject({ isDueDate: false, note: 'Call customer' });
  });

  it.each([{ workspaceId: 'other' }, { storeId: 'other' }, { workspaceId: undefined }])('never displays another or unscoped workspace reminder: %j', (changed) => {
    expect(project([{ ...reminder, ...changed }])).toEqual([]);
  });

  it.each([{ workspaceId: 'other' }, { storeId: 'other' }])('never joins a debt from another scope: %j', (changed) => {
    expect(project([reminder], [{ ...debt, ...changed }])[0].debt).toBeNull();
  });

  it('keeps a reminder visible with an unavailable-debt marker if its debt is missing', () => {
    expect(project([reminder], [])[0].debt).toBeNull();
  });

  it('groups pending before completed/dismissed and sorts pending by reminder time without mutating input', () => {
    const records: Reminder[] = [
      { ...reminder, id: 'completed', status: 'completed' },
      { ...reminder, id: 'later', remindAt: '2026-10-19T09:00:00.000Z' },
      { ...reminder, id: 'dismissed', status: 'dismissed' },
      { ...reminder, id: 'earlier' },
    ];
    expect(project(records).map((item) => item.reminder.id)).toEqual(['earlier', 'later', 'completed', 'dismissed']);
    expect(records[0].id).toBe('completed');
  });

  it('represents no cloud reminders as an empty list', () => {
    expect(project([])).toEqual([]);
  });

  it.each(['ar', 'en', 'tr'] as const)('explains in-app versus phone alert support in %s', (language) => {
    expect(translate('notificationCenterNativePending', language)).toBeTruthy();
    expect(translate('notificationCenterLoadError', language)).not.toBe(translate('remindersEmpty', language));
  });
});
