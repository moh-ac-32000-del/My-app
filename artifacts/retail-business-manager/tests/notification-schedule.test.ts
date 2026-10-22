import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  nextDailyNotification,
  notificationAtLocalMinute,
  reminderNotificationInstant,
} from '@/data/notificationSchedule';

afterEach(() => vi.unstubAllEnvs());

describe('recipient-independent notification timing; no scheduler or delivery claim', () => {
  it.each(['UTC', 'Asia/Riyadh', 'America/Los_Angeles'])('does not inherit the server clock zone %s', (zone) => {
    vi.stubEnv('TZ', zone);
    expect(notificationAtLocalMinute('2026-10-22', '17:00', 'Europe/Istanbul')).toBe('2026-10-22T14:00:00.000Z');
    expect(reminderNotificationInstant('2026-10-22T09:00:00', 'Europe/Istanbul')).toBe('2026-10-22T06:00:00.000Z');
  });
  it.each([
    ['2026-03-08', '02:30', 'America/New_York', '2026-03-08T07:00:00.000Z'],
    ['2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z'],
    ['2026-10-22', '17:00', 'Asia/Kathmandu', '2026-10-22T11:15:00.000Z'],
    ['2018-11-04', '00:00', 'America/Sao_Paulo', '2018-11-04T03:00:00.000Z'],
    ['2026-10-22', '00:00', 'Pacific/Kiritimati', '2026-10-21T10:00:00.000Z'],
    ['2026-10-22', '00:00', 'Pacific/Pago_Pago', '2026-10-22T11:00:00.000Z'],
  ])('resolves calendar/DST/minute-offset %s %s %s', (date, time, zone, expected) => {
    expect(notificationAtLocalMinute(date, time, zone)).toBe(expected);
  });
  it('preserves absolute manual reminder instants regardless of recipient location', () => {
    for (const zone of ['Europe/Istanbul', 'America/New_York']) {
      expect(reminderNotificationInstant('2026-10-22T09:00:00+03:00', zone)).toBe('2026-10-22T06:00:00.000Z');
      expect(reminderNotificationInstant('2026-10-22T06:00:00.123Z', zone)).toBe('2026-10-22T06:00:00.123Z');
    }
  });
  it('keeps the next daily slot strictly future, including an exact-time retry', () => {
    expect(nextDailyNotification('2026-10-22T13:59:59.999Z', '17:00', 'Europe/Istanbul')).toEqual({
      date: '2026-10-22',
      dueAt: '2026-10-22T14:00:00.000Z',
    });
    for (const now of ['2026-10-22T14:00:00.000Z', '2026-10-22T14:00:00.001Z']) {
      expect(nextDailyNotification(now, '17:00', 'Europe/Istanbul')).toEqual({
        date: '2026-10-23',
        dueAt: '2026-10-23T14:00:00.000Z',
      });
    }
  });
  it('does not schedule a second copy in the repeated DST hour', () => {
    expect(nextDailyNotification('2026-11-01T05:45:00.000Z', '01:30', 'America/New_York')).toEqual({
      date: '2026-11-02',
      dueAt: '2026-11-02T06:30:00.000Z',
    });
  });
  it('advances across a skipped whole local date without inventing that date', () => {
    expect(() => notificationAtLocalMinute('2011-12-30', '17:00', 'Pacific/Apia')).toThrow(
      'notificationLocalDateUnavailable',
    );
    expect(nextDailyNotification('2011-12-30T03:00:00.000Z', '17:00', 'Pacific/Apia')).toEqual({
      date: '2011-12-31',
      dueAt: '2011-12-31T03:00:00.000Z',
    });
  });
  it.each(['2026-02-30', '2026-13-01', '2026-10-22T12:00Z', 'not-a-date'])(
    'fails closed on an invalid calendar value %s',
    (date) => {
      expect(() => notificationAtLocalMinute(date, '17:00', 'Europe/Istanbul')).toThrow();
    },
  );
  it.each(['', '24:00', '17:60', '5:00'])('rejects an invalid selected clock %s', (time) => {
    expect(() => notificationAtLocalMinute('2026-10-22', time, 'Europe/Istanbul')).toThrow();
  });
  it.each(['2026-02-30T09:00:00Z', '2026-10-22T25:00:00Z', '2026-10-22T09:00:30', '2026-10-22'])(
    'does not guess unsupported/malformed reminder time %s',
    (value) => {
      expect(() => reminderNotificationInstant(value, 'Europe/Istanbul')).toThrow();
    },
  );
  it('requires a valid IANA zone for wall-clock reminders and a canonical server instant', () => {
    expect(() => reminderNotificationInstant('2026-10-22T09:00:00', 'Bad/Zone')).toThrow();
    expect(() => nextDailyNotification('2026-10-22T12:00:00+03:00', '17:00', 'Europe/Istanbul')).toThrow();
  });
});
