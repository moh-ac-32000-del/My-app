import { createHash } from 'node:crypto';
import {
  notificationAtLocalMinute,
  nextDailyNotification,
  reminderNotificationInstant,
} from '../../data/notificationSchedule.js';
import { workspaceDateKey } from '../../data/workspaceClosing.js';
import { parsePushFollowUp } from './pushFollowUpPreferences.js';

export type NotificationRow = Record<string, any>;
export interface NotificationEvent {
  key: string;
  dueAt: string;
  kind: 'reminder' | 'follow-up';
}
export const notificationReceiptId = (deviceId: string, device: NotificationRow, key: string) =>
  createHash('sha256')
    .update(JSON.stringify([deviceId, device.uid, device.spaceId, device.storeId, key]))
    .digest('hex');

/** Shared-space reminders target each currently opted-in member, not the row creator.
 * Pure eligibility only: no amounts/names are copied into notification payloads.
 */
export function planNotifications(
  device: NotificationRow,
  debts: NotificationRow[],
  reminders: NotificationRow[],
  now: string,
) {
  const preferences = parsePushFollowUp(device.followUp);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(device.reminderTime)) throw new Error('notificationTimeInvalid');
  const today = workspaceDateKey(new Date(now), preferences.timeZone);
  const localSlots = new Map<string, string>();
  const localMinute = (date: string, time: string) => {
    const key = `${date}/${time}`;
    if (!localSlots.has(key)) localSlots.set(key, notificationAtLocalMinute(date, time, preferences.timeZone));
    return localSlots.get(key)!;
  };
  const outstanding = new Map<string, NotificationRow>();
  for (const debt of debts) {
    if (
      debt.storeId !== device.storeId ||
      debt.workspaceId !== device.spaceId ||
      typeof debt.id !== 'string' ||
      typeof debt.amount !== 'number' ||
      !Number.isFinite(debt.amount) ||
      debt.amount < 0
    )
      throw new Error('notificationDebtInvalid');
    if (debt.amount > 0 && !debt.settledAt) outstanding.set(debt.id, debt);
  }
  const byId = new Map<string, NotificationRow>();
  for (const reminder of reminders) {
    if (
      reminder.storeId !== device.storeId ||
      reminder.workspaceId !== device.spaceId ||
      typeof reminder.id !== 'string' ||
      !['pending', 'completed', 'dismissed'].includes(reminder.status) ||
      (reminder.note === 'system:due-date' && reminder.id !== `due-date_${reminder.debtId}`)
    )
      throw new Error('notificationReminderInvalid');
    byId.set(reminder.id, reminder);
  }
  const events: NotificationEvent[] = [];
  let overdue = false;
  for (const debt of outstanding.values()) {
    if (!debt.dueDate) continue;
    const dueAt = localMinute(debt.dueDate, device.reminderTime);
    if (debt.dueDate < today) overdue = true;
    const reminder = byId.get(`due-date_${debt.id}`);
    if (reminder && (reminder.deletedAt || reminder.status !== 'pending')) continue;
    events.push({ key: `due:${debt.id}:${debt.dueDate}`, dueAt, kind: 'reminder' });
  }
  for (const reminder of reminders) {
    if (
      reminder.deletedAt ||
      reminder.status !== 'pending' ||
      reminder.note === 'system:due-date' ||
      !outstanding.has(reminder.debtId)
    )
      continue;
    events.push({
      key: `reminder:${reminder.id}`,
      dueAt: reminderNotificationInstant(reminder.remindAt, preferences.timeZone),
      kind: 'reminder',
    });
  }
  const pending = events.some((event) => event.dueAt <= now);
  const followUpAt = localMinute(today, preferences.time);
  if (followUpAt <= now && ((preferences.overdueEnabled && overdue) || (preferences.pendingEnabled && pending))) {
    events.push({ key: `follow-up:${today}`, dueAt: followUpAt, kind: 'follow-up' });
  }
  events.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.key.localeCompare(b.key));
  const nextDaily =
    preferences.overdueEnabled || preferences.pendingEnabled
      ? nextDailyNotification(now, preferences.time, preferences.timeZone).dueAt
      : '9999-12-31T00:00:00.000Z';
  return {
    events,
    nextAt: events
      .filter((event) => event.dueAt > now)
      .reduce((at, event) => (event.dueAt < at ? event.dueAt : at), nextDaily),
  };
}
