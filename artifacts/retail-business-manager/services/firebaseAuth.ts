import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { disconnectAndroidPush } from '@/services/androidPush';
import { clearLocalExportCache } from './localExportCache';
import type { Language } from '@/constants/i18n';

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

  return onAuthStateChanged(getFirebaseAuth(), (user) => { clearLocalExportCache(); onUser(user); }, onError);
}

export async function createFirebaseAccount(email: string, password: string): Promise<User> {
  return (await createUserWithEmailAndPassword(getFirebaseAuthOrThrow(), email.trim(), password)).user;
}

export async function signInWithFirebase(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(getFirebaseAuthOrThrow(), email.trim(), password)).user;
}

/** Recovery never signs in, creates an account, or changes financial/workspace data. */
export async function requestFirebasePasswordReset(email: string, language: Language): Promise<void> {
  const address = email.trim();
  if (!address) throw Object.assign(new Error('invalidEmail'), { code: 'auth/invalid-email' });
  const auth = getFirebaseAuthOrThrow();
  auth.languageCode = language;
  try {
    await sendPasswordResetEmail(auth, address);
  } catch (error) {
    // Match the SDK's email-enumeration protection on older project configurations.
    // The UI always uses a conditional message, not a claim that an account exists.
    if (isFirebaseError(error) && ['auth/user-not-found', 'auth/user-disabled'].includes(error.code)) return;
    throw error;
  }
}

export async function signOutFromFirebase(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }
  await disconnectAndroidPush();
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
