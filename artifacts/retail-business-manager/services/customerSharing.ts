import { CURRENCY_OPTIONS, formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, type Language, type TranslationKey } from '@/constants/i18n';
import { calculateDebtTotals } from '@/services/storage';
import type { Customer, Debt } from '@/types/business';
import type { ExactMoney } from '@/data/merchantAccounting';
import { formatExactMoney } from '@/data/exactMoneyPresentation';

export function buildCustomerStatement(
  customer: Customer,
  debts: Debt[],
  language: Language,
  t: (key: TranslationKey) => string,
  storeName: string,
  now = new Date(),
  balances?: ExactMoney[],
): string {
  // Reuse the existing outstanding-debt calculation; presentation only.
  const totals = calculateDebtTotals(debts);
  const debtLines = balances ? balances.filter(balance => balance.amount !== '0.00' && !balance.amount.startsWith('-'))
    .map(balance => `• ${formatExactMoney(balance.amount, balance.currency, language)} (${balance.currency})`) : CURRENCY_OPTIONS
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
    ...(balances?.some(balance => balance.amount.startsWith('-')) ? [
      '', `💳 ${t('customerCreditBalance')}:`, ...balances.filter(balance => balance.amount.startsWith('-'))
        .map(balance => `• ${formatExactMoney(balance.amount.slice(1), balance.currency, language)} (${balance.currency})`),
    ] : []),
    ...(debtLines.length > 1 ? [`ℹ️ ${t('shareSeparateCurrencies')}`] : []),
    '',
    `${t('statementRegards')} 🌷`,
    '━━━━━━━━━━━━━━',
  ].filter((line): line is string => line !== null).join('\n');
}
