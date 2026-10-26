import { collection, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth } from './firebase';
import { workspaceDocumentPath } from '../data/firestoreWorkspace';
import type { SpreadsheetPreparationSource } from '../data/prepareSpreadsheetExport';
import type { LocalExportScope } from './localExportCache';

function root(scope: LocalExportScope) {
  if (getFirebaseAuth().currentUser?.uid !== scope.uid || !scope.uid || !scope.storeId || scope.storeId.includes('/')) throw new Error('exportScopeChanged');
  return workspaceDocumentPath(scope.spaceId);
}
export const spreadsheetPreparationSource: SpreadsheetPreparationSource = {
  async authorize(scope) {
    const path = root(scope), db = getFirestore(getFirebaseApp());
    const [space, member, profile] = await Promise.all([
      getDocFromServer(doc(db, path)), getDocFromServer(doc(db, `${path}/members/${scope.uid}`)),
      getDocFromServer(doc(db, `${path}/storeProfile/profile`)),
    ]);
    root(scope);
    if (space.data()?.status !== 'active' || member.data()?.status !== 'active' ||
      !['owner', 'editor', 'viewer'].includes(member.data()?.role) || profile.data()?.storeId !== scope.storeId) throw new Error('exportScopeChanged');
  },
  async collection(scope, name) {
    const path = root(scope), db = getFirestore(getFirebaseApp());
    const snapshot = await getDocsFromServer(query(collection(db, `${path}/${name}`), where('storeId', '==', scope.storeId), limit(1001)));
    root(scope);
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw new Error('exportServerUnconfirmed');
    return snapshot.docs.map(row => ({ id: row.id, data: row.data() }));
  },
  async merchantPage(scope, merchantId, cursor, size) {
    const path = root(scope), db = getFirestore(getFirebaseApp());
    if (!merchantId || merchantId.includes('/') || !Number.isInteger(size) || size < 1 || size > 100 ||
      (cursor && (!cursor.id || cursor.id.includes('/') || !Number.isFinite(Date.parse(cursor.createdAt))))) throw new Error('exportScopeInvalid');
    const snapshot = await getDocsFromServer(query(collection(db, `${path}/merchantOperations`),
      where('merchantId', '==', merchantId), orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'),
      ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(size)));
    root(scope);
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw new Error('exportServerUnconfirmed');
    return snapshot.docs.map(row => ({ id: row.id, data: row.data() }));
  },
};
