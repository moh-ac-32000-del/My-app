import { collection, doc, getDoc, getDocs, getFirestore, setDoc, type Firestore } from 'firebase/firestore';
import type { SpaceDocument } from '@/data/collections';
import {
  FIRESTORE_WORKSPACE_COLLECTIONS,
} from '@/data/firestoreWorkspace';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { SpaceDiscoveryResult, SpaceIdentity } from '@/types/space';
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

export async function ensureCloudSpace(identity: SpaceIdentity): Promise<SpaceDocument> {
  const spaceId = normalizeSpaceId(identity.spaceId);
  const ownerUserId = normalizeOwnerUserId(identity.uid);
  const spaceReference = doc(
    getFirestoreInstance(),
    FIRESTORE_WORKSPACE_COLLECTIONS.spaces,
    spaceId,
  );
  const existingSnapshot = await getDoc(spaceReference);

  if (existingSnapshot.exists()) {
    const existingSpace = parseSpaceDocument(existingSnapshot.data(), spaceId);
    if (!existingSpace || existingSpace.ownerUserId !== ownerUserId) {
      throw new Error('cloudSpaceOwnershipMismatch');
    }
    return existingSpace;
  }

  const now = new Date().toISOString();
  const newSpace: SpaceDocument = {
    spaceId,
    ownerUserId,
    createdAt: identity.createdAt,
    updatedAt: now,
  };
  await setDoc(spaceReference, newSpace);
  return newSpace;
}

function getFirestoreInstance(): Firestore {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
  }
  return firestore;
}

function normalizeSpaceId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('cloudSpaceIdRequired');
  }
  const spaceId = value.trim();
  if (!spaceId || spaceId === LEGACY_LOCAL_STORE_ID) {
    throw new Error('cloudSpaceIdInvalid');
  }
  return spaceId;
}

function normalizeOwnerUserId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('cloudSpaceOwnerRequired');
  }
  return value.trim();
}

function parseSpaceDocument(value: unknown, expectedSpaceId: string): SpaceDocument | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.spaceId !== expectedSpaceId
    || typeof value.ownerUserId !== 'string'
    || !value.ownerUserId.trim()
    || typeof value.createdAt !== 'string'
    || !value.createdAt.trim()
    || typeof value.updatedAt !== 'string'
    || !value.updatedAt.trim()
  ) {
    return null;
  }
  return {
    spaceId: expectedSpaceId,
    ownerUserId: value.ownerUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}