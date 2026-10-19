import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { assertWorkspaceAccess } from './workspaceAccess.js';

const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);
const SUPPORTED_LANGUAGES = new Set(['ar', 'en', 'tr']);
const SUPPORTED_ACCENTS = new Set(['silver', 'white', 'gold', 'blue', 'violet', 'green']);

export interface StoreProfilePayload {
  name: string;
  phone: string;
  address: string;
  currency: string;
  quickCurrencies: string[];
  visibleCurrencies: string[];
  language: 'ar' | 'en' | 'tr';
  accent: string;
  logoUri?: string;
}

interface StoreProfileCommandRequest {
  action: 'getOrCreate' | 'update';
  spaceId: string;
  profile?: StoreProfilePayload;
}

export interface StoreProfileRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function storeProfileCommandHandler(
  request: CallableRequest<StoreProfileCommandRequest>,
  runtime: StoreProfileRuntime,
): Promise<{ outcome: 'created' | 'existing' | 'updated'; profile: StoreProfilePayload & { id: string; storeId: string }; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required', { code: 'UNAUTHENTICATED' });
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');

  try {
    return await db.runTransaction(async (tx) => {
      const [spaceSnap, memberSnap, profileSnap] = await Promise.all([
        tx.get(spaceRef),
        tx.get(memberRef),
        tx.get(profileRef),
      ]);
      if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
      }
      assertWorkspaceAccess(memberSnap.data(), 'read');

      if (profileSnap.exists) {
        const existing = normalizeStoredProfile(profileSnap.data());
        if (input.action === 'getOrCreate') {
          return { outcome: 'existing', profile: existing, processedAt: runtime.now() };
        }
        assertWorkspaceAccess(memberSnap.data(), 'owner', spaceSnap.data(), uid);
        const next = { ...input.profile!, id: existing.storeId, storeId: existing.storeId };
        const now = runtime.now();
        tx.set(profileRef, { ...next, updatedAt: now, createdAt: profileSnap.data()?.createdAt ?? now });
        return { outcome: 'updated', profile: next, processedAt: now };
      }

      if (input.action === 'update') {
        throw new HttpsError('failed-precondition', 'Store profile has not been initialized', { code: 'STORE_PROFILE_MISSING' });
      }
      assertWorkspaceAccess(memberSnap.data(), 'owner', spaceSnap.data(), uid);
      const now = runtime.now();
      const storeId = `store_${createHash('sha256').update(input.spaceId).digest('hex').slice(0, 24)}`;
      const profile = { ...input.profile!, id: storeId, storeId };
      tx.create(profileRef, { ...profile, createdAt: now, updatedAt: now });
      return { outcome: 'created', profile, processedAt: now };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('storeProfileCommand failed', error);
    throw new HttpsError('internal', 'Store profile could not be saved', { code: 'INTERNAL' });
  }
}

export function createStoreProfileRuntime(firestore: Firestore): StoreProfileRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): { action: 'getOrCreate' | 'update'; spaceId: string; profile?: StoreProfilePayload } {
  if (!isRecord(value) || (value.action !== 'getOrCreate' && value.action !== 'update')) {
    throw new HttpsError('invalid-argument', 'Store profile command is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.spaceId !== 'string' || !value.spaceId.trim() || value.spaceId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Workspace ID is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (value.action === 'getOrCreate') {
    return { action: value.action, spaceId: value.spaceId.trim(), profile: validateProfile(value.profile) };
  }
  return { action: value.action, spaceId: value.spaceId.trim(), profile: validateProfile(value.profile) };
}

function validateProfile(value: unknown): StoreProfilePayload {
  if (!isRecord(value)) throw new HttpsError('invalid-argument', 'Store profile is invalid', { code: 'INVALID_ARGUMENT' });
  const name = value.name;
  const phone = value.phone;
  const address = value.address;
  if (typeof name !== 'string' || name.length > 1000
    || typeof phone !== 'string' || phone.length > 1000
    || typeof address !== 'string' || address.length > 1000) {
    throw new HttpsError('invalid-argument', 'Store profile text fields are invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.currency !== 'string' || !SUPPORTED_CURRENCIES.has(value.currency)) {
    throw new HttpsError('invalid-argument', 'Currency is not supported', { code: 'INVALID_ARGUMENT' });
  }
  if (!Array.isArray(value.quickCurrencies) || !value.quickCurrencies.every((currency) => typeof currency === 'string' && SUPPORTED_CURRENCIES.has(currency))
    || !Array.isArray(value.visibleCurrencies) || !value.visibleCurrencies.every((currency) => typeof currency === 'string' && SUPPORTED_CURRENCIES.has(currency))) {
    throw new HttpsError('invalid-argument', 'Currency preferences are invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.language !== 'string' || !SUPPORTED_LANGUAGES.has(value.language)) {
    throw new HttpsError('invalid-argument', 'Language is not supported', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.accent !== 'string' || !SUPPORTED_ACCENTS.has(value.accent)) {
    throw new HttpsError('invalid-argument', 'Accent is not supported', { code: 'INVALID_ARGUMENT' });
  }
  if (value.logoUri !== undefined && (typeof value.logoUri !== 'string' || value.logoUri.length > 2048)) {
    throw new HttpsError('invalid-argument', 'Logo URI is invalid', { code: 'INVALID_ARGUMENT' });
  }
  return {
    name: name.trim().slice(0, 200),
    phone: phone.trim().slice(0, 100),
    address: address.trim().slice(0, 500),
    currency: value.currency,
    quickCurrencies: [...new Set(value.quickCurrencies as string[])],
    visibleCurrencies: [...new Set(value.visibleCurrencies as string[])],
    language: value.language as StoreProfilePayload['language'],
    accent: value.accent,
    ...(typeof value.logoUri === 'string' && value.logoUri.trim() ? { logoUri: value.logoUri.trim() } : {}),
  };
}

function normalizeStoredProfile(value: unknown): StoreProfilePayload & { id: string; storeId: string } {
  if (!isRecord(value) || typeof value.storeId !== 'string' || !value.storeId.trim()) {
    throw new HttpsError('data-loss', 'Stored store profile is invalid', { code: 'STORE_PROFILE_CORRUPTED' });
  }
  const profile = validateProfile(value);
  return { ...profile, id: value.storeId, storeId: value.storeId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
