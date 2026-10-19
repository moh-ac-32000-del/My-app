/** Session-only copies of snapshots already delivered to normal screens. No I/O or SDK imports. */
export const LOCAL_EXPORT_COLLECTIONS = ['customers', 'debts', 'payments', 'transactions', 'dailyArchives'] as const;
export type LocalExportCollection = typeof LOCAL_EXPORT_COLLECTIONS[number];
export interface LocalExportScope { uid: string; spaceId: string; storeId: string }
export interface StoredExportDocument { id: string; data: Record<string, unknown> }
interface Entry { documents: StoredExportDocument[]; capturedAt: string | null; tooLarge: boolean; coveredStoreId?: string }
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let epoch = 0;
export function localExportEpoch() { return epoch; }
const key = (uid: string, spaceId: string, collection: LocalExportCollection) => JSON.stringify([uid, spaceId, collection]);

export function rememberLocalExportCollection(uid: string, spaceId: string, collection: LocalExportCollection, documents: StoredExportDocument[], serverConfirmed: boolean, now = new Date().toISOString(), coveredStoreId?: string) {
  if (!uid || !spaceId) return;
  const tooLarge = documents.length > 1000;
  // Deep copy prevents later UI mutations from changing an already received source.
  cache.set(key(uid, spaceId, collection), { documents: serverConfirmed && !tooLarge ? JSON.parse(JSON.stringify(documents)) : [], capturedAt: serverConfirmed && !tooLarge ? now : null, tooLarge, coveredStoreId });
  listeners.forEach((listener) => listener());
}

export function localExportStatus(scope: LocalExportScope) {
  return LOCAL_EXPORT_COLLECTIONS.map((collection) => {
    const candidate = cache.get(key(scope.uid, scope.spaceId, collection));
    const entry = !candidate?.coveredStoreId || candidate.coveredStoreId === scope.storeId ? candidate : undefined;
    return { collection, capturedAt: entry?.capturedAt ?? null, tooLarge: entry?.tooLarge ?? false };
  });
}

export function readLocalExportData(scope: LocalExportScope) {
  const status = localExportStatus(scope);
  if (status.some((entry) => entry.tooLarge)) throw new Error('exportTooLarge');
  if (status.some((entry) => !entry.capturedAt)) throw new Error('exportLocalIncomplete');
  const records = {} as Record<LocalExportCollection, StoredExportDocument[]>;
  const capturedAt = {} as Record<LocalExportCollection, string>;
  for (const { collection, capturedAt: stamp } of status) {
    records[collection] = JSON.parse(JSON.stringify(cache.get(key(scope.uid, scope.spaceId, collection))!.documents
      .filter((doc) => doc.data.storeId === scope.storeId)));
    capturedAt[collection] = stamp!;
  }
  return { records, capturedAt };
}

export function subscribeLocalExportCache(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function clearLocalExportCache() { epoch += 1; cache.clear(); listeners.forEach((listener) => listener()); }
