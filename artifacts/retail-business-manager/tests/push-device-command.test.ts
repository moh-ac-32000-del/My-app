import { describe, expect, it, vi } from 'vitest';
import { pushDeviceCommandHandler, pushDeviceId } from '@/functions/src/pushDeviceCommand';

const token = 'fcm-test-token-abcdefghijklmnopqrstuvwxyz0123456789';
const path = `pushDevices/${pushDeviceId(token)}`;
const followUp = { time: '17:00', overdueEnabled: true, pendingEnabled: true, timeZone: 'Asia/Riyadh' };
type Doc = Record<string, any>;
function fixture(extra: Record<string, Doc> = {}) {
  const docs: Record<string, Doc> = {
    'spaces/s': { status: 'active' }, 'spaces/s/members/u': { status: 'active', role: 'owner' }, 'spaces/s/storeProfile/profile': { storeId: 'store' }, ...extra,
  };
  const writes: string[] = [];
  const ref = (name: string): any => ({ path: name, collection: (part: string) => ({ doc: (id: string) => ref(`${name}/${part}/${id}`) }) });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: any) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (r: any) => ({ exists: !!docs[r.path], data: () => docs[r.path] }),
        set: (r: any, data: Doc) => pending.push(() => { writes.push(r.path); docs[r.path] = data; }),
        update: (r: any, data: Doc) => pending.push(() => { writes.push(r.path); docs[r.path] = { ...docs[r.path], ...data }; }),
      });
      pending.forEach((write) => write()); return result;
    },
  };
  let now = Date.parse('2026-10-18T12:00:00Z');
  const send = vi.fn().mockResolvedValue('provider-message-id');
  return { docs, writes, send, advance: (ms: number) => { now += ms; }, runtime: { firestore: db as never, messaging: { send }, now: () => now } };
}
const request = (action: string, changes: Doc = {}) => ({ auth: { uid: 'u' }, data: { action, actorUid: 'u', spaceId: 's', storeId: 'store', token, language: 'ar', ...changes } });
const call = (f: ReturnType<typeof fixture>, action: string, changes: Doc = {}) => pushDeviceCommandHandler(request(action, changes) as never, f.runtime);

describe('authenticated Android Push registration and bounded test sending', () => {
  it('requires an explicit versioned reconnect to enroll scheduled delivery; preferences do not enroll old devices', async () => {
    const f = fixture();
    await call(f, 'register', { followUp });
    await call(f, 'preferences', { followUp, scheduledVersion: 1, reminderTime: '08:30' });
    expect(f.docs[path]).not.toHaveProperty('scheduledVersion');
    await expect(call(f, 'register', { followUp, scheduledVersion: 1 })).rejects.toMatchObject({ code: 'invalid-argument' });
    await call(f, 'register', { followUp, scheduledVersion: 1, reminderTime: '08:30' });
    expect(f.docs[path]).toMatchObject({ scheduledVersion: 1, reminderTime: '08:30', dispatchFailures: 0 });
    expect(f.docs[path].dispatchRevision).toMatch(/^[a-f0-9-]{36}$/);
    expect(await call(f, 'status', { scheduledVersion: 1 })).toMatchObject({ enabled: true, scheduledEnabled: false });
    Object.assign(f.runtime, { notificationDispatchReady: true });
    expect(await call(f, 'status', { scheduledVersion: 1 })).toMatchObject({ scheduledEnabled: true });
    const before = f.docs[path].dispatchRevision;
    await call(f, 'preferences', { followUp, scheduledVersion: 1, reminderTime: '10:45' });
    expect(f.docs[path].reminderTime).toBe('10:45');
    expect(f.docs[path].dispatchRevision).not.toBe(before);
    await call(f, 'register', { followUp });
    expect(f.docs[path]).not.toHaveProperty('scheduledVersion');
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each([{ scheduledVersion: 2 }, { scheduledVersion: 1, reminderTime: '24:00' }, { scheduledVersion: 1, reminderTime: '09:00', followUp: undefined }])('rejects malformed scheduled opt-in %j', async changes => {
    await expect(call(fixture(), 'register', { followUp, ...changes })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('reports paused/failed or stale ambiguous delivery state without exposing receipts or tokens', async () => {
    const f = fixture(); await call(f, 'register', { followUp, scheduledVersion: 1, reminderTime: '09:00' });
    f.docs[path].dispatchLastAttemptState = 'attempting';
    f.docs[path].dispatchLastAttemptAt = new Date(f.runtime.now() - 180_000).toISOString();
    expect(await call(f, 'status', { scheduledVersion: 1 })).toEqual({ enabled: true, scheduledEnabled: false, dispatchProblem: true });
  });
  it.each([
    null, {}, { ...followUp, time: '24:00' }, { ...followUp, time: '9:00' }, { ...followUp, time: '17:60' },
    { ...followUp, overdueEnabled: 'true' }, { ...followUp, pendingEnabled: 1 },
    { ...followUp, timeZone: 'Invalid/Zone' }, { ...followUp, timeZone: ' Asia/Riyadh' },
  ])('rejects malformed follow-up settings without writes: %j', async (value) => {
    const f = fixture();
    await expect(call(f, 'register', { followUp: value })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(f.writes).toEqual([]); expect(f.send).not.toHaveBeenCalled();
  });
  it('requires settings for the preferences action and refuses unconnected/disabled devices', async () => {
    const f = fixture();
    await expect(call(f, 'preferences')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(f, 'preferences', { followUp })).rejects.toMatchObject({ code: 'failed-precondition' });
    await call(f, 'register', { followUp }); await call(f, 'disable');
    await expect(call(f, 'preferences', { followUp })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.docs[path]).not.toHaveProperty('followUp');
  });
  it('saves settings only for the active device scope, allowlisting fields and preserving test limits', async () => {
    const f = fixture(); await call(f, 'register', { followUp }); await call(f, 'test');
    const changed = { ...followUp, time: '18:30', overdueEnabled: false, timeZone: 'Europe/Istanbul' };
    await call(f, 'preferences', { followUp: { ...changed, uid: 'attacker', enabled: false, nextSendAt: 0 } });
    expect(f.docs[path]).toMatchObject({ uid: 'u', enabled: true, followUp: changed, testCount: 1 });
    expect(f.docs[path].followUp).toEqual(changed);
    expect(f.send).toHaveBeenCalledOnce(); // Only the explicit connection test.
    expect(f.writes.every((key) => key.startsWith('pushDevices/'))).toBe(true);
  });
  it('preserves settings for legacy reconnects but never leaks them to a new owner/scope', async () => {
    const f = fixture(); await call(f, 'register', { followUp });
    await call(f, 'register'); expect(f.docs[path].followUp).toEqual(followUp);
    f.docs[path].uid = 'other';
    await expect(call(f, 'preferences', { followUp })).rejects.toMatchObject({ code: 'failed-precondition' });
    await call(f, 'register'); expect(f.docs[path]).not.toHaveProperty('followUp');
    await call(f, 'register', { followUp }); f.docs[path].storeId = 'other';
    await expect(call(f, 'preferences', { followUp })).rejects.toMatchObject({ code: 'failed-precondition' });
    await call(f, 'register'); expect(f.docs[path]).not.toHaveProperty('followUp');
  });
  it('rejects preference updates after revoked membership', async () => {
    const f = fixture(); await call(f, 'register', { followUp }); f.docs['spaces/s/members/u'].status = 'inactive';
    await expect(call(f, 'preferences', { followUp: { ...followUp, time: '18:00' } })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.docs[path].followUp).toEqual(followUp);
  });
  it('requires authentication and rejects stale account requests before Firestore', async () => {
    const f = fixture();
    await expect(pushDeviceCommandHandler({ data: request('register').data } as never, f.runtime)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call(f, 'register', { actorUid: 'other' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it.each([{ token: '' }, { token: 'invalid token' }, { spaceId: 's/other' }, { storeId: '' }, { language: 'xx' }, { action: 'broadcast' }])('rejects invalid registration %j', async (changes) => {
    await expect(call(fixture(), 'register', changes)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it.each([
    { 'spaces/s': { status: 'inactive' } },
    { 'spaces/s/members/u': { status: 'inactive' } },
    { 'spaces/s/storeProfile/profile': { storeId: 'other' } },
  ] as Record<string, Doc>[])('requires an active matching workspace for registration', async (changes) => {
    const f = fixture(changes);
    await expect(call(f, 'register')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.writes).toEqual([]);
  });
  it('registers idempotently without sending, exposing tokens, or writing financial data', async () => {
    const f = fixture();
    expect(await call(f, 'register')).toEqual({ enabled: true });
    expect(await call(f, 'register')).toEqual({ enabled: true });
    expect(f.docs[path]).toMatchObject({ uid: 'u', enabled: true, spaceId: 's', storeId: 'store' });
    expect(f.writes.every((key) => key.startsWith('pushDevices/'))).toBe(true);
    expect(f.send).not.toHaveBeenCalled();
    expect(pushDeviceId(token)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('does not report another account or store as connected', async () => {
    const f = fixture({ [path]: { uid: 'other', enabled: true, spaceId: 's', storeId: 'store' } });
    expect(await call(f, 'status')).toEqual({ enabled: false });
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('sends only a generic scoped test and distinguishes acceptance from delivery', async () => {
    const f = fixture(); await call(f, 'register');
    expect(await call(f, 'test')).toEqual({ enabled: true, accepted: true });
    expect(f.send).toHaveBeenCalledOnce();
    const message = f.send.mock.calls[0][0];
    expect(message.data).toEqual({ uid: 'u', spaceId: 's', storeId: 'store', route: '/notifications', kind: 'connection-test' });
    expect(message.notification).not.toHaveProperty('amount');
    expect(message.android.ttl).toBe(60_000);
  });
  it('enforces cooldown and five attempts per UTC day even after disable/re-register', async () => {
    const f = fixture(); await call(f, 'register'); await call(f, 'test');
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'resource-exhausted' });
    for (let i = 1; i < 5; i += 1) { f.advance(61_000); await call(f, 'test'); }
    await call(f, 'disable'); await call(f, 'register'); f.advance(61_000);
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(f.send).toHaveBeenCalledTimes(5);
    f.advance(24 * 60 * 60_000); await call(f, 'test');
    expect(f.send).toHaveBeenCalledTimes(6);
  });
  it('allows the owner to disable after revoked membership and removes the stored token', async () => {
    const f = fixture(); await call(f, 'register'); f.docs['spaces/s/members/u'].status = 'inactive';
    expect(await call(f, 'disable')).toEqual({ enabled: false });
    expect(f.docs[path]).not.toHaveProperty('token');
    expect(await call(f, 'disable')).toEqual({ enabled: false });
  });
  it('cannot disable another owner and refuses tests after membership revocation', async () => {
    const f = fixture({ [path]: { uid: 'other', token, enabled: true } });
    await call(f, 'disable'); expect(f.docs[path].enabled).toBe(true); expect(f.writes).toEqual([]);
    await call(f, 'register'); f.docs['spaces/s/members/u'].status = 'inactive';
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('does not retry provider errors or leak provider details', async () => {
    const f = fixture(); await call(f, 'register'); f.send.mockRejectedValueOnce(new Error(`secret ${token}`));
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'unavailable', message: 'Push provider did not accept the connection test' });
    expect(f.send).toHaveBeenCalledOnce();
    await expect(call(f, 'test')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
