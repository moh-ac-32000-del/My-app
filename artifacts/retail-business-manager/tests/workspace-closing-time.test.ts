import { describe, expect, it } from 'vitest';
import { canonicalTimeZone, closingSettings, workspaceDateKey, workspaceDayBounds } from '@/data/workspaceClosing';

describe('prepared workspace time settings, not scheduler activation', () => {
  it('defaults to Turkey/midnight without relying on the device zone', () => {
    expect(closingSettings()).toEqual({
      timeZone: 'Europe/Istanbul',
      executionTime: '00:00',
      revision: 0,
      status: 'prepared',
    });
    expect(workspaceDateKey(new Date('2026-10-21T22:00:00Z'), 'Europe/Istanbul')).toBe('2026-10-22');
    expect(workspaceDateKey(new Date('2026-10-21T22:00:00Z'), 'America/New_York')).toBe('2026-10-21');
  });
  it.each(['', 'Not_A_Zone', '+03:00', ' Europe/Istanbul', 'Bad/Zone', null])(
    'rejects invalid zone %s rather than using a fallback',
    (zone) => {
      expect(() => canonicalTimeZone(zone)).toThrow('invalidWorkspaceTimeZone');
    },
  );
  it('rejects a malformed saved configuration instead of silently resetting it', () => {
    expect(() =>
      closingSettings({ timeZone: 'Europe/Istanbul', executionTime: '00:00', revision: 1, status: 'enabled' }),
    ).toThrow();
    expect(() => workspaceDateKey(new Date('invalid'), 'UTC')).toThrow('invalidBusinessInstant');
  });
  it.each([
    ['Europe/Istanbul', '2026-10-21T22:00:00Z', '2026-10-22', '2026-10-21T21:00:00.000Z', '2026-10-22T21:00:00.000Z'],
    ['UTC', '2026-10-21T22:00:00Z', '2026-10-21', '2026-10-21T00:00:00.000Z', '2026-10-22T00:00:00.000Z'],
    ['Asia/Kathmandu', '2026-10-21T22:00:00Z', '2026-10-22', '2026-10-21T18:15:00.000Z', '2026-10-22T18:15:00.000Z'],
    [
      'Pacific/Kiritimati',
      '2026-10-21T22:00:00Z',
      '2026-10-22',
      '2026-10-21T10:00:00.000Z',
      '2026-10-22T10:00:00.000Z',
    ],
    ['America/New_York', '2026-03-08T12:00:00Z', '2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
    ['America/New_York', '2026-11-01T12:00:00Z', '2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
    [
      'Australia/Lord_Howe',
      '2026-10-04T12:00:00Z',
      '2026-10-04',
      '2026-10-03T13:30:00.000Z',
      '2026-10-04T13:00:00.000Z',
    ],
    ['America/Sao_Paulo', '2018-11-04T12:00:00Z', '2018-11-04', '2018-11-04T03:00:00.000Z', '2018-11-05T02:00:00.000Z'],
    ['Pacific/Apia', '2011-12-30T12:00:00Z', '2011-12-31', '2011-12-30T10:00:00.000Z', '2011-12-31T10:00:00.000Z'],
  ])('calculates real UTC day boundaries in %s at %s', (zone, instant, date, startAt, endAt) => {
    const before = new Date(instant);
    expect(workspaceDayBounds(before, zone)).toEqual({ date, startAt, endAt });
    expect(before.toISOString()).toBe(new Date(instant).toISOString());
    expect(workspaceDateKey(new Date(startAt), zone)).toBe(date);
    expect(workspaceDateKey(new Date(Date.parse(endAt) - 1), zone)).toBe(date);
    expect(workspaceDateKey(new Date(endAt), zone)).not.toBe(date);
  });
});
