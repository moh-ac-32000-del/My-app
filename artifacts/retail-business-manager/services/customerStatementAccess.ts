import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth } from './firebase';

/** Fresh authorization only. Reuses already confirmed history; never scans financial collections for PDF. */
export async function authorizeCustomerStatement(spaceId: string, storeId: string, customerId: string) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid || [spaceId, storeId, customerId].some(id => !id || id.includes('/'))) throw new Error('exportScopeChanged');
  const db = getFirestore(getFirebaseApp()), root = `spaces/${spaceId}`;
  const [space, member, profile, customer] = await Promise.all([
    getDocFromServer(doc(db, root)), getDocFromServer(doc(db, `${root}/members/${uid}`)),
    getDocFromServer(doc(db, `${root}/storeProfile/profile`)), getDocFromServer(doc(db, `${root}/customers/${customerId}`)),
  ]);
  if (getFirebaseAuth().currentUser?.uid !== uid || space.data()?.status !== 'active' || member.data()?.status !== 'active' ||
    !['owner', 'editor'].includes(member.data()?.role) || profile.data()?.storeId !== storeId ||
    customer.data()?.id !== customerId || customer.data()?.storeId !== storeId || customer.data()?.workspaceId !== spaceId)
    throw new Error('exportScopeChanged');
}
