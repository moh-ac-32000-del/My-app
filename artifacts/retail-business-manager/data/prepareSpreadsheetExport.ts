import { merchantBalanceFromDocument, merchantFromDocument, merchantOperationFromDocument } from './merchantDocuments';
import { merchantExportCoverage } from './merchantExportCoverage';
import { LOCAL_EXPORT_COLLECTIONS, exportCollectionRevision, localExportStatus, readLocalExportData,
  readReceivedExportCollection, rememberLocalExportCollection, type LocalExportCollection, type LocalExportScope, type StoredExportDocument } from '../services/localExportCache';
import { projectLocalExportSnapshot } from '../services/localExportProjection';

export type ExportCursor = { id: string; createdAt: string };
export type ExportProgress = { collection: LocalExportCollection; documents: number; completed: number; total: number };
export interface SpreadsheetPreparationSource {
  authorize(scope: LocalExportScope): Promise<void>;
  collection(scope: LocalExportScope, name: Exclude<LocalExportCollection, 'merchantOperations'>): Promise<StoredExportDocument[]>;
  merchantPage(scope: LocalExportScope, merchantId: string, cursor: ExportCursor | null, size: number): Promise<StoredExportDocument[]>;
}

/** Explicit, consented preparation only. No writes, background work, persistent cache or changed arithmetic. */
export async function prepareSpreadsheetExport(scope: LocalExportScope, storeName: string, source: SpreadsheetPreparationSource,
  options: { isCurrent: () => boolean; allowReads: boolean; progress?: (value: ExportProgress) => void }) {
  const assertCurrent = () => { if (!options.isCurrent()) throw new Error('exportScopeChanged'); };
  assertCurrent();
  const status = localExportStatus(scope);
  if (status.some(row => row.tooLarge)) throw new Error('exportTooLarge');
  if (status.every(row => row.capturedAt)) {
    const local = readLocalExportData(scope);
    return projectLocalExportSnapshot(scope, storeName, local.records, local.capturedAt, new Date().toISOString());
  }
  if (!options.allowReads) throw new Error('exportConsentRequired');
  const revisions = new Map(LOCAL_EXPORT_COLLECTIONS.map(name => [name, exportCollectionRevision(scope, name)]));
  const unchanged = () => LOCAL_EXPORT_COLLECTIONS.every(name => exportCollectionRevision(scope, name) === revisions.get(name));
  const records = {} as Record<LocalExportCollection, StoredExportDocument[]>;
  const capturedAt = {} as Record<LocalExportCollection, string>;
  const fetched = new Set<LocalExportCollection>();
  let authorized = false, documents = 0, completed = status.filter(row => row.capturedAt).length;
  const progress = (collection: LocalExportCollection) => {
    assertCurrent(); options.progress?.({ collection, documents, completed, total: LOCAL_EXPORT_COLLECTIONS.length });
  };
  const request = async (collection: LocalExportCollection, load: () => Promise<StoredExportDocument[]>) => {
    assertCurrent();
    if (!authorized) { await source.authorize(scope); assertCurrent(); authorized = true; }
    progress(collection);
    const rows = await load();
    assertCurrent();
    if (rows.length > 1000) throw new Error('exportTooLarge');
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row.id || row.id.includes('/') || ids.has(row.id) || row.data.storeId !== scope.storeId ||
        (row.data.workspaceId !== undefined && row.data.workspaceId !== scope.spaceId)) throw new Error('exportInvalidData');
      ids.add(row.id);
    }
    documents += rows.length; progress(collection);
    return rows;
  };
  // Reuse confirmed receipts. A partial merchant history is reusable but never considered complete yet.
  for (const name of LOCAL_EXPORT_COLLECTIONS) {
    const receipt = readReceivedExportCollection(scope, name);
    if (receipt) { records[name] = receipt.documents; capturedAt[name] = receipt.capturedAt; }
  }
  for (const name of LOCAL_EXPORT_COLLECTIONS) {
    if (name === 'merchantOperations' || records[name]) continue;
    records[name] = await request(name, () => source.collection(scope, name));
    capturedAt[name] = new Date().toISOString(); fetched.add(name); completed++; progress(name);
  }
  const merchants = records.merchants.map(row => merchantFromDocument(row.id, row.data, scope.spaceId, scope.storeId));
  const balances = records.merchantBalances.map(row => merchantBalanceFromDocument(row.id, row.data, scope.spaceId, scope.storeId));
  const expected = new Map(merchants.map(row => [row.id, 0]));
  if (expected.size !== merchants.length) throw new Error('exportInvalidData');
  const balanceKeys = new Set<string>();
  for (const balance of balances) {
    const key = JSON.stringify([balance.merchantId, balance.currency]);
    if (!expected.has(balance.merchantId) || balanceKeys.has(key)) throw new Error('exportInvalidData');
    balanceKeys.add(key);
    expected.set(balance.merchantId, expected.get(balance.merchantId)! + balance.revision);
  }
  if ([...expected.values()].reduce((sum, count) => sum + count, 0) > 1000) throw new Error('exportTooLarge');
  const operations = new Map((records.merchantOperations ?? []).map(row => [row.id, row]));
  if (operations.size !== (records.merchantOperations ?? []).length) throw new Error('exportInvalidData');
  for (const row of operations.values()) {
    const operation = merchantOperationFromDocument(row.id, row.data, scope.spaceId, scope.storeId);
    if (!expected.has(operation.merchantId)) throw new Error('exportInvalidData');
  }
  // Skip complete accounts. Partial histories can contain gaps, so scan bounded heads/pages until
  // trusted balance revisions prove coverage. A head may overlap already received rows.
  for (const [merchantId, count] of expected) {
    const have = () => [...operations.values()].filter(row => row.data.merchantId === merchantId).length;
    if (have() > count) throw new Error('exportChangedDuringPreparation');
    let cursor: ExportCursor | null = null, pages = 0;
    while (have() < count) {
      if (++pages > Math.ceil(count / 100)) throw new Error('exportLocalIncomplete');
      const size = Math.min(100, count);
      const rows = await request('merchantOperations', () => source.merchantPage(scope, merchantId, cursor, size));
      if (!rows.length || rows.length > size) throw new Error('exportLocalIncomplete');
      for (const row of rows) {
        const operation = merchantOperationFromDocument(row.id, row.data, scope.spaceId, scope.storeId);
        if (operation.merchantId !== merchantId) throw new Error('exportInvalidData');
        operations.set(row.id, row);
      }
      if (have() > count) throw new Error('exportChangedDuringPreparation');
      const last = rows[rows.length - 1];
      const next = { id: last.id, createdAt: String(last.data.createdAt) };
      if (cursor && next.id === cursor.id && next.createdAt === cursor.createdAt) throw new Error('exportLocalIncomplete');
      cursor = next;
      if (have() < count && rows.length < size) throw new Error('exportLocalIncomplete');
    }
  }
  records.merchantOperations = [...operations.values()];
  merchantExportCoverage(scope.spaceId, scope.storeId, records);
  capturedAt.merchantOperations = new Date().toISOString();
  fetched.add('merchantOperations');
  if (!status.find(row => row.collection === 'merchantOperations')?.capturedAt) completed++;
  progress('merchantOperations');
  const snapshot = projectLocalExportSnapshot(scope, storeName, records, capturedAt, new Date().toISOString());
  if (authorized) { assertCurrent(); await source.authorize(scope); assertCurrent(); }
  if (!unchanged()) throw new Error('exportChangedDuringPreparation');
  // Commit only a fully validated result, without overwriting a newer live receipt.
  for (const name of fetched) {
    assertCurrent();
    rememberLocalExportCollection(scope.uid, scope.spaceId, name, records[name], true, capturedAt[name], scope.storeId);
  }
  assertCurrent();
  return snapshot;
}
