export const SPACE_MODES = ['private', 'shared'] as const;
export type SpaceMode = (typeof SPACE_MODES)[number];

export const SPACE_STATUSES = ['active', 'suspended', 'archived'] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const MEMBERSHIP_ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type InvitableMembershipRole = Exclude<MembershipRole, 'owner'>;

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'invited'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const CLOUD_OPERATION_KINDS = ['command', 'mutation'] as const;
export type CloudOperationKind = (typeof CLOUD_OPERATION_KINDS)[number];

export const OPERATION_RECEIPT_STATUSES = ['accepted', 'completed', 'rejected'] as const;
export type OperationReceiptStatus = (typeof OPERATION_RECEIPT_STATUSES)[number];

/**
 * A Space is the future ownership, membership, and authorization boundary.
 * Its ID is independent from both Firebase user IDs and Store IDs.
 */
export interface Space {
  spaceId: string;
  name: string;
  mode: SpaceMode;
  status: SpaceStatus;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The membership under a Space is the future source of authorization.
 * users/{uid}/memberships/{spaceId} is only a discovery index.
 */
export interface Membership {
  spaceId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  invitedByUserId?: string;
}

/**
 * Every Space has exactly one ownerUserId, and that user must have this
 * active owner membership. Ownership transfer is intentionally not modeled
 * as an owners array or a custom-permissions contract.
 */
export interface OwnerMembership extends Membership {
  role: 'owner';
  status: 'active';
}

export interface Invitation {
  invitationId: string;
  spaceId: string;
  role: InvitableMembershipRole;
  status: InvitationStatus;
  invitedByUserId: string;
  inviteeEmailNormalized?: string;
  inviteeUserId?: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
}

/**
 * This is a future trusted-operation contract, not an outbox or sync model.
 * The operation ID is the idempotency boundary for server-side commands.
 */
export interface CloudOperation<TPayload = unknown> {
  operationId: string;
  spaceId: string;
  actorUserId: string;
  kind: CloudOperationKind;
  name: string;
  payload: TPayload;
  createdAt: string;
}

export interface OperationReceipt<TResult = unknown> {
  operationId: string;
  spaceId: string;
  status: OperationReceiptStatus;
  processedAt: string;
  result?: TResult;
  errorCode?: string;
}

export interface SpaceIdentity {
  uid: string;
  spaceId: string;
  createdAt: string;
}