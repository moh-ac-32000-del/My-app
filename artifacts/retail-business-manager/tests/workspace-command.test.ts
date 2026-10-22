import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { workspaceCommandHandler } from '@/functions/src/workspaceCommand';
import { workspaceBackend, workspaceTestTime } from './fixtures/workspaceBackend';
const token = 'a'.repeat(64);
const digest = createHash('sha256').update(token).digest('hex');
const req = (uid: string | null, data: Record<string, any>) => ({ auth: uid ? { uid } : null, data }) as never;
function fixture(access: unknown = 'owner') {
  const f = workspaceBackend(access);
  Object.assign(f.docs['spaces/s'], { name: 'Shop', mode: 'private' });
  f.docs['users/u'] = { primarySpaceId: 's' };
  f.docs['users/u/memberships/s'] = { spaceId: 's', role: 'owner', status: 'active' };
  return { ...f, runtime: { ...f.runtime, token: () => token } };
}
describe('workspace metadata command', () => {
  const settings = { timeZone: 'Europe/Istanbul', executionTime: '00:00', expectedRevision: 0 };
  it('denies unauthenticated and cross-space closing settings requests', async () => {
    const f = fixture();
    await expect(workspaceCommandHandler(req(null, { action: 'closingSettings', spaceId: 's', closingSettings: settings }), f.runtime)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(workspaceCommandHandler(req('u', { action: 'closingSettings', spaceId: 'other', closingSettings: settings }), f.runtime)).rejects.toBeDefined();
    expect(f.writes).toEqual([]);
  });
  it('does not repair or overwrite malformed stored closing settings silently', async () => {
    const f = fixture();
    f.docs['spaces/s'].closingSettings = { timeZone: 'Bad/Zone', status: 'active' };
    await expect(workspaceCommandHandler(req('u', { action: 'closingSettings', spaceId: 's', closingSettings: settings }), f.runtime)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.writes).toEqual([]);
    expect(f.docs['spaces/s'].closingSettings.timeZone).toBe('Bad/Zone');
  });
  it('prepares owner settings once, keeps spaces independent and never enables automatic closing', async () => {
    const f = fixture();
    const before = structuredClone(f.docs);
    const input = { action: 'closingSettings', spaceId: 's', closingSettings: settings };
    const result = await workspaceCommandHandler(req('u', input), f.runtime);
    expect(result.closingSettings).toMatchObject({ timeZone: 'Europe/Istanbul', executionTime: '00:00', revision: 1, status: 'prepared', updatedByUserId: 'u' });
    expect(f.writes).toEqual(['spaces/s']);
    expect(await workspaceCommandHandler(req('u', input), f.runtime)).toEqual(result);
    expect(f.writes).toHaveLength(1);
    for (const path of Object.keys(before).filter((path) => path !== 'spaces/s')) expect(f.docs[path]).toEqual(before[path]);
    expect(f.docs['spaces/s'].automaticClosing).toBeUndefined();
    expect(f.docs['spaces/s'].nextClosingAt).toBeUndefined();
  });
  it('rejects concurrent conflicting edits rather than overwriting a saved time zone', async () => {
    const f = fixture();
    const results = await Promise.allSettled(['Europe/Istanbul', 'America/New_York'].map((timeZone) => workspaceCommandHandler(req('u', {
      action: 'closingSettings', spaceId: 's', closingSettings: { ...settings, timeZone },
    }), f.runtime)));
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect(f.writes).toEqual(['spaces/s']);
  });
  it.each(['editor', 'viewer', 'manager', null])('rejects settings writes by %s, including forged owner/activation fields', async (role) => {
    const f = fixture(role);
    await expect(workspaceCommandHandler(req('u', { action: 'closingSettings', spaceId: 's', closingSettings: settings, role: 'owner', enabled: true }), f.runtime)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it.each([
    { timeZone: 'Bad/Zone' }, { timeZone: '+03:00' }, { executionTime: '24:00' }, { executionTime: '12:60' },
    { executionTime: '9:00' }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { enabled: true }, { status: 'enabled' },
  ])('rejects malformed or activation payload %j with no writes', async (changed) => {
    const f = fixture();
    await expect(workspaceCommandHandler(req('u', { action: 'closingSettings', spaceId: 's', closingSettings: { ...settings, ...changed } }), f.runtime)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(f.writes).toEqual([]);
  });
  it('rechecks owner membership on a conflict retry and does not change financial history', async () => {
    const f = fixture();
    f.retryOnce(() => { f.docs['spaces/s/members/u'].role = 'viewer'; });
    await expect(workspaceCommandHandler(req('u', { action: 'closingSettings', spaceId: 's', closingSettings: settings }), f.runtime)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it('requires authentication', async () => {
    const f = fixture();
    await expect(
      workspaceCommandHandler(
        req(null, { action: 'create', name: 'New', mode: 'shared', operationId: 'new' }),
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(f.writes).toEqual([]);
  });
  it('enforces private ownership, while joined spaces do not count', async () => {
    const f = fixture();
    f.docs['spaces/joined'] = { ownerUserId: 'other', mode: 'private', status: 'active' };
    await expect(
      workspaceCommandHandler(
        req('u', { action: 'create', name: 'Another', mode: 'private', operationId: 'new' }),
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    const created = await workspaceCommandHandler(
      req('u', { action: 'create', name: 'Shared', mode: 'shared', operationId: 'new' }),
      f.runtime,
    );
    expect(created.spaceId).not.toBe('u');
    expect(f.docs[`spaces/${created.spaceId}/members/u`]).toMatchObject({ role: 'owner', status: 'active' });
    expect(f.writes.every((path) => !/(debts|payments|transactions|dailyArchives|customers)/.test(path))).toBe(true);
  });
  it('counts archived and suspended spaces and blocks concurrent over-allocation', async () => {
    const f = fixture();
    f.docs['spaces/archived'] = { ownerUserId: 'u', mode: 'shared', status: 'archived' };
    const result = await Promise.allSettled(
      ['a', 'b'].map((operationId) =>
        workspaceCommandHandler(
          req('u', { action: 'create', name: operationId, mode: 'shared', operationId }),
          f.runtime,
        ),
      ),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
    f.docs['spaces/archived'].status = 'suspended';
    await expect(
      workspaceCommandHandler(req('u', { action: 'create', name: 'c', mode: 'shared', operationId: 'c' }), f.runtime),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('rechecks quota on transaction conflict retry', async () => {
    const f = fixture();
    f.docs['spaces/shared-1'] = { ownerUserId: 'u', mode: 'shared', status: 'active' };
    f.retryOnce(() => {
      f.docs['spaces/shared-2'] = { ownerUserId: 'u', mode: 'shared', status: 'active' };
    });
    await expect(
      workspaceCommandHandler(req('u', { action: 'create', name: 'c', mode: 'shared', operationId: 'c' }), f.runtime),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(f.writes).toEqual([]);
  });
  it('supports trusted account-specific limits, never request-supplied limits', async () => {
    const f = fixture();
    f.docs['users/u'].workspaceLimits = { private: 0, shared: 0 };
    await expect(
      workspaceCommandHandler(
        req('u', { action: 'create', name: 'c', mode: 'shared', operationId: 'c', workspaceLimits: { shared: 100 } }),
        f.runtime,
      ),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    f.docs['users/u'].workspaceLimits = { private: 1, shared: 3 };
    await expect(
      workspaceCommandHandler(req('u', { action: 'create', name: 'c', mode: 'shared', operationId: 'c' }), f.runtime),
    ).resolves.toHaveProperty('spaceId');
  });
  it('is idempotent on creation and rejects a changed operation payload', async () => {
    const f = fixture();
    const data = { action: 'create', name: 'c', mode: 'shared', operationId: 'c' };
    const first = await workspaceCommandHandler(req('u', data), f.runtime);
    const writes = f.writes.length;
    expect(await workspaceCommandHandler(req('u', data), f.runtime)).toEqual(first);
    expect(f.writes).toHaveLength(writes);
    await expect(workspaceCommandHandler(req('u', { ...data, name: 'changed' }), f.runtime)).rejects.toMatchObject({
      code: 'already-exists',
    });
  });
  it('converts private to shared in place when inviting, storing only the token hash', async () => {
    const f = fixture();
    const before = structuredClone(f.docs['spaces/s/debts/d']);
    const result = await workspaceCommandHandler(
      req('u', { action: 'invite', spaceId: 's', role: 'viewer' }),
      f.runtime,
    );
    expect(result.token).toBe(token);
    expect(f.docs['spaces/s']).toMatchObject({ spaceId: 's', mode: 'shared' });
    expect(f.docs[`spaceInvitations/${digest}`]).toMatchObject({
      role: 'viewer',
      status: 'pending',
      expiresAt: '2026-10-26T12:00:00.000Z',
    });
    expect(JSON.stringify(f.docs)).not.toContain(token);
    expect(f.docs['spaces/s/debts/d']).toEqual(before);
  });
  it('cannot convert to shared if the shared quota is already occupied', async () => {
    const f = fixture();
    for (const s of ['a', 'b']) f.docs[`spaces/${s}`] = { ownerUserId: 'u', mode: 'shared', status: 'active' };
    await expect(
      workspaceCommandHandler(req('u', { action: 'invite', spaceId: 's', role: 'editor' }), f.runtime),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(f.docs['spaces/s'].mode).toBe('private');
    expect(f.writes).toEqual([]);
  });
  it.each(['editor', 'viewer', 'manager', null])(
    'denies management to %s including forged role fields',
    async (access) => {
      const f = fixture(access);
      for (const data of [
        { action: 'rename', name: 'x' },
        { action: 'invite', role: 'editor' },
        { action: 'role', role: 'editor', userId: 'other' },
        { action: 'remove', userId: 'other' },
        { action: 'revoke', invitationId: digest },
      ])
        await expect(
          workspaceCommandHandler(req('u', { spaceId: 's', ...data, actorRole: 'owner' }), f.runtime),
        ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(f.writes).toEqual([]);
    },
  );
  it('never grants owner through invitations or role changes', async () => {
    const f = fixture();
    for (const action of ['invite', 'role'])
      await expect(
        workspaceCommandHandler(req('u', { action, spaceId: 's', role: 'owner', userId: 'other' }), f.runtime),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      workspaceCommandHandler(req('u', { action: 'remove', spaceId: 's', userId: 'u' }), f.runtime),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('allows exactly one authenticated account to consume a bearer invitation', async () => {
    const f = fixture();
    await workspaceCommandHandler(req('u', { action: 'invite', spaceId: 's', role: 'editor' }), f.runtime);
    const result = await Promise.allSettled(
      ['a', 'b'].map((uid) => workspaceCommandHandler(req(uid, { action: 'accept', token }), f.runtime)),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.docs[`spaceInvitations/${digest}`].status).toBe('accepted');
    const accepted = f.docs[`spaceInvitations/${digest}`].acceptedByUserId;
    expect(f.docs[`spaces/s/members/${accepted}`]).toMatchObject({ role: 'editor', status: 'active' });
    expect(f.docs[`users/${accepted}/memberships/s`]).toMatchObject({ role: 'editor', status: 'active' });
  });
  it('does not let a consumed invitation revive an removed member', async () => {
    const f = fixture();
    await workspaceCommandHandler(req('u', { action: 'invite', spaceId: 's', role: 'editor' }), f.runtime);
    await workspaceCommandHandler(req('a', { action: 'accept', token }), f.runtime);
    await workspaceCommandHandler(req('u', { action: 'remove', spaceId: 's', userId: 'a' }), f.runtime);
    const count = f.writes.length;
    await expect(workspaceCommandHandler(req('a', { action: 'accept', token }), f.runtime)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(f.docs['spaces/s/members/a'].status).toBe('suspended');
    expect(f.writes).toHaveLength(count);
  });
  it.each(['expired', 'revoked', 'suspended', 'owner-removed'])(
    'rejects %s invitation acceptance',
    async (scenario) => {
      const f = fixture();
      await workspaceCommandHandler(req('u', { action: 'invite', spaceId: 's', role: 'viewer' }), f.runtime);
      if (scenario === 'expired') f.docs[`spaceInvitations/${digest}`].expiresAt = workspaceTestTime;
      if (scenario === 'revoked')
        await workspaceCommandHandler(req('u', { action: 'revoke', spaceId: 's', invitationId: digest }), f.runtime);
      if (scenario === 'suspended') f.docs['spaces/s'].status = 'suspended';
      if (scenario === 'owner-removed') f.docs['spaces/s/members/u'].status = 'suspended';
      await expect(workspaceCommandHandler(req('a', { action: 'accept', token }), f.runtime)).rejects.toBeTruthy();
      expect(f.docs['spaces/s/members/a']).toBeUndefined();
    },
  );
  it('changes role and removes membership without modifying financial history', async () => {
    const f = fixture();
    f.docs['spaces/s/members/a'] = { userId: 'a', spaceId: 's', role: 'editor', status: 'active' };
    const debt = structuredClone(f.docs['spaces/s/debts/d']);
    await workspaceCommandHandler(req('u', { action: 'role', spaceId: 's', userId: 'a', role: 'viewer' }), f.runtime);
    expect(f.docs['spaces/s/members/a'].role).toBe('viewer');
    await workspaceCommandHandler(req('u', { action: 'remove', spaceId: 's', userId: 'a' }), f.runtime);
    expect(f.docs['spaces/s/members/a'].status).toBe('suspended');
    expect(f.docs['spaces/s/debts/d']).toEqual(debt);
  });
  it('returns quota metadata only to the canonical owner', async () => {
    const f = fixture();
    const result = await workspaceCommandHandler(req('u', { action: 'overview', spaceId: 's' }), f.runtime);
    expect(result.used).toEqual({ private: 1, shared: 0 });
    expect(result.limits).toEqual({ private: 1, shared: 2 });
    f.docs['spaces/s/members/u'].role = 'viewer';
    const viewer = await workspaceCommandHandler(req('u', { action: 'overview', spaceId: 's' }), f.runtime);
    expect(viewer.members).toBeUndefined();
    expect(viewer.limits).toBeUndefined();
  });
  it('rechecks canonical owner authorization after a transaction conflict', async () => {
    const f = fixture();
    f.retryOnce(() => {
      f.docs['spaces/s/members/u'].role = 'viewer';
    });
    await expect(
      workspaceCommandHandler(req('u', { action: 'rename', spaceId: 's', name: 'renamed' }), f.runtime),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
    expect(f.docs['spaces/s'].name).toBe('Shop');
  });
});
