import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SpaceIdentity } from '@/types/space';

export const SPACE_IDENTITY_STORAGE_PREFIX = '@retail-business-manager/space-identity/';

const LEGACY_LOCAL_STORE_ID = 'local-store';
const pendingIdentities = new Map<string, Promise<SpaceIdentity>>();

export function getSpaceIdentityStorageKey(uid: string): string {
  return `${SPACE_IDENTITY_STORAGE_PREFIX}${encodeURIComponent(normalizeUid(uid))}`;
}

export async function getOrCreateSpaceIdentity(uid: string): Promise<SpaceIdentity> {
  const normalizedUid = normalizeUid(uid);
  const pending = pendingIdentities.get(normalizedUid);
  if (pending) {
    return pending;
  }

  const operation = loadOrCreateSpaceIdentity(normalizedUid);
  pendingIdentities.set(normalizedUid, operation);
  operation.then(
    () => removePendingIdentity(normalizedUid, operation),
    () => removePendingIdentity(normalizedUid, operation),
  );
  return operation;
}

async function loadOrCreateSpaceIdentity(uid: string): Promise<SpaceIdentity> {
  const key = getSpaceIdentityStorageKey(uid);
  const stored = await AsyncStorage.getItem(key);
  const parsed = stored ? parseSpaceIdentity(stored, uid) : null;
  if (parsed) {
    return parsed;
  }

  const identity: SpaceIdentity = {
    uid,
    spaceId: createSpaceId(),
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(identity));
  return identity;
}

function removePendingIdentity(uid: string, operation: Promise<SpaceIdentity>): void {
  if (pendingIdentities.get(uid) === operation) {
    pendingIdentities.delete(uid);
  }
}

function parseSpaceIdentity(value: string, uid: string): SpaceIdentity | null {
  try {
    const parsed = JSON.parse(value) as Partial<SpaceIdentity>;
    if (
      parsed.uid !== uid
      || typeof parsed.spaceId !== 'string'
      || parsed.spaceId.trim().length === 0
      || parsed.spaceId === LEGACY_LOCAL_STORE_ID
      || typeof parsed.createdAt !== 'string'
      || parsed.createdAt.trim().length === 0
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      spaceId: parsed.spaceId,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function createSpaceId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  const randomPart = randomUuid
    ? randomUuid.replace(/-/g, '')
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `space_${randomPart}`;
}

function normalizeUid(uid: string): string {
  const normalizedUid = typeof uid === 'string' ? uid.trim() : '';
  if (!normalizedUid) {
    throw new Error('firebaseUidRequired');
  }
  return normalizedUid;
}