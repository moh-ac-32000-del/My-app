import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth } from './firebase';
import { archiveExportFingerprint } from './archivePdf';
import { isValidCloudDailyArchive } from './cloudDailyArchives';
import type { DailyArchive } from '../types/business';

/** Fresh reads of access and the selected closing only; no history scan or writes. */
export async function authorizeArchivePdf(spaceId: string, storeId: string, archive: DailyArchive) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid || [spaceId, storeId, archive.id].some(id => !id || id.includes('/'))) throw new Error('exportScopeChanged');
  const db = getFirestore(getFirebaseApp()), root = `spaces/${spaceId}`;
  const [space, member, profile, saved] = await Promise.all([
    getDocFromServer(doc(db, root)), getDocFromServer(doc(db, `${root}/members/${uid}`)),
    getDocFromServer(doc(db, `${root}/storeProfile/profile`)), getDocFromServer(doc(db, `${root}/dailyArchives/${archive.id}`)),
  ]);
  const value = saved.data();
  if (getFirebaseAuth().currentUser?.uid !== uid || space.data()?.status !== 'active' || member.data()?.status !== 'active'
    || !['owner', 'editor', 'viewer'].includes(member.data()?.role) || profile.data()?.storeId !== storeId
    || !isValidCloudDailyArchive(value, spaceId, storeId) || value.id !== archive.id
    || archiveExportFingerprint(value) !== archiveExportFingerprint(archive)) throw new Error('exportScopeChanged');
}
