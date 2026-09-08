import type { StoreProfile } from '@/types/business';
import type { Membership, Space } from '@/types/space';

export const FIRESTORE_WORKSPACE_COLLECTIONS = {
  spaces: 'spaces',
  members: 'members',
  users: 'users',
  memberships: 'memberships',
  storeProfile: 'storeProfile',
  profile: 'profile',
  customers: 'customers',
  debts: 'debts',
  payments: 'payments',
  cashTransactions: 'cashTransactions',
  dailyClosings: 'dailyClosings',
  reminders: 'reminders',
  notificationRecords: 'notificationRecords',
  operationReceipts: 'operationReceipts',
  auditEvents: 'auditEvents',
} as const;

export const WORKSPACE_BUSINESS_COLLECTIONS = {
  customers: FIRESTORE_WORKSPACE_COLLECTIONS.customers,
  debts: FIRESTORE_WORKSPACE_COLLECTIONS.debts,
  payments: FIRESTORE_WORKSPACE_COLLECTIONS.payments,
  cashTransactions: FIRESTORE_WORKSPACE_COLLECTIONS.cashTransactions,
  dailyClosings: FIRESTORE_WORKSPACE_COLLECTIONS.dailyClosings,
  reminders: FIRESTORE_WORKSPACE_COLLECTIONS.reminders,
  notificationRecords: FIRESTORE_WORKSPACE_COLLECTIONS.notificationRecords,
  operationReceipts: FIRESTORE_WORKSPACE_COLLECTIONS.operationReceipts,
  auditEvents: FIRESTORE_WORKSPACE_COLLECTIONS.auditEvents,
} as const;

export type WorkspaceBusinessCollection = keyof typeof WORKSPACE_BUSINESS_COLLECTIONS;

export type WorkspaceDocument = Space;
export type WorkspaceMembershipDocument = Membership;

export interface UserWorkspaceMetadataDocument {
  primarySpaceId?: string;
}

export interface WorkspaceStoreProfileDocument extends StoreProfile {
  storeId: string;
}

export function workspaceDocumentPath(spaceId: string): string {
  return joinFirestorePath(
    FIRESTORE_WORKSPACE_COLLECTIONS.spaces,
    requirePathSegment(spaceId, 'spaceId'),
  );
}

export function workspaceMembersCollectionPath(spaceId: string): string {
  return joinFirestorePath(
    workspaceDocumentPath(spaceId),
    FIRESTORE_WORKSPACE_COLLECTIONS.members,
  );
}

export function workspaceMemberDocumentPath(spaceId: string, uid: string): string {
  return joinFirestorePath(
    workspaceMembersCollectionPath(spaceId),
    requirePathSegment(uid, 'uid'),
  );
}

export function userDocumentPath(uid: string): string {
  return joinFirestorePath(
    FIRESTORE_WORKSPACE_COLLECTIONS.users,
    requirePathSegment(uid, 'uid'),
  );
}

export function userMembershipsCollectionPath(uid: string): string {
  return joinFirestorePath(
    userDocumentPath(uid),
    FIRESTORE_WORKSPACE_COLLECTIONS.memberships,
  );
}

export function userMembershipDocumentPath(uid: string, spaceId: string): string {
  return joinFirestorePath(
    userMembershipsCollectionPath(uid),
    requirePathSegment(spaceId, 'spaceId'),
  );
}

export function workspaceStoreProfileDocumentPath(spaceId: string): string {
  return joinFirestorePath(
    workspaceDocumentPath(spaceId),
    FIRESTORE_WORKSPACE_COLLECTIONS.storeProfile,
    FIRESTORE_WORKSPACE_COLLECTIONS.profile,
  );
}

export function workspaceBusinessCollectionPath(
  spaceId: string,
  collection: WorkspaceBusinessCollection,
): string {
  return joinFirestorePath(
    workspaceDocumentPath(spaceId),
    WORKSPACE_BUSINESS_COLLECTIONS[collection],
  );
}

export function workspaceBusinessDocumentPath(
  spaceId: string,
  collection: WorkspaceBusinessCollection,
  documentId: string,
): string {
  return joinFirestorePath(
    workspaceBusinessCollectionPath(spaceId, collection),
    requirePathSegment(documentId, 'documentId'),
  );
}

export function firestorePathSegments(path: string): string[] {
  return path.split('/');
}

function joinFirestorePath(...segments: string[]): string {
  return segments.join('/');
}

function requirePathSegment(value: string, name: string): string {
  const segment = typeof value === 'string' ? value.trim() : '';
  if (!segment || segment.includes('/')) {
    throw new Error(`${name}Invalid`);
  }
  return segment;
}