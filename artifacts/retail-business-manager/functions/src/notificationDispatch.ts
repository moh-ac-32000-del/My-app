import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { planNotifications, notificationReceiptId, type NotificationRow } from './notificationPlan.js';

export interface NotificationRuntime {
  firestore: Firestore;
  messaging: Pick<Messaging, 'send'>;
  now: () => string;
}
const SOURCE_LIMIT = 500;
const DEVICE_LIMIT = 5;
const EVENTS_PER_ATTEMPT = 20;
const disabledUntil = '9999-12-31T00:00:00.000Z';
const after = (now: string, minutes: number) => new Date(Date.parse(now) + minutes * 60_000).toISOString();
const validId = (value: unknown): value is string =>
  typeof value === 'string' && !!value && value.length <= 200 && !value.includes('/');
const optedIn = (device: NotificationRow | undefined) =>
  device?.enabled === true &&
  device.scheduledVersion === 1 &&
  validId(device.uid) &&
  validId(device.spaceId) &&
  validId(device.storeId) &&
  typeof device.token === 'string' &&
  /^[a-f0-9-]{36}$/.test(device.dispatchRevision);

function disable(tx: Transaction, ref: DocumentReference, device: NotificationRow, now: string) {
  // Same privacy behavior as explicit disconnect: no token/scope/preferences remain.
  tx.set(ref, {
    uid: device.uid,
    enabled: false,
    updatedAt: Date.parse(now),
    testDay: device.testDay ?? '',
    testCount: device.testCount ?? 0,
    lastTestAt: device.lastTestAt ?? 0,
  });
}

async function currentPlan(tx: Transaction, db: Firestore, device: NotificationRow, now: string) {
  const space = db.collection('spaces').doc(device.spaceId);
  const [canonical, member, profile] = await Promise.all([
    tx.get(space),
    tx.get(space.collection('members').doc(device.uid)),
    tx.get(space.collection('storeProfile').doc('profile')),
  ]);
  if (canonical.data()?.status !== 'active' || profile.data()?.storeId !== device.storeId) return null;
  try {
    assertWorkspaceAccess(member.data(), 'read');
  } catch {
    return null;
  }
  const [debts, reminders] = await Promise.all([
    tx.get(
      space
        .collection('debts')
        .where('storeId', '==', device.storeId)
        .where('amount', '>', 0)
        .limit(SOURCE_LIMIT + 1),
    ),
    tx.get(
      space
        .collection('reminders')
        .where('storeId', '==', device.storeId)
        .where('status', '==', 'pending')
        .limit(SOURCE_LIMIT + 1),
    ),
  ]);
  if (debts.docs.length > SOURCE_LIMIT || reminders.docs.length > SOURCE_LIMIT)
    throw new Error('notificationSourceLimit');
  // Read cancellation/completion markers only for currently outstanding due debts,
  // not the entire paid/reminder history. A missing generated row is valid.
  const pendingIds = new Set(reminders.docs.map((doc) => doc.id));
  const markers = await Promise.all(
    debts.docs
      .filter((doc) => doc.data().dueDate && !doc.data().settledAt && !pendingIds.has(`due-date_${doc.id}`))
      .map((doc) => tx.get(space.collection('reminders').doc(`due-date_${doc.id}`))),
  );
  return planNotifications(
    device,
    debts.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    [...reminders.docs, ...markers.filter((doc) => doc.exists)].map((doc) => ({ ...doc.data(), id: doc.id })),
    now,
  );
}

export interface NotificationClaim {
  deviceId: string;
  id: string;
  revision: string;
  keys: string[];
}

/** Claims precede external sending. Existing receipts, including failed/ambiguous ones,
 * are never automatically retried. This is at-most-once attempt, not guaranteed delivery.
 */
export async function claimNotificationDevice(
  runtime: NotificationRuntime,
  deviceId: string,
): Promise<NotificationClaim | null> {
  const db = runtime.firestore,
    ref = db.collection('pushDevices').doc(deviceId);
  return db.runTransaction(async (tx) => {
    const now = runtime.now(),
      device = (await tx.get(ref)).data();
    if (!optedIn(device) || device!.nextDispatchAt > now || device!.dispatchFailures >= 3) return null;
    if (device!.dispatchClaim?.expiresAt > now) return null;
    const plan = await currentPlan(tx, db, device!, now);
    if (!plan) {
      disable(tx, ref, device!, now);
      return null;
    }
    const due = plan.events.filter((event) => event.dueAt <= now);
    const receipts = await Promise.all(
      due.map((event) =>
        tx.get(db.collection('pushDeliveryReceipts').doc(notificationReceiptId(deviceId, device!, event.key))),
      ),
    );
    const unseen = due.filter((_, index) => !receipts[index].exists);
    const selected = unseen.slice(0, EVENTS_PER_ATTEMPT);
    const nextAt = unseen.length > selected.length ? after(now, 5) : plan.nextAt;
    const claim: NotificationClaim = {
      deviceId,
      id: randomUUID(),
      revision: device!.dispatchRevision,
      keys: selected.map((event) => event.key),
    };
    for (const event of selected) {
      tx.create(db.collection('pushDeliveryReceipts').doc(notificationReceiptId(deviceId, device!, event.key)), {
        uid: device!.uid,
        spaceId: device!.spaceId,
        storeId: device!.storeId,
        deviceId,
        key: event.key,
        claimId: claim.id,
        state: 'reserved',
        reservedAt: now,
      });
    }
    tx.update(ref, {
      nextDispatchAt: nextAt,
      dispatchFailures: 0,
      dispatchLastCheckAt: now,
      ...(selected.length ? { dispatchLastAttemptAt: now, dispatchLastAttemptState: 'reserved' } : {}),
      dispatchClaim: selected.length
        ? { id: claim.id, revision: claim.revision, keys: claim.keys, expiresAt: after(now, 2) }
        : null,
    });
    return selected.length ? claim : null;
  });
}

/** Recheck after claim, before handing a generic notification to FCM. A change after
 * FCM acceptance cannot recall an OS notification; tap handling revalidates its scope.
 */
export async function deliverNotificationClaim(runtime: NotificationRuntime, claim: NotificationClaim) {
  const db = runtime.firestore,
    ref = db.collection('pushDevices').doc(claim.deviceId);
  const delivery = await db.runTransaction(async (tx) => {
    const now = runtime.now(),
      device = (await tx.get(ref)).data();
    if (!optedIn(device) || device!.dispatchRevision !== claim.revision || device!.dispatchClaim?.id !== claim.id)
      return null;
    const plan = await currentPlan(tx, db, device!, now);
    const receiptRefs = claim.keys.map((key) =>
      db.collection('pushDeliveryReceipts').doc(notificationReceiptId(claim.deviceId, device!, key)),
    );
    const receipts = await Promise.all(receiptRefs.map((receipt) => tx.get(receipt)));
    if (receipts.some((receipt) => receipt.data()?.claimId !== claim.id || receipt.data()?.state !== 'reserved'))
      return null;
    const stillDue = new Set(plan?.events.filter((event) => event.dueAt <= now).map((event) => event.key) ?? []);
    const eligible = claim.keys.filter((key) => stillDue.has(key));
    receipts.forEach((_, index) =>
      tx.update(receiptRefs[index], {
        state: eligible.includes(claim.keys[index]) ? 'attempting' : 'cancelled',
        checkedAt: now,
      }),
    );
    if (!plan) {
      disable(tx, ref, device!, now);
      return null;
    }
    if (!eligible.length) {
      tx.update(ref, { dispatchClaim: null, dispatchLastAttemptAt: now, dispatchLastAttemptState: 'cancelled' });
      return null;
    }
    tx.update(ref, { dispatchLastAttemptAt: now, dispatchLastAttemptState: 'attempting' });
    return {
      token: device!.token as string,
      uid: device!.uid as string,
      spaceId: device!.spaceId as string,
      storeId: device!.storeId as string,
      language: device!.language as string,
      followUp: eligible.some((key) => key.startsWith('follow-up:')),
      receiptRefs,
    };
  });
  if (!delivery) return 'cancelled' as const;
  const bodies = {
    ar: delivery.followUp
      ? 'حان وقت المتابعة اليومية. افتح التطبيق لمراجعة التذكيرات والديون المستحقة.'
      : 'لديك تذكيرات مستحقة. افتح التطبيق لمراجعتها.',
    en: delivery.followUp
      ? 'Time for your daily follow-up. Open the app to review due reminders and debts.'
      : 'You have due reminders. Open the app to review them.',
    tr: delivery.followUp
      ? 'Günlük takip zamanı. Hatırlatmaları ve vadesi gelen borçları uygulamada inceleyin.'
      : 'Zamanı gelen hatırlatmalarınız var. Uygulamada inceleyin.',
  };
  let accepted = false,
    invalidToken = false;
  try {
    await runtime.messaging.send({
      token: delivery.token,
      notification: { title: 'My app', body: bodies[delivery.language as keyof typeof bodies] ?? bodies.ar },
      android: {
        priority: 'normal',
        ttl: 15 * 60_000,
        notification: { channelId: 'my-app-reminders', visibility: 'private', tag: claim.id },
      },
      data: {
        route: '/notifications',
        kind: delivery.followUp ? 'daily-follow-up' : 'due-reminder',
        deliveryId: claim.id,
        uid: delivery.uid,
        spaceId: delivery.spaceId,
        storeId: delivery.storeId,
      },
    });
    accepted = true;
  } catch (error) {
    invalidToken = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(
      (error as { code?: string }).code ?? '',
    );
  }
  await db.runTransaction(async (tx) => {
    const now = runtime.now(),
      device = (await tx.get(ref)).data();
    const receipts = await Promise.all(delivery.receiptRefs.map((receipt) => tx.get(receipt)));
    receipts.forEach((receipt, index) => {
      if (receipt.data()?.claimId === claim.id && receipt.data()?.state === 'attempting')
        tx.update(delivery.receiptRefs[index], { state: accepted ? 'accepted' : 'failed', finishedAt: now });
    });
    if (invalidToken && device?.dispatchRevision === claim.revision) disable(tx, ref, device, now);
    else if (device?.dispatchRevision === claim.revision && device.dispatchClaim?.id === claim.id)
      tx.update(ref, {
        dispatchClaim: null,
        dispatchLastAttemptAt: now,
        dispatchLastAttemptState: accepted ? 'accepted' : 'failed',
      });
  });
  return accepted ? ('accepted' as const) : ('failed' as const);
}

/** Source writes wake only registered, opted-in devices in that space. It never
 * touches a financial record and coalesces already-due work instead of fan-out sends.
 */
export async function wakeNotificationSpace(runtime: Pick<NotificationRuntime, 'firestore' | 'now'>, spaceId: string) {
  if (!validId(spaceId)) throw new Error('notificationScopeInvalid');
  const devices = await runtime.firestore
    .collection('pushDevices')
    .where('enabled', '==', true)
    .where('scheduledVersion', '==', 1)
    .where('spaceId', '==', spaceId)
    .limit(SOURCE_LIMIT + 1)
    .get();
  if (devices.docs.length > SOURCE_LIMIT) throw new Error('notificationFanoutLimit');
  for (const doc of devices.docs)
    await runtime.firestore.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data(),
        now = runtime.now();
      if (!optedIn(fresh) || fresh!.spaceId !== spaceId || fresh!.dispatchFailures >= 3) return;
      if (!fresh!.nextDispatchAt || fresh!.nextDispatchAt > now) tx.update(doc.ref, { nextDispatchAt: now });
    });
}

/** Eventarc may redeliver transient failures, but wake work expires after fifteen
 * minutes. Permanent fan-out limits are acknowledged, not retried indefinitely.
 * The normal daily scan is a later catch-up path if a source event expires.
 */
export async function wakeNotificationEvent(
  runtime: Pick<NotificationRuntime, 'firestore' | 'now'>,
  spaceId: string,
  eventTime: string,
) {
  const timestamp = Date.parse(eventTime);
  if (!Number.isFinite(timestamp) || Date.parse(runtime.now()) - timestamp > 15 * 60_000) return 'expired';
  try {
    await wakeNotificationSpace(runtime, spaceId);
    return 'queued';
  } catch (error) {
    if (['notificationFanoutLimit', 'notificationScopeInvalid'].includes((error as Error).message))
      return 'bounded-rejection';
    throw new Error('Notification source wake temporarily unavailable');
  }
}

/** One shared due-device queue, not a poll of every workspace/device financial history. */
export async function dispatchNotifications(runtime: NotificationRuntime) {
  const due = await runtime.firestore
    .collection('pushDevices')
    .where('enabled', '==', true)
    .where('scheduledVersion', '==', 1)
    .where('nextDispatchAt', '<=', runtime.now())
    .orderBy('nextDispatchAt')
    .limit(DEVICE_LIMIT)
    .get();
  const result = { inspected: due.docs.length, accepted: 0, cancelled: 0, failed: 0 };
  for (const doc of due.docs) {
    let claim: NotificationClaim | null = null;
    try {
      claim = await claimNotificationDevice(runtime, doc.id);
      if (claim) result[await deliverNotificationClaim(runtime, claim)]++;
    } catch {
      result.failed++;
      await runtime.firestore.runTransaction(async (tx) => {
        const fresh = (await tx.get(doc.ref)).data(),
          now = runtime.now();
        // Stale failures cannot pause a newly registered/rebound device or newer check.
        if (
          !optedIn(fresh) ||
          fresh!.dispatchRevision !== doc.data().dispatchRevision ||
          (claim
            ? fresh!.dispatchClaim?.id !== claim.id
            : fresh!.dispatchLastCheckAt !== doc.data().dispatchLastCheckAt)
        )
          return;
        const failures = Math.min(3, (fresh!.dispatchFailures ?? 0) + 1);
        tx.update(doc.ref, {
          dispatchFailures: failures,
          dispatchLastErrorAt: now,
          dispatchLastAttemptState: 'failed',
          nextDispatchAt: failures === 3 ? disabledUntil : after(now, 5),
        });
      });
    }
  }
  return result;
}
