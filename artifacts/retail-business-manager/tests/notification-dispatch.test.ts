import { describe, expect, it, vi } from 'vitest';
import { workspaceBackend } from './fixtures/workspaceBackend';
import {
  claimNotificationDevice,
  deliverNotificationClaim,
  dispatchNotifications,
  wakeNotificationSpace,
  wakeNotificationEvent,
} from '@/functions/src/notificationDispatch';
import { planNotifications } from '@/functions/src/notificationPlan';

const revision = '00000000-0000-0000-0000-000000000001';
function fixture(role = 'owner') {
  const f = workspaceBackend(role);
  let now = '2026-10-21T14:00:01.000Z';
  const device = {
    uid: 'u',
    spaceId: 's',
    storeId: 'store',
    enabled: true,
    scheduledVersion: 1,
    token: 'synthetic-token-never-log',
    language: 'ar',
    reminderTime: '09:00',
    dispatchRevision: revision,
    nextDispatchAt: now,
    followUp: { time: '17:00', overdueEnabled: true, pendingEnabled: true, timeZone: 'Europe/Istanbul' },
  };
  f.docs['pushDevices/device'] = structuredClone(device);
  const send = vi.fn().mockResolvedValue('synthetic-provider-acceptance');
  const runtime = { firestore: f.db as never, now: () => now, messaging: { send } };
  return {
    ...f,
    runtime,
    send,
    device: f.docs['pushDevices/device'],
    advance: (minutes: number) => {
      now = new Date(Date.parse(now) + minutes * 60_000).toISOString();
    },
  };
}
const receipts = (f: ReturnType<typeof fixture>) =>
  Object.entries(f.docs)
    .filter(([path]) => path.startsWith('pushDeliveryReceipts/'))
    .map(([, row]) => row);
const business = (f: ReturnType<typeof fixture>) =>
  structuredClone(Object.fromEntries(Object.entries(f.docs).filter(([path]) => path.startsWith('spaces/'))));

describe('bounded opted-in member dispatch (controlled provider, not physical delivery)', () => {
  it('expires old source events without reads, and allows fresh coalesced wakeups', async () => {
    const f = fixture();
    f.device.nextDispatchAt = '2026-10-22T14:00:00.000Z';
    const reads = f.reads.length;
    expect(await wakeNotificationEvent(f.runtime, 's', '2026-10-21T13:00:00.000Z')).toBe('expired');
    expect(f.reads).toHaveLength(reads);
    expect(await wakeNotificationEvent(f.runtime, 's', f.runtime.now())).toBe('queued');
    expect(f.docs['pushDevices/device'].nextDispatchAt).toBe(f.runtime.now());
  });
  it('does not overwrite an in-flight claim when source changes wake the queue', async () => {
    const f = fixture();
    const claim = (await claimNotificationDevice(f.runtime, 'device'))!;
    f.docs['spaces/s/debts/new'] = { ...f.docs['spaces/s/debts/d'], id: 'new' };
    await wakeNotificationSpace(f.runtime, 's');
    expect(await claimNotificationDevice(f.runtime, 'device')).toBeNull();
    await deliverNotificationClaim(f.runtime, claim);
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(receipts(f).filter((row) => row.key === 'due:new:2026-10-20')).toHaveLength(1);
  });
  it('does not disable a newly rebound device after an older send fails', async () => {
    const f = fixture();
    f.send.mockImplementationOnce(async () => {
      f.docs['pushDevices/device'] = {
        ...f.device,
        uid: 'new-owner',
        token: 'different-token',
        dispatchRevision: '00000000-0000-0000-0000-000000000002',
      };
      throw { code: 'messaging/registration-token-not-registered' };
    });
    await dispatchNotifications(f.runtime);
    expect(f.docs['pushDevices/device']).toMatchObject({ uid: 'new-owner', token: 'different-token', enabled: true });
  });
  it('rejects an oversized active source rather than silently sending a partial summary', async () => {
    const f = fixture();
    for (let i = 0; i < 501; i++)
      f.docs[`spaces/s/debts/active-${i}`] = { ...f.docs['spaces/s/debts/d'], id: `active-${i}` };
    expect(await dispatchNotifications(f.runtime)).toMatchObject({ failed: 1, accepted: 0 });
    expect(f.send).not.toHaveBeenCalled();
    expect(receipts(f)).toEqual([]);
  });
  it('derives due-debt reminders without list reconciliation and groups daily categories in one generic send', async () => {
    const f = fixture();
    delete f.docs['spaces/s/reminders/r'];
    const before = business(f);
    expect(await dispatchNotifications(f.runtime)).toMatchObject({ inspected: 1, accepted: 1, failed: 0 });
    expect(f.send).toHaveBeenCalledOnce();
    expect(
      receipts(f)
        .map((row) => row.key)
        .sort(),
    ).toEqual(['due:d:2026-10-20', 'follow-up:2026-10-21']);
    expect(receipts(f).every((row) => row.state === 'accepted')).toBe(true);
    const message = f.send.mock.calls[0][0];
    expect(message.data).toMatchObject({ uid: 'u', spaceId: 's', storeId: 'store', route: '/notifications' });
    expect(JSON.stringify(message)).not.toContain('Test customer');
    expect(message.notification).not.toHaveProperty('amount');
    expect(business(f)).toEqual(before);
    expect(f.writes.every((path) => /^(pushDevices|pushDeliveryReceipts)\//.test(path))).toBe(true);
    expect(f.docs['pushDevices/device'].nextDispatchAt).toBe('2026-10-22T14:00:00.000Z');
  });
  it.each(['owner', 'editor', 'viewer'])(
    'notifies opted-in %s members, independent of who created the reminder',
    async (role) => {
      const f = fixture(role);
      f.docs['spaces/s/reminders/r'].createdByUserId = 'different-user';
      await dispatchNotifications(f.runtime);
      expect(f.send).toHaveBeenCalledOnce();
    },
  );
  it('sends to each opted-in active member, but not unconnected devices or inactive members', async () => {
    const f = fixture();
    f.docs['spaces/s/members/second'] = { status: 'active', role: 'viewer' };
    f.docs['pushDevices/second'] = { ...f.device, uid: 'second' };
    f.docs['pushDevices/legacy'] = { ...f.device, scheduledVersion: undefined };
    f.docs['pushDevices/disabled'] = { ...f.device, enabled: false };
    f.docs['pushDevices/removed'] = { ...f.device, uid: 'removed' };
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls.map(([message]) => message.data.uid).sort()).toEqual(['second', 'u']);
    expect(f.docs['pushDevices/removed']).not.toHaveProperty('token');
  });
  it('claims concurrent/repeated worker runs only once and revalidates a claim before attempting', async () => {
    const f = fixture();
    const claims = await Promise.all([
      claimNotificationDevice(f.runtime, 'device'),
      claimNotificationDevice(f.runtime, 'device'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    await Promise.all([deliverNotificationClaim(f.runtime, claim), deliverNotificationClaim(f.runtime, claim)]);
    expect(f.send).toHaveBeenCalledOnce();
    f.device.nextDispatchAt = f.runtime.now();
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledOnce();
  });
  it.each(['settled', 'completed', 'deleted', 'revoked', 'rebound', 'disabled'])(
    'does not send a stale claimed reminder after %s',
    async (change) => {
      const f = fixture();
      f.device.followUp.overdueEnabled = false;
      f.device.followUp.pendingEnabled = false;
      delete f.docs['spaces/s/reminders/r'];
      const claim = (await claimNotificationDevice(f.runtime, 'device'))!;
      expect(claim).not.toBeNull();
      if (change === 'settled') f.docs['spaces/s/debts/d'].amount = 0;
      if (change === 'revoked') f.docs['spaces/s/members/u'].status = 'inactive';
      if (change === 'rebound')
        f.docs['pushDevices/device'] = {
          ...f.device,
          uid: 'another',
          dispatchRevision: '00000000-0000-0000-0000-000000000002',
        };
      if (change === 'disabled') f.docs['pushDevices/device'] = { uid: 'u', enabled: false };
      if (change === 'deleted' || change === 'completed')
        f.docs['spaces/s/reminders/due-date_d'] = {
          id: 'due-date_d',
          workspaceId: 's',
          storeId: 'store',
          debtId: 'd',
          note: 'system:due-date',
          status: change === 'completed' ? 'completed' : 'dismissed',
          ...(change === 'deleted' ? { deletedAt: f.runtime.now() } : {}),
        };
      expect(await deliverNotificationClaim(f.runtime, claim)).toBe('cancelled');
      expect(f.send).not.toHaveBeenCalled();
      expect(receipts(f).every((row) => row.state !== 'accepted')).toBe(true);
      if (change === 'rebound') expect(f.docs['pushDevices/device'].uid).toBe('another');
    },
  );
  it('does not retry an ambiguous provider error or expose tokens in results', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error('synthetic-provider-detail-and-token'));
    expect(await dispatchNotifications(f.runtime)).toMatchObject({ failed: 1 });
    expect(receipts(f).every((row) => row.state === 'failed')).toBe(true);
    await wakeNotificationSpace(f.runtime, 's');
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.docs['pushDevices/device'].dispatchLastAttemptState).toBe('failed');
  });
  it('disables an expired provider token without changing the financial sources', async () => {
    const f = fixture();
    const before = business(f);
    f.send.mockRejectedValueOnce({ code: 'messaging/registration-token-not-registered' });
    await dispatchNotifications(f.runtime);
    expect(f.docs['pushDevices/device']).toMatchObject({ uid: 'u', enabled: false });
    expect(f.docs['pushDevices/device']).not.toHaveProperty('token');
    expect(business(f)).toEqual(before);
  });
  it('does not read old paid debt or completed reminder history as an unbounded source', async () => {
    const f = fixture();
    for (let i = 0; i < 550; i++) {
      f.docs[`spaces/s/debts/paid-${i}`] = { ...f.docs['spaces/s/debts/d'], id: `paid-${i}`, amount: 0 };
      f.docs[`spaces/s/reminders/done-${i}`] = {
        id: `done-${i}`,
        workspaceId: 's',
        storeId: 'store',
        status: 'completed',
        debtId: 'd',
      };
    }
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledOnce();
  });
  it('pauses after three source failures, without partial receipts or financial writes', async () => {
    const f = fixture();
    const before = business(f);
    f.docs['spaces/s/debts/d'].workspaceId = 'another-space';
    for (let i = 0; i < 3; i++) {
      await dispatchNotifications(f.runtime);
      f.advance(5);
    }
    expect(f.docs['pushDevices/device'].dispatchFailures).toBe(3);
    expect(f.docs['pushDevices/device'].nextDispatchAt).toBe('9999-12-31T00:00:00.000Z');
    expect(f.send).not.toHaveBeenCalled();
    expect(receipts(f)).toHaveLength(0);
    const after = business(f);
    after['spaces/s/debts/d'].workspaceId = 's';
    expect(after).toEqual(before);
  });
  it('wake-up coalesces changes and touches only opted-in matching devices', async () => {
    const f = fixture();
    f.device.nextDispatchAt = '2026-10-22T14:00:00.000Z';
    f.docs['pushDevices/other-space'] = { ...f.device, spaceId: 'other' };
    f.docs['pushDevices/legacy'] = { ...f.device, scheduledVersion: undefined };
    await wakeNotificationSpace(f.runtime, 's');
    const writes = f.writes.length;
    await wakeNotificationSpace(f.runtime, 's');
    expect(f.docs['pushDevices/device'].nextDispatchAt).toBe(f.runtime.now());
    expect(f.writes).toHaveLength(writes);
    expect(f.writes).toEqual(['pushDevices/device']);
  });
  it('caps each application send to twenty newly claimed events and drains the rest without replay', async () => {
    const f = fixture();
    for (let i = 0; i < 25; i++)
      f.docs[`spaces/s/reminders/r-${i}`] = { ...f.docs['spaces/s/reminders/r'], id: `r-${i}` };
    await dispatchNotifications(f.runtime);
    expect(receipts(f)).toHaveLength(20);
    f.advance(5);
    await dispatchNotifications(f.runtime);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(receipts(f)).toHaveLength(28);
    expect(new Set(receipts(f).map((row) => row.key)).size).toBe(28);
  });
  it('caps due-device selection to five and does not enroll old registered tokens', async () => {
    const f = fixture();
    for (let i = 0; i < 7; i++) f.docs[`pushDevices/extra-${i}`] = { ...f.device };
    expect(await dispatchNotifications(f.runtime)).toMatchObject({ inspected: 5, accepted: 5 });
    expect(f.send).toHaveBeenCalledTimes(5);
    delete f.docs['pushDevices/device'].scheduledVersion;
    expect(await claimNotificationDevice(f.runtime, 'device')).toBeNull();
  });
  it('keeps future reminder/daily schedules independent of settled debts', () => {
    const f = fixture();
    const plan = planNotifications(f.device, [{ ...f.docs['spaces/s/debts/d'], amount: 0 }], [], f.runtime.now());
    expect(plan.events).toEqual([]);
    expect(plan.nextAt).toBe('2026-10-22T14:00:00.000Z');
  });
});
