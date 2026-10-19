import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  get: vi.fn(),
  user: vi.fn(),
  query: vi.fn(),
  listeners: [] as Array<{ next: (snapshot: any) => void; error: () => void; stop: ReturnType<typeof vi.fn> }>,
}));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: state.user,
  collection: vi.fn(),
  getDocs: state.query,
  getDocFromServer: state.get,
  onSnapshot: (_ref: unknown, _options: unknown, next: any, error: any) => {
    const stop = vi.fn();
    state.listeners.push({ next, error, stop });
    return stop;
  },
}));
import {
  loadWorkspaceSession,
  observeWorkspaceSession,
  validateUserSpaceMembership,
  listUserWorkspaces,
} from '@/services/firestore';
const space = { spaceId: 's', ownerUserId: 'u', status: 'active', mode: 'private', name: 'Shop' };
const member = { spaceId: 's', userId: 'u', role: 'owner', status: 'active' };
const snapshot = (value: any, cached = false, pending = false) => ({
  data: () => value,
  metadata: { fromCache: cached, hasPendingWrites: pending },
});
describe('canonical workspace session', () => {
  it('skips a revoked selection hint without treating network errors as missing membership', async () => {
    state.get.mockRejectedValueOnce({ code: 'permission-denied' });
    expect(await validateUserSpaceMembership('u', 'removed')).toBe(false);
    state.get.mockRejectedValueOnce({ code: 'unavailable' });
    await expect(validateUserSpaceMembership('u', 's')).rejects.toMatchObject({ code: 'unavailable' });
  });
  beforeEach(() => {
    state.listeners = [];
    state.get.mockReset();
    state.get.mockImplementation(async (ref) => snapshot(ref.path.endsWith('/members/u') ? member : space));
    state.user.mockResolvedValue({ exists: () => true, data: () => ({ primarySpaceId: 's' }) });
    state.query.mockReset();
    state.query.mockResolvedValue({ docs: [] });
  });
  it('requires canonical server reads, not a saved selector or discovery role', async () => {
    expect(await loadWorkspaceSession('u', 's')).toMatchObject({ space: { spaceId: 's' }, role: 'owner' });
    expect(state.get.mock.calls.map(([ref]) => ref.path).sort()).toEqual(['spaces/s', 'spaces/s/members/u']);
  });
  it('refreshes chooser names and roles and removes revoked discovery hints', async () => {
    state.query.mockResolvedValue({
      docs: ['s', 'removed'].map((spaceId) => ({
        data: () => ({ spaceId, role: 'viewer', status: 'active', spaceNameSnapshot: 'Old name' }),
      })),
    });
    state.get.mockImplementation(async (ref) => {
      if (ref.path.includes('/removed')) throw { code: 'permission-denied' };
      return snapshot(ref.path.endsWith('/members/u') ? member : space);
    });
    expect(await listUserWorkspaces('u')).toEqual([
      expect.objectContaining({ spaceId: 's', role: 'owner', spaceNameSnapshot: 'Shop' }),
    ]);
  });
  it('does not mislabel a failed network lookup as a removed workspace', async () => {
    state.query.mockResolvedValue({ docs: [{ data: () => ({ spaceId: 's', role: 'owner', status: 'active' }) }] });
    state.get.mockRejectedValue({ code: 'unavailable' });
    await expect(listUserWorkspaces('u')).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('bounds chooser validation to four workspaces concurrently, without financial queries', async () => {
    state.query.mockResolvedValue({
      docs: Array.from({ length: 10 }, (_, i) => ({
        data: () => ({ spaceId: `s${i}`, role: 'editor', status: 'active' }),
      })),
    });
    let active = 0;
    let maximum = 0;
    state.get.mockImplementation(async (ref) => {
      active++;
      maximum = Math.max(active, maximum);
      await Promise.resolve();
      active--;
      const spaceId = ref.path.split('/')[1];
      return snapshot(
        ref.path.endsWith('/members/u') ? { ...member, spaceId, role: 'editor' } : { ...space, spaceId, name: spaceId },
      );
    });
    expect(await listUserWorkspaces('u')).toHaveLength(10);
    expect(maximum).toBeLessThanOrEqual(8);
    expect(state.get.mock.calls.every(([ref]) => /^spaces\/[^/]+(?:\/members\/u)?$/.test(ref.path))).toBe(true);
  });
  it.each([
    { role: 'manager' },
    { role: undefined },
    { status: 'suspended' },
    { userId: 'other' },
    { spaceId: 'other' },
  ])('rejects invalid canonical membership %j', async (changed) => {
    state.get.mockImplementation(async (ref) =>
      snapshot(ref.path.endsWith('/members/u') ? { ...member, ...changed } : space),
    );
    await expect(loadWorkspaceSession('u', 's')).rejects.toThrow('activeWorkspaceMembershipMissing');
  });
  it('rejects a mismatched canonical owner and an inactive space', async () => {
    for (const changed of [{ ownerUserId: 'other' }, { status: 'archived' }]) {
      state.get.mockImplementation(async (ref) =>
        snapshot(ref.path.endsWith('/members/u') ? member : { ...space, ...changed }),
      );
      await expect(loadWorkspaceSession('u', 's')).rejects.toThrow('activeWorkspaceMembershipMissing');
    }
  });
  it('does not hide connection errors behind cached membership', async () => {
    state.get.mockRejectedValue(new Error('unavailable'));
    await expect(loadWorkspaceSession('u', 's')).rejects.toThrow('unavailable');
  });
  it('observes downgrade and revocation with two scoped listeners', () => {
    const onValue = vi.fn();
    observeWorkspaceSession('u', 's', onValue);
    expect(state.listeners).toHaveLength(2);
    state.listeners[0].next(snapshot(space, true));
    state.listeners[1].next(snapshot(member, true));
    expect(onValue).not.toHaveBeenCalled();
    state.listeners[0].next(snapshot(space));
    state.listeners[1].next(snapshot(member));
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'owner' }));
    state.listeners[1].next(snapshot({ ...member, role: 'viewer' }));
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'viewer' }));
    state.listeners[1].next(snapshot(undefined));
    expect(onValue).toHaveBeenLastCalledWith(null);
  });
  it('revokes a previously verified session when listeners become cached or pending', () => {
    const value = vi.fn();
    observeWorkspaceSession('u', 's', value);
    state.listeners[0].next(snapshot(space));
    state.listeners[1].next(snapshot(member));
    state.listeners[1].next(snapshot(member, true));
    expect(value).toHaveBeenLastCalledWith(null);
    state.listeners[1].next(snapshot(member, false, true));
    expect(value).toHaveBeenLastCalledWith(null);
    state.listeners[1].next(snapshot(member));
    expect(value).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'owner' }));
    state.listeners[0].error();
    expect(value).toHaveBeenLastCalledWith(null);
  });
  it('unsubscribes both listeners and ignores late snapshots after a switch', () => {
    const value = vi.fn();
    const stop = observeWorkspaceSession('u', 's', value);
    stop();
    expect(state.listeners.every((listener) => listener.stop.mock.calls.length === 1)).toBe(true);
    state.listeners[0].next(snapshot(space));
    state.listeners[1].next(snapshot(member));
    state.listeners[0].error();
    expect(value).not.toHaveBeenCalled();
  });
});
