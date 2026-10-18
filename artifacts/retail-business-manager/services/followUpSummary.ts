import { CURRENCY_OPTIONS } from '@/constants/currencies';
import { calculateDebtTotals } from '@/services/storage';
import type { Debt, Reminder } from '@/types/business';
import type { FollowUpPreferences } from '@/services/followUpPreferences';

export function buildFollowUpSummary(debts: Debt[], reminders: Reminder[], spaceId: string, storeId: string, now: Date) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const outstanding = debts.filter((debt) => debt.storeId === storeId && (!debt.workspaceId || debt.workspaceId === spaceId) && debt.amount > 0);
  const overdue = outstanding.filter((debt) => {
    if (!debt.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate)) return false;
    const [year, month, day] = debt.dueDate.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day && debt.dueDate < today;
  });
  const debtIds = new Set(outstanding.map((debt) => debt.id));
  const pending = reminders.filter((reminder) => reminder.workspaceId === spaceId && reminder.storeId === storeId
    && reminder.status === 'pending' && debtIds.has(reminder.debtId) && Date.parse(reminder.remindAt) <= now.getTime());
  const totals = calculateDebtTotals(overdue);
  return {
    overdueDebtIds: overdue.map((debt) => debt.id),
    overdueCustomerCount: new Set(overdue.map((debt) => debt.customerId)).size,
    balances: CURRENCY_OPTIONS.filter(({ code }) => totals[code] > 0).map(({ code }) => ({ currency: code, amount: totals[code] })),
    pendingReminderIds: pending.map((reminder) => reminder.id),
  };
}

export function hasFollowUpContent(summary: ReturnType<typeof buildFollowUpSummary>, preferences: FollowUpPreferences): boolean {
  return (preferences.overdueEnabled && summary.overdueDebtIds.length > 0)
    || (preferences.pendingEnabled && summary.pendingReminderIds.length > 0);
}
