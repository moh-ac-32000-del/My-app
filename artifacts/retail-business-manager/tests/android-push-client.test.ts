import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(),
  permission: vi.fn(), request: vi.fn(), token: vi.fn(), unregister: vi.fn(), channel: vi.fn(), call: vi.fn(),
  auth: { currentUser: { uid: 'u' } as { uid: string } | null },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: mocks.getItem, setItem: mocks.setItem, removeItem: mocks.removeItem } }));
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: mocks.permission, requestPermissionsAsync: mocks.request, getDevicePushTokenAsync: mocks.token,
  unregisterForNotificationsAsync: mocks.unregister, setNotificationChannelAsync: mocks.channel,
  AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock('expo-constants', () => ({ default: { executionEnvironment: 'standalone' } }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => mocks.call }));
vi.mock('@/services/firebase', () => ({ getFirebaseApp: () => ({}), getFirebaseAuth: () => mocks.auth }));
const scope = { uid: 'u', spaceId: 's', storeId: 'store', language: 'ar' as const };
const saved = JSON.stringify({ ...scope, token: 'test-device-token' });

describe('Android Push client lifecycle with mocked native APIs (not a device test)', () => {
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks(); mocks.auth.currentUser = { uid: 'u' };
    mocks.getItem.mockResolvedValue(null); mocks.setItem.mockResolvedValue(undefined); mocks.removeItem.mockResolvedValue(undefined);
    mocks.permission.mockResolvedValue({ granted: true }); mocks.request.mockResolvedValue({ granted: true });
    mocks.token.mockResolvedValue({ data: 'test-device-token' }); mocks.unregister.mockResolvedValue(undefined); mocks.channel.mockResolvedValue(undefined);
    mocks.call.mockImplementation(async (input) => ({ data: { enabled: input.action !== 'disable', ...(input.action === 'test' ? { accepted: true } : {}) } }));
  });
  it('requests permission only on explicit connect and never registers after denial', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.permission.mockResolvedValue({ granted: false }); mocks.request.mockResolvedValue({ granted: false });
    await expect(client.androidPushConnected(scope)).resolves.toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
    await expect(client.connectAndroidPush(scope)).rejects.toThrow('pushPermissionDenied');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it.each(['channel', 'permission', 'token'] as const)('identifies a native %s failure before any server registration', async native => {
    const client = await import('@/services/androidPush.android');
    const { androidPushFailure } = await import('@/data/androidPushFailure');
    mocks[native].mockRejectedValueOnce(new Error('native failure'));
    try { await client.connectAndroidPush(scope); throw new Error('unexpected success'); }
    catch (error) { expect(androidPushFailure(error)).toBe(native === 'permission' ? 'permissionCheck' : native); }
    expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.setItem).not.toHaveBeenCalled();
  });
  it('reports registration rejection without saving connection metadata', async () => {
    const client = await import('@/services/androidPush.android');
    const { androidPushFailure } = await import('@/data/androidPushFailure');
    mocks.call.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 'functions/unauthenticated' }));
    await expect(client.connectAndroidPush(scope).catch(error => androidPushFailure(error))).resolves.toBe('session');
    expect(mocks.setItem).not.toHaveBeenCalled();
  });
  it('hands off the reminder time without silently keeping a different server schedule', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.getItem.mockImplementation(async (key: string) => key.includes('/notification-time') ? '10:45' : null);
    await client.connectAndroidPush(scope);
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ action: 'register', scheduledVersion: 1, reminderTime: '10:45' }));
  });
  it('syncs reminder-time changes only to the connected scope, before local success', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    await client.syncAndroidReminderTime(scope, '10:30');
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ action: 'preferences', reminderTime: '10:30' }));
    mocks.call.mockRejectedValueOnce(new Error('offline'));
    await expect(client.syncAndroidReminderTime(scope, '11:00')).rejects.toThrow('offline');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rotates a matching native token without permission prompts and ignores another scope', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    await client.refreshAndroidPushToken({ ...scope, spaceId: 'other' }, 'new-token');
    expect(mocks.call).not.toHaveBeenCalled();
    await client.refreshAndroidPushToken(scope, 'new-token');
    expect(mocks.call.mock.calls.map(([request]) => request.action)).toEqual(['disable', 'register']);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('does not claim automatic delivery from an old server or a connection-test-only registration', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    expect(await client.androidPushDeliveryState(scope)).toEqual({ connected: true, scheduled: false, problem: false });
  });
  it('registers an FCM token with an explicit actor and scope, then sends only an explicit test', async () => {
    const client = await import('@/services/androidPush.android');
    await client.connectAndroidPush(scope);
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ action: 'register', actorUid: 'u', spaceId: 's', storeId: 'store' }));
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(mocks.call.mock.calls[0][0].followUp).toEqual({ time: '17:00', overdueEnabled: true, pendingEnabled: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    await client.testAndroidPush(scope);
    expect(mocks.call).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'test' }));
  });
  it('registers the stored scoped settings instead of silently resetting to 17:00', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.getItem.mockImplementation(async (key: string) => key.includes('/follow-up/') ? JSON.stringify({ time: '18:30', overdueEnabled: false, pendingEnabled: true }) : null);
    await client.connectAndroidPush(scope);
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ followUp: expect.objectContaining({ time: '18:30', overdueEnabled: false }) }));
  });
  it('does not report a connection when reading local settings fails', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.getItem.mockImplementation(async (key: string) => { if (key.includes('/follow-up/')) throw new Error('storage failed'); return null; });
    await expect(client.connectAndroidPush(scope)).rejects.toThrow('storage failed');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('syncs settings for the connected device without re-registering or requesting permissions', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    const preferences = { time: '16:45', overdueEnabled: true, pendingEnabled: false };
    await client.syncAndroidFollowUp(scope, preferences);
    expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ action: 'preferences', actorUid: 'u', followUp: { ...preferences, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }));
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled();
  });
  it('does not opt in an unconnected device or overwrite a different workspace', async () => {
    const client = await import('@/services/androidPush.android');
    const preferences = { time: '17:00', overdueEnabled: true, pendingEnabled: true };
    await client.syncAndroidFollowUp(scope, preferences);
    mocks.getItem.mockResolvedValue(saved);
    await client.syncAndroidFollowUp({ ...scope, spaceId: 'other' }, preferences);
    expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it('surfaces offline and changed-account sync errors instead of claiming success', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    const preferences = { time: '17:00', overdueEnabled: false, pendingEnabled: false };
    mocks.call.mockRejectedValueOnce(new Error('offline'));
    await expect(client.syncAndroidFollowUp(scope, preferences)).rejects.toThrow('offline');
    mocks.auth.currentUser = { uid: 'other' };
    await expect(client.syncAndroidFollowUp(scope, preferences)).rejects.toThrow('pushAccountChanged');
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it('compensates a cloud registration when local persistence fails', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.setItem.mockRejectedValueOnce(new Error('storage failed'));
    await expect(client.connectAndroidPush(scope)).rejects.toThrow('storage failed');
    expect(mocks.call).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'disable' }));
    expect(mocks.unregister).toHaveBeenCalledOnce();
  });
  it('invalidates the native token even if cloud disconnection fails', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved); mocks.call.mockRejectedValueOnce(new Error('offline'));
    await expect(client.disconnectAndroidPush()).resolves.toBeUndefined();
    expect(mocks.unregister).toHaveBeenCalledOnce(); expect(mocks.removeItem).toHaveBeenCalledOnce();
  });
  it('preserves retry metadata and refuses unsafe sign-out when both disconnection paths fail', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    mocks.call.mockRejectedValueOnce(new Error('offline')); mocks.unregister.mockRejectedValueOnce(new Error('offline'));
    await expect(client.disconnectAndroidPush()).rejects.toThrow('pushDisconnectFailed');
    expect(mocks.removeItem).not.toHaveBeenCalled();
  });
  it('can disconnect a native token when local storage cannot be read', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockRejectedValueOnce(new Error('storage failed'));
    await expect(client.disconnectAndroidPush()).resolves.toBeUndefined();
    expect(mocks.unregister).toHaveBeenCalledOnce();
  });
  it('never tests a stale account or workspace registration', async () => {
    const client = await import('@/services/androidPush.android'); mocks.getItem.mockResolvedValue(saved);
    await expect(client.testAndroidPush({ ...scope, spaceId: 'other' })).rejects.toThrow('pushNotConnected');
    mocks.auth.currentUser = { uid: 'other' };
    await expect(client.testAndroidPush(scope)).rejects.toThrow('pushAccountChanged');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('invalidates a late registration if sign-out wins the race', async () => {
    const client = await import('@/services/androidPush.android');
    mocks.call.mockImplementationOnce(async () => { mocks.auth.currentUser = null; return { data: { enabled: true } }; });
    await expect(client.connectAndroidPush(scope)).rejects.toThrow('pushAccountChanged');
    expect(mocks.unregister).toHaveBeenCalledOnce();
    expect(mocks.setItem).not.toHaveBeenCalled();
  });
});
