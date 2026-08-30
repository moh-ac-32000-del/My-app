import { describe, expect, it } from 'vitest';
import {
  TRUSTED_BOOTSTRAP_ERROR_CODES,
  type BootstrapPrimarySpaceRequest,
  type CreateAdditionalSpaceRequest,
  type MembershipDiscoveryIndexEntry,
  type SpaceProvisioningWriteSet,
  type TrustedAuthIdentity,
} from '@/types/trustedBootstrap';
import type { OwnerMembership } from '@/types/space';

describe('Trusted Bootstrap contracts', () => {
  it('keeps Firebase identity in trusted context, not the bootstrap request body', () => {
    const identity: TrustedAuthIdentity = { uid: 'firebase-user-contract' };
    const request: BootstrapPrimarySpaceRequest = {};

    expect(identity.uid).toBe('firebase-user-contract');
    expect(request).toEqual({});
  });

  it('limits additional Space input to allowed fields and an idempotency key', () => {
    const request: CreateAdditionalSpaceRequest = {
      name: 'Additional Space',
      mode: 'private',
      idempotencyKey: 'create-space-contract',
    };

    expect(Object.keys(request).sort()).toEqual(['idempotencyKey', 'mode', 'name']);
    expect(request).not.toHaveProperty('spaceId');
    expect(request).not.toHaveProperty('ownerUserId');
    expect(request).not.toHaveProperty('role');
  });

  it('represents one active owner membership and an index-only membership entry', () => {
    const ownerMembership: OwnerMembership = {
      spaceId: 'space-contract',
      userId: 'firebase-user-contract',
      role: 'owner',
      status: 'active',
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };
    const membershipIndex: MembershipDiscoveryIndexEntry = {
      spaceId: ownerMembership.spaceId,
      role: ownerMembership.role,
      status: ownerMembership.status,
      spaceNameSnapshot: 'Contract Space',
      joinedAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };

    expect(ownerMembership.role).toBe('owner');
    expect(ownerMembership.status).toBe('active');
    expect(membershipIndex).not.toHaveProperty('userId');
  });

  it('defines the trusted error contract', () => {
    expect(TRUSTED_BOOTSTRAP_ERROR_CODES).toEqual([
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'SPACE_NOT_FOUND',
      'MEMBERSHIP_NOT_FOUND',
      'CONFLICT',
      'ALREADY_EXISTS',
      'INVALID_ARGUMENT',
      'INTERNAL',
    ]);
  });

  it('models the atomic provisioning write set', () => {
    const writeSet: SpaceProvisioningWriteSet = {
      space: {
        spaceId: 'space-contract',
        name: 'Contract Space',
        mode: 'private',
        status: 'active',
        ownerUserId: 'firebase-user-contract',
        createdAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:00:00.000Z',
      },
      ownerMembership: {
        spaceId: 'space-contract',
        userId: 'firebase-user-contract',
        role: 'owner',
        status: 'active',
        createdAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:00:00.000Z',
      },
      membershipIndex: {
        spaceId: 'space-contract',
        role: 'owner',
        status: 'active',
        spaceNameSnapshot: 'Contract Space',
        joinedAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:00:00.000Z',
      },
    };

    expect(writeSet.space.ownerUserId).toBe(writeSet.ownerMembership.userId);
    expect(writeSet.membershipIndex.spaceId).toBe(writeSet.space.spaceId);
  });
});