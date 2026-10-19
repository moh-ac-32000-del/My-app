import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { rememberLocalExportCollection, rememberLocalMerchantOperations, localExportEpoch, type LocalExportCollection } from './localExportCache';

type ObservedSnapshot = { docs: Array<{ id: string; data: () => Record<string, unknown> }>; metadata?: { fromCache: boolean; hasPendingWrites: boolean } };
function uid() { try { return isFirebaseConfigured ? getFirebaseAuth().currentUser?.uid ?? null : null; } catch { return null; } }

/** Attach to an existing subscription only. Does not fetch, listen, refresh or persist anything. */
export function observeForLocalExport(spaceId: string, collection: LocalExportCollection) {
  const actor = uid();
  const epoch = localExportEpoch();
  const isCurrent = () => !!actor && uid() === actor && localExportEpoch() === epoch;
  return {
    merchantOperations(snapshot: ObservedSnapshot, storeId: string) {
      if (!actor || !isCurrent()) return;
      rememberLocalMerchantOperations(actor, spaceId, storeId, snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
        snapshot.metadata?.fromCache === false && snapshot.metadata.hasPendingWrites === false);
    },
    receive(snapshot: ObservedSnapshot) {
      if (!actor || !isCurrent()) return;
      try {
        rememberLocalExportCollection(actor, spaceId, collection,
          snapshot.docs.length > 1000 ? Array.from({ length: 1001 }, () => ({ id: '', data: {} })) : snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
          snapshot.metadata?.fromCache === false && snapshot.metadata.hasPendingWrites === false);
      } catch { rememberLocalExportCollection(actor, spaceId, collection, [], false); }
    },
    invalidate() { if (actor && isCurrent()) rememberLocalExportCollection(actor, spaceId, collection, [], false); },
    archives(rows: Array<{ id: string }>, processedAt: string, storeId: string) {
      if (!actor || !isCurrent()) return;
      try { rememberLocalExportCollection(actor, spaceId, 'dailyArchives', rows.map((row) => ({ id: row.id, data: row as unknown as Record<string, unknown> })), true, processedAt, storeId); }
      catch { rememberLocalExportCollection(actor, spaceId, 'dailyArchives', [], false); }
    },
  };
}
