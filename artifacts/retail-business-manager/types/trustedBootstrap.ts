import type {
  MembershipStatus,
  OperationReceipt,
  OwnerMembership,
  Space,
  SpaceMode,
} from '@/types/space';

/**
 * Firebase Auth context supplied by the trusted runtime.
 * This is not part of either client request body.
 */
export interface TrustedAuthIdentity {
  uid: string;
}

/**
 * Bootstrap has no client-supplied identity or Space selector.
 * The server derives the idempotency key from the verified UID.
 */
export type BootstrapPrimarySpaceRequest = Record<string, never>;

export type BootstrapPrimarySpaceOutcome = 'created' | 'existing' | 'repaired';

export interface BootstrapPrimarySpaceResponse {
  outcome: BootstrapPrimarySpaceOutcome;
  primarySpaceId: string;
  space: Space;
  ownerMembership: OwnerMembership;
  operationReceipt: OperationReceipt;
}

/**
 * These are the only client-controlled fields for an additional Space.
 * spaceId, ownerUserId, and role are deliberately absent.
 */
export interface CreateAdditionalSpaceRequest {
  name: string;
  mode?: SpaceMode;
  idempotencyKey: string;
}

export type CreateAdditionalSpaceOutcome = 'created' | 'replayed';

export interface CreateAdditionalSpaceResponse {
  outcome: CreateAdditionalSpaceOutcome;
  space: Space;
  ownerMembership: OwnerMembership;
  operationReceipt: OperationReceipt;
}

/**
 * This is the server-side atomic write set for either provisioning flow.
 * The users/{uid}/memberships/{spaceId} entry is an index only; authorization
 * continues to come from spaces/{spaceId}/members/{uid}.
 */
export interface SpaceProvisioningWriteSet {
  space: Space;
  ownerMembership: OwnerMembership;
  membershipIndex: MembershipDiscoveryIndexEntry;
}

export interface MembershipDiscoveryIndexEntry {
  spaceId: string;
  role: 'owner';
  status: MembershipStatus;
  spaceNameSnapshot: string;
  joinedAt: string;
  updatedAt: string;
}

export type TrustedBootstrapErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SPACE_NOT_FOUND'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'CONFLICT'
  | 'ALREADY_EXISTS'
  | 'INVALID_ARGUMENT'
  | 'INTERNAL';

export const TRUSTED_BOOTSTRAP_ERROR_CODES: readonly TrustedBootstrapErrorCode[] = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'SPACE_NOT_FOUND',
  'MEMBERSHIP_NOT_FOUND',
  'CONFLICT',
  'ALREADY_EXISTS',
  'INVALID_ARGUMENT',
  'INTERNAL',
];