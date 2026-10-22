import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { parsePushFollowUp } from './pushFollowUpPreferences.js';
import { assertWorkspaceAccess } from './workspaceAccess.js';

type Input = { action: 'register' | 'status' | 'disable' | 'test' | 'preferences'; actorUid: string; token: string; spaceId: string; storeId: string; language?: 'ar' | 'en' | 'tr'; followUp?: unknown; scheduledVersion?: 1; reminderTime?: string };
export interface PushDeviceRuntime { firestore: Firestore; messaging: Pick<Messaging, 'send'>; now: () => number; notificationDispatchReady?: boolean }
export const pushDeviceId = (token: string) => createHash('sha256').update(token).digest('hex');

/** Registration and user-requested connection test only; never reads/writes financial documents. */
export async function pushDeviceCommandHandler(request: CallableRequest<Input>, runtime: PushDeviceRuntime) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  const input = request.data;
  if (input?.actorUid !== uid) throw new HttpsError('permission-denied', 'Account changed');
  if (!input || !['register', 'status', 'disable', 'test', 'preferences'].includes(input.action)
    || typeof input.token !== 'string' || !/^[A-Za-z0-9:_-]{32,4096}$/.test(input.token)
    || !validId(input.spaceId) || !validId(input.storeId)
    || (input.language !== undefined && !['ar', 'en', 'tr'].includes(input.language))) {
    throw new HttpsError('invalid-argument', 'Invalid notification device');
  }
  const followUp = input.followUp === undefined ? undefined : parsePushFollowUp(input.followUp);
  if ((input.scheduledVersion !== undefined && input.scheduledVersion !== 1)
    || (input.reminderTime !== undefined && (typeof input.reminderTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)))
    || (input.action === 'register' && input.scheduledVersion === 1 && (!followUp || !input.reminderTime))) {
    throw new HttpsError('invalid-argument', 'Invalid scheduled notification settings');
  }
  if (input.action === 'preferences' && !followUp) throw new HttpsError('invalid-argument', 'Follow-up preferences required');
  const ref = runtime.firestore.collection('pushDevices').doc(pushDeviceId(input.token));
  const space = runtime.firestore.collection('spaces').doc(input.spaceId);
  const now = runtime.now();
  const result = await runtime.firestore.runTransaction(async (tx) => {
    const device = (await tx.get(ref)).data();
    const owned = device?.uid === uid;
    const matches = owned && device?.spaceId === input.spaceId && device?.storeId === input.storeId;
    if (input.action === 'disable') {
      // Disabling remains possible after workspace access is revoked. Never disable somebody else's token.
      if (owned) tx.set(ref, { uid, enabled: false, updatedAt: now,
        testDay: device?.testDay ?? '', testCount: device?.testCount ?? 0, lastTestAt: device?.lastTestAt ?? 0 });
      return { enabled: false };
    }
    const [spaceSnap, member, profile] = await Promise.all([
      tx.get(space), tx.get(space.collection('members').doc(uid)), tx.get(space.collection('storeProfile').doc('profile')),
    ]);
    if (spaceSnap.data()?.status !== 'active' || member.data()?.status !== 'active' || profile.data()?.storeId !== input.storeId) {
      throw new HttpsError('permission-denied', 'Active matching workspace membership required');
    }
    // A viewer may manage their own device preferences, not shared business records.
    assertWorkspaceAccess(member.data(), 'read');
    if (input.action === 'status') return { enabled: Boolean(matches && device?.enabled), ...(input.scheduledVersion === 1 ? {
      scheduledEnabled: Boolean(matches && device?.enabled && device.scheduledVersion === 1 && runtime.notificationDispatchReady),
      dispatchProblem: Boolean(matches && (device?.dispatchFailures >= 3 || device?.dispatchLastAttemptState === 'failed'
        || (['reserved', 'attempting'].includes(device?.dispatchLastAttemptState) && now - Date.parse(device?.dispatchLastAttemptAt) > 120_000))),
    } : {}) };
    if (input.action === 'register') {
      tx.set(ref, { uid, token: input.token, spaceId: input.spaceId, storeId: input.storeId, language: input.language ?? 'ar',
        enabled: true, updatedAt: now,
        ...(input.scheduledVersion === 1 ? { scheduledVersion: 1, reminderTime: input.reminderTime,
          dispatchRevision: randomUUID(), nextDispatchAt: new Date(now).toISOString(), dispatchFailures: 0 } : {}),
        ...(followUp ? { followUp, followUpUpdatedAt: now } : matches && device?.followUp ? { followUp: device.followUp, followUpUpdatedAt: device.followUpUpdatedAt ?? now } : {}),
        testDay: device?.testDay ?? '', testCount: device?.testCount ?? 0, lastTestAt: device?.lastTestAt ?? 0 });
      return { enabled: true };
    }
    if (!matches || !device?.enabled) throw new HttpsError('failed-precondition', 'Connect this device first');
    if (input.action === 'preferences') {
      tx.update(ref, { followUp, followUpUpdatedAt: now, language: input.language ?? device.language ?? 'ar', updatedAt: now,
        ...(device.scheduledVersion === 1 ? { reminderTime: input.reminderTime ?? device.reminderTime, dispatchRevision: randomUUID(),
          dispatchClaim: null, dispatchFailures: 0, nextDispatchAt: new Date(now).toISOString() } : {}) });
      return { enabled: true };
    }
    const day = new Date(now).toISOString().slice(0, 10);
    const count = device.testDay === day ? Number(device.testCount) || 0 : 0;
    if (count >= 5 || (Number(device.lastTestAt) > 0 && now - Number(device.lastTestAt) < 60_000)) {
      throw new HttpsError('resource-exhausted', 'Connection tests are limited to five per day, at least one minute apart');
    }
    // Reserve the attempt atomically: retries/concurrent clicks cannot cause an unbounded send loop.
    tx.update(ref, { testDay: day, testCount: count + 1, lastTestAt: now });
    return { enabled: true, send: true };
  });
  if ('send' in result && result.send) {
    const bodies = {
      ar: 'اختبار اتصال الإشعارات. هذه الرسالة لا تحتوي بيانات مالية.',
      en: 'Notification connection test. This message contains no financial data.',
      tr: 'Bildirim bağlantısı testi. Bu mesaj mali veri içermez.',
    };
    try {
      await runtime.messaging.send({ token: input.token,
        notification: { title: 'My app', body: bodies[input.language ?? 'ar'] },
        android: { priority: 'high', ttl: 60_000, notification: { channelId: 'my-app-reminders', visibility: 'private' } },
        data: { route: '/notifications', kind: 'connection-test', uid, spaceId: input.spaceId, storeId: input.storeId },
      });
    } catch {
      // Do not log tokens/provider payloads or expose them in errors. No automatic retry.
      throw new HttpsError('unavailable', 'Push provider did not accept the connection test');
    }
    return { enabled: true, accepted: true };
  }
  if (input.action === 'status' && input.scheduledVersion === 1) return result;
  return { enabled: result.enabled };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !value.includes('/');
}
