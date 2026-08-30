import { describe, expect, it } from 'vitest';
import type { StoreProfile } from '@/types/business';
import {
  CLOUD_OPERATION_KINDS,
  INVITATION_STATUSES,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  OPERATION_RECEIPT_STATUSES,
  SPACE_MODES,
  SPACE_STATUSES,
  type CloudOperation,
  type Invitation,
  type Membership,
  type OperationReceipt,
  type OwnerMembership,
  type Space,
  type SpaceIdentity,
} from '@/types/space';

describe('Multi-Space domain contracts', () => {
  it('defines the initial membership roles without custom permissions', () => {
    expect(MEMBERSHIP_ROLES).toEqual(['owner', 'admin', 'manager', 'cashier', 'viewer']);
  });

  it('defines the membership statuses', () => {
    expect(MEMBERSHIP_STATUSES).toEqual(['active', 'suspended', 'invited']);
  });

  it('defines the Space modes and statuses', () => {
    expect(SPACE_MODES).toEqual(['private', 'shared']);
    expect(SPACE_STATUSES).toEqual(['active', 'suspended', 'archived']);
  });

  it('defines invitation and trusted operation lifecycle values', () => {
    expect(INVITATION_STATUSES).toEqual(['pending', 'accepted', 'revoked', 'expired']);
    expect(CLOUD_OPERATION_KINDS).toEqual(['command', 'mutation']);
    expect(OPERATION_RECEIPT_STATUSES).toEqual(['accepted', 'completed', 'rejected']);
  });

  it('models the owner as one Space member with the owner role', () => {
    const space: Space = {
      spaceId: 'space-contract',
      name: 'Contract Space',
      mode: 'private',
      status: 'active',
      ownerUserId: 'firebase-user-contract',
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };
    const ownerMembership: OwnerMembership = {
      spaceId: space.spaceId,
      userId: space.ownerUserId,
      role: 'owner',
      status: 'active',
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      joinedAt: space.createdAt,
    };

    expect(space.ownerUserId).toBe(ownerMembership.userId);
    expect(ownerMembership.role).toBe('owner');
    expect(ownerMembership.status).toBe('active');
  });

  it('keeps Firebase UID, Space ID, and Store ID as separate concepts', () => {
    const identity: SpaceIdentity = {
      uid: 'firebase-user-contract',
      spaceId: 'space-contract',
      createdAt: '2026-08-30T10:00:00.000Z',
    };
    const space: Space = {
      spaceId: identity.spaceId,
      name: 'Contract Space',
      mode: 'shared',
      status: 'active',
      ownerUserId: identity.uid,
      createdAt: identity.createdAt,
      updatedAt: identity.createdAt,
    };
    const storeProfile: StoreProfile = {
      id: 'store-contract',
      name: 'Contract Store',
      phone: '',
      address: '',
      currency: 'TRY',
      quickCurrencies: ['TRY'],
      visibleCurrencies: ['TRY'],
      language: 'en',
      accent: 'blue',
    };

    expect(identity.uid).not.toBe(identity.spaceId);
    expect(identity.spaceId).toBe(space.spaceId);
    expect(storeProfile.id).not.toBe(identity.spaceId);
    expect(space).not.toHaveProperty('id');
  });

  it('uses a non-owner role for invitations', () => {
    const invitation: Invitation = {
      invitationId: 'invitation-contract',
      spaceId: 'space-contract',
      role: 'manager',
      status: 'pending',
      invitedByUserId: 'firebase-user-contract',
      inviteeEmailNormalized: 'invitee@example.test',
      tokenHash: 'token-hash-contract',
      createdAt: '2026-08-30T10:00:00.000Z',
      expiresAt: '2026-09-06T10:00:00.000Z',
    };

    expect(invitation.role).not.toBe('owner');
    expect(invitation.status).toBe('pending');
  });

  it('keeps membership authorization separate from the discovery index', () => {
    const membership: Membership = {
      spaceId: 'space-contract',
      userId: 'firebase-user-contract',
      role: 'viewer',
      status: 'active',
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };
    const discoveryIndexEntry = {
      spaceId: membership.spaceId,
      role: membership.role,
      status: membership.status,
    };

    expect(membership).toHaveProperty('userId');
    expect(discoveryIndexEntry).not.toHaveProperty('userId');
  });

  it('provides contracts for idempotent trusted operations and receipts', () => {
    const operation: CloudOperation<{ amount: number }> = {
      operationId: 'operation-contract',
      spaceId: 'space-contract',
      actorUserId: 'firebase-user-contract',
      kind: 'command',
      name: 'financialSettlement',
      payload: { amount: 100 },
      createdAt: '2026-08-30T10:00:00.000Z',
    };
    const receipt: OperationReceipt<{ settlementId: string }> = {
      operationId: operation.operationId,
      spaceId: operation.spaceId,
      status: 'completed',
      processedAt: '2026-08-30T10:00:01.000Z',
      result: { settlementId: 'settlement-contract' },
    };

    expect(receipt.operationId).toBe(operation.operationId);
    expect(receipt.spaceId).toBe(operation.spaceId);
    expect(receipt.status).toBe('completed');
  });
});