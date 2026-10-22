import { canonicalTimeZone, workspaceDateKey, workspaceDayBounds } from './workspaceClosing';
import { closingExecutionAt } from './automaticClosing';

const minutePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function calendarDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('notificationDateInvalid');
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('notificationDateInvalid');
  }
}

/** An explicit IANA zone is mandatory; never fall back to the server/device's local zone. */
export function notificationAtLocalMinute(date: string, time: string, timeZone: string): string {
  calendarDate(date);
  if (!minutePattern.test(time)) throw new Error('notificationTimeInvalid');
  const zone = canonicalTimeZone(timeZone);
  const middle = Date.parse(`${date}T12:00:00.000Z`);
  // Locate the actual calendar day, including ±14h offsets and non-existent midnight.
  // A skipped whole local date must require review, not silently become another date.
  for (let hours = -48; hours <= 48; hours += 6) {
    const anchor = new Date(middle + hours * 3_600_000);
    if (workspaceDateKey(anchor, zone) !== date) continue;
    const bounds = workspaceDayBounds(anchor, zone);
    const instant = closingExecutionAt(bounds.startAt, zone, time);
    if (workspaceDateKey(new Date(instant), zone) !== date) throw new Error('notificationLocalDateUnavailable');
    return instant;
  }
  throw new Error('notificationLocalDateUnavailable');
}

/** Next *future* daily slot. A worker must claim a persisted due slot before advancing it.
 * The repeated DST minute is used only once; a missing minute moves after the gap.
 * This computes metadata only; it does not register a device, schedule or send anything.
 */
export function nextDailyNotification(now: string, time: string, timeZone: string): { date: string; dueAt: string } {
  const at = new Date(now);
  if (!Number.isFinite(at.getTime()) || at.toISOString() !== now) throw new Error('notificationClockInvalid');
  const zone = canonicalTimeZone(timeZone);
  const bounds = workspaceDayBounds(at, zone);
  const dueAt = notificationAtLocalMinute(bounds.date, time, zone);
  if (dueAt > now) return { date: bounds.date, dueAt };
  const date = workspaceDateKey(new Date(bounds.endAt), zone);
  return { date, dueAt: notificationAtLocalMinute(date, time, zone) };
}

/** Existing manual reminders have absolute timestamps; generated due-date rows use
 * a wall-clock string without an offset. Resolve only with a verified recipient zone.
 */
export function reminderNotificationInstant(value: string, timeZone: string): string {
  if (typeof value !== 'string') throw new Error('notificationDateInvalid');
  const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::00)?$/.exec(value);
  if (wall) return notificationAtLocalMinute(wall[1], wall[2], timeZone);
  const absolute =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!absolute) throw new Error('notificationDateInvalid');
  calendarDate(absolute[1]);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('notificationDateInvalid');
  return parsed.toISOString();
}
