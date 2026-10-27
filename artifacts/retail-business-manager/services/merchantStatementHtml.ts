import { merchantStatementText } from '../constants/merchantStatementText';
import { formatExactDecimal, formatExactMoney } from '../data/exactMoneyPresentation';
import type { Language } from '../constants/i18n';
import type { MerchantStatement } from '../data/merchantStatement';
import { customerStatementText } from '../constants/customerStatementText';
import { translate } from '../constants/i18n';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!,
  );

/** Offline public statement. No external assets or internal actor/linked-party provenance. */
export function merchantStatementHtml(input: {
  statement: MerchantStatement;
  language: Language;
  merchantName: string;
  storeName: string;
  issuedAt: string;
  from?: string;
  to?: string;
  kind?: 'customer' | 'merchant';
}): string {
  const customer = input.kind === 'customer';
  const copy = { ...merchantStatementText[input.language], ...(customer ? customerStatementText[input.language] : {}) };
  const pages: string[] = [];
  const number = (value: string, currency: Parameters<typeof formatExactMoney>[1]) =>
    escape(formatExactMoney(value, currency, input.language));
  const summary = (total: MerchantStatement['totals'][number]) => `<section class="summary"><h2>${total.currency}</h2>${
    (['opening', 'purchases', 'payments', 'adjustments', 'closing'] as const)
      .filter(key => key !== 'adjustments' || total.adjustments !== '0.00')
      .map(key => `<div class="total ${key}"><span>${escape(copy[key])}</span><b dir="ltr">${number(total[key], total.currency)}</b></div>`).join('')
  }</section><p class="note">${escape(copy.note)}</p>`;
  type DisplayRow = MerchantStatement['rows'][number] & { continuation?: boolean };
  let group: DisplayRow[] = [],
    weight = 0;
  const continued = { ar: 'تابع الوصف', tr: 'Açıklamanın devamı', en: 'Description continued' }[input.language];
  const table = (rows: DisplayRow[]) =>
    `<table class="${customer ? 'customer' : 'merchant'}"><thead><tr>${(customer ? [copy.date, copy.type, copy.item, copy.method, copy.amount] : [copy.date, copy.type, copy.item, copy.quantity, copy.price, copy.method, copy.amount]).map((value) => `<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => {
        const kind = row.kind === 'opening' ? copy.openingRow : copy[row.kind];
        const tone =
          row.kind === 'payment' || row.kind === 'correctionPayment'
            ? 'payment'
            : row.kind === 'purchase' || row.kind === 'correctionPurchase'
              ? 'purchase'
              : 'other';
        const methods = { cash: 'paymentMethodCash', card: 'paymentMethodCard', 'bank-transfer': 'paymentMethodBankTransfer', other: 'paymentMethodOther' } as const;
        const method = row.methodLabel ?? (customer && row.method in methods ? translate(methods[row.method as keyof typeof methods], input.language) : row.method);
        return `<tr class="${tone}"><td><span dir="ltr">${escape(row.date)}</span>${!row.continuation && row.date !== row.recordedDate ? `<small>${escape(copy.recorded)}: <span dir="ltr">${escape(row.recordedDate)}</span></small>` : ''}</td><td>${escape(row.continuation ? continued : kind)}${row.corrected && !row.continuation ? `<small>${escape(copy.corrected)}</small>` : ''}</td><td>${escape(row.description)}</td>${customer ? '' : `<td dir="ltr">${row.continuation ? '—' : row.quantity ? escape(formatExactDecimal(row.quantity)) : ''}</td><td dir="ltr">${row.continuation ? '—' : row.unitPrice ? escape(formatExactDecimal(row.unitPrice)) : ''}</td>`}<td>${row.continuation ? '—' : escape(method)}</td><td dir="ltr">${row.continuation ? '—' : number(row.amount, row.currency)}</td></tr>`;
      })
      .join('')}</tbody></table>`;
  // Never mix currencies within a table/page. Bounds account for summary and long wrapping text.
  for (const total of input.statement.totals) {
    let first = true;
    group = []; weight = 0;
    const flush = () => {
      pages.push(`${first ? summary(total) : `<h2>${total.currency}</h2>`}${group.length ? table(group) : `<p>${escape(copy.empty)}</p>`}`);
      first = false; group = []; weight = 0;
    };
    for (const row of input.statement.rows.filter(value => value.currency === total.currency)) {
    // Bound individual printed rows without truncating notes or repeating financial amounts.
    const text = Array.from(row.description);
    const fragments: string[] = [];
    for (let index = 0; index < text.length;) {
      const candidate = text.slice(index, index + 240);
      const boundary = candidate.lastIndexOf(' ');
      const length = index + 240 < text.length && boundary >= 120 ? boundary + 1 : candidate.length;
      fragments.push(candidate.slice(0, length).join(''));
      index += length;
    }
    if (!fragments.length) fragments.push('');
    for (const [index, description] of fragments.entries()) {
    const display = { ...row, description, continuation: index > 0 };
    const rowWeight =
      Math.max(
        2,
        Math.ceil(description.length / 18),
        Math.ceil((row.methodLabel ?? row.method).length / 14),
        Math.ceil(row.amount.length / 12),
        Math.ceil(row.quantity.length / 6),
        Math.ceil(row.unitPrice.length / 9),
      ) + (row.corrected ? 2 : 0);
    if (group.length && weight + rowWeight > (first ? 18 : 30)) flush();
    group.push(display);
    weight += rowWeight;
    }
    }
    if (group.length || first) flush();
  }
  if (!input.statement.rows.length) pages.push(`<p>${escape(copy.empty)}</p>`);
  const issued = new Date(input.issuedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const heading = `<header><h1>${escape(copy.title.replace(' PDF', '').replace('PDF ', ''))}</h1><h2>${escape(input.storeName)} · ${escape(input.merchantName)}</h2><p>${escape(input.from ?? copy.all)}${input.to ? ` - ${escape(input.to)}` : ''}</p><small>${escape(copy.issued)}: <time dir="ltr" style="display:inline-block;unicode-bidi:isolate">${escape(issued)}</time></small></header>`;
  return `<!DOCTYPE html><html lang="${input.language}" dir="${input.language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.title)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;margin:0;background:white}
    .page{break-after:page;page-break-after:always;min-height:265mm;display:flex;flex-direction:column}.page:last-child{break-after:auto;page-break-after:auto}
    header{border-bottom:2px solid #334155;margin-bottom:16px;padding-bottom:10px}h1{font-size:21px;margin:0 0 10px}h2{font-size:15px;margin:6px 0}p{margin:8px 0}
    .summary{border:1px solid #d6dae4;border-radius:10px;padding:12px;margin-bottom:12px}.total{display:flex;justify-content:space-between;gap:18px;padding:5px}.closing{border-top:1px solid #d6dae4;font-weight:bold}
    .note,small{font-size:10px;color:#526070}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #d6dae4;padding:7px 5px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;text-align:start;line-height:1.55}
    th{background:#eef1f5;font-weight:bold}th:nth-child(1){width:14%}th:nth-child(2){width:16%}th:nth-child(3){width:22%}th:nth-child(4){width:9%}th:nth-child(5){width:10%}th:nth-child(6){width:13%}th:nth-child(7){width:16%}
    table.customer th:nth-child(1){width:17%}table.customer th:nth-child(2){width:17%}table.customer th:nth-child(3){width:30%}table.customer th:nth-child(4){width:17%}table.customer th:nth-child(5){width:19%}
    tr{break-inside:avoid;page-break-inside:avoid}td small{display:block;margin-top:5px}.purchase td:nth-child(2){color:#1d4ed8}.payment td:nth-child(2){color:#b91c1c}footer{margin-top:auto;padding-top:14px;text-align:center;font-size:10px;color:#526070}
    </style></head><body>${pages.map((page, index) => `<article class="page">${heading}${page}<footer>${escape(copy.page)} <span dir="ltr">${index + 1} / ${pages.length}</span></footer></article>`).join('')}</body></html>`;
}
