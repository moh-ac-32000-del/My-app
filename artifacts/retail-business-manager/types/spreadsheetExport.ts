export const EXPORT_VERSION = 1;
export type ExportValue = string | number | boolean | null;
export const EXPORT_COLUMNS = {
  customers: ['id', 'name', 'phone', 'address', 'notes', 'isActive', 'createdAt', 'updatedAt'],
  debts: ['id', 'customerId', 'currency', 'originalAmount', 'amount', 'dueDate', 'settledAt', 'createdAt', 'updatedAt'],
  payments: ['id', 'customerId', 'transactionId', 'currency', 'amount', 'direction', 'method', 'paidAt', 'note', 'createdAt', 'updatedAt'],
  transactions: ['id', 'type', 'currency', 'amount', 'note', 'createdAt', 'updatedAt'],
  dailyArchives: ['id', 'date', 'closedAt', 'closingNumber', 'hasClosingBalances', 'eventCount'],
  archiveEvents: ['archiveId', 'id', 'sourceId', 'type', 'customerId', 'customerName', 'currency', 'amount', 'occurredAt', 'note'],
  closingBalances: ['archiveId', 'currency', 'amount'],
} as const;
export type ExportTableName = keyof typeof EXPORT_COLUMNS;
export type ExportTables = { [K in ExportTableName]: ExportValue[][] };
export interface SpreadsheetExportSnapshot {
  version: 1;
  spaceId: string;
  storeId: string;
  storeName: string;
  exportedAt: string;
  /** Different local capture times, not a single atomic/current cloud snapshot. */
  capturedAt: Record<'customers' | 'debts' | 'payments' | 'transactions' | 'dailyArchives', string>;
  tables: ExportTables;
}
