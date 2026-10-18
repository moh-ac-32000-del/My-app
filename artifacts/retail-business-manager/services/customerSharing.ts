import { CURRENCY_OPTIONS, formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, type Language, type TranslationKey } from '@/constants/i18n';
import { calculateDebtTotals } from '@/services/storage';
import type { Customer, Debt } from '@/types/business';

export function buildCustomerStatement(
  customer: Customer,
  debts: Debt[],
  language: Language,
  t: (key: TranslationKey) => string,
  storeName: string,
  now = new Date(),
): string {
  // Reuse the existing outstanding-debt calculation; presentation only.
  const totals = calculateDebtTotals(debts);
  const debtLines = CURRENCY_OPTIONS
    .filter(({ code }) => totals[code] > 0)
    .map(({ code }) => `• ${formatMoney(totals[code], code, language)} (${code})`);
  return [
    '━━━━━━━━━━━━━━',
    `📋 ${t('customerStatementTitle')}`,
    storeName.trim() ? `🏪 ${storeName.trim()}` : null,
    `👤 ${t('statementCustomer')}: ${customer.name}`,
    customer.phone ? `📞 ${t('statementPhone')}: ${customer.phone}` : null,
    `📅 ${t('statementDate')}: ${formatLocalizedDate(now, language)}`,
    '',
    debtLines.length ? `💰 ${t('statementOutstanding')}:` : `✅ ${t('statementNoOutstanding')}`,
    ...debtLines,
    ...(debtLines.length > 1 ? [`ℹ️ ${t('shareSeparateCurrencies')}`] : []),
    '',
    `${t('statementRegards')} 🌷`,
    '━━━━━━━━━━━━━━',
  ].filter((line): line is string => line !== null).join('\n');
}
