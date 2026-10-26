/** Session-only confirmed receipts from screens or explicit export preparation. No persistent I/O or SDK imports. */
import { merchantExportCoverage } from '../data/merchantExportCoverage';
import { merchantOperationFromDocument } from '../data/merchantDocuments';
import { mergeMerchantHistory } from '../data/merchantHistory';
export const LOCAL_EXPORT_COLLECTIONS = ['customers', 'debts', 'payments', 'transactions', 'dailyArchives',
  'customerCredits', 'merchants', 'merchantBalances', 'merchantOperations'] as const;
export type LocalExportCollection = typeof LOCAL_EXPORT_COLLECTIONS[number];
export interface LocalExportScope { uid: string; spaceId: string; storeId: string }
export interface StoredExportDocument { id: string; data: Record<string, unknown> }
interface Entry { documents: StoredExportDocument[]; capturedAt: string | null; tooLarge: boolean; coveredStoreId?: string; revision: number }
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let epoch = 0;
let revision = 0;
export function localExportEpoch() { return epoch; }
const key = (uid: string, spaceId: string, collection: LocalExportCollection) => JSON.stringify([uid, spaceId, collection]);

export function rememberLocalExportCollection(uid: string, spaceId: string, collection: LocalExportCollection, documents: StoredExportDocument[], serverConfirmed: boolean, now = new Date().toISOString(), coveredStoreId?: string) {
  if (!uid || !spaceId) return;
  const tooLarge = documents.length > 1000;
  // Deep copy prevents later UI mutations from changing an already received source.
  cache.set(key(uid, spaceId, collection), { documents: serverConfirmed && !tooLarge ? JSON.parse(JSON.stringify(documents)) : [], capturedAt: serverConfirmed && !tooLarge ? now : null, tooLarge, coveredStoreId, revision: ++revision });
  listeners.forEach((listener) => listener());
}

export function localExportStatus(scope: LocalExportScope) {
  const status = LOCAL_EXPORT_COLLECTIONS.map((collection) => {
    const candidate = cache.get(key(scope.uid, scope.spaceId, collection));
    const entry = !candidate?.coveredStoreId || candidate.coveredStoreId === scope.storeId ? candidate : undefined;
    return { collection, capturedAt: entry?.capturedAt ?? null, tooLarge: entry?.tooLarge ?? false };
  });
  const operationStatus = status.find((entry) => entry.collection === 'merchantOperations')!;
  if (status.filter((entry) => ['merchants', 'merchantBalances'].includes(entry.collection)).every((entry) => entry.capturedAt)) {
    try {
      merchantExportCoverage(scope.spaceId, scope.storeId, {
        merchants: cache.get(key(scope.uid, scope.spaceId, 'merchants'))!.documents,
        merchantBalances: cache.get(key(scope.uid, scope.spaceId, 'merchantBalances'))!.documents,
        merchantOperations: cache.get(key(scope.uid, scope.spaceId, 'merchantOperations'))?.documents ?? [],
      });
      // A confirmed empty merchant/balance pair also proves there is no statement to load.
      if (!operationStatus.capturedAt && !(cache.get(key(scope.uid, scope.spaceId, 'merchantOperations'))?.documents.length)) {
        const stamp = status.find((entry) => entry.collection === 'merchantBalances')!.capturedAt!;
        operationStatus.capturedAt = stamp;
      }
    } catch (error) {
      operationStatus.capturedAt = null;
      operationStatus.tooLarge ||= error instanceof Error && error.message === 'exportTooLarge';
    }
  } else operationStatus.capturedAt = null;
  return status;
}

/** Union of already received authenticated statement pages, never a new listener/read. */
export function rememberLocalMerchantOperations(uid: string, spaceId: string, storeId: string,
  documents: StoredExportDocument[], serverConfirmed: boolean, now = new Date().toISOString()) {
  const previous = cache.get(key(uid, spaceId, 'merchantOperations'));
  if (!serverConfirmed) {
    cache.set(key(uid, spaceId, 'merchantOperations'), { documents: previous?.documents ?? [], capturedAt: null, tooLarge: previous?.tooLarge ?? false, coveredStoreId: storeId, revision: ++revision });
    listeners.forEach((listener) => listener()); return;
  }
  try {
    const rows = new Map<string, ReturnType<typeof merchantOperationFromDocument>[]>();
    for (const doc of [...(previous?.documents ?? []), ...documents]) {
      const row = merchantOperationFromDocument(doc.id, doc.data, spaceId, storeId);
      const group = rows.get(row.merchantId) ?? [];
      group.push(row); rows.set(row.merchantId, group);
    }
    const merged = [...rows.values()].flatMap((group) => mergeMerchantHistory([], group));
    rememberLocalExportCollection(uid, spaceId, 'merchantOperations', merged.map((row) => ({ id: row.id, data: row as unknown as Record<string, unknown> })), true, now, storeId);
  } catch {
    rememberLocalExportCollection(uid, spaceId, 'merchantOperations', [], false, now, storeId);
  }
}

export function readLocalExportData(scope: LocalExportScope) {
  const status = localExportStatus(scope);
  if (status.some((entry) => entry.tooLarge)) throw new Error('exportTooLarge');
  if (status.some((entry) => !entry.capturedAt)) throw new Error('exportLocalIncomplete');
  const records = {} as Record<LocalExportCollection, StoredExportDocument[]>;
  const capturedAt = {} as Record<LocalExportCollection, string>;
  for (const { collection, capturedAt: stamp } of status) {
    records[collection] = JSON.parse(JSON.stringify((cache.get(key(scope.uid, scope.spaceId, collection))?.documents ?? [])
      .filter((doc) => doc.data.storeId === scope.storeId)));
    capturedAt[collection] = stamp!;
  }
  return { records, capturedAt };
}

export function subscribeLocalExportCache(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** A complete, server-confirmed snapshot already received in this session. No I/O. */
export function readConfirmedCollection(scope: LocalExportScope, collection: LocalExportCollection): StoredExportDocument[] | null {
  return readReceivedExportCollection(scope, collection)?.documents ?? null;
}
/** Receipt metadata may describe partial merchant history; coverage must still be proved. */
export function readReceivedExportCollection(scope: LocalExportScope, collection: LocalExportCollection) {
  const entry = cache.get(key(scope.uid, scope.spaceId, collection));
  if (!entry?.capturedAt || entry.tooLarge || (entry.coveredStoreId && entry.coveredStoreId !== scope.storeId)) return null;
  return { documents: JSON.parse(JSON.stringify(entry.documents.filter(row => row.data.storeId === scope.storeId))) as StoredExportDocument[], capturedAt: entry.capturedAt };
}
export function exportCollectionRevision(scope: LocalExportScope, collection: LocalExportCollection): number | null {
  return cache.get(key(scope.uid, scope.spaceId, collection))?.revision ?? null;
}
export function clearLocalExportCache() { epoch += 1; cache.clear(); listeners.forEach((listener) => listener()); }
