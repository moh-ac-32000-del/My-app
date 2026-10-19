import * as XLSX from 'xlsx';
import type { Language } from '@/constants/i18n';
import { exportLabels, exportReportLabels } from '@/constants/exportLabels';
import { EXPORT_COLUMNS, type ExportTableName, type ExportValue, type SpreadsheetExportSnapshot } from '@/types/spreadsheetExport';
import { spreadsheetPresentation, TECHNICAL_COLUMNS } from './spreadsheetPresentation';
import { groupSpreadsheetReports } from './spreadsheetGroupedReport';
import { exactSpreadsheetReports } from './exactSpreadsheetReport';
import { merchantExportLabels } from '@/constants/merchantExportLabels';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DATE_COLUMNS = new Set(['createdAt', 'updatedAt', 'paidAt', 'settledAt', 'dueDate', 'closedAt', 'date', 'occurredAt']);

export function buildSpreadsheetWorkbook(snapshot: SpreadsheetExportSnapshot, language: Language): XLSX.WorkBook {
  const source = buildDetailedSpreadsheetWorkbook(snapshot, language);
  return snapshot.version === 2 ? exactSpreadsheetReports(snapshot, language) : groupSpreadsheetReports(snapshot, language, source);
}

/** Validated, typed intermediate tables; the downloaded workbook contains two grouped reports. */
export function buildDetailedSpreadsheetWorkbook(snapshot: SpreadsheetExportSnapshot, language: Language): XLSX.WorkBook {
  if (![1, 2].includes(snapshot.version) || (snapshot.version === 2 && !snapshot.accountData) || !snapshot.tables || !Number.isFinite(Date.parse(snapshot.exportedAt))) throw new Error('exportResponseInvalid');
  const labels = { ...exportLabels[language], ...exportReportLabels[language], ...merchantExportLabels[language] };
  const presentation = spreadsheetPresentation(snapshot, language);
  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: language === 'ar' }] };
  book.Props = { Title: 'My app — financial export', Author: 'My app', CreatedDate: new Date(snapshot.exportedAt) };
  const details: ExportValue[][] = [
    ['My app', ''], [labels.store, snapshot.storeName],
    [labels.exportedAt, readableTime(snapshot.exportedAt)], [labels.source, labels.localSource],
    ...Object.entries(snapshot.capturedAt).map(([name, time]): ExportValue[] => [labels[name as ExportTableName] + ' (UTC)', readableTime(time)]),
    ...wrapWarning(labels.warning).map((line): ExportValue[] => [line, null]),
    ...wrapWarning(labels.technicalHint).map((line): ExportValue[] => [line, null]),
    [labels.scope, snapshot.spaceId], [labels.storeId, snapshot.storeId], [labels.version, snapshot.version],
  ];
  const info = sheet(details, ['label', 'value']);
  info['!cols'] = [{ wch: 58 }, { wch: 38 }];
  info['!rows'] = details.map(() => ({ hpt: 28 }));
  for (const name of Object.keys(EXPORT_COLUMNS) as ExportTableName[]) {
    const { columns, rows } = presentation[name];
    const headers = columns.map((key) => labels[key as keyof typeof labels]);
    // A debt's amount is the stored remaining debt, not a newly calculated balance.
    if (name === 'debts') headers[columns.indexOf('amount')] = labels.remainingDebt;
    const data = sheet([headers, ...rows], columns);
    data['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length, c: columns.length - 1 }) };
    data['!cols'] = columns.map((key, index) => ({ hidden: TECHNICAL_COLUMNS.has(key), wch: Math.max(headers[index].length + 3, key === 'note' || key === 'notes' ? 36 : DATE_COLUMNS.has(key) ? 25 : key === 'amount' || key === 'originalAmount' ? 23 : 27) }));
    data['!rows'] = [{ hpt: 28 }, ...rows.map(() => ({ hpt: 24 }))];
    XLSX.utils.book_append_sheet(book, data, labels[name]);
  }
  // Open on useful customer names, not a page of workspace IDs and diagnostic metadata.
  XLSX.utils.book_append_sheet(book, info, labels.info);
  return book;
}

function readableTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error('exportResponseInvalid');
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

function wrapWarning(message: string): string[] {
  const lines: string[] = [];
  for (const word of message.split(' ')) {
    if (!lines.length || lines[lines.length - 1].length + word.length > 66) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}

function sheet(rows: ExportValue[][], columns: readonly string[]): XLSX.WorkSheet {
  const result: XLSX.WorkSheet = {};
  rows.forEach((row, r) => row.forEach((value, c) => {
    if (value === null) return;
    const key = XLSX.utils.encode_cell({ r, c });
    if (r > 0 && DATE_COLUMNS.has(columns[c]) && typeof value === 'string') {
      const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
      if (!Number.isFinite(parsed)) throw new Error('exportResponseInvalid');
      result[key] = { t: 'n', v: (parsed - Date.UTC(1899, 11, 30)) / 86_400_000, z: value.length === 10 ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss' };
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = { t: 'n', v: value, z: columns[c] === 'amount' || columns[c] === 'originalAmount' ? '#,##0.00##########' : '0' };
    } else if (typeof value === 'boolean') result[key] = { t: 'b', v: value };
    else if (typeof value === 'string' && value.length <= 32767) {
      // Always literal text, including =, +, -, @, URLs, phone numbers and IDs.
      // Never set f/l fields: no formulas, hyperlinks, macros or external connections.
      result[key] = { t: 's', v: value, z: '@' };
    } else throw new Error('exportResponseInvalid');
  }));
  result['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: columns.length - 1 });
  return result;
}

export function spreadsheetBytes(snapshot: SpreadsheetExportSnapshot, language: Language): Uint8Array {
  return new Uint8Array(XLSX.write(buildSpreadsheetWorkbook(snapshot, language), { type: 'array', bookType: 'xlsx', compression: true }));
}

export function exportFileName(exportedAt: string): string {
  const stamp = new Date(exportedAt).toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '').replace('.', '-');
  return `My-app-export-${stamp}.xlsx`;
}
