import { collection, doc, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore';
import {
  FIRESTORE_WORKSPACE_COLLECTIONS,
} from '@/data/firestoreWorkspace';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { SpaceDiscoveryResult } from '@/types/space';
import type { MembershipDiscoveryIndexEntry } from '@/types/trustedBootstrap';

const LEGACY_LOCAL_STORE_ID = 'local-store';

export async function discoverUserSpaces(uid: string): Promise<SpaceDiscoveryResult> {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    throw new Error('firebaseUserIdRequired');
  }

  const database = getFirestoreInstance();
  const [userSnapshot, membershipsSnapshot] = await Promise.all([
    getDoc(doc(database, FIRESTORE_WORKSPACE_COLLECTIONS.users, normalizedUid)),
    getDocs(collection(
      database,
      FIRESTORE_WORKSPACE_COLLECTIONS.users,
      normalizedUid,
      FIRESTORE_WORKSPACE_COLLECTIONS.memberships,
    )),
  ]);
  const userData = userSnapshot.exists() ? userSnapshot.data() : undefined;
  const primarySpaceId = typeof userData?.primarySpaceId === 'string'
    && userData.primarySpaceId.trim()
    ? userData.primarySpaceId
    : null;

  return {
    memberships: membershipsSnapshot.docs.map(
      (membershipSnapshot) => membershipSnapshot.data() as MembershipDiscoveryIndexEntry,
    ),
    primarySpaceId,
    // activeSpaceId is an in-memory namespace selector, not a persisted last-active source.
    lastActiveSpaceId: null,
  };
}

export async function validateUserSpaceMembership(uid: string, spaceId: string): Promise<boolean> {
  const normalizedUid = uid.trim();
  const normalizedSpaceId = spaceId.trim();
  if (!normalizedUid) {
    throw new Error('firebaseUserIdRequired');
  }
  if (!normalizedSpaceId || normalizedSpaceId === LEGACY_LOCAL_STORE_ID) {
    throw new Error('cloudSpaceIdInvalid');
  }

  const membershipSnapshot = await getDoc(doc(
    getFirestoreInstance(),
    FIRESTORE_WORKSPACE_COLLECTIONS.spaces,
    normalizedSpaceId,
    FIRESTORE_WORKSPACE_COLLECTIONS.members,
    normalizedUid,
  ));
  if (!membershipSnapshot.exists()) {
    return false;
  }

  const membership = membershipSnapshot.data();
  return membership.spaceId === normalizedSpaceId
    && membership.userId === normalizedUid
    && membership.status === 'active';
}

let firestore: Firestore | null = null;


function getFirestoreInstance(): Firestore {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
  }
  return firestore;
}




