import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workspaceCommandHandler } from '../functions/lib/functions/src/workspaceCommand.js';
import { closeAutomaticPeriod, dispatchAutomaticClosings } from '../functions/lib/functions/src/automaticClosing.js';
import { createCashTransactionHandler } from '../functions/lib/functions/src/createCashTransaction.js';
import { settleCustomerDebtHandler } from '../functions/lib/functions/src/settleCustomerDebt.js';
import { merchantCommandHandler } from '../functions/lib/functions/src/merchantCommand.js';
import { dailyArchiveCommandHandler } from '../functions/lib/functions/src/dailyArchiveCommand.js';

if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST))
  throw new Error('Demo local emulator required');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'automatic-closing-tests');
const db = getFirestore(app);
const request = (data, uid = 'owner') => ({ auth: { uid }, data });
async function setup(suffix) {
  const spaceId = `automatic-closing-${suffix}`;
  const space = db.doc(`spaces/${spaceId}`);
  let now = '2026-10-21T12:00:00.000Z';
  const runtime = { firestore: db, now: () => now, automaticClosingReady: true };
  await space.set({ spaceId, status: 'active', ownerUserId: 'owner' });
  await space.collection('members').doc('owner').set({ status: 'active', role: 'owner' });
  await space.collection('members').doc('viewer').set({ status: 'active', role: 'viewer' });
  await space.collection('storeProfile').doc('profile').set({ storeId: 'store' });
  await space
    .collection('customers')
    .doc('customer')
    .set({ id: 'customer', workspaceId: spaceId, storeId: 'store', name: 'Synthetic', isActive: true });
  const cash = (id, at, amount, type = 'cash_in') =>
    space
      .collection('transactions')
      .doc(id)
      .set({
        id,
        workspaceId: spaceId,
        storeId: 'store',
        type,
        amount,
        currency: 'TRY',
        createdAt: at,
        updatedAt: at,
        note: `Synthetic ${id}`,
      });
  const command = (data, uid) => workspaceCommandHandler(request({ spaceId, ...data }, uid), runtime);
  const enable = () => command({ action: 'enableClosing', legacyTimeZone: 'Europe/Istanbul' });
  return {
    space,
    spaceId,
    runtime,
    cash,
    command,
    enable,
    clock: (at) => {
      now = at;
    },
  };
}
try {
  const f = await setup('history');
  await f.cash('manual', '2026-10-20T10:00:00.000Z', 10);
  await f.cash('remaining', '2026-10-20T11:00:00.000Z', 5, 'cash_out');
  await f.cash('today', '2026-10-21T10:00:00.000Z', 1000);
  const prior = {
    id: '2026-10-20_000004',
    workspaceId: f.spaceId,
    storeId: 'store',
    date: '2026-10-20',
    closingNumber: 4,
    closedAt: '2026-10-20T10:30:00.000Z',
    snapshot: [{ id: 'transaction:manual' }],
    closingCashBalances: [{ currency: 'TRY', amount: 10 }],
  };
  await f.space.collection('dailyArchives').doc(prior.id).set(prior);
  await assert.rejects(f.command({ action: 'enableClosing', legacyTimeZone: 'Europe/Istanbul' }, 'viewer'), {
    code: 'permission-denied',
  });
  await f.enable();
  await Promise.all([closeAutomaticPeriod(f.runtime, f.spaceId), closeAutomaticPeriod(f.runtime, f.spaceId)]);
  let archives = await f.space.collection('dailyArchives').get();
  assert.equal(archives.size, 2);
  assert.deepEqual((await f.space.collection('dailyArchives').doc(prior.id).get()).data(), prior);
  const automatic = archives.docs.find((doc) => doc.id !== prior.id).data();
  assert.equal(automatic.closingNumber, 5);
  assert.equal(automatic.closingMode, 'automatic');
  assert.deepEqual(
    automatic.snapshot.map((row) => row.id),
    ['transaction:remaining'],
  );
  assert.deepEqual(automatic.closingCashBalances, [{ currency: 'TRY', amount: 5 }]);
  assert.equal((await f.space.collection('transactions').get()).size, 3);
  console.log(
    'Automatic closing emulator — concurrent retries preserve manual snapshots, close remaining events once and exclude new-day cash: PASS',
  );

  await assert.rejects(
    dailyArchiveCommandHandler(
      request({
        action: 'close',
        spaceId: f.spaceId,
        storeId: 'store',
        date: '2026-10-21',
        startAt: '2026-10-20T21:00:00.000Z',
        endAt: '2026-10-21T21:00:00.000Z',
      }),
      f.runtime,
    ),
    { code: 'failed-precondition' },
  );
  console.log('Automatic closing emulator — old clients cannot create competing manual closings: PASS');

  const race = await setup('midnight-race');
  await race.enable();
  race.clock('2026-10-21T21:00:00.001Z');
  const cashInput = {
    spaceId: race.spaceId,
    storeId: 'store',
    transactionId: 'new-day',
    operationId: 'new-day',
    type: 'cash_in',
    amount: 9,
    currency: 'TRY',
  };
  await Promise.all([
    closeAutomaticPeriod(race.runtime, race.spaceId),
    createCashTransactionHandler(request(cashInput), race.runtime),
  ]);
  await createCashTransactionHandler(request(cashInput), race.runtime);
  assert.equal((await race.space.collection('transactions').get()).size, 1);
  assert.equal((await race.space.collection('dailyArchives').get()).size, 0);
  race.clock('2026-10-22T21:00:00.000Z');
  await closeAutomaticPeriod(race.runtime, race.spaceId);
  archives = await race.space.collection('dailyArchives').get();
  assert.equal(archives.size, 1);
  assert.equal(archives.docs[0].data().date, '2026-10-22');
  assert.deepEqual(
    archives.docs[0].data().snapshot.map((row) => row.id),
    ['transaction:new-day'],
  );
  console.log(
    'Automatic closing emulator — midnight write/close race and replay keep new-day money in its own period: PASS',
  );

  const linked = await setup('linked');
  await linked.enable();
  await linked.space
    .collection('debts')
    .doc('debt')
    .set({
      id: 'debt',
      workspaceId: linked.spaceId,
      storeId: 'store',
      customerId: 'customer',
      amount: 10,
      currency: 'TRY',
      originalAmount: 10,
      createdAt: '2026-10-21T12:00:00.000Z',
      updatedAt: '2026-10-21T12:00:00.000Z',
    });
  await settleCustomerDebtHandler(
    request({
      spaceId: linked.spaceId,
      storeId: 'store',
      customerId: 'customer',
      operationId: 'paid',
      transactionId: 'paid-cash',
      paymentId: 'paid',
      amount: 4,
      currency: 'TRY',
    }),
    linked.runtime,
  );
  await linked.space
    .collection('merchants')
    .doc('merchant')
    .set({ id: 'merchant', workspaceId: linked.spaceId, storeId: 'store', name: 'Synthetic merchant', isActive: true });
  await merchantCommandHandler(
    request({
      action: 'purchase',
      spaceId: linked.spaceId,
      storeId: 'store',
      merchantId: 'merchant',
      operationId: 'goods',
      currency: 'TRY',
      source: 'cash',
      paidExact: '2.00',
      lines: [{ name: 'Synthetic item', quantity: '1', unitPrice: '5' }],
    }),
    linked.runtime,
  );
  linked.clock('2026-10-21T21:00:00.000Z');
  await closeAutomaticPeriod(linked.runtime, linked.spaceId);
  const saved = (await linked.space.collection('dailyArchives').get()).docs[0].data();
  assert.deepEqual(saved.snapshot.map((row) => row.id).sort(), ['debt:debt', 'merchant:goods', 'settlement:paid']);
  assert.deepEqual(saved.closingCashBalances, [{ currency: 'TRY', amount: 2 }]);
  console.log(
    'Automatic closing emulator — linked settlement and merchant cash are projected once without inventing drawer movements: PASS',
  );

  const pending = await setup('backlog');
  await pending.cash('day1', '2026-10-19T10:00:00.000Z', 1);
  await pending.cash('day2', '2026-10-20T10:00:00.000Z', 2);
  await pending.enable();
  await dispatchAutomaticClosings(pending.runtime);
  await dispatchAutomaticClosings(pending.runtime);
  assert.deepEqual((await pending.space.collection('dailyArchives').get()).docs.map((doc) => doc.data().date).sort(), [
    '2026-10-19',
    '2026-10-20',
  ]);
  console.log('Automatic closing emulator — delayed dispatch recovers backlog as independent daily archives: PASS');
} finally {
  await db.terminate();
  await deleteApp(app);
}
