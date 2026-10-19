import { translate, type Language } from '@/constants/i18n';
import { getCurrency, isCurrencyCode } from '@/constants/currencies';
import { exportReportLabels } from '@/constants/exportLabels';
import { EXPORT_COLUMNS, type ExportTableName, type ExportValue, type SpreadsheetExportSnapshot } from '@/types/spreadsheetExport';
import { merchantExportLabels } from '@/constants/merchantExportLabels';

// Preserve raw references for tracing, but do not make users read Firebase IDs.
export const REPORT_COLUMNS = {
  customers: ['name', 'phone', 'isActive', 'address', 'notes', 'createdAt', 'updatedAt', 'id'],
  debts: ['customerName', 'customerPhone', 'currency', 'originalAmount', 'amount', 'dueDate', 'settledAt', 'createdAt', 'updatedAt', 'id', 'customerId'],
  payments: ['customerName', 'customerPhone', 'currency', 'amount', 'direction', 'method', 'paidAt', 'note', 'createdAt', 'updatedAt', 'id', 'customerId', 'transactionId'],
  transactions: ['type', 'currency', 'amount', 'note', 'createdAt', 'updatedAt', 'id'],
  dailyArchives: ['closingNumber', 'date', 'closedAt', 'hasClosingBalances', 'eventCount', 'id'],
  archiveEvents: ['archiveLabel', 'customerName', 'type', 'currency', 'amount', 'occurredAt', 'note', 'archiveId', 'id', 'sourceId', 'customerId'],
  closingBalances: ['archiveLabel', 'currency', 'amount', 'archiveId'],
} as const satisfies Record<ExportTableName, readonly string[]>;
export const TECHNICAL_COLUMNS = new Set(['id', 'customerId', 'transactionId', 'archiveId', 'sourceId']);
type RecordRow = Record<string, ExportValue>;

/** Presentation-only local joins. No SDK, I/O, totals, conversions or financial writes. */
export function spreadsheetPresentation(snapshot: SpreadsheetExportSnapshot, language: Language) {
  const labels = { ...exportReportLabels[language], ...merchantExportLabels[language] };
  const raw = {} as Record<ExportTableName, RecordRow[]>;
  for (const name of Object.keys(EXPORT_COLUMNS) as ExportTableName[]) {
    const columns = EXPORT_COLUMNS[name];
    const rows = snapshot.tables[name];
    if (!Array.isArray(rows) || rows.length > 10_000 || rows.some((row) => !Array.isArray(row) || row.length !== columns.length)) throw new Error('exportResponseInvalid');
    // Validate even hidden/source-only fields. Never hide invalid amounts behind presentation.
    if (rows.some((row) => row.some((value) => value !== null && !(typeof value === 'string' && value.length <= 32767) && !(typeof value === 'number' && Number.isFinite(value)) && typeof value !== 'boolean'))) throw new Error('exportResponseInvalid');
    raw[name] = rows.map((row) => Object.fromEntries(columns.map((key, index) => [key, row[index]])));
  }
  function index(rows: RecordRow[]): Map<ExportValue, RecordRow> {
    const result = new Map<ExportValue, RecordRow>();
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || result.has(row.id)) throw new Error('exportResponseInvalid');
      result.set(row.id, row);
    }
    return result;
  }
  const customers = index(raw.customers);
  const archives = index(raw.dailyArchives);
  function customerName(id: ExportValue, recordedName?: ExportValue): string {
    // Archive events retain the name recorded at closing, not a later renamed customer.
    if (typeof recordedName === 'string' && recordedName.trim()) return recordedName;
    if (id === null || id === '') return labels.noCustomer;
    const customer = customers.get(id);
    if (!customer) return labels.missingCustomer;
    return typeof customer.name === 'string' && customer.name.trim() ? customer.name : labels.unnamedCustomer;
  }
  const localized = (value: ExportValue, options: readonly string[]) => {
    if (typeof value !== 'string' || !options.includes(value)) throw new Error('exportResponseInvalid');
    const dictionary: Readonly<Record<string, string>> = labels;
    if (!dictionary[value]) throw new Error('exportResponseInvalid');
    return dictionary[value];
  };
  const result = {} as Record<ExportTableName, { columns: readonly string[]; rows: ExportValue[][] }>;
  for (const name of Object.keys(REPORT_COLUMNS) as ExportTableName[]) {
    const columns = REPORT_COLUMNS[name];
    const rows = raw[name].map((record) => {
      const view = { ...record };
      if (name === 'debts' || name === 'payments' || name === 'archiveEvents') {
        view.customerName = customerName(record.customerId, name === 'archiveEvents' ? record.customerName : undefined);
        view.customerPhone = customers.get(record.customerId)?.phone ?? null;
      }
      if (name === 'customers') {
        if (typeof record.isActive !== 'boolean') throw new Error('exportResponseInvalid');
        view.isActive = record.isActive ? labels.active : labels.inactive;
        view.name = typeof record.name === 'string' && record.name.trim() ? record.name : labels.unnamedCustomer;
      }
      if (name === 'dailyArchives') {
        if (typeof record.hasClosingBalances !== 'boolean') throw new Error('exportResponseInvalid');
        view.hasClosingBalances = record.hasClosingBalances ? labels.yes : labels.no;
      }
      if ('currency' in record) {
        if (!isCurrencyCode(record.currency)) throw new Error('exportResponseInvalid');
        view.currency = `${translate(getCurrency(record.currency).nameKey, language)} (${record.currency})`;
      }
      if (name === 'payments') {
        view.direction = localized(record.direction, ['in', 'out']);
        view.method = localized(record.method, ['cash', 'card', 'bank-transfer', 'other']);
      }
      if ('type' in record) view.type = localized(record.type, ['cash_in', 'cash_out', 'debt', 'settlement', 'merchant']);
      if ('archiveId' in record) {
        const archive = archives.get(record.archiveId);
        if (!archive) throw new Error('exportResponseInvalid');
        view.archiveLabel = `${archive.date} — ${labels.archiveLabel} ${archive.closingNumber}`;
      }
      return columns.map((column) => view[column] ?? null);
    });
    result[name] = { columns, rows };
  }
  return result;
}
