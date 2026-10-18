import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { parsePushFollowUp } from './pushFollowUpPreferences.js';

type Input = { action: 'register' | 'status' | 'disable' | 'test' | 'preferences'; actorUid: string; token: string; spaceId: string; storeId: string; language?: 'ar' | 'en' | 'tr'; followUp?: unknown };
export interface PushDeviceRuntime { firestore: Firestore; messaging: Pick<Messaging, 'send'>; now: () => number }
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
    if (input.action === 'status') return { enabled: Boolean(matches && device?.enabled) };
    if (input.action === 'register') {
      tx.set(ref, { uid, token: input.token, spaceId: input.spaceId, storeId: input.storeId, language: input.language ?? 'ar',
        enabled: true, updatedAt: now,
        ...(followUp ? { followUp, followUpUpdatedAt: now } : matches && device?.followUp ? { followUp: device.followUp, followUpUpdatedAt: device.followUpUpdatedAt ?? now } : {}),
        testDay: device?.testDay ?? '', testCount: device?.testCount ?? 0, lastTestAt: device?.lastTestAt ?? 0 });
      return { enabled: true };
    }
    if (!matches || !device?.enabled) throw new HttpsError('failed-precondition', 'Connect this device first');
    if (input.action === 'preferences') {
      tx.update(ref, { followUp, followUpUpdatedAt: now, language: input.language ?? device.language ?? 'ar', updatedAt: now });
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
  return { enabled: result.enabled };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !value.includes('/');
}
