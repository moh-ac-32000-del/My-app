import type { Debt, Reminder, ReminderStatus } from '@/types/business';

export const NOTIFICATION_GROUPS: ReminderStatus[] = ['pending', 'completed', 'dismissed'];

/** Display projection only: Firestore reminders remain the source of truth. */
export function notificationCenterItems(reminders: Reminder[], debts: Debt[], spaceId: string, storeId: string) {
  const byId = new Map(debts.filter((debt) => debt.storeId === storeId
    && (!debt.workspaceId || debt.workspaceId === spaceId)).map((debt) => [debt.id, debt]));
  return reminders.filter((reminder) => reminder.storeId === storeId && reminder.workspaceId === spaceId)
    .map((reminder) => ({
      reminder,
      debt: byId.get(reminder.debtId) ?? null,
      isDueDate: reminder.note === 'system:due-date',
      note: reminder.note === 'system:due-date' ? undefined : reminder.note,
    }))
    .sort((a, b) => NOTIFICATION_GROUPS.indexOf(a.reminder.status) - NOTIFICATION_GROUPS.indexOf(b.reminder.status)
      || (a.reminder.status === 'pending'
        ? Date.parse(a.reminder.remindAt) - Date.parse(b.reminder.remindAt)
        : Date.parse(b.reminder.remindAt) - Date.parse(a.reminder.remindAt))
      || a.reminder.id.localeCompare(b.reminder.id));
}
