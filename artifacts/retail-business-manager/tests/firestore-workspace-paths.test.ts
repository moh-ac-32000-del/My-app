import { describe, expect, it } from 'vitest';
import type {
  UserWorkspaceMetadataDocument,
  WorkspaceDocument,
  WorkspaceStoreProfileDocument,
} from '@/data/firestoreWorkspace';
import {
  FIRESTORE_WORKSPACE_COLLECTIONS,
  firestorePathSegments,
  userDocumentPath,
  userMembershipDocumentPath,
  userMembershipsCollectionPath,
  workspaceBusinessCollectionPath,
  workspaceBusinessDocumentPath,
  workspaceDocumentPath,
  workspaceMemberDocumentPath,
  workspaceMembersCollectionPath,
  workspaceStoreProfileDocumentPath,
} from '@/data/firestoreWorkspace';

describe('Firestore Workspace path contracts', () => {
  it('uses spaceId for the canonical Workspace and authoritative membership paths', () => {
    expect(workspaceDocumentPath('space-a')).toBe('spaces/space-a');
    expect(workspaceMembersCollectionPath('space-a')).toBe('spaces/space-a/members');
    expect(workspaceMemberDocumentPath('space-a', 'user-a')).toBe(
      'spaces/space-a/members/user-a',
    );
  });

  it('keeps user discovery under a multi-document memberships subcollection', () => {
    expect(userDocumentPath('user-a')).toBe('users/user-a');
    expect(userMembershipsCollectionPath('user-a')).toBe('users/user-a/memberships');
    expect(userMembershipDocumentPath('user-a', 'space-a')).toBe(
      'users/user-a/memberships/space-a',
    );
    expect([
      userMembershipDocumentPath('user-a', 'space-a'),
      userMembershipDocumentPath('user-a', 'space-shared'),
    ]).toHaveLength(2);
  });

  it('keeps primarySpaceId as a selection hint separate from membership documents', () => {
    const metadata: UserWorkspaceMetadataDocument = { primarySpaceId: 'space-a' };

    expect(metadata.primarySpaceId).toBe('space-a');
    expect(userMembershipsCollectionPath('user-a')).not.toBe(userDocumentPath('user-a'));
  });

  it('places the future Store Profile under the Workspace boundary', () => {
    const profile: WorkspaceStoreProfileDocument = {
      id: 'profile-id',
      storeId: 'business-store-id',
      name: 'Store',
      phone: '',
      address: '',
      currency: 'TRY',
      quickCurrencies: ['TRY'],
      visibleCurrencies: ['TRY'],
      language: 'en',
      accent: 'blue',
    };

    expect(workspaceStoreProfileDocumentPath('space-a')).toBe(
      'spaces/space-a/storeProfile/profile',
    );
    expect(profile.storeId).not.toBe('space-a');
    expect(profile.id).not.toBe('space-a');
  });

  it('defines every future business collection under spaces/{spaceId}', () => {
    const collections = [
      'customers',
      'debts',
      'payments',
      'transactions',
      'cashTransactions',
      'dailyClosings',
      'reminders',
      'notificationRecords',
      'operationReceipts',
      'auditEvents',
    ] as const;

    for (const collection of collections) {
      expect(workspaceBusinessCollectionPath('space-a', collection)).toBe(
        `spaces/space-a/${collection}`,
      );
      expect(workspaceBusinessDocumentPath('space-a', collection, 'document-a')).toBe(
        `spaces/space-a/${collection}/document-a`,
      );
    }
  });

  it('keeps Workspace paths isolated and shared Workspaces address the same data', () => {
    expect(workspaceBusinessDocumentPath('space-a', 'customers', 'customer-a')).not.toBe(
      workspaceBusinessDocumentPath('space-b', 'customers', 'customer-a'),
    );
    expect(workspaceBusinessDocumentPath('space-shared', 'customers', 'customer-a')).toBe(
      workspaceBusinessDocumentPath('space-shared', 'customers', 'customer-a'),
    );
  });

  it('does not introduce top-level financial collection paths', () => {
    expect(FIRESTORE_WORKSPACE_COLLECTIONS.customers).toBe('customers');
    expect(workspaceBusinessCollectionPath('space-a', 'customers')).toMatch(/^spaces\//);
    expect(workspaceBusinessCollectionPath('space-a', 'payments')).not.toBe('payments');
    expect(workspaceBusinessCollectionPath('space-a', 'transactions')).not.toBe('transactions');
  });

  it('rejects unsafe or empty path segments', () => {
    expect(() => workspaceDocumentPath('')).toThrow('spaceIdInvalid');
    expect(() => workspaceMemberDocumentPath('space-a', 'user/a')).toThrow('uidInvalid');
    expect(() => workspaceBusinessDocumentPath('space-a', 'debts', '')).toThrow('documentIdInvalid');
  });

  it('keeps path segments usable by Firestore SDK helpers', () => {
    expect(firestorePathSegments(workspaceMemberDocumentPath('space-a', 'user-a'))).toEqual([
      'spaces',
      'space-a',
      'members',
      'user-a',
    ]);
  });

  it('preserves the established Workspace document shape without adding financial data', () => {
    const workspace: WorkspaceDocument = {
      spaceId: 'space-a',
      name: 'Workspace A',
      mode: 'private',
      status: 'active',
      ownerUserId: 'user-a',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    };

    expect(workspace).toMatchObject({
      spaceId: 'space-a',
      ownerUserId: 'user-a',
    });
    expect(workspace).not.toHaveProperty('customers');
    expect(workspace).not.toHaveProperty('debts');
    expect(workspace).not.toHaveProperty('payments');
  });
});