import { beforeEach, describe, expect, it, vi } from 'vitest';

const authInstance = vi.hoisted(() => ({ name: 'auth-instance', languageCode: null as string | null }));
const firebaseUser = vi.hoisted(() => ({ uid: 'firebase-user', email: 'owner@example.com' }));
const createUserMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());
const onAuthStateChangedMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/firebase', () => ({
  getFirebaseAuth: () => authInstance,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: createUserMock,
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithEmailAndPassword: signInMock,
  signOut: signOutMock,
  sendPasswordResetEmail: resetMock,
}));

import {
  createFirebaseAccount,
  getFirebaseAuthErrorKey,
  signInWithFirebase,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
  requestFirebasePasswordReset,
} from '@/services/firebaseAuth';

describe('Firebase Authentication boundary', () => {
  beforeEach(() => {
    createUserMock.mockReset();
    signInMock.mockReset();
    signOutMock.mockReset();
    unsubscribeMock.mockReset();
    onAuthStateChangedMock.mockReset();
    resetMock.mockReset(); authInstance.languageCode = null;
  });

  it('creates an email/password account through Firebase Auth', async () => {
    createUserMock.mockResolvedValue({ user: firebaseUser });

    await expect(createFirebaseAccount(' owner@example.com ', 'secret12')).resolves.toBe(firebaseUser);
    expect(createUserMock).toHaveBeenCalledWith(authInstance, 'owner@example.com', 'secret12');
  });

  it('signs in through Firebase Auth', async () => {
    signInMock.mockResolvedValue({ user: firebaseUser });

    await expect(signInWithFirebase(' owner@example.com ', 'secret12')).resolves.toBe(firebaseUser);
    expect(signInMock).toHaveBeenCalledWith(authInstance, 'owner@example.com', 'secret12');
  });

  it('signs out through Firebase Auth', async () => {
    signOutMock.mockResolvedValue(undefined);

    await expect(signOutFromFirebase()).resolves.toBeUndefined();
    expect(signOutMock).toHaveBeenCalledWith(authInstance);
  });
  it.each(['ar','en','tr'] as const)('requests a localized %s email reset without changing the signed-in user', async language => {
    resetMock.mockResolvedValue(undefined);
    await requestFirebasePasswordReset(' owner@example.com ',language);
    expect(resetMock).toHaveBeenCalledExactlyOnceWith(authInstance,'owner@example.com');
    expect(authInstance.languageCode).toBe(language);
    expect(createUserMock).not.toHaveBeenCalled(); expect(signInMock).not.toHaveBeenCalled(); expect(signOutMock).not.toHaveBeenCalled();
  });
  it.each(['auth/user-not-found','auth/user-disabled'])('does not reveal account status for %s', async code => {
    resetMock.mockRejectedValue({ code });
    await expect(requestFirebasePasswordReset('owner@example.com','ar')).resolves.toBeUndefined();
  });
  it.each(['auth/network-request-failed','auth/too-many-requests','auth/invalid-email'])('propagates actual reset failure %s', async code => {
    resetMock.mockRejectedValue({ code });
    await expect(requestFirebasePasswordReset('owner@example.com','ar')).rejects.toEqual({ code });
  });
  it('does not send an empty email', async () => {
    await expect(requestFirebasePasswordReset('  ','ar')).rejects.toMatchObject({ code: 'auth/invalid-email' }); expect(resetMock).not.toHaveBeenCalled();
  });

  it('restores an existing Firebase session through the auth-state observer', () => {
    onAuthStateChangedMock.mockImplementation((_auth, onUser) => {
      onUser(firebaseUser);
      return unsubscribeMock;
    });
    const onUser = vi.fn();

    const unsubscribe = subscribeToFirebaseAuth(onUser);

    expect(onAuthStateChangedMock).toHaveBeenCalledWith(authInstance, expect.any(Function), undefined);
    expect(onUser).toHaveBeenCalledWith(firebaseUser);
    expect(unsubscribe).toBe(unsubscribeMock);
  });

  it.each([
    ['auth/email-already-in-use', 'authEmailAlreadyInUse'],
    ['auth/invalid-email', 'authInvalidEmail'],
    ['auth/weak-password', 'authWeakPassword'],
    ['auth/invalid-credential', 'authInvalidCredentials'],
    ['auth/user-disabled', 'authUserDisabled'],
    ['auth/too-many-requests', 'authTooManyRequests'],
    ['auth/network-request-failed', 'authNetworkError'],
    ['auth/operation-not-allowed', 'authOperationNotAllowed'],
    ['auth/configuration-not-found', 'authFirebaseNotConfigured'],
  ] as const)('maps %s to a localized message key', (code, expected) => {
    expect(getFirebaseAuthErrorKey({ code })).toBe(expected);
  });
});
