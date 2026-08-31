import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import type { BootstrapPrimarySpaceResponse } from '@/types/trustedBootstrap';
import type { Space } from '@/types/space';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';

let functions: Functions | null = null;

export async function bootstrapPrimarySpace(): Promise<BootstrapPrimarySpaceResponse> {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }

  const callable = httpsCallable<Record<string, never>, BootstrapPrimarySpaceResponse>(
    getFunctionsInstance(),
    'bootstrapPrimarySpace',
  );
  const result = await callable({});

  if (!isBootstrapPrimarySpaceResponse(result.data)) {
    throw new Error('invalidBootstrapResponse');
  }

  return result.data;
}

function getFunctionsInstance(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
  }
  return functions;
}

function isBootstrapPrimarySpaceResponse(
  value: unknown,
): value is BootstrapPrimarySpaceResponse {
  if (!isRecord(value) || !isSpace(value.space)) {
    return false;
  }
  return (
    (value.outcome === 'created' || value.outcome === 'existing' || value.outcome === 'repaired')
    && value.primarySpaceId === value.space.spaceId
    && isRecord(value.ownerMembership)
    && isRecord(value.operationReceipt)
  );
}

function isSpace(value: unknown): value is Space {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.spaceId === 'string'
    && typeof value.name === 'string'
    && (value.mode === 'private' || value.mode === 'shared')
    && (value.status === 'active' || value.status === 'suspended' || value.status === 'archived')
    && typeof value.ownerUserId === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}