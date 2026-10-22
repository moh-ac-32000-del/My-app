import { createHash, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { canonicalTimeZone, closingSettings } from '../../data/workspaceClosing.js';
import { automaticClosingPolicy, nextClosingAt, queueClosingTransition } from '../../data/automaticClosing.js';
import { prepareAutomaticClosing } from './automaticClosing.js';

type Role = 'editor' | 'viewer';
type Input = {
  action:
    | 'quota'
    | 'create'
    | 'rename'
    | 'overview'
    | 'invite'
    | 'revoke'
    | 'accept'
    | 'role'
    | 'remove'
    | 'closingSettings'
    | 'enableClosing'
    | 'retryClosing';
  legacyTimeZone?: string;
  closingSettings?: { timeZone: string; executionTime: string; expectedRevision: number };
  spaceId?: string;
  name?: string;
  mode?: 'private' | 'shared';
  role?: Role;
  userId?: string;
  token?: string;
  invitationId?: string;
  operationId?: string;
};
export interface WorkspaceRuntime {
  firestore: Firestore;
  now: () => string;
  token?: () => string;
  automaticClosingReady?: boolean;
}
const defaults = { private: 1, shared: 2 };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fail(
  code: 'invalid-argument' | 'permission-denied' | 'failed-precondition' | 'already-exists' | 'resource-exhausted',
  message: string,
): never {
  throw new HttpsError(code, message);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function role(value: unknown): value is Role {
  return value === 'editor' || value === 'viewer';
}

/** Metadata-only commands. Never read or write financial collections. */
export async function workspaceCommandHandler(
  request: CallableRequest<Input>,
  runtime: WorkspaceRuntime,
): Promise<Record<string, any>> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required');
  const input = request.data;
  if (
    !input ||
    ![
      'quota',
      'create',
      'rename',
      'overview',
      'invite',
      'revoke',
      'accept',
      'role',
      'remove',
      'closingSettings',
      'enableClosing',
      'retryClosing',
    ].includes(input.action)
  )
    fail('invalid-argument', 'Invalid workspace action');
  if (
    ['create', 'rename'].includes(input.action) &&
    (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80)
  )
    fail('invalid-argument', 'Invalid workspace name');
  if (input.action === 'create' && (!['private', 'shared'].includes(input.mode!) || !id(input.operationId)))
    fail('invalid-argument', 'Invalid creation request');
  if (['invite', 'role'].includes(input.action) && !role(input.role))
    fail('invalid-argument', 'Only editor or viewer can be assigned');
  if (['role', 'remove'].includes(input.action) && !id(input.userId)) fail('invalid-argument', 'Invalid member');
  if (input.action === 'revoke' && !/^[a-f0-9]{64}$/.test(input.invitationId ?? ''))
    fail('invalid-argument', 'Invalid invitation');
  if (input.action === 'accept' && !/^[a-f0-9]{64}$/.test(input.token ?? ''))
    fail('invalid-argument', 'Invalid invitation token');
  if (!['quota', 'create', 'accept'].includes(input.action) && !id(input.spaceId))
    fail('invalid-argument', 'Invalid workspace');
  let prepared: { timeZone: string; executionTime: string; expectedRevision: number } | undefined;
  if (input.action === 'closingSettings') {
    const settings = input.closingSettings;
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => !['timeZone', 'executionTime', 'expectedRevision'].includes(key)) ||
      !Number.isSafeInteger(settings.expectedRevision) ||
      settings.expectedRevision < 0 ||
      typeof settings.executionTime !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.executionTime)
    ) {
      fail('invalid-argument', 'Invalid closing settings');
    }
    try {
      prepared = {
        timeZone: canonicalTimeZone(settings.timeZone),
        executionTime: settings.executionTime,
        expectedRevision: settings.expectedRevision,
      };
    } catch {
      fail('invalid-argument', 'Invalid workspace time zone');
    }
  }
  const db = runtime.firestore;
  const actorRef = db.collection('users').doc(uid);
  // Generated once per call, outside the retry callback. Tokens are returned only to the owner, never stored.
  const token = input.action === 'invite' ? (runtime.token?.() ?? randomBytes(32).toString('hex')) : '';
  return db.runTransaction(async (tx) => {
    const now = runtime.now();
    if (!Number.isFinite(Date.parse(now))) throw new HttpsError('internal', 'Invalid server clock');
    if (input.action === 'quota') {
      const [actor, owned] = await Promise.all([
        tx.get(actorRef),
        tx.get(db.collection('spaces').where('ownerUserId', '==', uid)),
      ]);
      return {
        limits: accountLimits(actor.data()?.workspaceLimits),
        used: countOwned(owned.docs.map((d) => d.data())),
      };
    }
    if (input.action === 'accept') {
      const inviteRef = db.collection('spaceInvitations').doc(hash(input.token!));
      const invite = (await tx.get(inviteRef)).data();
      if (
        !invite ||
        invite.status !== 'pending' ||
        Date.parse(invite.expiresAt) <= Date.parse(now) ||
        !Number.isFinite(Date.parse(invite.expiresAt)) ||
        !id(invite.spaceId) ||
        !role(invite.role)
      )
        fail('failed-precondition', 'Invitation unavailable or expired');
      const spaceRef = db.collection('spaces').doc(invite.spaceId);
      const memberRef = spaceRef.collection('members').doc(uid);
      const [spaceSnap, memberSnap, ownerMemberSnap] = await Promise.all([
        tx.get(spaceRef),
        tx.get(memberRef),
        tx.get(spaceRef.collection('members').doc(invite.invitedByUserId)),
      ]);
      const space = spaceSnap.data();
      if (
        !space ||
        space.status !== 'active' ||
        space.mode !== 'shared' ||
        space.ownerUserId !== invite.invitedByUserId
      )
        fail('failed-precondition', 'Workspace unavailable');
      assertWorkspaceAccess(ownerMemberSnap.data(), 'owner', space, invite.invitedByUserId);
      if (space.ownerUserId === uid || memberSnap.data()?.status === 'active')
        fail('already-exists', 'Already an active member');
      const displayName = request.auth?.token?.name || request.auth?.token?.email || uid;
      const member = {
        spaceId: invite.spaceId,
        userId: uid,
        displayName,
        role: invite.role,
        status: 'active',
        createdAt: memberSnap.data()?.createdAt ?? now,
        updatedAt: now,
        joinedAt: now,
        invitedByUserId: invite.invitedByUserId,
      };
      tx.set(memberRef, member);
      tx.set(actorRef.collection('memberships').doc(invite.spaceId), {
        spaceId: invite.spaceId,
        role: invite.role,
        status: 'active',
        spaceNameSnapshot: space.name,
        joinedAt: now,
        updatedAt: now,
      });
      tx.update(inviteRef, { status: 'accepted', acceptedByUserId: uid, acceptedAt: now });
      return { spaceId: invite.spaceId };
    }

    if (input.action === 'create') {
      // Also read and update users/{uid}, the serialization document used by legacy bootstrap.
      const [actorSnap, ownedSnap] = await Promise.all([
        tx.get(actorRef),
        tx.get(db.collection('spaces').where('ownerUserId', '==', uid)),
      ]);
      const actor = actorSnap.data() ?? {};
      const limits = accountLimits(actor.workspaceLimits);
      const used = countOwned(ownedSnap.docs.map((d) => d.data()));
      const spaceId = `space_${hash(`${uid}/${input.operationId}`).slice(0, 32)}`;
      const spaceRef = db.collection('spaces').doc(spaceId);
      const existing = (await tx.get(spaceRef)).data();
      if (existing) {
        assertWorkspaceAccess((await tx.get(spaceRef.collection('members').doc(uid))).data(), 'owner', existing, uid);
        if (existing.ownerUserId !== uid || existing.name !== input.name!.trim() || existing.mode !== input.mode)
          fail('already-exists', 'Operation ID was used with a different payload');
        // A retry cannot restore a suspended or archived workspace.
        if (existing.status !== 'active') fail('failed-precondition', 'Workspace unavailable');
        return { spaceId };
      }
      if (used[input.mode!] >= limits[input.mode!]) fail('resource-exhausted', 'Workspace ownership limit reached');
      const space = {
        spaceId,
        name: input.name!.trim(),
        mode: input.mode,
        status: 'active',
        ownerUserId: uid,
        createdAt: now,
        updatedAt: now,
      };
      tx.create(spaceRef, space);
      tx.create(spaceRef.collection('members').doc(uid), {
        spaceId,
        userId: uid,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        joinedAt: now,
      });
      tx.create(actorRef.collection('memberships').doc(spaceId), {
        spaceId,
        role: 'owner',
        status: 'active',
        spaceNameSnapshot: space.name,
        joinedAt: now,
        updatedAt: now,
      });
      tx.set(actorRef, {
        ...actor,
        primarySpaceId: actor.primarySpaceId ?? spaceId,
        workspaceRevision: (Number(actor.workspaceRevision) || 0) + 1,
        updatedAt: now,
      });
      return { spaceId };
    }

    const spaceRef = db.collection('spaces').doc(input.spaceId!);
    const [spaceSnap, memberSnap] = await Promise.all([
      tx.get(spaceRef),
      tx.get(spaceRef.collection('members').doc(uid)),
    ]);
    const space = spaceSnap.data();
    if (!space || space.status !== 'active') fail('failed-precondition', 'Workspace unavailable');
    assertWorkspaceAccess(memberSnap.data(), input.action === 'overview' ? 'read' : 'owner', space, uid);
    if (input.action === 'enableClosing' || input.action === 'retryClosing') {
      if (!runtime.automaticClosingReady) fail('failed-precondition', 'Scheduled backend has not been verified ready');
      const profile = await tx.get(spaceRef.collection('storeProfile').doc('profile'));
      const storeId = profile.data()?.storeId;
      if (typeof storeId !== 'string' || !storeId) fail('failed-precondition', 'Workspace profile is missing');
      let legacyZone = '';
      if (input.action === 'enableClosing') {
        try {
          legacyZone = canonicalTimeZone(input.legacyTimeZone);
        } catch {
          fail('invalid-argument', 'Confirm the timezone of existing records before activation');
        }
      }
      if (space.automaticClosing) {
        const policy = automaticClosingPolicy(space.automaticClosing);
        if (input.action === 'enableClosing' && legacyZone !== policy.legacyTimeZone)
          fail('already-exists', 'Activation used a different legacy time zone');
        if (input.action === 'retryClosing') {
          tx.update(spaceRef, {
            automaticClosing: { ...policy, failures: 0 },
            autoClosingNextAt: nextClosingAt(policy),
          });
        }
        return { spaceId: input.spaceId };
      }
      if (input.action === 'retryClosing') fail('failed-precondition', 'Automatic closing is not active');
      const policy = await prepareAutomaticClosing(tx, spaceRef, space, storeId, uid, now, legacyZone);
      tx.update(spaceRef, { automaticClosing: policy, autoClosingNextAt: nextClosingAt(policy) });
      return { spaceId: input.spaceId };
    }
    if (input.action === 'closingSettings') {
      let previous;
      try {
        previous = closingSettings(space.closingSettings);
      } catch {
        fail('failed-precondition', 'Stored closing settings require review');
      }
      const same = previous.timeZone === prepared!.timeZone && previous.executionTime === prepared!.executionTime;
      // Canonical owner authorization above is checked even for a replay.
      if (
        previous.revision > 0 &&
        same &&
        previous.updatedByUserId === uid &&
        [previous.revision, previous.revision - 1].includes(prepared!.expectedRevision)
      ) {
        return { spaceId: input.spaceId, closingSettings: previous };
      }
      if (previous.revision !== prepared!.expectedRevision)
        fail('failed-precondition', 'Closing settings changed; refresh before saving');
      if (previous.revision >= Number.MAX_SAFE_INTEGER - 1)
        fail('failed-precondition', 'Closing settings revision requires review');
      const next = {
        timeZone: prepared!.timeZone,
        executionTime: prepared!.executionTime,
        revision: previous.revision + 1,
        status: 'prepared' as const,
        updatedAt: now,
        updatedByUserId: uid,
      };
      // One metadata write; no timer, financial collection, archive or historical date is changed.
      const automatic = space.automaticClosing
        ? queueClosingTransition(automaticClosingPolicy(space.automaticClosing), now, next.timeZone, next.executionTime)
        : null;
      tx.update(spaceRef, {
        closingSettings: next,
        updatedAt: now,
        ...(automatic ? { automaticClosing: automatic, autoClosingNextAt: nextClosingAt(automatic) } : {}),
      });
      return { spaceId: input.spaceId, closingSettings: next };
    }
    if (input.action === 'overview') {
      // Only owners receive membership/invitation management metadata or account quota configuration.
      if (memberSnap.data()?.role !== 'owner')
        return { space, role: memberSnap.data()?.role, automaticClosingReady: !!runtime.automaticClosingReady };
      assertWorkspaceAccess(memberSnap.data(), 'owner', space, uid);
      const [members, invites, actor, owned] = await Promise.all([
        tx.get(spaceRef.collection('members')),
        tx.get(
          db
            .collection('spaceInvitations')
            .where('spaceId', '==', input.spaceId)
            .where('status', '==', 'pending')
            .where('expiresAt', '>', now),
        ),
        tx.get(actorRef),
        tx.get(db.collection('spaces').where('ownerUserId', '==', uid)),
      ]);
      return {
        space,
        role: 'owner',
        automaticClosingReady: !!runtime.automaticClosingReady,
        members: members.docs.map((d) => ({
          userId: d.id,
          displayName: d.data().displayName ?? d.id,
          role: d.data().role,
          status: d.data().status,
        })),
        invitations: invites.docs.map((d) => ({
          invitationId: d.id,
          role: d.data().role,
          status:
            d.data().status === 'pending' && Date.parse(d.data().expiresAt) <= Date.parse(now)
              ? 'expired'
              : d.data().status,
          expiresAt: d.data().expiresAt,
        })),
        limits: accountLimits(actor.data()?.workspaceLimits),
        used: countOwned(owned.docs.map((d) => d.data())),
      };
    }
    if (input.action === 'rename') {
      // Discovery names are hints. The canonical current name is read when opening the space.
      tx.update(spaceRef, { name: input.name!.trim(), updatedAt: now });
      tx.update(actorRef.collection('memberships').doc(input.spaceId!), {
        spaceNameSnapshot: input.name!.trim(),
        updatedAt: now,
      });
      return { spaceId: input.spaceId };
    }
    if (input.action === 'invite') {
      const [actorSnap, ownedSnap, invites, profileSnap] = await Promise.all([
        tx.get(actorRef),
        tx.get(db.collection('spaces').where('ownerUserId', '==', uid)),
        tx.get(
          db
            .collection('spaceInvitations')
            .where('spaceId', '==', input.spaceId)
            .where('status', '==', 'pending')
            .where('expiresAt', '>', now),
        ),
        tx.get(spaceRef.collection('storeProfile').doc('profile')),
      ]);
      if (typeof profileSnap.data()?.storeId !== 'string' || !profileSnap.data()?.storeId)
        fail('failed-precondition', 'Owner must initialize workspace profile before inviting');
      if (
        invites.docs.filter((d) => d.data().status === 'pending' && Date.parse(d.data().expiresAt) > Date.parse(now))
          .length >= 20
      )
        fail('resource-exhausted', 'Revoke pending invitations before creating more');
      const actor = actorSnap.data() ?? {};
      if (space.mode !== 'private' && space.mode !== 'shared')
        fail('failed-precondition', 'Workspace mode requires review');
      if (space.mode === 'private') {
        const used = countOwned(ownedSnap.docs.map((d) => d.data()));
        if (used.shared >= accountLimits(actor.workspaceLimits).shared)
          fail('resource-exhausted', 'Shared workspace limit reached');
        tx.update(spaceRef, { mode: 'shared', updatedAt: now });
        tx.set(actorRef, { ...actor, workspaceRevision: (Number(actor.workspaceRevision) || 0) + 1, updatedAt: now });
      }
      const invitationId = hash(token);
      const expiresAt = new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString();
      tx.create(db.collection('spaceInvitations').doc(invitationId), {
        spaceId: input.spaceId,
        role: input.role,
        status: 'pending',
        invitedByUserId: uid,
        tokenHash: invitationId,
        createdAt: now,
        expiresAt,
      });
      return { invitationId, token, expiresAt, spaceId: input.spaceId };
    }
    if (input.action === 'revoke') {
      const reference = db.collection('spaceInvitations').doc(input.invitationId!);
      const invite = (await tx.get(reference)).data();
      if (!invite || invite.spaceId !== input.spaceId) fail('permission-denied', 'Invitation scope mismatch');
      if (invite.status !== 'pending') fail('failed-precondition', 'Invitation no longer pending');
      tx.update(reference, { status: 'revoked', revokedAt: now, revokedByUserId: uid });
      return { spaceId: input.spaceId };
    }
    const targetRef = spaceRef.collection('members').doc(input.userId!);
    const target = (await tx.get(targetRef)).data();
    if (input.userId === space.ownerUserId || target?.role === 'owner')
      fail('permission-denied', 'Owner cannot be removed or reassigned');
    if (!target || target.status !== 'active') fail('failed-precondition', 'Active member required');
    const updates = input.action === 'remove' ? { status: 'suspended' } : { role: input.role };
    tx.update(targetRef, { ...updates, updatedAt: now, updatedByUserId: uid });
    tx.set(db.collection('users').doc(input.userId!).collection('memberships').doc(input.spaceId!), {
      spaceId: input.spaceId,
      role: input.action === 'role' ? input.role : target.role,
      status: input.action === 'remove' ? 'suspended' : 'active',
      spaceNameSnapshot: space.name,
      joinedAt: target.joinedAt ?? now,
      updatedAt: now,
    });
    return { spaceId: input.spaceId };
  });
}

function accountLimits(value: any): typeof defaults {
  if (value === undefined) return { ...defaults };
  if (
    !value ||
    !Number.isInteger(value.private) ||
    value.private < 0 ||
    value.private > 100 ||
    !Number.isInteger(value.shared) ||
    value.shared < 0 ||
    value.shared > 100
  )
    fail('failed-precondition', 'Workspace limits require review');
  return { private: value.private, shared: value.shared };
}
function countOwned(spaces: Array<Record<string, any>>): typeof defaults {
  const used = { private: 0, shared: 0 };
  for (const space of spaces) {
    // All retained documents count, including archived/suspended. No quota release without safe permanent deletion.
    if (space.mode !== 'private' && space.mode !== 'shared')
      fail('failed-precondition', 'Workspace inventory requires review');
    used[space.mode as keyof typeof used]++;
  }
  return used;
}
