import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { initializePostAuthSession, isFirebaseSessionAuthenticated } from '@/context/StoreContext';

const getOrCreateSpaceIdentityMock = vi.hoisted(() => vi.fn());
const bootstrapPrimarySpaceMock = vi.hoisted(() => vi.fn());
const loadStoreProfileMock = vi.hoisted(() => vi.fn());
const saveStoreProfileMock = vi.hoisted(() => vi.fn());

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
  spaceId: 'space-primary',
  createdAt: '2026-09-05T12:00:00.000Z',
};
const bootstrapResponse = {
  outcome: 'existing' as const,
  primarySpaceId: 'space-primary',
  space: {
    spaceId: 'space-primary',
    name: 'Primary Space',
    mode: 'private' as const,
    status: 'active' as const,
    ownerUserId: firebaseUser.uid,
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
  ownerMembership: {},
  operationReceipt: {},
};

function createCallbacks() {
  return {
    onActiveSpaceId: vi.fn(),
    onCloudSpace: vi.fn(),
    onError: vi.fn(),
    onProfile: vi.fn(),
    onReady: vi.fn(),
    onSpaceIdentity: vi.fn(),
  };
}

describe('post-auth initialization', () => {
  beforeEach(() => {
    getOrCreateSpaceIdentityMock.mockReset().mockResolvedValue(identity);
    bootstrapPrimarySpaceMock.mockReset().mockResolvedValue(bootstrapResponse);
    loadStoreProfileMock.mockReset().mockResolvedValue(null);
    saveStoreProfileMock.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the authenticated user and records a bootstrap error for retry', async () => {
    const callbacks = createCallbacks();
    const initializationError = { value: null as string | null };
    callbacks.onError.mockImplementation((message: string) => {
      initializationError.value = message;
    });
    bootstrapPrimarySpaceMock.mockRejectedValueOnce(new Error('bootstrapUnavailable'));

    await initializePostAuthSession(firebaseUser, () => true, callbacks);

    expect(isFirebaseSessionAuthenticated(firebaseUser)).toBe(true);
    expect(isFirebaseSessionAuthenticated(null)).toBe(false);
    expect(initializationError.value).toBe('bootstrapUnavailable');
    expect(callbacks.onError).toHaveBeenCalledWith('bootstrapUnavailable');
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(null);

    initializationError.value = null;
    await initializePostAuthSession(firebaseUser, () => true, callbacks);

    expect(initializationError.value).toBeNull();
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onSpaceIdentity).toHaveBeenLastCalledWith(identity);
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
  });

  it('completes initialization and retains the server space on success', async () => {
    const callbacks = createCallbacks();

    await initializePostAuthSession(firebaseUser, () => true, callbacks);

    expect(getOrCreateSpaceIdentityMock).toHaveBeenCalledWith(firebaseUser.uid);
    expect(bootstrapPrimarySpaceMock).toHaveBeenCalledTimes(1);
    expect(loadStoreProfileMock).toHaveBeenCalledTimes(1);
    expect(saveStoreProfileMock).toHaveBeenCalledTimes(1);
    expect(callbacks.onActiveSpaceId).toHaveBeenCalledWith(identity.spaceId);
    expect(callbacks.onCloudSpace).toHaveBeenCalledWith(bootstrapResponse.space);
    expect(callbacks.onProfile).toHaveBeenCalledTimes(1);
    expect(callbacks.onSpaceIdentity).toHaveBeenCalledWith(identity);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
  });
});