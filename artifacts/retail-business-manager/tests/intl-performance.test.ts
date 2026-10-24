import { describe, expect, it, vi } from 'vitest';
import { dateTimeFormatter, numberFormatter } from '../data/intlFormatters';
import { formatMoney, getCurrency } from '../constants/currencies';
import { formatExactMoney } from '../data/exactMoneyPresentation';
import { workspaceDayBounds, workspaceDateKey } from '../data/workspaceClosing';

describe('formatting reuse without changing amounts or calendar rules', () => {
  it('reuses explicit-zone machinery but never caches an implicit device zone', () => {
    expect(dateTimeFormatter('en', { timeZone: 'UTC' })).toBe(dateTimeFormatter('en', { timeZone: 'UTC' }));
    expect(dateTimeFormatter('en', { year: 'numeric' })).not.toBe(dateTimeFormatter('en', { year: 'numeric' }));
    expect(numberFormatter('en', { maximumFractionDigits: 2 })).toBe(numberFormatter('en', { maximumFractionDigits: 2 }));
    expect(() => dateTimeFormatter('en', { timeZone: 'Bad/Zone' })).toThrow();
  });
  it('does not allocate hundreds of Intl objects to find repeated day boundaries', () => {
    const NativeFormatter = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) { return new NativeFormatter(...args); } as typeof Intl.DateTimeFormat);
    try {
      for (let index = 0; index < 10; index++) workspaceDayBounds(new Date('2026-10-23T12:00:00Z'), 'Asia/Kathmandu');
      expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
      expect(workspaceDateKey(new Date('2026-10-23T19:00:00Z'), 'Asia/Kathmandu')).toBe('2026-10-24');
    } finally { spy.mockRestore(); }
  });
  it('preserves old money output for all app languages, precision and large exact integers', () => {
    for (const language of ['ar', 'tr', 'en'] as const) {
      const locale = language === 'ar' ? 'ar' : language === 'tr' ? 'tr-TR' : 'en-US';
      for (const amount of [0, 0.005, -1234.567, 9999999.99]) {
        const number = amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        expect(formatMoney(amount, 'TRY', language)).toBe(`₺ ${number}`);
      }
      for (const value of ['0.00', '-0.005', '900719925474099312345.123456']) {
        const [whole, fraction = '00'] = value.replace(/^-/, '').split('.');
        const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
        const group = parts.find(part => part.type === 'group')!.value;
        const decimal = parts.find(part => part.type === 'decimal')!.value;
        const digits = new Intl.NumberFormat(language === 'ar' ? 'ar' : 'en', { useGrouping: false });
        const number = `${value.startsWith('-') ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${decimal}${fraction}`
          .replace(/\d/g, digit => digits.format(Number(digit)));
        expect(formatExactMoney(value, 'TRY', language)).toBe(`₺ ${number}`);
      }
    }
  });
  it('records a synthetic local CPU comparison, not phone or Firebase latency', () => {
    const old = (value: string) => {
      const [whole, fraction] = value.split('.');
      const parts = new Intl.NumberFormat('tr-TR').formatToParts(1000.1);
      const group = parts.find(part => part.type === 'group')!.value;
      const separator = parts.find(part => part.type === 'decimal')!.value;
      const digits = new Intl.NumberFormat('en', { useGrouping: false });
      const table = Array.from({ length: 10 }, (_, digit) => digits.format(digit));
      return `${getCurrency('TRY').symbol} ${`${whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${separator}${fraction}`.replace(/\d/g, digit => table[Number(digit)])}`;
    };
    const rows = Array.from({ length: 1000 }, (_, index) => `${123456 + index}.123`);
    const at = performance.now(), baseline = rows.map(old), beforeMs = performance.now() - at;
    const next = performance.now(), optimized = rows.map(value => formatExactMoney(value, 'TRY', 'tr'));
    const afterMs = performance.now() - next;
    expect(optimized).toEqual(baseline);
    console.info(JSON.stringify({ benchmark: 'synthetic-1000-money-labels', beforeMs, afterMs, outputEqual: true, deviceTest: false }));
  });
});
