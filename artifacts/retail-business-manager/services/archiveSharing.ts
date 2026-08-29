import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime, type Language, type TranslationKey } from '@/constants/i18n';
import type { DailyArchive } from '@/types/business';
import type { DailyJournalEvent } from '@/services/storage';

type Translate = (key: TranslationKey) => string;

function parseArchiveDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function eventLabel(event: DailyJournalEvent, t: Translate): string {
  if (event.type === 'cash_in') {
    return t('cashIn');
  }
  if (event.type === 'cash_out') {
    return t('cashOut');
  }
  const customerName = event.customerName ?? t('unknownCustomer');
  return event.type === 'debt'
    ? `${t('archiveDebt')} — ${customerName}`
    : `${t('settlementFrom')} ${customerName}`;
}

export function buildArchiveShareMessage(
  archive: DailyArchive,
  storeName: string,
  language: Language,
  t: Translate,
): string {
  const lines = [
    '━━━━━━━━━━━━━━',
    `📦 ${t('archive')}`,
    storeName.trim() ? `🏪 ${storeName.trim()}` : null,
    `📅 ${t('archiveDate')}: ${formatLocalizedDate(parseArchiveDate(archive.date), language)}`,
    `🔒 ${t('closeDay')} #${archive.closingNumber}`,
    `🕒 ${t('archiveClosedAt')}: ${formatLocalizedDateTime(new Date(archive.closedAt), language)}`,
    '',
    `🧾 ${t('archiveEvents')}:`,
  ];

  archive.snapshot.forEach((event, index) => {
    lines.push(
      `${index + 1}. ${t('archiveOperation')}: ${eventLabel(event, t)}`,
      `   ${formatMoney(event.amount, event.currency, language)} (${event.currency})`,
      `   ${formatLocalizedDateTime(new Date(event.occurredAt), language)}`,
      ...(event.note ? [`   ${t('optionalNote')}: ${event.note}`] : []),
    );
  });

  if (archive.snapshot.length === 0) {
    lines.push(`   ${t('archiveNoEvents')}`);
  }
  lines.push('━━━━━━━━━━━━━━');
  return lines.filter((line): line is string => line !== null).join('\n');
}