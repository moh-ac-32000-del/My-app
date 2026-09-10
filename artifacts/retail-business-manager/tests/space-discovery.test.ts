import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembershipDiscoveryIndexEntry } from '@/types/trustedBootstrap';

const firestoreState = vi.hoisted(() => ({
  membershipDocuments: [] as MembershipDiscoveryIndexEntry[],
  userDocument: null as Record<string, unknown> | null,
  collection: vi.fn((database: unknown, ...segments: string[]) => ({
    database,
    path: segments.join('/'),
  })),
  doc: vi.fn((database: unknown, ...segments: string[]) => ({
    database,
    path: segments.join('/'),
  })),
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

import { discoverUserSpaces, validateUserSpaceMembership } from '@/services/firestore';

describe('Space discovery', () => {
  beforeEach(() => {
    firestoreState.membershipDocuments = [];
    firestoreState.userDocument = null;
    firestoreState.collection.mockClear();
    firestoreState.doc.mockClear();
    firestoreState.getDoc.mockReset();
    firestoreState.getDoc.mockImplementation(async () => ({
      exists: () => firestoreState.userDocument !== null,
      data: () => firestoreState.userDocument,
    }));
    firestoreState.getDocs.mockReset();
    firestoreState.getDocs.mockImplementation(async () => ({
      docs: firestoreState.membershipDocuments.map((membership) => ({
        data: () => membership,
      })),
    }));
    firestoreState.getFirestore.mockClear();
    firestoreState.setDoc.mockReset();
  });

  it('returns empty memberships and null selection hints when no index documents exist', async () => {
    await expect(discoverUserSpaces('firebase-user-a')).resolves.toEqual({
      memberships: [],
      primarySpaceId: null,
      lastActiveSpaceId: null,
    });

    expect(firestoreState.getDoc).toHaveBeenCalledTimes(1);
    expect(firestoreState.getDocs).toHaveBeenCalledTimes(1);
    expect(firestoreState.setDoc).not.toHaveBeenCalled();
  });

  it('maps multiple existing membership discovery entries and preserves their Space IDs', async () => {
    const first: MembershipDiscoveryIndexEntry = {
      spaceId: 'space-a',
      role: 'owner',
      status: 'active',
      spaceNameSnapshot: 'Space A',
      joinedAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };
    const second: MembershipDiscoveryIndexEntry = {
      spaceId: 'space-b',
      role: 'owner',
      status: 'active',
      spaceNameSnapshot: 'Space B',
      joinedAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    };
    firestoreState.membershipDocuments = [first, second];
    firestoreState.userDocument = { primarySpaceId: 'space-b' };

    await expect(discoverUserSpaces('firebase-user-a')).resolves.toEqual({
      memberships: [first, second],
      primarySpaceId: 'space-b',
      lastActiveSpaceId: null,
    });

    expect(firestoreState.collection).toHaveBeenCalledWith(
      { name: 'test-firestore' },
      'users',
      'firebase-user-a',
      'memberships',
    );
    expect(firestoreState.doc).toHaveBeenCalledWith(
      { name: 'test-firestore' },
      'users',
      'firebase-user-a',
    );
  });

  it('returns null when the existing user discovery document has no primary Space', async () => {
    firestoreState.userDocument = { displayName: 'No primary configured' };

    await expect(discoverUserSpaces('firebase-user-a')).resolves.toMatchObject({
      memberships: [],
      primarySpaceId: null,
      lastActiveSpaceId: null,
    });
  });

  it('performs reads only and does not change local active-space state', async () => {
    await discoverUserSpaces('firebase-user-a');

    expect(firestoreState.getDoc).toHaveBeenCalledTimes(1);
    expect(firestoreState.getDocs).toHaveBeenCalledTimes(1);
    expect(firestoreState.setDoc).not.toHaveBeenCalled();
  });

  it('validates the active membership from the Workspace member document', async () => {
    firestoreState.getDoc.mockImplementation(async (reference: { path?: string }) => {
      if (reference.path === 'spaces/space-a/members/firebase-user-a') {
        return {
          exists: () => true,
          data: () => ({
            spaceId: 'space-a',
            userId: 'firebase-user-a',
            status: 'active',
          }),
        };
      }
      return {
        exists: () => false,
        data: () => undefined,
      };
    });

    await expect(validateUserSpaceMembership('firebase-user-a', 'space-a')).resolves.toBe(true);
    await expect(validateUserSpaceMembership('firebase-user-a', 'space-b')).resolves.toBe(false);
    expect(firestoreState.getDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-a/members/firebase-user-a' }),
    );
  });
});