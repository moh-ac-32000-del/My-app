import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import { workspaceDocumentPath } from '../data/firestoreWorkspace';
import { isArchiveDate } from '../data/archiveCalendar';
import { isValidCloudDailyArchive } from './cloudDailyArchives';
import type { DailyArchive } from '../types/business';

/** Only the selected day's server-confirmed immutable closings. This partial
 * observation must never claim complete-history spreadsheet export coverage. */
export function subscribeArchiveDay(spaceId: string, storeId: string, date: string,
  publish: (archives: DailyArchive[]) => void, fail: (error: Error) => void): () => void {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  if (!storeId.trim() || !isArchiveDate(date)) throw new Error('invalidArchiveDayScope');
  const root = workspaceDocumentPath(spaceId);
  let active = true;
  const stop = onSnapshot(query(collection(getFirestore(getFirebaseApp()), `${root}/dailyArchives`),
    where('storeId', '==', storeId), where('date', '==', date)), { includeMetadataChanges: true }, snapshot => {
    if (!active) return;
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
      fail(new Error('archiveAwaitingServer')); return;
    }
    try {
      const rows = snapshot.docs.map(doc => {
        const row = doc.data();
        if (row.id !== doc.id || !isValidCloudDailyArchive(row, spaceId, storeId) || row.date !== date ||
          !row.snapshot.every(event => typeof event.id === 'string' && event.id.length > 0)) {
          throw new Error('invalidCloudDailyArchiveResponse');
        }
        // Current-state decorations come only from the separately authorized
        // status request, never from a saved historical document.
        const { operationStatuses: _statuses, operationStatusesUnavailable: _unavailable, ...saved } = row;
        return saved;
      });
      publish(rows.sort((a, b) => b.closingNumber - a.closingNumber));
    } catch (error) { fail(error instanceof Error ? error : new Error('archiveLoadFailed')); }
  }, error => { if (active) fail(error); });
  return () => { active = false; stop(); };
}
