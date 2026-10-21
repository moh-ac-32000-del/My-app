/** Calendar-only keys: never convert an archive's stored business date through a timezone. */
export function isArchiveDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftArchiveDate(value: string, days: -1 | 1): string | null {
  if (!isArchiveDate(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const next = date.toISOString().slice(0, 10);
  return isArchiveDate(next) ? next : null;
}

export function archiveDateForDisplay(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function shiftArchiveMonth(month: string, offset: -1 | 1): string | null {
  if (!isArchiveDate(`${month}-01`)) return null;
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const next = date.toISOString().slice(0, 7);
  return isArchiveDate(`${next}-01`) ? next : null;
}

export function archiveMonthDays(month: string): Array<string | null> {
  if (!isArchiveDate(`${month}-01`)) return [];
  const first = new Date(`${month}-01T12:00:00Z`);
  const slots: Array<string | null> = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= 31; day++) {
    const key = `${month}-${String(day).padStart(2, '0')}`;
    if (!isArchiveDate(key)) break;
    slots.push(key);
  }
  return slots;
}
