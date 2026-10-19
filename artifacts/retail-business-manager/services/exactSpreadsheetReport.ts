import * as XLSX from 'xlsx';
import { translate, type Language } from '../constants/i18n';
import { exportLabels, exportReportLabels } from '../constants/exportLabels';
import { merchantExportLabels } from '../constants/merchantExportLabels';
import { groupedReportLabels } from './spreadsheetGroupedReport';
import { legacyAmountExact, canonicalCredit } from '../data/customerCreditAccounting';
import { projectCustomerAccounts } from '../data/customerAccountProjection';
import { summarizeMerchantBalances } from '../data/merchantAccounting';
import { journalEventTitle, journalEventDetails } from './journalPresentation';
import type { SpreadsheetExportSnapshot } from '../types/spreadsheetExport';

type Cell = XLSX.CellObject | null;
const text = (value?: string | null): Cell => (value == null ? null : { t: 's', v: value, z: '@' });
/** Excel numeric cells have 15 significant digits. Preserve longer authoritative values literally. */
export function exactExportCell(value: string): XLSX.CellObject {
  const negative = value.startsWith('-'),
    absolute = negative ? value.slice(1) : value;
  const canonical = canonicalCredit(absolute),
    numeric = Number(canonical);
  const digits = canonical.replace('.', '').replace(/^0+|0+$/g, '').length;
  const [whole, fraction = ''] = canonical.split('.');
  // Keep deep legacy fractions/subnormal values literal too: Excel can underflow or visually
  // round them to zero even when JavaScript's numeric mirror still exists.
  if (Number.isFinite(numeric) && digits <= 15 && whole.length <= 15 && fraction.length <= 15 && legacyAmountExact(numeric) === canonical) {
    return { t: 'n', v: negative ? -numeric : numeric, z: `#,##0.${'0'.repeat(Math.max(2, fraction.length))}` };
  }
  return { t: 's', v: negative ? `-${canonical}` : canonical, z: '@' };
}
function time(value: string): XLSX.CellObject {
  const numeric = Date.parse(value);
  if (!Number.isFinite(numeric)) throw new Error('exportInvalidData');
  return {
    t: 'n',
    v: (numeric - Date.UTC(1899, 11, 30)) / 86400000,
    z: value.length === 10 ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss',
  };
}

/** Readable static review report; it never recalculates or writes business balances. */
export function exactSpreadsheetReports(snapshot: SpreadsheetExportSnapshot, language: Language): XLSX.WorkBook {
  const data = snapshot.accountData;
  if (!data) throw new Error('exportLocalIncomplete');
  const l = { ...exportLabels[language], ...exportReportLabels[language], ...merchantExportLabels[language] };
  const g = groupedReportLabels[language],
    t = (key: Parameters<typeof translate>[0]) => translate(key, language);
  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: language === 'ar' }] };
  book.Props = { Title: 'My app — financial export', Author: 'My app', CreatedDate: new Date(snapshot.exportedAt) };
  function report(name: string) {
    const sheet: XLSX.WorkSheet = {};
    let row = 0;
    const add = (cells: Cell[], height = 25) => {
      cells.forEach((cell, column) => {
        if (!cell) return;
        if (typeof cell.v === 'string' && cell.v.length > 32767) throw new Error('exportTooLarge');
        sheet[XLSX.utils.encode_cell({ r: row, c: column })] = { ...cell };
      });
      (sheet['!rows'] ??= []).push({ hpt: height });
      row++;
    };
    const line = (message: string) => {
      const words = message.split(' ');
      let part = '';
      for (const word of words) {
        if (part && part.length + word.length > 45) {
          add([text(part)]);
          part = '';
        }
        part += (part ? ' ' : '') + word;
      }
      if (part) add([text(part)]);
    };
    add([text(name), text(snapshot.storeName)], 32);
    add([text(l.exportedAt), time(snapshot.exportedAt)]);
    line(l.exactHint);
    add([]);
    const finish = () => {
      add([]);
      line(l.warning);
      line(l.technicalHint);
      add([text(l.source), text(l.localSource)]);
      for (const [collection, stamp] of Object.entries(snapshot.capturedAt)) {
        add([text((l as Record<string, string>)[collection]), time(stamp)]);
      }
      add([text(l.scope), text(snapshot.spaceId)]);
      add([text(l.storeId), text(snapshot.storeId)]);
      sheet['!cols'] = [38, 26, 16, 24, 24, 24, 24, 32, 48, 28, 28].map((wch, index) => ({ wch, hidden: index >= 9 }));
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith('!') || cell.t !== 's' || typeof cell.v !== 'string' || !/^-?\d+\.\d+$/.test(cell.v))
          continue;
        const column = XLSX.utils.decode_cell(address).c;
        if (column < 9) sheet['!cols'][column].wch = Math.min(255, Math.max(sheet['!cols'][column].wch ?? 0, cell.v.length + 2));
      }
      sheet['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: Math.max(0, row - 1), c: 10 });
      XLSX.utils.book_append_sheet(book, sheet, name);
    };
    return { add, line, finish };
  }
  const customerNames = new Map(
    snapshot.tables.customers.map((row) => [String(row[0]), String(row[1]) || l.unnamedCustomer]),
  );
  const account = projectCustomerAccounts(data.debts, data.credits, snapshot.spaceId, snapshot.storeId);
  const customerIds = new Set([
    ...customerNames.keys(),
    ...account.accounts.map((row) => row.customerId),
    ...data.payments.flatMap((row) => (row.customerId ? [row.customerId] : [])),
  ]);
  const customers = report(g.customers);
  customers.line(l.accountSign);
  for (const id of customerIds) {
    const source = snapshot.tables.customers.find((row) => row[0] === id);
    customers.add(
      [
        text(customerNames.get(id) ?? l.missingCustomer),
        text(source?.[2] as string | null),
        text(source ? (source[5] ? l.active : l.inactive) : null),
        null,
        null,
        null,
        null,
        null,
        null,
        text(id),
      ],
      32,
    );
    if (source)
      customers.add([
        text(l.address),
        text(source[3] as string | null),
        null,
        text(l.notes),
        text(source[4] as string | null),
      ]);
    for (const row of account.accounts.filter((row) => row.customerId === id)) {
      customers.add([text(l.balance), null, text(row.currency), null, null, exactExportCell(row.balanceExact)]);
    }
    customers.add([g.record, g.time, l.currency, g.original, g.payment, g.balance, g.due, g.method, g.note].map(text));
    const rows = [
      ...data.debts.filter((row) => row.customerId === id).map((row) => ({ at: row.createdAt, debt: row })),
      ...data.payments.filter((row) => row.customerId === id).map((row) => ({ at: row.paidAt, payment: row })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    for (const entry of rows) {
      if ('debt' in entry) {
        const row = entry.debt;
        customers.add([
          text(l.debt),
          time(row.createdAt),
          text(row.currency),
          row.originalAmount === undefined ? null : exactExportCell(legacyAmountExact(row.originalAmount)),
          null,
          exactExportCell(row.amountExact!),
          row.dueDate ? time(row.dueDate) : null,
          text(row.creditAppliedExact && row.creditAppliedExact !== '0.00' ? t('customerCreditUsed') : null),
          text(row.note),
          text(row.id),
        ]);
      } else {
        const row = entry.payment;
        customers.add([
          text(
            row.source === 'customer-to-merchant'
              ? t('merchantDirect')
              : row.direction === 'in'
                ? g.paymentIn
                : g.paymentOut,
          ),
          time(row.paidAt),
          text(row.amount.currency),
          null,
          exactExportCell(row.amountExact!),
          null,
          null,
          text(row.source === 'customer-to-merchant' ? t('merchantNoncash') : l[row.method]),
          text([row.merchantName, row.note].filter(Boolean).join(' — ')),
          text(row.id),
        ]);
      }
    }
    customers.add([]);
  }
  for (const row of data.payments.filter((row) => !row.customerId)) {
    customers.add([
      text(l.noCustomer),
      time(row.paidAt),
      text(row.amount.currency),
      null,
      exactExportCell(row.amountExact!),
      null,
      null,
      text(l[row.method]),
      text(row.note),
      text(row.id),
    ]);
  }
  if (!customerIds.size && !data.payments.length) customers.add([text(g.empty)]);
  customers.finish();

  const merchants = report(l.merchants);
  merchants.line(l.accountSign);
  const totals = summarizeMerchantBalances(
    snapshot.spaceId,
    data.balances.map((row) => ({
      workspaceId: row.workspaceId,
      partyId: row.merchantId,
      kind: 'merchant',
      currency: row.currency,
      balance: row.balanceExact,
    })),
  );
  for (const row of totals) {
    merchants.add([
      text(row.currency),
      text(t('merchantPayable')),
      exactExportCell(row.payable),
      text(t('merchantCredit')),
      exactExportCell(row.credit),
      text(t('merchantNet')),
      exactExportCell(row.net),
    ]);
  }
  for (const merchant of data.merchants) {
    merchants.add(
      [
        text(merchant.name),
        text(merchant.phone),
        text(merchant.isActive ? l.active : l.inactive),
        null,
        null,
        null,
        null,
        null,
        null,
        text(merchant.id),
      ],
      32,
    );
    for (const balance of data.balances.filter((row) => row.merchantId === merchant.id)) {
      merchants.add([text(l.balance), null, text(balance.currency), null, null, exactExportCell(balance.balanceExact)]);
    }
    merchants.add([g.record, g.time, l.currency, l.amount, l.cashEffect, l.before, l.after, l.party, l.note].map(text));
    for (const op of data.operations
      .filter((row) => row.merchantId === merchant.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      const labels = {
        opening: 'merchantOpening',
        purchase: 'merchantPurchase',
        payment: 'merchantPayment',
        directPayment: 'merchantDirect',
        reverse: 'merchantReverse',
      } as const;
      merchants.add([
        text(t(labels[op.action])),
        time(op.createdAt),
        text(op.currency),
        exactExportCell(
          op.action === 'purchase' ? op.totalExact! : op.action === 'opening' ? op.balanceAfterExact : op.amountExact!,
        ),
        exactExportCell(op.cashDeltaExact),
        exactExportCell(op.balanceBeforeExact),
        exactExportCell(op.balanceAfterExact),
        text(op.customerName),
        text(op.note),
        text(op.id),
        text(op.createdByUserId),
      ]);
      for (const item of op.lines ?? [])
        merchants.add([text(item.name), text(item.quantity), text(item.unitPrice), exactExportCell(item.totalExact)]);
    }
    merchants.add([]);
  }
  if (!data.merchants.length) merchants.add([text(g.empty)]);
  merchants.finish();

  const cash = report(g.cash);
  cash.line(g.cashHint);
  cash.add([text(g.movements)]);
  cash.add([g.record, g.time, l.currency, g.incoming, g.outgoing, g.closing, l.party, g.number, g.note].map(text));
  for (const row of [...data.transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const incoming = row.type === 'cash_in';
    const op = data.operations.find((op) => op.transactionId === row.id);
    const payment = data.payments.find((payment) => payment.transactionId === row.id);
    cash.add([
      text(l[row.type]),
      time(row.createdAt),
      text(row.currency),
      incoming ? exactExportCell(row.amountExact!) : null,
      incoming ? null : exactExportCell(row.amountExact!),
      null,
      text(op?.merchantName ?? (payment?.customerId ? customerNames.get(payment.customerId) : null)),
      null,
      text(row.note),
      text(row.id),
    ]);
  }
  if (!data.transactions.length) cash.add([text(g.empty)]);
  for (const archive of [...data.archives].sort(
    (a, b) => a.date.localeCompare(b.date) || a.closingNumber - b.closingNumber,
  )) {
    cash.add([]);
    cash.add(
      [
        text(l.archiveLabel),
        time(archive.date),
        null,
        null,
        null,
        null,
        null,
        { t: 'n', v: archive.closingNumber },
        null,
        text(archive.id),
      ],
      32,
    );
    cash.add([text(l.closedAt), time(archive.closedAt)]);
    if (archive.closingCashBalances === undefined) cash.add([text(g.unavailable)]);
    else
      for (const row of archive.closingCashBalances)
        cash.add([
          text(g.closing),
          null,
          text(row.currency),
          null,
          null,
          exactExportCell(`${row.amount < 0 ? '-' : ''}${legacyAmountExact(Math.abs(row.amount))}`),
        ]);
    cash.add([text(g.archived)]);
    cash.add([g.record, g.time, l.currency, l.amount, l.cashEffect, l.before, l.after, l.party, g.note].map(text));
    for (const event of archive.snapshot) {
      cash.add([
        text(journalEventTitle(event, t)),
        time(event.occurredAt),
        text(event.currency),
        exactExportCell(event.amountExact ?? legacyAmountExact(event.amount)),
        event.cashDeltaExact !== undefined ? exactExportCell(event.cashDeltaExact) : null,
        event.balanceBeforeExact !== undefined ? exactExportCell(event.balanceBeforeExact) : null,
        event.balanceAfterExact !== undefined ? exactExportCell(event.balanceAfterExact) : null,
        text(event.merchantName ?? event.customerName),
        text(event.note),
        text(event.id),
      ]);
      for (const detail of journalEventDetails(event, language, t).filter((detail) => detail !== event.note))
        cash.line(detail);
    }
  }
  cash.finish();
  return book;
}
