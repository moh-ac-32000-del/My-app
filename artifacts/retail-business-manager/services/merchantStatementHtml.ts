import { merchantStatementText } from '../constants/merchantStatementText';
import { formatExactMoney } from '../data/exactMoneyPresentation';
import type { Language } from '../constants/i18n';
import type { MerchantStatement } from '../data/merchantStatement';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!,
  );

/** Offline, self-contained HTML. No external fonts, images, scripts, links or customer/employee data. */
export function merchantStatementHtml(input: {
  statement: MerchantStatement;
  language: Language;
  merchantName: string;
  storeName: string;
  issuedAt: string;
  from?: string;
  to?: string;
}): string {
  const copy = merchantStatementText[input.language];
  const pages: string[] = [];
  const number = (value: string, currency: Parameters<typeof formatExactMoney>[1]) =>
    escape(formatExactMoney(value, currency, input.language));
  for (let index = 0; index < input.statement.totals.length; index += 4) {
    pages.push(
      input.statement.totals
        .slice(index, index + 4)
        .map(
          (total) =>
            `<section class="summary"><h2>${total.currency}</h2>${(
              ['opening', 'purchases', 'payments', 'adjustments', 'closing'] as const
            )
              .map(
                (key) =>
                  `<div class="total ${key}"><span>${escape(copy[key])}</span><b dir="ltr">${number(total[key], total.currency)}</b></div>`,
              )
              .join('')}</section>`,
        )
        .join('') + `<p class="note">${escape(copy.note)}</p>`,
    );
  }
  let group: MerchantStatement['rows'] = [],
    weight = 0;
  const table = (rows: MerchantStatement['rows']) =>
    `<table><thead><tr>${[copy.date, copy.type, copy.item, copy.quantity, copy.price, copy.method, copy.amount].map((value) => `<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((row) => {
        const kind = row.kind === 'opening' ? copy.openingRow : copy[row.kind];
        const tone =
          row.kind === 'payment' || row.kind === 'correctionPayment'
            ? 'payment'
            : row.kind === 'purchase' || row.kind === 'correctionPurchase'
              ? 'purchase'
              : 'other';
        return `<tr class="${tone}"><td>${escape(row.date)}${row.date !== row.recordedDate ? `<small>${escape(copy.recorded)}: ${escape(row.recordedDate)}</small>` : ''}</td><td>${escape(kind)}${row.corrected ? `<small>${escape(copy.corrected)}</small>` : ''}</td><td>${escape(row.description)}</td><td dir="ltr">${escape(row.quantity)}</td><td dir="ltr">${escape(row.unitPrice)}</td><td>${escape(row.method)}</td><td dir="ltr">${number(row.amount, row.currency)}</td></tr>`;
      })
      .join('')}</tbody></table>`;
  // Bound content per explicit page, including worst-case wrapping of long user-entered descriptions/methods.
  for (const row of input.statement.rows) {
    const rowWeight =
      Math.max(
        4,
        Math.ceil(row.description.length / 20),
        Math.ceil(row.method.length / 14),
        Math.ceil(row.amount.length / 12),
        Math.ceil(row.quantity.length / 6),
        Math.ceil(row.unitPrice.length / 9),
      ) + (row.corrected ? 2 : 0);
    if (group.length && weight + rowWeight > 27) {
      pages.push(table(group));
      group = [];
      weight = 0;
    }
    group.push(row);
    weight += rowWeight;
  }
  if (group.length) pages.push(table(group));
  if (!input.statement.rows.length) pages.push(`<p>${escape(copy.empty)}</p>`);
  const issued = new Date(input.issuedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const heading = `<header><h1>${escape(copy.title.replace(' PDF', '').replace('PDF ', ''))}</h1><h2>${escape(input.storeName)} · ${escape(input.merchantName)}</h2><p>${escape(input.from ?? copy.all)}${input.to ? ` - ${escape(input.to)}` : ''}</p><small>${escape(copy.issued)}: <time dir="ltr" style="display:inline-block;unicode-bidi:isolate">${escape(issued)}</time></small></header>`;
  return `<!DOCTYPE html><html lang="${input.language}" dir="${input.language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.title)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;margin:0;background:white}
    .page{break-after:page;page-break-after:always;min-height:265mm;display:flex;flex-direction:column}.page:last-child{break-after:auto;page-break-after:auto}
    header{border-bottom:2px solid #8b7ae6;margin-bottom:16px;padding-bottom:10px}h1{font-size:21px;margin:0 0 10px}h2{font-size:15px;margin:6px 0}p{margin:8px 0}
    .summary{border:1px solid #d6dae4;border-radius:10px;padding:12px;margin-bottom:12px}.total{display:flex;justify-content:space-between;gap:18px;padding:5px}.closing{border-top:1px solid #d6dae4;font-weight:bold}
    .note,small{font-size:10px;color:#526070}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #d6dae4;padding:7px 5px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;text-align:start;line-height:1.55}
    th{background:#f0eefb;font-weight:bold}th:nth-child(1){width:14%}th:nth-child(2){width:16%}th:nth-child(3){width:22%}th:nth-child(4){width:8%}th:nth-child(5){width:11%}th:nth-child(6){width:13%}th:nth-child(7){width:16%}
    tr{break-inside:avoid;page-break-inside:avoid}td small{display:block;margin-top:5px}.purchase td:nth-child(2){color:#1d4ed8}.payment td:nth-child(2){color:#b91c1c}footer{margin-top:auto;padding-top:14px;text-align:center;font-size:10px;color:#526070}
    </style></head><body>${pages.map((page, index) => `<article class="page">${heading}${page}<footer>${escape(copy.page)} <span dir="ltr">${index + 1} / ${pages.length}</span></footer></article>`).join('')}</body></html>`;
}
