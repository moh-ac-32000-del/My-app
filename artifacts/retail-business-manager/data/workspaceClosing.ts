import { dateTimeFormatter } from './intlFormatters';

/** Prepared metadata only. Saving this does not enable a scheduler or re-date any record. */
export interface WorkspaceClosingSettings {
  timeZone: string;
  executionTime: string;
  revision: number;
  status: 'prepared';
  updatedAt?: string;
  updatedByUserId?: string;
}

export function canonicalTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(value)) {
    throw new Error('invalidWorkspaceTimeZone');
  }
  try {
    return dateTimeFormatter('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new Error('invalidWorkspaceTimeZone');
  }
}

export function closingSettings(value?: unknown): WorkspaceClosingSettings {
  if (value === undefined)
    return { timeZone: 'Europe/Istanbul', executionTime: '00:00', revision: 0, status: 'prepared' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalidClosingSettings');
  const row = value as Record<string, unknown>;
  if (
    row.status !== 'prepared' ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 1 ||
    Number(row.revision) >= Number.MAX_SAFE_INTEGER ||
    typeof row.executionTime !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.executionTime) ||
    typeof row.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(row.updatedAt)) ||
    typeof row.updatedByUserId !== 'string' ||
    !row.updatedByUserId
  )
    throw new Error('invalidClosingSettings');
  return {
    timeZone: canonicalTimeZone(row.timeZone),
    executionTime: row.executionTime,
    revision: Number(row.revision),
    status: 'prepared',
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

export function workspaceDateKey(instant: Date, timeZone: string): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('invalidBusinessInstant');
  const parts = dateTimeFormatter('en-CA', {
    timeZone: canonicalTimeZone(timeZone),
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const field = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${field('year').padStart(4, '0')}-${field('month')}-${field('day')}`;
}

/** UTC interval of the real local calendar day, including 23/25h DST days and midnight gaps.
 * Preview/planning utility only until the financial posting and scheduler cutover is reviewed.
 */
export function workspaceDayBounds(instant: Date, timeZone: string): { date: string; startAt: string; endAt: string } {
  const zone = canonicalTimeZone(timeZone);
  const date = workspaceDateKey(instant, zone);
  const current = instant.getTime();
  const span = 96 * 60 * 60 * 1000;
  const boundary = (low: number, high: number, predicate: (key: string) => boolean) => {
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (predicate(workspaceDateKey(new Date(mid), zone))) high = mid;
      else low = mid;
    }
    return new Date(high).toISOString();
  };
  return {
    date,
    startAt: boundary(current - span, current, (key) => key >= date),
    endAt: boundary(current, current + span, (key) => key > date),
  };
}
