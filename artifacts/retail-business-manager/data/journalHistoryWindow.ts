import { isArchiveDate } from './archiveCalendar';
import { canonicalTimeZone, workspaceDateKey, workspaceDayBounds } from './workspaceClosing';
import type { FinancialWindow } from './automaticClosing';

/** Read-only calendar selection. Never closes a day or changes source timestamps. */
export function journalHistoryWindow(date: string, timeZone: string): FinancialWindow {
  if (!isArchiveDate(date)) throw new Error('invalidJournalHistoryDate');
  const zone = canonicalTimeZone(timeZone);
  const middle = Date.parse(`${date}T12:00:00.000Z`);
  for (let hours = -48; hours <= 48; hours += 6) {
    const anchor = new Date(middle + hours * 3_600_000);
    if (workspaceDateKey(anchor, zone) === date) return { ...workspaceDayBounds(anchor, zone), timeZone: zone };
  }
  throw new Error('journalHistoryDateUnavailable');
}
