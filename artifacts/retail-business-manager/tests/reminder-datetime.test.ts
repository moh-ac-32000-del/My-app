import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatReminderDateTime, parseReminderDateTime } from '@/services/reminderDateTime';

afterEach(() => vi.unstubAllEnvs());

describe('web reminder date and time', () => {
  it.each(['UTC', 'Asia/Riyadh', 'America/New_York'])(
    'preserves the selected local calendar date/time and UTC save instant in %s', (timezone) => {
      vi.stubEnv('TZ', timezone);
      const selected = new Date(2026, 9, 19, 0, 15, 0, 0);
      expect(formatReminderDateTime(selected)).toBe('2026-10-19T00:15');
      const parsed = parseReminderDateTime('2026-10-19T00:15');
      expect(parsed?.getTime()).toBe(selected.getTime());
      expect(parsed?.toISOString()).toBe(selected.toISOString());
    },
  );

  it.each(['', '2026-10-19', '2026-10-19T', '2026-02-30T12:00',
    '2026-13-01T12:00', '2026-10-19T24:00', '2026-10-19T12:60',
    '2026-10-19T12:00Z', '2026-10-19T12:00:00', 'not-a-date'])(
    'rejects invalid or incomplete input %j instead of saving the previous date', (input) => {
      expect(parseReminderDateTime(input)).toBeNull();
    },
  );

  it('accepts a valid leap day', () => {
    expect(formatReminderDateTime(parseReminderDateTime('2028-02-29T09:05')!)).toBe('2028-02-29T09:05');
  });

  it('rejects a nonexistent local time during the spring DST transition', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(parseReminderDateTime('2026-03-08T02:30')).toBeNull();
  });
});
