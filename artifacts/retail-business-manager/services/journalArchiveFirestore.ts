import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { workspaceDocumentPath } from '../data/firestoreWorkspace';
import { isValidCloudDailyArchive } from './cloudDailyArchives';
import { observeForLocalExport } from './localExportObservation';
import type { DailyArchive } from '../types/business';

/** One live archive observation, not another full callable fetch on every debt,
 * payment or cash snapshot. Keep complete coverage for the existing zero-read
 * spreadsheet export; the daily projection still filters by financial day.
 */
export function subscribeJournalArchives(spaceId: string, storeId: string,
  publish: (archives: DailyArchive[]) => void, fail: (error: Error) => void): () => void {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  if (!storeId.trim()) throw new Error('invalidJournalArchiveScope');
  const root = workspaceDocumentPath(spaceId);
  let active = true;
  const exportObservation = observeForLocalExport(spaceId, 'dailyArchives');
  const report = (error: Error) => { exportObservation.invalidate(); fail(error); };
  const stop = onSnapshot(query(collection(getFirestore(getFirebaseApp()), `${root}/dailyArchives`),
    where('storeId', '==', storeId)), { includeMetadataChanges: true }, snapshot => {
    if (!active) return;
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
      report(new Error('journalAwaitingServer')); return;
    }
    try {
      const rows = snapshot.docs.map(doc => {
        const row = doc.data();
        if (row.id !== doc.id || !isValidCloudDailyArchive(row, spaceId, storeId) ||
          !row.snapshot.every(event => typeof event.id === 'string' && event.id.length > 0)) {
          throw new Error('invalidCloudDailyArchiveResponse');
        }
        return row;
      });
      publish(rows);
      exportObservation.archives(rows, new Date().toISOString(), storeId);
    } catch (error) { report(error instanceof Error ? error : new Error('journalArchiveLoadFailed')); }
  }, error => { if (active) report(error); });
  return () => { active = false; stop(); };
}
