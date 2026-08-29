import { describe, expect, it } from 'vitest';
import { formatMoney, normalizeCurrency, normalizeQuickCurrencies } from '@/constants/currencies';

describe('currency helpers', () => {
  it('normalizes currency codes and legacy symbols', () => {
    expect(normalizeCurrency('TRY')).toBe('TRY');
    expect(normalizeCurrency('₺')).toBe('TRY');
    expect(normalizeCurrency('unknown')).toBe('SAR');
  });

  it('keeps only supported unique quick currencies', () => {
    expect(normalizeQuickCurrencies(['USD', 'TRY', 'USD', 'unknown'])).toEqual(['USD', 'TRY']);
    expect(normalizeQuickCurrencies([])).toEqual([]);
    expect(normalizeQuickCurrencies(null, ['EUR'])).toEqual(['EUR']);
  });

  it('formats currencies using their placement and locale', () => {
    expect(formatMoney(1234.5, 'USD', 'en')).toBe('$ 1,234.5');
    expect(formatMoney(1234.5, 'SAR', 'en')).toBe('1,234.5 ر.س');
    expect(formatMoney(10, 'TRY', 'tr')).toContain('₺');
  });
});