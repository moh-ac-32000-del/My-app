import type { Language, TranslationKey } from '../constants/i18n';
import { formatMoney } from '../constants/currencies';
import { formatExactMoney } from '../data/exactMoneyPresentation';
import type { DailyJournalEvent } from '../types/journal';

type Translate = (key: TranslationKey) => string;
export function journalEventTitle(event: DailyJournalEvent, t: Translate): string {
  if (event.type === 'merchant') {
    const labels = {
      opening: 'merchantOpening',
      purchase: 'merchantPurchase',
      payment: 'merchantPayment',
      directPayment: 'merchantDirect',
      reverse: 'merchantReverse',
    } as const;
    return [
      t(event.merchantAction ? labels[event.merchantAction] : 'merchants'),
      event.merchantName,
      event.customerName,
    ]
      .filter(Boolean)
      .join(' — ');
  }
  if (event.type === 'cash_in') return t('cashIn');
  if (event.type === 'cash_out') return t('cashOut');
  const customer = event.customerName ?? t('unknownCustomer');
  return event.type === 'debt' ? `${t('archiveDebt')} — ${customer}` : `${t('settlementFrom')} ${customer}`;
}
export function journalEventMoney(event: DailyJournalEvent, language: Language): string {
  return event.amountExact !== undefined
    ? formatExactMoney(event.amountExact, event.currency, language)
    : formatMoney(event.amount, event.currency, language);
}
export function journalEventDetails(event: DailyJournalEvent, language: Language, t: Translate): string[] {
  return [
    ...(event.note ? [event.note] : []),
    ...(event.lines ?? []).map(
      (line) =>
        `${line.name} · ${line.quantity} × ${line.unitPrice} = ${formatExactMoney(line.totalExact, event.currency, language)}`,
    ),
    ...(event.cashDeltaExact !== undefined
      ? [
          event.cashDeltaExact === '0.00'
            ? t('merchantNoncash')
            : `${t('merchantCashEffect')}: ${formatExactMoney(event.cashDeltaExact, event.currency, language)}`,
        ]
      : []),
  ];
}
