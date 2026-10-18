import type { SpreadsheetExportSnapshot } from '@/types/spreadsheetExport';
export const exportSnapshotFixture: SpreadsheetExportSnapshot = {
  version: 1, spaceId: 'sample-space', storeId: 'sample-store', storeName: 'متجر تجريبي — مثال فقط', exportedAt: '2026-10-19T08:30:00.123Z',
  capturedAt: { customers: '2026-10-19T08:00:00Z', debts: '2026-10-19T08:00:00Z', payments: '2026-10-19T08:00:00Z', transactions: '2026-10-19T08:00:00Z', dailyArchives: '2026-10-19T08:20:00Z' },
  tables: {
    customers: [['c1', 'عميل تجريبي', '+905001234567', 'عنوان تجريبي', '=HYPERLINK("https://example.invalid","test")', false, '2026-10-18T09:00:00Z', '2026-10-19T08:00:00Z']],
    debts: [['d1', 'c1', 'TRY', 120.5, 70.25, '2026-10-20', null, '2026-10-18T09:00:00Z', '2026-10-19T08:00:00Z'], ['d2', 'c1', 'USD', null, 0, null, '2026-10-19T08:00:00Z', '2026-10-18T09:00:00Z', '2026-10-19T08:00:00Z']],
    payments: [['p1', 'c1', 't1', 'TRY', 50.25, 'in', 'cash', '2026-10-19T08:00:00Z', 'دفعة تجريبية', '2026-10-19T08:00:00Z', '2026-10-19T08:00:00Z']],
    transactions: [['t1', 'cash_in', 'TRY', 50.25, 'حركة تجريبية', '2026-10-19T08:00:00Z', '2026-10-19T08:00:00Z']],
    dailyArchives: [['a1', '2026-10-19', '2026-10-19T08:20:00Z', 1, true, 1], ['legacy', '2026-10-18', '2026-10-18T18:00:00Z', 1, false, 0]],
    archiveEvents: [['a1', 'settlement:p1', 'p1', 'settlement', 'c1', 'عميل تجريبي', 'TRY', 50.25, '2026-10-19T08:00:00Z', null]],
    closingBalances: [['a1', 'TRY', 50.25], ['a1', 'USD', -20]],
  },
};
