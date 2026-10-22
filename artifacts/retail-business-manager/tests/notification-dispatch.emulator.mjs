import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pushDeviceCommandHandler, pushDeviceId } from '../functions/lib/functions/src/pushDeviceCommand.js';
import {
  claimNotificationDevice,
  deliverNotificationClaim,
  dispatchNotifications,
  wakeNotificationSpace,
} from '../functions/lib/functions/src/notificationDispatch.js';
if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST))
  throw new Error('Demo emulator required');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'notification-dispatch-tests');
const db = getFirestore(app);
async function fixture(suffix) {
  const spaceId = `notification-dispatch-${suffix}`,
    space = db.doc(`spaces/${spaceId}`);
  let now = '2026-10-22T14:00:01.000Z';
  const sent = [];
  const runtime = {
    firestore: db,
    now: () => now,
    messaging: {
      send: async (message) => {
        sent.push(message);
        return 'synthetic-provider-acceptance';
      },
    },
  };
  const followUp = { time: '17:00', overdueEnabled: true, pendingEnabled: true, timeZone: 'Europe/Istanbul' };
  await space.set({ spaceId, ownerUserId: 'owner', status: 'active' });
  await space.collection('storeProfile').doc('profile').set({ storeId: 'store' });
  for (const [uid, role] of [
    ['owner', 'owner'],
    ['viewer', 'viewer'],
  ])
    await space.collection('members').doc(uid).set({ status: 'active', role });
  const debt = {
    id: 'd',
    workspaceId: spaceId,
    storeId: 'store',
    customerId: 'synthetic',
    amount: 10,
    currency: 'TRY',
    dueDate: '2026-10-21',
  };
  await space.collection('debts').doc('d').set(debt);
  const register = async (uid, scheduled = true) => {
    const token = `synthetic-${suffix}-${uid}-abcdefghijklmnopqrstuvwxyz0123456789`;
    await pushDeviceCommandHandler(
      {
        auth: { uid },
        data: {
          action: 'register',
          actorUid: uid,
          token,
          spaceId,
          storeId: 'store',
          language: 'ar',
          followUp,
          ...(scheduled ? { scheduledVersion: 1, reminderTime: '09:00' } : {}),
        },
      },
      { ...runtime, now: () => Date.parse(now), notificationDispatchReady: true },
    );
    return db.doc(`pushDevices/${pushDeviceId(token)}`);
  };
  return {
    space,
    spaceId,
    debt,
    runtime,
    sent,
    register,
    clock: (value) => {
      now = value;
    },
  };
}
try {
  const f = await fixture('members');
  await f.register('owner');
  await f.register('viewer');
  const legacy = await f.register('owner', false); // Same token deliberately becomes test-only again.
  assert.equal((await legacy.get()).data().scheduledVersion, undefined);
  await f.register('owner');
  await Promise.all([dispatchNotifications(f.runtime), dispatchNotifications(f.runtime)]);
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent.map((message) => message.data.uid).sort(), ['owner', 'viewer']);
  assert.ok(
    f.sent.every(
      (message) => message.data.spaceId === f.spaceId && !JSON.stringify(message.notification).includes('10'),
    ),
  );
  assert.deepEqual((await f.space.collection('debts').doc('d').get()).data(), f.debt);
  assert.equal((await f.space.collection('reminders').get()).size, 0); // No screen reconciliation needed.
  console.log(
    'Notification emulator — concurrent dispatch reaches every opted-in active member once, including Viewer, without opening reminders or changing debt: PASS',
  );

  const cancel = await fixture('cancel');
  const cancelDevice = await cancel.register('owner');
  const claim = await claimNotificationDevice(cancel.runtime, cancelDevice.id);
  assert(claim);
  await cancel.space.collection('debts').doc('d').update({ amount: 0, settledAt: cancel.runtime.now() });
  assert.equal(await deliverNotificationClaim(cancel.runtime, claim), 'cancelled');
  assert.equal(cancel.sent.length, 0);
  console.log(
    'Notification emulator — settlement between claim and provider hand-off cancels the claimed notification: PASS',
  );

  const removed = await fixture('removed');
  const removedDevice = await removed.register('viewer');
  const removedClaim = await claimNotificationDevice(removed.runtime, removedDevice.id);
  assert(removedClaim);
  await removed.space.collection('members').doc('viewer').update({ status: 'inactive' });
  assert.equal(await deliverNotificationClaim(removed.runtime, removedClaim), 'cancelled');
  assert.equal(removed.sent.length, 0);
  assert.equal((await removedDevice.get()).data().token, undefined);
  console.log(
    'Notification emulator — fresh canonical membership removal suppresses delivery and strips device token: PASS',
  );

  const duplicate = await fixture('claim-race');
  const device = await duplicate.register('owner');
  const claims = await Promise.all([
    claimNotificationDevice(duplicate.runtime, device.id),
    claimNotificationDevice(duplicate.runtime, device.id),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const winner = claims.find(Boolean);
  await Promise.all([
    deliverNotificationClaim(duplicate.runtime, winner),
    deliverNotificationClaim(duplicate.runtime, winner),
  ]);
  assert.equal(duplicate.sent.length, 1);
  console.log(
    'Notification emulator — independent claim and delivery races reserve one application-level provider attempt: PASS',
  );

  const error = await fixture('provider-error');
  await error.register('owner');
  let attempts = 0;
  error.runtime.messaging.send = async () => {
    attempts++;
    throw { code: 'messaging/server-unavailable' };
  };
  await dispatchNotifications(error.runtime);
  await wakeNotificationSpace(error.runtime, error.spaceId);
  await dispatchNotifications(error.runtime);
  assert.equal(attempts, 1);
  console.log(
    'Notification emulator — ambiguous provider failure consumes its receipt and is not blindly resent: PASS',
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
