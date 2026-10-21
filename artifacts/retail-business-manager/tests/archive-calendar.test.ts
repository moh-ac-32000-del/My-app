import { describe, expect, it } from 'vitest';
import {
  archiveDateForDisplay,
  isArchiveDate,
  shiftArchiveDate,
  archiveMonthDays,
  shiftArchiveMonth,
} from '@/data/archiveCalendar';

describe('archive date keys do not shift with UTC offsets', () => {
  it('builds a calendar grid with correct weekdays/leap days and bounded month navigation', () => {
    const leap = archiveMonthDays('2024-02');
    expect(leap.slice(0, 4)).toEqual([null, null, null, null]);
    expect(leap[4]).toBe('2024-02-01');
    expect(leap.filter(Boolean)).toHaveLength(29);
    expect(archiveMonthDays('2026-02').filter(Boolean)).toHaveLength(28);
    expect(archiveMonthDays('invalid')).toEqual([]);
    expect(shiftArchiveMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftArchiveMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftArchiveMonth('0001-01', -1)).toBeNull();
    expect(shiftArchiveMonth('9999-12', 1)).toBeNull();
  });
  it.each(['2024-02-29', '2026-10-21', '0001-01-01', '9999-12-31'])('accepts a real day %s', (date) => {
    expect(isArchiveDate(date)).toBe(true);
    const display = archiveDateForDisplay(date);
    expect(display.getFullYear()).toBe(Number(date.slice(0, 4)));
    expect(display.getMonth() + 1).toBe(Number(date.slice(5, 7)));
    expect(display.getDate()).toBe(Number(date.slice(8, 10)));
  });
  it.each(['2026-02-29', '2024-02-30', '2026-00-10', '2026-10-00', '2026-1-01', '0000-01-01', '', null])(
    'rejects %s',
    (date) => {
      expect(isArchiveDate(date)).toBe(false);
    },
  );
  it('moves through leap days, month/year boundaries and stops at supported bounds', () => {
    expect(shiftArchiveDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftArchiveDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftArchiveDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftArchiveDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftArchiveDate('0001-01-01', -1)).toBeNull();
    expect(shiftArchiveDate('9999-12-31', 1)).toBeNull();
    expect(shiftArchiveDate('invalid', 1)).toBeNull();
  });
});
