import * as XLSX from 'xlsx';
import type { Language } from '@/constants/i18n';
import { exportLabels, exportReportLabels } from '@/constants/exportLabels';
import type { ExportTableName, SpreadsheetExportSnapshot } from '@/types/spreadsheetExport';
import { REPORT_COLUMNS } from './spreadsheetPresentation';

export const groupedReportLabels = {
  ar: { customers: 'كشف العملاء', cash: 'الصندوق والإغلاقات', record: 'السجل', time: 'التاريخ UTC', original: 'الدين الأصلي', payment: 'الدفعة', balance: 'المتبقي الحالي', due: 'الاستحقاق', method: 'طريقة الدفع', note: 'ملاحظة', current: 'إجمالي المتبقي', empty: 'لا توجد سجلات', history: 'سجل الديون والدفعات', movements: 'حركة الصندوق', archived: 'تفاصيل الإغلاق التاريخية', closing: 'رصيد الإغلاق المسجل', unavailable: 'غير مسجل', incoming: 'داخل / المبلغ', outgoing: 'خارج', client: 'العميل', number: 'رقم الإغلاق', paymentIn: 'دفعة واردة', paymentOut: 'دفعة صادرة', hint: 'المتبقي هو الوضع الحالي، وليس رصيدًا تاريخيًا بعد كل دفعة. الدفعات مرتبطة بالعميل والعملة؛ لا يوجد توزيع محفوظ لكل دفعة على الديون.', cashHint: 'حركة الصندوق وتفاصيل الإغلاقات عرضان مختلفان للعمليات؛ لا تجمع مبالغهما معًا. رصيد الإغلاق هو المسجل عند الإغلاق، وليس الرصيد الحالي.' },
  en: { customers: 'Customer statement', cash: 'Cash and closings', record: 'Record', time: 'Date UTC', original: 'Original debt', payment: 'Payment', balance: 'Current remaining', due: 'Due date', method: 'Payment method', note: 'Note', current: 'Total remaining', empty: 'No records', history: 'Debt and payment history', movements: 'Cash movements', archived: 'Historical closing details', closing: 'Recorded closing balance', unavailable: 'Not recorded', incoming: 'Incoming / amount', outgoing: 'Outgoing', client: 'Customer', number: 'Closing number', paymentIn: 'Incoming payment', paymentOut: 'Outgoing payment', hint: 'Remaining amounts are current, not historical balances after each payment. Payments link to customer and currency; per-payment debt allocations are not stored.', cashHint: 'Cash movements and closing details are separate views of transactions; do not add them together. Closing balances are recorded at closing, not current balances.' },
  tr: { customers: 'Müşteri hesap dökümü', cash: 'Kasa ve kapanışlar', record: 'Kayıt', time: 'Tarih UTC', original: 'İlk borç', payment: 'Ödeme', balance: 'Güncel kalan', due: 'Vade tarihi', method: 'Ödeme yöntemi', note: 'Not', current: 'Toplam kalan', empty: 'Kayıt yok', history: 'Borç ve ödeme geçmişi', movements: 'Kasa hareketleri', archived: 'Geçmiş kapanış ayrıntıları', closing: 'Kayıtlı kapanış bakiyesi', unavailable: 'Kaydedilmemiş', incoming: 'Giriş / tutar', outgoing: 'Çıkış', client: 'Müşteri', number: 'Kapanış numarası', paymentIn: 'Gelen ödeme', paymentOut: 'Giden ödeme', hint: 'Kalan tutarlar günceldir; her ödeme sonrası geçmiş bakiye değildir. Ödemeler müşteri ve para birimine bağlıdır; borç başına ödeme dağılımı kaydedilmez.', cashHint: 'Kasa hareketleri ve kapanış ayrıntıları işlemlerin ayrı görünümleridir; birlikte toplamayın. Kapanış bakiyesi kapanış anında kaydedilmiştir, güncel bakiye değildir.' },
};
type Cell = XLSX.CellObject | null;
const text = (value: string | number): XLSX.CellObject => typeof value === 'number'
  ? { t: 'n', v: value, z: '#,##0.00##########' } : { t: 's', v: value, z: '@' };

/** Group the already validated local snapshot. No cloud calls, debt allocation or balance reconstruction. */
export function groupSpreadsheetReports(snapshot: SpreadsheetExportSnapshot, language: Language, source: XLSX.WorkBook): XLSX.WorkBook {
  const l = groupedReportLabels[language]; const labels = exportLabels[language]; const words = exportReportLabels[language];
  const book = XLSX.utils.book_new(); book.Workbook = source.Workbook; book.Props = source.Props;
  const cell = (table: ExportTableName, row: number, key: string): Cell => {
    const index = (REPORT_COLUMNS[table] as readonly string[]).indexOf(key);
    if (index < 0) return null;
    const found = source.Sheets[labels[table]][XLSX.utils.encode_cell({ r: row + 1, c: index })];
    return found ? { ...found } : null;
  };
  function report(name: string) {
    const sheet: XLSX.WorkSheet = {}; let next = 0;
    const add = (values: Cell[], height = 25) => {
      values.forEach((value, c) => { if (value) sheet[XLSX.utils.encode_cell({ r: next, c })] = { ...value }; });
      (sheet['!rows'] ??= []).push({ hpt: height }); next++;
    };
    const line = (value: string) => {
      // Short lines stay readable without a giant merged cell forcing mobile zoom-out.
      const lines: string[] = [];
      for (const word of value.split(' ')) {
        if (!lines.length || lines[lines.length - 1].length + word.length > 38) lines.push(word);
        else lines[lines.length - 1] += ' ' + word;
      }
      lines.forEach((part) => add([text(part)], 23));
    };
    add([text(name), text(snapshot.storeName)], 32);
    add([text(labels.exportedAt), text(snapshot.exportedAt.replace('T', ' ').slice(0, 19))]);
    const finish = () => {
      add([]); line(labels.warning);
      const info = source.Sheets[labels.info]; const range = XLSX.utils.decode_range(info['!ref']!);
      for (let r = 3; r <= range.e.r; r++) {
        // Keep local source, capture times and scope metadata, not a third worksheet.
        if (r > 8) break;
        add([info[XLSX.utils.encode_cell({r,c:0})] ?? null, info[XLSX.utils.encode_cell({r,c:1})] ?? null]);
      }
      sheet['!cols'] = [38, 26, 28, 25, 23, 25, 25, 24, 38].map((wch) => ({wch}));
      for (let c = 9; c < 18; c++) sheet['!cols'].push({ hidden: true, wch: 28 });
      sheet['!ref'] = XLSX.utils.encode_range({r:0,c:0},{r:Math.max(0,next-1),c:17});
      XLSX.utils.book_append_sheet(book, sheet, name);
    };
    return {add,line,finish};
  }
  const trace = (table: ExportTableName, row: number): Cell[] => [text(table), ...['id','customerId','transactionId','archiveId','sourceId','updatedAt','settledAt'].map((key) => cell(table,row,key)), text(snapshot.spaceId)];
  const statement = report(l.customers); statement.line(l.hint); statement.add([]);
  const customerIndexes = new Map(snapshot.tables.customers.map((row,index) => [row[0], index]));
  const groups = new Set(snapshot.tables.customers.map((row) => row[0]));
  snapshot.tables.debts.forEach((row) => groups.add(row[1]));
  snapshot.tables.payments.forEach((row) => groups.add(row[1]));
  for (const id of groups) {
    const customer = customerIndexes.get(id);
    const debts = snapshot.tables.debts.flatMap((row,index) => row[1] === id ? [index] : []);
    const payments = snapshot.tables.payments.flatMap((row,index) => row[1] === id ? [index] : []);
    const name = customer !== undefined ? cell('customers',customer,'name') : debts.length ? cell('debts',debts[0],'customerName') : cell('payments',payments[0],'customerName');
    statement.add([name, customer === undefined ? null : cell('customers',customer,'phone'), customer === undefined ? null : cell('customers',customer,'isActive'), ...Array<Cell>(6).fill(null), ...(customer === undefined ? [] : trace('customers',customer))], 32);
    if (customer !== undefined) {
      statement.add([text(labels.address), cell('customers',customer,'address'), null, text(labels.notes), cell('customers',customer,'notes')]);
    }
    const currencies = new Set([...debts.map((i) => snapshot.tables.debts[i][2]), ...payments.map((i) => snapshot.tables.payments[i][3])]);
    for (const currency of currencies) {
      const matching = debts.filter((i) => snapshot.tables.debts[i][2] === currency);
      const remaining = matching.reduce((sum,i) => sum + Number(snapshot.tables.debts[i][4]),0);
      if (!Number.isFinite(remaining)) throw new Error('exportResponseInvalid');
      const currencyCell = matching.length ? cell('debts',matching[0],'currency') : cell('payments',payments.find((i) => snapshot.tables.payments[i][3] === currency)!,'currency');
      statement.add([text(l.current),null,currencyCell,null,null,text(remaining)]);
    }
    statement.add([text(l.history)]);
    statement.add([l.record,l.time,labels.currency,l.original,l.payment,l.balance,l.due,l.method,l.note].map(text));
    const history = [...debts.map((i) => ({table:'debts' as const,i,time:String(snapshot.tables.debts[i][7])})), ...payments.map((i) => ({table:'payments' as const,i,time:String(snapshot.tables.payments[i][7])}))].sort((a,b) => Date.parse(a.time)-Date.parse(b.time) || a.table.localeCompare(b.table) || a.i-b.i);
    if (!history.length) statement.add([text(l.empty)]);
    for (const {table,i} of history) {
      statement.add(table === 'debts'
        ? [text(words.debt),cell(table,i,'createdAt'),cell(table,i,'currency'),cell(table,i,'originalAmount'),null,cell(table,i,'amount'),cell(table,i,'dueDate'),null,null,...trace(table,i)]
        : [text(snapshot.tables.payments[i][5] === 'in' ? l.paymentIn : l.paymentOut),cell(table,i,'paidAt'),cell(table,i,'currency'),null,cell(table,i,'amount'),null,null,cell(table,i,'method'),cell(table,i,'note'),...trace(table,i)]);
    }
    statement.add([]);
  }
  if (!groups.size) statement.add([text(l.empty)]);
  statement.finish();

  const cash = report(l.cash); cash.line(l.cashHint); cash.add([]);
  const cashHeaders = [l.record,l.time,labels.currency,l.incoming,l.outgoing,l.closing,l.client,l.number,l.note].map(text);
  cash.add([text(l.movements)]); cash.add(cashHeaders);
  const transactions = snapshot.tables.transactions.map((_,i)=>i).sort((a,b)=>Date.parse(String(snapshot.tables.transactions[a][5]))-Date.parse(String(snapshot.tables.transactions[b][5])) || a-b);
  for (const i of transactions) {
    const incoming = snapshot.tables.transactions[i][1] === 'cash_in';
    const links = snapshot.tables.payments.flatMap((row,p)=>row[2]===snapshot.tables.transactions[i][0] ? [p] : []);
    const linked = links.length === 1 ? links[0] : undefined;
    cash.add([cell('transactions',i,'type'),cell('transactions',i,'createdAt'),cell('transactions',i,'currency'),incoming?cell('transactions',i,'amount'):null,incoming?null:cell('transactions',i,'amount'),null,linked===undefined?null:cell('payments',linked,'customerName'),null,cell('transactions',i,'note'),...trace('transactions',i)]);
  }
  if (!transactions.length) cash.add([text(l.empty)]);
  cash.add([]);
  const archives = snapshot.tables.dailyArchives.map((_,i)=>i).sort((a,b)=>Date.parse(String(snapshot.tables.dailyArchives[a][2]))-Date.parse(String(snapshot.tables.dailyArchives[b][2])) || a-b);
  for (const i of archives) {
    const id = snapshot.tables.dailyArchives[i][0];
    cash.add([text(words.archiveLabel),cell('dailyArchives',i,'date'),null,null,null,null,null,cell('dailyArchives',i,'closingNumber'),null,...trace('dailyArchives',i)],32);
    cash.add([text(labels.closedAt),cell('dailyArchives',i,'closedAt'),text(labels.eventCount),cell('dailyArchives',i,'eventCount')]);
    cash.add([text(l.closing)]);
    const balances = snapshot.tables.closingBalances.flatMap((row,b)=>row[0]===id?[b]:[]);
    if (!snapshot.tables.dailyArchives[i][4]) cash.add([text(l.unavailable)]);
    else if (!balances.length) cash.add([text(l.empty)]);
    for(const b of balances) cash.add([text(l.closing),null,cell('closingBalances',b,'currency'),null,null,cell('closingBalances',b,'amount'),null,null,null,...trace('closingBalances',b)]);
    cash.add([text(l.archived)]); cash.add(cashHeaders);
    const events = snapshot.tables.archiveEvents.flatMap((row,e)=>row[0]===id?[e]:[]).sort((a,b)=>Date.parse(String(snapshot.tables.archiveEvents[a][8]))-Date.parse(String(snapshot.tables.archiveEvents[b][8])) || a-b);
    if (!events.length) cash.add([text(l.empty)]);
    for (const e of events) {
      const outgoing = snapshot.tables.archiveEvents[e][3] === 'cash_out';
      cash.add([cell('archiveEvents',e,'type'),cell('archiveEvents',e,'occurredAt'),cell('archiveEvents',e,'currency'),outgoing?null:cell('archiveEvents',e,'amount'),outgoing?cell('archiveEvents',e,'amount'):null,null,cell('archiveEvents',e,'customerName'),null,cell('archiveEvents',e,'note'),...trace('archiveEvents',e)]);
    }
    cash.add([]);
  }
  if (!archives.length) cash.add([text(l.empty)]);
  cash.finish();
  return book;
}
