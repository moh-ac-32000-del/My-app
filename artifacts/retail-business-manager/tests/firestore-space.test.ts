import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceDocument } from '@/data/collections';
import type { SpaceIdentity } from '@/types/space';

const firestoreState = vi.hoisted(() => ({
  documents: new Map<string, SpaceDocument>(),
  collection: vi.fn(),
  doc: vi.fn((database: unknown, collection: string, id: string) => ({ database, collection, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestore: vi.fn(() => ({ name: 'test-firestore' })),
  setDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreState.collection,
  doc: firestoreState.doc,
  getDoc: firestoreState.getDoc,
  getDocs: firestoreState.getDocs,
  getFirestore: firestoreState.getFirestore,
  setDoc: firestoreState.setDoc,
}));

vi.mock('@/services/firebase', () => ({
  getFirebaseApp: vi.fn(() => ({ name: 'test-app' })),
  isFirebaseConfigured: true,
}));

import { ensureCloudSpace } from '@/services/firestore';

const identityA: SpaceIdentity = {
  uid: 'firebase-user-a',
  spaceId: 'space_A',
  createdAt: '2026-08-30T10:00:00.000Z',
};

const identityB: SpaceIdentity = {
  uid: 'firebase-user-b',
  spaceId: 'space_B',
  createdAt: '2026-08-30T10:01:00.000Z',
};

describe('Firestore Space foundation', () => {
  beforeEach(() => {
    firestoreState.documents.clear();
    firestoreState.doc.mockClear();
    firestoreState.getDoc.mockReset();
    firestoreState.getDoc.mockImplementation(async (reference: { id: string }) => {
      const value = firestoreState.documents.get(reference.id);
      return {
        exists: () => value !== undefined,
        data: () => value,
      };
    });
    firestoreState.setDoc.mockReset();
    firestoreState.setDoc.mockImplementation(async (
      reference: { id: string },
      value: SpaceDocument,
    ) => {
      firestoreState.documents.set(reference.id, value);
    });
  });

  it('creates one Space document for Firebase user A', async () => {
    await expect(ensureCloudSpace(identityA)).resolves.toMatchObject({
      spaceId: 'space_A',
      ownerUserId: 'firebase-user-a',
    });

    expect(firestoreState.doc).toHaveBeenCalledWith(
      { name: 'test-firestore' },
      'spaces',
      'space_A',
    );
    expect(firestoreState.documents.get('space_A')).toMatchObject({
      spaceId: 'space_A',
      ownerUserId: 'firebase-user-a',
    });
  });

  it('creates a separate Space document for Firebase user B', async () => {
    await ensureCloudSpace(identityA);
    await ensureCloudSpace(identityB);

    expect(Array.from(firestoreState.documents.keys())).toEqual(['space_A', 'space_B']);
    expect(firestoreState.documents.get('space_B')).toMatchObject({
      spaceId: 'space_B',
      ownerUserId: 'firebase-user-b',
    });
  });

  it('rejects a user trying to access a Space owned by another UID', async () => {
    await ensureCloudSpace(identityA);

    await expect(ensureCloudSpace({
      ...identityA,
      uid: identityB.uid,
    })).rejects.toThrow('cloudSpaceOwnershipMismatch');
  });

  it('enforces ownership in the opposite direction too', async () => {
    await ensureCloudSpace(identityB);

    await expect(ensureCloudSpace({
      ...identityB,
      uid: identityA.uid,
    })).rejects.toThrow('cloudSpaceOwnershipMismatch');
  });

  it('does not create a new Space when the same user signs in again', async () => {
    await ensureCloudSpace(identityA);
    const firstDocument = firestoreState.documents.get(identityA.spaceId);

    await expect(ensureCloudSpace(identityA)).resolves.toEqual(firstDocument);

    expect(firestoreState.setDoc).toHaveBeenCalledTimes(1);
    expect(firestoreState.getDoc).toHaveBeenCalledTimes(2);
  });

  it('stores the Firebase UID as ownerUserId and only stores Space metadata', async () => {
    await ensureCloudSpace(identityA);

    const storedDocument = firestoreState.documents.get(identityA.spaceId);
    expect(storedDocument).toEqual({
      spaceId: identityA.spaceId,
      ownerUserId: identityA.uid,
      createdAt: identityA.createdAt,
      updatedAt: expect.any(String),
    });
    expect(Object.keys(storedDocument ?? {}).sort()).toEqual([
      'createdAt',
      'ownerUserId',
      'spaceId',
      'updatedAt',
    ]);
    expect(storedDocument).not.toHaveProperty('customers');
    expect(storedDocument).not.toHaveProperty('transactions');
    expect(storedDocument).not.toHaveProperty('debts');
    expect(storedDocument).not.toHaveProperty('payments');
    expect(storedDocument).not.toHaveProperty('dailyArchives');
  });

  it('never uses local-store as a cloud Space ID', async () => {
    await expect(ensureCloudSpace({
      ...identityA,
      spaceId: 'local-store',
    })).rejects.toThrow('cloudSpaceIdInvalid');

    expect(firestoreState.getDoc).not.toHaveBeenCalled();
    expect(firestoreState.setDoc).not.toHaveBeenCalled();
  });

  it('leaves local state untouched when Firestore fails', async () => {
    const localState = new Map([[
      '@retail-business-manager/spaces/space_A/customers',
      JSON.stringify([{ id: 'customer-a' }]),
    ]]);
    const beforeFailure = new Map(localState);
    firestoreState.getDoc.mockRejectedValueOnce(new Error('offline'));

    await expect(ensureCloudSpace(identityA)).rejects.toThrow('offline');

    expect(localState).toEqual(beforeFailure);
    expect(firestoreState.setDoc).not.toHaveBeenCalled();
  });
});