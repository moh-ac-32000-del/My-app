import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore';
import { FIREBASE_COLLECTIONS, type SpaceDocument } from '@/data/collections';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { SpaceIdentity } from '@/types/space';

const LEGACY_LOCAL_STORE_ID = 'local-store';

let firestore: Firestore | null = null;

export async function ensureCloudSpace(identity: SpaceIdentity): Promise<SpaceDocument> {
  const spaceId = normalizeSpaceId(identity.spaceId);
  const ownerUserId = normalizeOwnerUserId(identity.uid);
  const spaceReference = doc(getFirestoreInstance(), FIREBASE_COLLECTIONS.stores, spaceId);
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