import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { workspaceCommandHandler } from '@/functions/src/workspaceCommand';
import { workspaceBackend } from './fixtures/workspaceBackend';
import { memberColor, memberDisplayName } from '@/data/memberIdentity';
import { projectArchiveSnapshot } from '@/functions/src/dailyArchiveCommand';
const request = (uid: string | null, data: Record<string, unknown>) =>
  ({ auth: uid ? { uid, token: { email: 'private@example.test', name: 'Global name' } } : null, data }) as never;
const setName = (name: unknown, extra = {}) => ({ action: 'setMemberName', spaceId: 's', displayName: name, ...extra });

describe('per-workspace member identity (metadata, never authorization)', () => {
  it('preserves only existing author UIDs in future archive projections without changing finance', async () => {
    const f = workspaceBackend();
    const before = structuredClone(f.docs);
    const snapshot = (id: string, data: Record<string, any>) => ({ docs: [{ id, data: () => data }] });
    const empty = { docs: [] };
    const now = '2026-10-19T12:00:00.000Z';
    const events = await f.runtime.firestore.runTransaction((tx: any) => projectArchiveSnapshot(tx,
      f.runtime.firestore.collection('spaces').doc('s'), { spaceId: 's', storeId: 'store' },
      snapshot('cash', { id: 'cash', storeId: 'store', type: 'cash_in', amount: 10, currency: 'TRY', createdAt: now, createdByUserId: 'cash-user' }),
      snapshot('debt', { id: 'debt', storeId: 'store', amount: 20, currency: 'TRY', customerId: 'c', createdAt: now, createdByUserId: 'debt-user' }),
      snapshot('payment', { storeId: 'store', direction: 'in', amount: { amount: 5, currency: 'TRY' }, customerId: 'c', paidAt: now, createdByUserId: 'pay-user' }),
      empty, empty));
    expect(events.map((event: any) => [event.sourceId, event.amount, event.createdByUserId]).sort()).toEqual([
      ['cash', 10, 'cash-user'], ['debt', 20, 'debt-user'], ['payment', 5, 'pay-user'],
    ]);
    expect(f.docs).toEqual(before); expect(f.writes).toEqual([]);
  });
  it('does not replace a confirmed name when a former member accepts a new invitation', async () => {
    const f = workspaceBackend(); f.docs['spaces/s'].mode = 'shared';
    const token = 'c'.repeat(64);
    const invite = `spaceInvitations/${createHash('sha256').update(token).digest('hex')}`;
    f.docs[invite] = { status: 'pending', expiresAt: '2027-01-01T00:00:00.000Z', spaceId: 's', role: 'viewer', invitedByUserId: 'u' };
    f.docs['spaces/s/members/returning'] = { displayName: 'Original', identityVersion: 1, role: 'editor', status: 'suspended' };
    await expect(workspaceCommandHandler(request('returning', { action: 'accept', token, displayName: 'Other' }), f.runtime)).rejects.toMatchObject({ code: 'already-exists' });
    expect(f.writes).toEqual([]);
    await workspaceCommandHandler(request('returning', { action: 'accept', token }), f.runtime);
    expect(f.docs['spaces/s/members/returning']).toMatchObject({ displayName: 'Original', identityVersion: 1, role: 'viewer' });
  });
  it.each(['owner', 'editor', 'viewer'])(
    'allows %s to name self only, without changing roles or finance',
    async (role) => {
      const f = workspaceBackend(role);
      const before = structuredClone(f.docs);
      await workspaceCommandHandler(
        request('u', setName('  أحمد  علي ', { userId: 'someone-else', role: 'owner' })),
        f.runtime,
      );
      expect(f.docs['spaces/s/members/u']).toMatchObject({ displayName: 'أحمد علي', identityVersion: 1, role });
      expect(f.writes).toEqual(['spaces/s/members/u']);
      for (const path of Object.keys(before).filter((path) => path !== 'spaces/s/members/u'))
        expect(f.docs[path]).toEqual(before[path]);
      const count = f.writes.length;
      await workspaceCommandHandler(request('u', setName('أحمد علي')), f.runtime);
      expect(f.writes).toHaveLength(count);
      await expect(workspaceCommandHandler(request('u', setName('Different')), f.runtime)).rejects.toMatchObject({
        code: 'already-exists',
      });
    },
  );
  it('keeps the same account names isolated between spaces and ignores Auth name/email', async () => {
    const f = workspaceBackend('viewer');
    f.docs['spaces/other'] = { spaceId: 'other', status: 'active', ownerUserId: 'owner' };
    f.docs['spaces/other/members/u'] = { userId: 'u', status: 'active', role: 'viewer' };
    await workspaceCommandHandler(request('u', setName('أحمد')), f.runtime);
    await workspaceCommandHandler(request('u', setName('Ahmet', { spaceId: 'other' })), f.runtime);
    const first = await workspaceCommandHandler(request('u', { action: 'memberNames', spaceId: 's' }), f.runtime);
    const second = await workspaceCommandHandler(request('u', { action: 'memberNames', spaceId: 'other' }), f.runtime);
    expect(first.members).toEqual([{ userId: 'u', displayName: 'أحمد' }]);
    expect(second.members).toEqual([{ userId: 'u', displayName: 'Ahmet' }]);
  });
  it('keeps former-member names available for history without exposing emails, roles or invitations', async () => {
    const f = workspaceBackend('viewer');
    f.docs['spaces/s/members/former'] = {
      identityVersion: 1,
      displayName: 'Former',
      role: 'editor',
      status: 'removed',
      email: 'secret@example.test',
    };
    f.docs['spaces/s/members/legacy'] = { displayName: 'legacy@example.test', status: 'active', role: 'viewer' };
    const result = await workspaceCommandHandler(request('u', { action: 'memberNames', spaceId: 's' }), f.runtime);
    expect(result.members).toContainEqual({ userId: 'former', displayName: 'Former' });
    expect(result.members).toContainEqual({ userId: 'legacy', displayName: null });
    expect(JSON.stringify(result)).not.toMatch(/@|editor|removed|invitation/);
    expect(f.writes).toEqual([]);
  });
  it.each([null, 'removed', 'manager'])(
    'denies directory and name writes to unauthorized membership %s',
    async (role) => {
      const f = workspaceBackend(role);
      if (role === 'removed') f.docs['spaces/s/members/u'].status = 'removed';
      for (const data of [setName('Name'), { action: 'memberNames', spaceId: 's' }])
        await expect(workspaceCommandHandler(request('u', data), f.runtime)).rejects.toMatchObject({
          code: 'permission-denied',
        });
      expect(f.writes).toEqual([]);
    },
  );
  it('requires authentication, canonical space access and rechecks membership on transaction retry', async () => {
    const f = workspaceBackend('editor');
    await expect(workspaceCommandHandler(request(null, setName('Name')), f.runtime)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(workspaceCommandHandler(request('outsider', setName('Name')), f.runtime)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    f.retryOnce(() => {
      f.docs['spaces/s/members/u'].status = 'removed';
    });
    await expect(workspaceCommandHandler(request('u', setName('Name')), f.runtime)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(f.writes).toEqual([]);
  });
  it.each(['', '   ', 'a'.repeat(41), 'name\nspoof', 'name\u202E', 12, null])(
    'rejects invalid name %j atomically',
    async (name) => {
      const f = workspaceBackend();
      await expect(workspaceCommandHandler(request('u', setName(name)), f.runtime)).rejects.toMatchObject({
        code: 'invalid-argument',
      });
      expect(f.writes).toEqual([]);
    },
  );
  it('preserves creation idempotency including changed-name rejection', async () => {
    const f = workspaceBackend();
    f.docs['spaces/s'].mode = 'private';
    const data = { action: 'create', name: 'Shared', mode: 'shared', operationId: 'new', displayName: 'Owner' };
    const first = await workspaceCommandHandler(request('u', data), f.runtime);
    const count = f.writes.length;
    expect(await workspaceCommandHandler(request('u', data), f.runtime)).toEqual(first);
    expect(f.writes).toHaveLength(count);
    await expect(
      workspaceCommandHandler(request('u', { ...data, displayName: 'Other' }), f.runtime),
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(f.docs[`spaces/${first.spaceId}/members/u`]).toMatchObject({ displayName: 'Owner', identityVersion: 1 });
  });
  it('assigns a joining member only their submitted space-specific name', async () => {
    const f = workspaceBackend();
    f.docs['spaces/s'].mode = 'shared';
    const token = 'a'.repeat(64);
    f.docs[`spaceInvitations/${createHash('sha256').update(token).digest('hex')}`] = {
      status: 'pending',
      expiresAt: '2027-01-01T00:00:00.000Z',
      spaceId: 's',
      role: 'viewer',
      invitedByUserId: 'u',
    };
    await workspaceCommandHandler(request('joiner', { action: 'accept', token, displayName: 'Ayşe' }), f.runtime);
    expect(f.docs['spaces/s/members/joiner']).toMatchObject({
      displayName: 'Ayşe',
      identityVersion: 1,
      role: 'viewer',
    });
  });
  it('bounds the directory rather than silently hiding historical attribution', async () => {
    const f = workspaceBackend();
    for (let i = 0; i < 500; i++) f.docs[`spaces/s/members/member${i}`] = {};
    await expect(
      workspaceCommandHandler(request('u', { action: 'memberNames', spaceId: 's' }), f.runtime),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(f.writes).toEqual([]);
  });
  it('normalizes supported scripts and derives stable account/space-based colors, not name-based identity', () => {
    for (const name of ['محمد', 'Ayşe', 'John']) expect(memberDisplayName(name)).toBe(name);
    expect(memberColor('s', 'u')).toBe(memberColor('s', 'u'));
    expect(memberColor('s', 'u')).not.toBe(memberColor('other', 'u'));
    expect(memberColor('s', 'u')).not.toBe(memberColor('s', 'v'));
  });
});
