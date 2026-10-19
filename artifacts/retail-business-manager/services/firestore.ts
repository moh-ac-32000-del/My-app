import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { FIRESTORE_WORKSPACE_COLLECTIONS } from '@/data/firestoreWorkspace';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { Space, MembershipRole, SpaceDiscoveryResult } from '@/types/space';
import type { MembershipDiscoveryIndexEntry } from '@/types/trustedBootstrap';
import { canReadWorkspace } from '@/data/workspaceAccess';

export interface WorkspaceSession {
  space: Space;
  role: MembershipRole;
}

function sessionFromData(
  uid: string,
  spaceId: string,
  space: Record<string, any> | undefined,
  member: Record<string, any> | undefined,
): WorkspaceSession {
  if (
    !space ||
    space.status !== 'active' ||
    space.spaceId !== spaceId ||
    typeof space.name !== 'string' ||
    !space.name.trim() ||
    typeof space.ownerUserId !== 'string' ||
    !space.ownerUserId ||
    !['private', 'shared'].includes(space.mode) ||
    !member ||
    member.userId !== uid ||
    member.spaceId !== spaceId ||
    !canReadWorkspace(member) ||
    (member.role === 'owner' && space.ownerUserId !== uid)
  )
    throw new Error('activeWorkspaceMembershipMissing');
  return { space: { ...space, spaceId } as Space, role: member.role };
}

export async function loadWorkspaceSession(uid: string, spaceId: string): Promise<WorkspaceSession> {
  if (!uid.trim() || !spaceId.trim() || spaceId.includes('/')) throw new Error('cloudSpaceIdInvalid');
  const db = getFirestoreInstance();
  const [space, member] = await Promise.all([
    getDocFromServer(doc(db, 'spaces', spaceId)),
    getDocFromServer(doc(db, 'spaces', spaceId, 'members', uid)),
  ]);
  return sessionFromData(uid, spaceId, space.data(), member.data());
}

/** Two scoped listeners, never polling all spaces. Cached metadata cannot authorize a session. */
export function observeWorkspaceSession(
  uid: string,
  spaceId: string,
  onValue: (value: WorkspaceSession | null) => void,
): () => void {
  const db = getFirestoreInstance();
  let space: Record<string, any> | undefined;
  let member: Record<string, any> | undefined;
  let spaceVerified = false;
  let memberVerified = false;
  let verifiedOnce = false;
  let active = true;
  const publish = () => {
    if (!active) return;
    if (!spaceVerified || !memberVerified) {
      if (verifiedOnce) onValue(null);
      return;
    }
    verifiedOnce = true;
    try {
      onValue(sessionFromData(uid, spaceId, space, member));
    } catch {
      onValue(null);
    }
  };
  const stopSpace = onSnapshot(
    doc(db, 'spaces', spaceId),
    { includeMetadataChanges: true },
    (snapshot) => {
      space = snapshot.data();
      spaceVerified = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      publish();
    },
    () => {
      spaceVerified = false;
      if (active) onValue(null);
    },
  );
  const stopMember = onSnapshot(
    doc(db, 'spaces', spaceId, 'members', uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      member = snapshot.data();
      memberVerified = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      publish();
    },
    () => {
      memberVerified = false;
      if (active) onValue(null);
    },
  );
  return () => {
    active = false;
    stopSpace();
    stopMember();
  };
}

const LEGACY_LOCAL_STORE_ID = 'local-store';

export async function discoverUserSpaces(uid: string): Promise<SpaceDiscoveryResult> {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    throw new Error('firebaseUserIdRequired');
  }

  const database = getFirestoreInstance();
  const [userSnapshot, membershipsSnapshot] = await Promise.all([
    getDoc(doc(database, FIRESTORE_WORKSPACE_COLLECTIONS.users, normalizedUid)),
    getDocs(
      collection(
        database,
        FIRESTORE_WORKSPACE_COLLECTIONS.users,
        normalizedUid,
        FIRESTORE_WORKSPACE_COLLECTIONS.memberships,
      ),
    ),
  ]);
  const userData = userSnapshot.exists() ? userSnapshot.data() : undefined;
  const primarySpaceId =
    typeof userData?.primarySpaceId === 'string' && userData.primarySpaceId.trim() ? userData.primarySpaceId : null;

  return {
    memberships: membershipsSnapshot.docs.map(
      (membershipSnapshot) => membershipSnapshot.data() as MembershipDiscoveryIndexEntry,
    ),
    primarySpaceId,
    // activeSpaceId is an in-memory namespace selector, not a persisted last-active source.
    lastActiveSpaceId: null,
  };
}

/** Refresh names and roles only when the chooser opens; no financial reads or all-space polling. */
export async function listUserWorkspaces(uid: string): Promise<MembershipDiscoveryIndexEntry[]> {
  const discovery = await discoverUserSpaces(uid);
  const candidates = discovery.memberships.filter((item) => item.status === 'active');
  const verified: MembershipDiscoveryIndexEntry[] = [];
  // Keep concurrency bounded for users with many joined workspaces.
  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(
      candidates.slice(offset, offset + 4).map(async (item) => {
        try {
          const session = await loadWorkspaceSession(uid, item.spaceId);
          verified.push({ ...item, spaceNameSnapshot: session.space.name, role: session.role, status: 'active' });
        } catch (error) {
          const denied =
            (error instanceof Error && error.message === 'activeWorkspaceMembershipMissing') ||
            (!!error &&
              typeof error === 'object' &&
              'code' in error &&
              ['permission-denied', 'not-found'].includes(String(error.code)));
          if (!denied) throw error;
        }
      }),
    );
  }
  return verified.sort((a, b) => a.spaceNameSnapshot.localeCompare(b.spaceNameSnapshot));
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

  const membershipSnapshot = await getDocFromServer(
    doc(
      getFirestoreInstance(),
      FIRESTORE_WORKSPACE_COLLECTIONS.spaces,
      normalizedSpaceId,
      FIRESTORE_WORKSPACE_COLLECTIONS.members,
      normalizedUid,
    ),
  ).catch((error: unknown) => {
    // Revoked membership is expected for stale discovery/last-active hints.
    // Connection failures are not proof of revocation and must remain visible.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['permission-denied', 'not-found'].includes(String(error.code))
    )
      return null;
    throw error;
  });
  if (!membershipSnapshot || !membershipSnapshot.exists()) {
    return false;
  }

  const membership = membershipSnapshot.data();
  return (
    membership.spaceId === normalizedSpaceId && membership.userId === normalizedUid && canReadWorkspace(membership)
  );
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
