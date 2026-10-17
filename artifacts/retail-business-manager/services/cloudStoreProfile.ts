import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { StoreProfile } from '@/types/business';

type StoreProfilePayload = Omit<StoreProfile, 'id'>;
interface StoreProfileCommandResponse {
  outcome: 'created' | 'existing' | 'updated';
  profile: StoreProfilePayload & { id: string; storeId: string };
  processedAt: string;
}

let functions: Functions | null = null;

export async function getOrCreateCloudStoreProfile(
  spaceId: string,
  defaults: StoreProfile,
): Promise<StoreProfile> {
  return sendCommand(spaceId, 'getOrCreate', defaults);
}

export async function updateCloudStoreProfile(
  spaceId: string,
  profile: StoreProfile,
): Promise<StoreProfile> {
  return sendCommand(spaceId, 'update', profile);
}

async function sendCommand(
  spaceId: string,
  action: 'getOrCreate' | 'update',
  profile: StoreProfile,
): Promise<StoreProfile> {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const normalizedSpaceId = spaceId.trim();
  if (!normalizedSpaceId || normalizedSpaceId.includes('/')) {
    throw new Error('cloudSpaceIdInvalid');
  }

  const callable = httpsCallable<{
    action: 'getOrCreate' | 'update';
    spaceId: string;
    profile: StoreProfilePayload;
  }, StoreProfileCommandResponse>(getFunctionsInstance(), 'storeProfileCommand');
  const { data } = await callable({
    action,
    spaceId: normalizedSpaceId,
    profile: {
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      currency: profile.currency,
      quickCurrencies: profile.quickCurrencies,
      visibleCurrencies: profile.visibleCurrencies,
      language: profile.language,
      accent: profile.accent,
      ...(profile.logoUri ? { logoUri: profile.logoUri } : {}),
    },
  });

  if (!data || !['created', 'existing', 'updated'].includes(data.outcome)
    || !isValidProfile(data.profile)
    || typeof data.processedAt !== 'string'
    || !Number.isFinite(Date.parse(data.processedAt))) {
    throw new Error('invalidCloudStoreProfileResponse');
  }
  return {
    id: data.profile.storeId,
    name: data.profile.name,
    phone: data.profile.phone,
    address: data.profile.address,
    currency: data.profile.currency,
    quickCurrencies: data.profile.quickCurrencies,
    visibleCurrencies: data.profile.visibleCurrencies,
    language: data.profile.language,
    accent: data.profile.accent,
    ...(data.profile.logoUri ? { logoUri: data.profile.logoUri } : {}),
  };
}

function isValidProfile(value: unknown): value is StoreProfileCommandResponse['profile'] {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === 'string'
    && typeof profile.storeId === 'string'
    && profile.id === profile.storeId
    && typeof profile.name === 'string'
    && typeof profile.phone === 'string'
    && typeof profile.address === 'string'
    && typeof profile.currency === 'string'
    && Array.isArray(profile.quickCurrencies)
    && profile.quickCurrencies.every((item) => typeof item === 'string')
    && Array.isArray(profile.visibleCurrencies)
    && profile.visibleCurrencies.every((item) => typeof item === 'string')
    && (profile.language === 'ar' || profile.language === 'en' || profile.language === 'tr')
    && typeof profile.accent === 'string';
}

function getFunctionsInstance(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}
