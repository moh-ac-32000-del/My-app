import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';

export type FirebaseAuthErrorKey =
  | 'authEmailAlreadyInUse'
  | 'authInvalidEmail'
  | 'authWeakPassword'
  | 'authInvalidCredentials'
  | 'authUserDisabled'
  | 'authTooManyRequests'
  | 'authNetworkError'
  | 'authOperationNotAllowed'
  | 'authFirebaseNotConfigured'
  | 'authGenericError';

export function subscribeToFirebaseAuth(
  onUser: (user: User | null) => void,
  onError?: (error: Error) => void,
): () => void {
  if (!isFirebaseConfigured) {
    onUser(null);
    return () => undefined;
  }

  return onAuthStateChanged(getFirebaseAuth(), onUser, onError);
}

export async function createFirebaseAccount(email: string, password: string): Promise<User> {
  return (await createUserWithEmailAndPassword(getFirebaseAuthOrThrow(), email.trim(), password)).user;
}

export async function signInWithFirebase(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(getFirebaseAuthOrThrow(), email.trim(), password)).user;
}

export async function signOutFromFirebase(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }
  await signOut(getFirebaseAuth());
}

export function getFirebaseAuthErrorKey(error: unknown): FirebaseAuthErrorKey {
  if (isFirebaseError(error)) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'authEmailAlreadyInUse';
      case 'auth/invalid-email':
        return 'authInvalidEmail';
      case 'auth/weak-password':
      case 'auth/password-does-not-meet-requirements':
        return 'authWeakPassword';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'authInvalidCredentials';
      case 'auth/user-disabled':
        return 'authUserDisabled';
      case 'auth/too-many-requests':
        return 'authTooManyRequests';
      case 'auth/network-request-failed':
        return 'authNetworkError';
      case 'auth/operation-not-allowed':
        return 'authOperationNotAllowed';
      case 'auth/api-key-not-valid':
      case 'auth/app-not-authorized':
      case 'auth/configuration-not-found':
        return 'authFirebaseNotConfigured';
      default:
        return 'authGenericError';
    }
  }

  if (error instanceof Error && error.message === 'firebaseNotConfigured') {
    return 'authFirebaseNotConfigured';
  }

  return 'authGenericError';
}

function getFirebaseAuthOrThrow(): Auth {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  return getFirebaseAuth();
}

function isFirebaseError(error: unknown): error is { code: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string';
}