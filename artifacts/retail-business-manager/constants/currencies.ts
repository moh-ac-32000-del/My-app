import type { Language, TranslationKey } from '@/constants/i18n';

export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'SYP';
export type CurrencyPlacement = 'before' | 'after';

export interface CurrencyDefinition {
  code: CurrencyCode;
  symbol: string;
  nameKey: TranslationKey;
  placement: CurrencyPlacement;
}

export const DEFAULT_CURRENCY: CurrencyCode = 'SAR';

const currencyCodes = new Set<CurrencyCode>(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);

export const CURRENCY_OPTIONS: CurrencyDefinition[] = [
  { code: 'TRY', symbol: '₺', nameKey: 'currencyTRYName', placement: 'before' },
  { code: 'USD', symbol: '$', nameKey: 'currencyUSDName', placement: 'before' },
  { code: 'EUR', symbol: '€', nameKey: 'currencyEURName', placement: 'before' },
  { code: 'GBP', symbol: '£', nameKey: 'currencyGBPName', placement: 'before' },
  { code: 'SAR', symbol: 'ر.س', nameKey: 'currencySARName', placement: 'after' },
  { code: 'AED', symbol: 'د.إ', nameKey: 'currencyAEDName', placement: 'after' },
  { code: 'SYP', symbol: 'ل.س', nameKey: 'currencySYPName', placement: 'after' },
];

const currencyMap: Record<CurrencyCode, CurrencyDefinition> = Object.fromEntries(
  CURRENCY_OPTIONS.map((currency) => [currency.code, currency]),
) as Record<CurrencyCode, CurrencyDefinition>;

export function getCurrency(code: CurrencyCode): CurrencyDefinition {
  return currencyMap[code] ?? currencyMap[DEFAULT_CURRENCY];
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && currencyCodes.has(value as CurrencyCode);
}

export function normalizeCurrency(value: unknown, fallback: CurrencyCode = DEFAULT_CURRENCY): CurrencyCode {
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
  return typeof value === 'string' ? legacyCurrencyMap[value] ?? fallback : fallback;
}

export function normalizeQuickCurrencies(value: unknown, fallback: CurrencyCode[] = [DEFAULT_CURRENCY]): CurrencyCode[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return Array.from(
    new Set(
      value.filter((item): item is CurrencyCode =>
        typeof item === 'string' && currencyCodes.has(item as CurrencyCode),
      ),
    ),
  );
}

export function formatMoney(
  amount: number,
  code: CurrencyCode,
  language: Language = 'ar',
): string {
  const currency = getCurrency(code);
  const locale = language === 'ar' ? 'ar' : language === 'tr' ? 'tr-TR' : 'en-US';
  const formattedAmount = amount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency.placement === 'before'
    ? `${currency.symbol} ${formattedAmount}`
    : `${formattedAmount} ${currency.symbol}`;
}