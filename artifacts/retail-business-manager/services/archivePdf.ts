import { formatMoney } from '../constants/currencies';
import { formatLocalizedDateTime, translate, type Language } from '../constants/i18n';
import { journalEventDetails, journalEventMoney, journalEventTitle } from './journalPresentation';
import type { DailyArchive } from '../types/business';

export const archivePdfText = {
  ar: { share: 'مشاركة الأرشيف PDF', title: 'كشف إغلاق الصندوق', historical: 'يعرض هذا الكشف السجلات والأرصدة المحفوظة وقت هذا الإغلاق فقط، وليس حالة الحسابات الحالية.', type: 'العملية والطرف', details: 'التفاصيل والملاحظات' },
  en: { share: 'Share archive PDF', title: 'Cash closing statement', historical: 'This statement shows only the records and balances saved at this closing, not current account balances.', type: 'Operation and party', details: 'Details and notes' },
  tr: { share: 'Arşivi PDF paylaş', title: 'Kasa kapanış dökümü', historical: 'Bu döküm yalnızca bu kapanışta kaydedilen kayıtları ve bakiyeleri gösterir; güncel hesap bakiyelerini göstermez.', type: 'İşlem ve taraf', details: 'Ayrıntılar ve notlar' },
};
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Compare immutable saved fields; current-status decorations never alter an archive export. */
export function archiveExportFingerprint(archive: DailyArchive): string {
  const { operationStatuses: _statuses, operationStatusesUnavailable: _unavailable, ...saved } = archive;
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return JSON.stringify(stable(saved));
}

/** Selected immutable closing only. No live account reads, balance calculation or archive mutation. */
export function archivePdfHtml(archive: DailyArchive, storeName: string, language: Language): string {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, language), copy = archivePdfText[language];
  const balances = archive.closingCashBalances === undefined ? t('closingBalanceUnavailable')
    : archive.closingCashBalances.length === 0 ? t('closingNoCashMovements')
    : archive.closingCashBalances.map(row => `<div><b>${row.currency}</b> <span dir="ltr">${escape(formatMoney(row.amount, row.currency, language))}</span></div>`).join('');
  const rows = archive.snapshot.map(event => `<tr><td><span dir="ltr">${escape(formatLocalizedDateTime(new Date(event.occurredAt), language, archive.timeZone))}</span></td><td>${escape(journalEventTitle(event, t))}</td><td>${journalEventDetails(event, language, t).map(line => `<div>${escape(line)}</div>`).join('')}</td><td dir="ltr">${escape(journalEventMoney(event, language))}</td><td>${event.currency}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escape(copy.title)}</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;background:#fff;margin:0}h1{font-size:22px}h2{font-size:16px}header{border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:16px}.summary{border:1px solid #d6dae4;border-radius:8px;padding:12px;margin:14px 0}.summary div{display:flex;justify-content:space-between;gap:18px;padding:5px}.note{font-size:11px;color:#526070;line-height:1.7}table{width:100%;table-layout:fixed;border-collapse:collapse}thead{display:table-header-group}th,td{border:1px solid #d6dae4;padding:8px 6px;text-align:start;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.6}th{background:#eef1f5}th:nth-child(1){width:19%}th:nth-child(2){width:23%}th:nth-child(3){width:32%}th:nth-child(4){width:18%}th:nth-child(5){width:8%}td div+div{margin-top:5px}
  </style></head><body><header><h1>${escape(copy.title)} #${archive.closingNumber}</h1><h2>${escape(storeName)}</h2><p>${escape(t('archiveDate'))}: <span dir="ltr">${escape(archive.date)}</span></p><p>${escape(t('archiveClosedAt'))}: <span dir="ltr">${escape(formatLocalizedDateTime(new Date(archive.closedAt), language, archive.timeZone))}</span></p><p>${escape(t(archive.closingMode === 'automatic' ? 'automaticClosingActive' : 'manualClosing'))}${archive.timeZone ? ` · ${escape(archive.timeZone)}` : ''}</p></header><section class="summary"><h2>${escape(t('cashBalanceAtClosing'))}</h2>${balances}</section><p class="note">${escape(copy.historical)}</p><h2>${escape(t('archiveEvents'))}</h2>${archive.snapshot.length ? `<table><thead><tr><th>${escape(t('merchantOperationDate'))}</th><th>${escape(copy.type)}</th><th>${escape(copy.details)}</th><th>${escape(t('amount'))}</th><th>${escape(t('currency'))}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p>${escape(t('archiveNoEvents'))}</p>`}</body></html>`;
}
