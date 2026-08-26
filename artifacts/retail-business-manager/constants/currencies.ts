import type { Language } from '@/constants/i18n';

export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'SYP';
export type CurrencyPlacement = 'before' | 'after';

export interface CurrencyDefinition {
  code: CurrencyCode;
  symbol: string;
  name: string;
  placement: CurrencyPlacement;
}

export const DEFAULT_CURRENCY: CurrencyCode = 'SAR';

export const CURRENCY_OPTIONS: CurrencyDefinition[] = [
  { code: 'TRY', symbol: '₺', name: 'الليرة التركية', placement: 'before' },
  { code: 'USD', symbol: '$', name: 'الدولار الأمريكي', placement: 'before' },
  { code: 'EUR', symbol: '€', name: 'اليورو', placement: 'before' },
  { code: 'GBP', symbol: '£', name: 'الجنيه الإسترليني', placement: 'before' },
  { code: 'SAR', symbol: 'ر.س', name: 'الريال السعودي', placement: 'after' },
  { code: 'AED', symbol: 'د.إ', name: 'الدرهم الإماراتي', placement: 'after' },
  { code: 'SYP', symbol: 'ل.س', name: 'الليرة السورية', placement: 'after' },
];

const currencyMap: Record<CurrencyCode, CurrencyDefinition> = Object.fromEntries(
  CURRENCY_OPTIONS.map((currency) => [currency.code, currency]),
) as Record<CurrencyCode, CurrencyDefinition>;

export function getCurrency(code: CurrencyCode): CurrencyDefinition {
  return currencyMap[code] ?? currencyMap[DEFAULT_CURRENCY];
}

export function normalizeCurrency(value: unknown): CurrencyCode {
  if (typeof value === 'string' && value in currencyMap) {
    return value as CurrencyCode;
  }
  const legacyCurrencyMap: Record<string, CurrencyCode> = {
    'ر.س': 'SAR',
    'د.إ': 'AED',
    'ل.س': 'SYP',
    '₺': 'TRY',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
  };
  return typeof value === 'string' ? legacyCurrencyMap[value] ?? DEFAULT_CURRENCY : DEFAULT_CURRENCY;
}

export function formatMoney(
  amount: number,
  code: CurrencyCode,
  _language: Language = 'ar',
): string {
  const currency = getCurrency(code);
  const formattedAmount = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency.placement === 'before'
    ? `${currency.symbol} ${formattedAmount}`
    : `${formattedAmount} ${currency.symbol}`;
}