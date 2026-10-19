import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { workspaceDocumentPath } from '../data/firestoreWorkspace';
import { merchantOperationFromDocument } from '../data/merchantDocuments';
import type { MerchantOperation } from '../types/merchant';

/** Current calendar interval only; never an all-history scan or a silently truncated page. */
export function subscribeMerchantJournal(
  spaceId: string,
  storeId: string,
  startAt: string,
  endAt: string,
  publish: (operations: MerchantOperation[]) => void,
  fail: (error: Error) => void,
): () => void {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  if (!storeId || !Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt)) || startAt >= endAt)
    throw new Error('invalidJournalInterval');
  let active = true;
  const stop = onSnapshot(
    query(
      collection(getFirestore(getFirebaseApp()), `${workspaceDocumentPath(spaceId)}/merchantOperations`),
      where('storeId', '==', storeId),
      where('createdAt', '>=', startAt),
      where('createdAt', '<', endAt),
    ),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active) return;
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
        fail(new Error('journalAwaitingServer'));
        return;
      }
      try {
        publish(snapshot.docs.map((doc) => merchantOperationFromDocument(doc.id, doc.data(), spaceId, storeId)));
      } catch {
        fail(new Error('invalidCloudMerchantDocument'));
      }
    },
    (error) => {
      if (active) fail(error);
    },
  );
  return () => {
    active = false;
    stop();
  };
}
