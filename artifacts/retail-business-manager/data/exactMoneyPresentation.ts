import { getCurrency, type CurrencyCode } from '@/constants/currencies';
import type { Language } from '@/constants/i18n';
import { numberFormatter } from './intlFormatters';

const localeTokens = new Map<string, { group: string; separator: string; digits: string[] }>();
function moneyTokens(language: Language) {
  const locale = language === 'tr' ? 'tr-TR' : language === 'ar' ? 'ar' : 'en-US';
  const existing = localeTokens.get(locale);
  if (existing) return existing;
  const parts = numberFormatter(locale).formatToParts(1000.1);
  const digitFormatter = numberFormatter(language === 'ar' ? 'ar' : 'en', { useGrouping: false });
  const tokens = { group: parts.find(part => part.type === 'group')?.value ?? ',',
    separator: parts.find(part => part.type === 'decimal')?.value ?? '.',
    digits: Array.from({ length: 10 }, (_, index) => digitFormatter.format(index)) };
  localeTokens.set(locale, tokens);
  return tokens;
}

/** Locale input without converting financial amounts to a floating-point number. No grouping accepted. */
export function exactMoneyEntry(value: string, places: number, signed = false): string {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٫,]/g, '.');
  const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(normalized);
  if (
    !match ||
    (!signed && match[1]) ||
    (!match[2] && !match[3]) ||
    (match[3]?.length ?? 0) > places ||
    normalized.length > 80
  )
    throw new Error('invalidExactMoneyEntry');
  const whole = (match[2] || '0').replace(/^0+(?=\d)/, '');
  const fraction = match[3] ?? '';
  const negative = match[1] && /[1-9]/.test(whole + fraction) ? '-' : '';
  const canonical = `${negative}${whole}.${fraction.padEnd(places, '0')}`;
  if (canonical.length > 80) throw new Error('invalidExactMoneyEntry');
  return canonical;
}

/** Exact decimal text, including legacy fractions and integers larger than Number.MAX_SAFE_INTEGER. */
export function formatExactMoney(value: string, currency: CurrencyCode, language: Language): string {
  if (typeof value !== 'string' || value.length > 500 || !/^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error('invalidExactMoney');
  const negative = value.startsWith('-');
  const [whole, fraction = '00'] = (negative ? value.slice(1) : value).split('.');
  const { group, separator, digits } = moneyTokens(language);
  const number =
    `${negative ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${separator}${fraction}`.replace(
      /\d/g,
      (digit) => digits[Number(digit)],
    );
  const definition = getCurrency(currency);
  return definition.placement === 'before' ? `${definition.symbol} ${number}` : `${number} ${definition.symbol}`;
}
