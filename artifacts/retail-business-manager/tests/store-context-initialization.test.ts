import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  clearFirebaseAuthSession,
  initializePostAuthLocalSession,
  isFirebaseSessionAuthenticated,
  resolveActiveSpaceForUser,
} from '@/context/StoreContext';

const getOrCreateSpaceIdentityMock = vi.hoisted(() => vi.fn());
const loadStoreProfileMock = vi.hoisted(() => vi.fn());
const saveStoreProfileMock = vi.hoisted(() => vi.fn());
const discoverUserSpacesMock = vi.hoisted(() => vi.fn());
const validateUserSpaceMembershipMock = vi.hoisted(() => vi.fn());
const bootstrapPrimarySpaceMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/firebase', () => ({
  isFirebaseConfigured: false,
}));

vi.mock('@/services/firebaseAuth', () => ({
  signOutFromFirebase: vi.fn(),
  subscribeToFirebaseAuth: vi.fn(),
}));

vi.mock('@/services/spaceIdentity', () => ({
  getOrCreateSpaceIdentity: getOrCreateSpaceIdentityMock,
}));

vi.mock('@/services/firestore', () => ({
  discoverUserSpaces: discoverUserSpacesMock,
  validateUserSpaceMembership: validateUserSpaceMembershipMock,
}));

vi.mock('@/services/trustedBootstrap', () => ({
  bootstrapPrimarySpace: bootstrapPrimarySpaceMock,
}));

vi.mock('@/services/storage', () => ({
  clearLegacyLanguage: vi.fn(),
  createCashTransaction: vi.fn(),
  createDebt: vi.fn(),
  loadAuthenticatedState: vi.fn(),
  loadDebts: vi.fn(),
  loadLegacyLanguage: vi.fn(),
  loadStoreProfile: loadStoreProfileMock,
  loadTransactions: vi.fn(),
  normalizeStoredStoreProfile: (stored: unknown, fallback: unknown) => stored ?? fallback,
  restoreLocalBackup: vi.fn(),
  saveAuthenticatedState: vi.fn(),
  saveDebts: vi.fn(),
  saveStoreProfile: saveStoreProfileMock,
  saveTransactions: vi.fn(),
  setActiveSpaceId: vi.fn(),
  settleCustomerDebt: vi.fn(),
}));

const firebaseUser = { uid: 'firebase-user', email: 'owner@example.com' } as User;
const identity = {
  uid: firebaseUser.uid,
  spaceId: 'device-local-space',
  createdAt: '2026-09-05T12:00:00.000Z',
};

function createCallbacks() {
  return {
    onError: vi.fn(),
    onProfile: vi.fn(),
    onReady: vi.fn(),
    onSpaceIdentity: vi.fn(),
  };
}

describe('post-auth local initialization', () => {
  beforeEach(() => {
    getOrCreateSpaceIdentityMock.mockReset().mockResolvedValue(identity);
    loadStoreProfileMock.mockReset().mockResolvedValue(null);
    saveStoreProfileMock.mockReset().mockResolvedValue(undefined);
    discoverUserSpacesMock.mockReset();
    validateUserSpaceMembershipMock.mockReset();
    bootstrapPrimarySpaceMock.mockReset();
  });

  it('keeps the authenticated user when local initialization fails and can retry', async () => {
    const callbacks = createCallbacks();
    const initializationError = { value: null as string | null };
    callbacks.onError.mockImplementation((message: string | null) => {
      initializationError.value = message;
    });
    loadStoreProfileMock.mockRejectedValueOnce(new Error('profileUnavailable'));

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(isFirebaseSessionAuthenticated(firebaseUser)).toBe(true);
    expect(isFirebaseSessionAuthenticated(null)).toBe(false);
    expect(initializationError.value).toBe('profileUnavailable');
    expect(callbacks.onError).toHaveBeenCalledWith('profileUnavailable');
    expect(callbacks.onError).toHaveBeenNthCalledWith(1, null);
    expect(callbacks.onError).toHaveBeenNthCalledWith(2, 'profileUnavailable');
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(identity);
    expect(loadStoreProfileMock).toHaveBeenCalledTimes(1);
    expect(saveStoreProfileMock).not.toHaveBeenCalled();

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(initializationError.value).toBeNull();
    expect(callbacks.onError).toHaveBeenCalledTimes(3);
    expect(callbacks.onError).toHaveBeenNthCalledWith(3, null);
    expect(callbacks.onSpaceIdentity).toHaveBeenLastCalledWith(identity);
    expect(getOrCreateSpaceIdentityMock).toHaveBeenCalledTimes(2);
    expect(getOrCreateSpaceIdentityMock).toHaveBeenCalledWith(firebaseUser.uid);
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
  });

  it('completes local initialization without calling Cloud Workspace bootstrap', async () => {
    const callbacks = createCallbacks();

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(getOrCreateSpaceIdentityMock).toHaveBeenCalledWith(firebaseUser.uid);
    expect(loadStoreProfileMock).toHaveBeenCalledTimes(1);
    expect(saveStoreProfileMock).toHaveBeenCalledTimes(1);
    expect(callbacks.onProfile).toHaveBeenCalledTimes(1);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(identity);
    expect(callbacks.onError).toHaveBeenCalledWith(null);
    expect(callbacks.onError).not.toHaveBeenCalledWith(expect.any(String));
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
  });

  it('retains local compatibility identity without activating a Cloud Workspace', async () => {
    const callbacks = createCallbacks();
    getOrCreateSpaceIdentityMock.mockResolvedValueOnce({
      uid: firebaseUser.uid,
      spaceId: 'different-device-local-space',
      createdAt: '2026-09-05T12:00:00.000Z',
    });

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith({
      uid: firebaseUser.uid,
      spaceId: 'different-device-local-space',
      createdAt: '2026-09-05T12:00:00.000Z',
    });
    expect(callbacks.onProfile).toHaveBeenCalledTimes(1);
  });

  it('does not require a Cloud Workspace response to complete auth initialization', async () => {
    const callbacks = createCallbacks();

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(null);
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps StoreProfile identity separate from local compatibility identity', async () => {
    const callbacks = createCallbacks();
    const storeProfile = { id: 'store-profile-id' };
    loadStoreProfileMock.mockResolvedValueOnce(storeProfile);

    await initializePostAuthLocalSession(firebaseUser, () => true, callbacks);

    expect(callbacks.onProfile).toHaveBeenCalledWith(storeProfile);
    expect(storeProfile.id).not.toBe(identity.spaceId);
  });

  it('resolves the single active membership after discovery and validates its member document', async () => {
    discoverUserSpacesMock.mockResolvedValueOnce({
      memberships: [{
        spaceId: 'space-A',
        role: 'owner',
        status: 'active',
        spaceNameSnapshot: 'Space A',
        joinedAt: '2026-09-05T12:00:00.000Z',
        updatedAt: '2026-09-05T12:00:00.000Z',
      }],
      primarySpaceId: 'space-A',
      lastActiveSpaceId: null,
    });
    validateUserSpaceMembershipMock.mockResolvedValueOnce(true);

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).resolves.toBe('space-A');
    expect(validateUserSpaceMembershipMock).toHaveBeenCalledWith(firebaseUser.uid, 'space-A');
    expect(bootstrapPrimarySpaceMock).not.toHaveBeenCalled();
  });

  it('uses bootstrap when discovery has no primary Space and keeps auth independent from bootstrap failure', async () => {
    discoverUserSpacesMock.mockResolvedValueOnce({
      memberships: [],
      primarySpaceId: null,
      lastActiveSpaceId: null,
    });
    bootstrapPrimarySpaceMock.mockRejectedValueOnce(new Error('bootstrapUnavailable'));

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).rejects.toThrow('bootstrapUnavailable');
    expect(isFirebaseSessionAuthenticated(firebaseUser)).toBe(true);
  });

  it('does not choose between multiple active memberships', async () => {
    discoverUserSpacesMock.mockResolvedValueOnce({
      memberships: [
        { spaceId: 'space-A', role: 'owner', status: 'active' },
        { spaceId: 'space-B', role: 'manager', status: 'active' },
      ],
      primarySpaceId: 'space-A',
      lastActiveSpaceId: null,
    });

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).rejects.toThrow('multipleWorkspacesUnsupported');
    expect(validateUserSpaceMembershipMock).not.toHaveBeenCalled();
  });

  it('clears Firebase authentication and session state on real auth loss', () => {
    const callbacks = {
      onFirebaseUser: vi.fn(),
      onSpaceIdentity: vi.fn(),
      onCloudSpace: vi.fn(),
      onActiveSpaceId: vi.fn(),
      onInitializationError: vi.fn(),
      onFirebaseReady: vi.fn(),
    };

    clearFirebaseAuthSession(callbacks);

    expect(callbacks.onFirebaseUser).toHaveBeenCalledWith(null);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(null);
    expect(callbacks.onCloudSpace).toHaveBeenCalledWith(null);
    expect(callbacks.onActiveSpaceId).toHaveBeenCalledWith(null);
    expect(callbacks.onInitializationError).toHaveBeenCalledWith(null);
    expect(callbacks.onFirebaseReady).toHaveBeenCalledTimes(1);
  });
});