import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  clearFirebaseAuthSession,
  initializePostAuthCloudSession,
  isFirebaseSessionAuthenticated,
  resolveActiveSpaceForUser,
} from '@/context/StoreContext';

const mocks = vi.hoisted(() => ({
  getOrCreateSpaceIdentity: vi.fn(),
  getOrCreateCloudStoreProfile: vi.fn(),
  discoverUserSpaces: vi.fn(),
  validateUserSpaceMembership: vi.fn(),
  bootstrapPrimarySpace: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('@/services/firebaseAuth', () => ({
  signOutFromFirebase: vi.fn(),
  subscribeToFirebaseAuth: vi.fn(),
}));
vi.mock('@/services/spaceIdentity', () => ({
  getOrCreateSpaceIdentity: mocks.getOrCreateSpaceIdentity,
}));
vi.mock('@/services/firestore', () => ({
  discoverUserSpaces: mocks.discoverUserSpaces,
  validateUserSpaceMembership: mocks.validateUserSpaceMembership,
}));
vi.mock('@/services/trustedBootstrap', () => ({
  bootstrapPrimarySpace: mocks.bootstrapPrimarySpace,
}));
vi.mock('@/services/cloudStoreProfile', () => ({
  getOrCreateCloudStoreProfile: mocks.getOrCreateCloudStoreProfile,
  updateCloudStoreProfile: vi.fn(),
}));
vi.mock('@/services/storage', () => ({
  clearLegacyLanguage: vi.fn().mockResolvedValue(undefined),
  createCashTransaction: vi.fn(),
  createDebt: vi.fn(),
  setActiveSpaceId: vi.fn(),
}));

const firebaseUser = { uid: 'firebase-user', email: 'owner@example.com' } as User;
const identity = {
  uid: firebaseUser.uid,
  spaceId: 'device-local-space',
  createdAt: '2026-09-05T12:00:00.000Z',
};
const cloudProfile = {
  id: 'cloud-store-id',
  name: 'Cloud Store',
  phone: '',
  address: '',
  currency: 'TRY',
  quickCurrencies: ['TRY'],
  visibleCurrencies: ['TRY'],
  language: 'ar',
  accent: 'blue',
};

function createCallbacks() {
  return {
    onError: vi.fn(),
    onProfile: vi.fn(),
    onReady: vi.fn(),
    onSpaceIdentity: vi.fn(),
  };
}

describe('post-auth cloud initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateSpaceIdentity.mockResolvedValue(identity);
    mocks.getOrCreateCloudStoreProfile.mockResolvedValue(cloudProfile);
    mocks.discoverUserSpaces.mockReset();
    mocks.validateUserSpaceMembership.mockReset();
    mocks.bootstrapPrimarySpace.mockReset();
  });

  it('loads the store profile from Firebase for the authenticated workspace', async () => {
    const callbacks = createCallbacks();
    await initializePostAuthCloudSession(firebaseUser, () => true, callbacks, 'space-A');

    expect(mocks.getOrCreateCloudStoreProfile).toHaveBeenCalledWith('space-A', expect.objectContaining({ id: '' }));
    expect(callbacks.onProfile).toHaveBeenCalledWith(cloudProfile);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(identity);
    expect(callbacks.onError).toHaveBeenNthCalledWith(1, null);
    expect(callbacks.onError).not.toHaveBeenCalledWith(expect.any(String));
    expect(callbacks.onReady).toHaveBeenCalledOnce();
  });

  it('fails closed when no cloud workspace is available instead of loading a local profile', async () => {
    const callbacks = createCallbacks();
    await initializePostAuthCloudSession(firebaseUser, () => true, callbacks, null);

    expect(mocks.getOrCreateCloudStoreProfile).not.toHaveBeenCalled();
    expect(callbacks.onProfile).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenLastCalledWith('cloudSpaceUnavailable');
    expect(callbacks.onReady).toHaveBeenCalledOnce();
  });

  it('surfaces cloud profile failures and does not fall back to device storage', async () => {
    const callbacks = createCallbacks();
    mocks.getOrCreateCloudStoreProfile.mockRejectedValueOnce(new Error('profileUnavailable'));
    await initializePostAuthCloudSession(firebaseUser, () => true, callbacks, 'space-A');

    expect(callbacks.onProfile).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenLastCalledWith('profileUnavailable');
    expect(callbacks.onReady).toHaveBeenCalledOnce();
  });

  it('stops if the authentication transition is no longer current', async () => {
    const callbacks = createCallbacks();
    await initializePostAuthCloudSession(firebaseUser, () => false, callbacks, 'space-A');
    expect(mocks.getOrCreateCloudStoreProfile).not.toHaveBeenCalled();
    expect(callbacks.onReady).not.toHaveBeenCalled();
  });
});

describe('cloud workspace discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves and validates the single active membership', async () => {
    mocks.discoverUserSpaces.mockResolvedValueOnce({
      memberships: [{
        spaceId: 'space-A', role: 'owner', status: 'active',
        spaceNameSnapshot: 'Space A', joinedAt: '2026-09-05T12:00:00.000Z',
        updatedAt: '2026-09-05T12:00:00.000Z',
      }],
      primarySpaceId: 'space-A',
      lastActiveSpaceId: null,
    });
    mocks.validateUserSpaceMembership.mockResolvedValueOnce(true);

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).resolves.toBe('space-A');
    expect(mocks.validateUserSpaceMembership).toHaveBeenCalledWith(firebaseUser.uid, 'space-A');
    expect(mocks.bootstrapPrimarySpace).not.toHaveBeenCalled();
  });

  it('bootstraps a private workspace when none exists', async () => {
    mocks.discoverUserSpaces.mockResolvedValueOnce({
      memberships: [], primarySpaceId: null, lastActiveSpaceId: null,
    });
    mocks.bootstrapPrimarySpace.mockResolvedValueOnce({ primarySpaceId: 'space-new' });
    mocks.validateUserSpaceMembership.mockResolvedValueOnce(true);

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).resolves.toBe('space-new');
  });

  it('rejects ambiguous multiple active workspaces', async () => {
    mocks.discoverUserSpaces.mockResolvedValueOnce({
      memberships: [
        { spaceId: 'space-A', role: 'owner', status: 'active' },
        { spaceId: 'space-B', role: 'manager', status: 'active' },
      ],
      primarySpaceId: 'space-A',
      lastActiveSpaceId: null,
    });

    await expect(resolveActiveSpaceForUser(firebaseUser.uid)).rejects.toThrow('multipleWorkspacesUnsupported');
    expect(mocks.validateUserSpaceMembership).not.toHaveBeenCalled();
  });
});

describe('Firebase session identity', () => {
  it('uses Firebase Auth user presence as the authentication truth', () => {
    expect(isFirebaseSessionAuthenticated(firebaseUser)).toBe(true);
    expect(isFirebaseSessionAuthenticated(null)).toBe(false);
  });

  it('clears Firebase auth and active workspace state on auth loss', () => {
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
    expect(callbacks.onFirebaseReady).toHaveBeenCalledOnce();
  });
});
