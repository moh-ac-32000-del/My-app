import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dailyArchiveCommandHandler } from '../functions/lib/functions/src/dailyArchiveCommand.js';

if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Demo local emulator required');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'archive-calendar-tests');
const db = getFirestore(app);
const base = db.doc('spaces/archive-calendar-emulator');
const now = '2026-10-21T15:00:00.000Z';
const runtime = { firestore: db, now: () => now };
const list = (uid, extra = {}) =>
  dailyArchiveCommandHandler(
    {
      auth: { uid },
      data: {
        action: 'list',
        spaceId: base.id,
        storeId: 'archive-test-store',
        date: '2026-10-21',
        ...extra,
      },
    },
    runtime,
  );
try {
  await base.set({ status: 'active' });
  await base.collection('storeProfile').doc('profile').set({ storeId: 'archive-test-store' });
  for (const role of ['owner', 'editor', 'viewer']) {
    await base.collection('members').doc(role).set({ role, status: 'active' });
  }
  const archives = [
    ['first', '2026-10-21', 'archive-test-store', 1],
    ['second', '2026-10-21', 'archive-test-store', 2],
    ['previous', '2026-10-20', 'archive-test-store', 1],
    ['other-store', '2026-10-21', 'other-store', 1],
  ].map(([id, date, storeId, closingNumber]) => ({
    id,
    date,
    storeId,
    closingNumber,
    workspaceId: base.id,
    closedAt: now,
    snapshot: [{ id: `transaction:${id}`, note: 'Preserved note', amount: 12.5, currency: 'TRY' }],
    closingCashBalances: [{ currency: 'TRY', amount: -20 }],
  }));
  for (const row of archives) await base.collection('dailyArchives').doc(row.id).set(row);
  for (const role of ['owner', 'editor', 'viewer']) {
    const result = await list(role);
    assert.equal(result.date, '2026-10-21');
    assert.deepEqual(result.archives, [archives[1], archives[0]]);
    console.log(`Archive calendar emulator — ${role} reads selected day, every closing, exact snapshots: PASS`);
  }
  assert.deepEqual((await list('viewer', { date: '2024-02-29' })).archives, []);
  assert.deepEqual((await list('owner', { date: undefined })).archives, [archives[1], archives[0], archives[2]]);
  console.log('Archive calendar emulator — confirmed empty day and legacy full-list compatibility: PASS');
  for (const date of ['2026-02-29', '2026-02-30', '', null]) {
    await assert.rejects(list('owner', { date }), { code: 'invalid-argument' });
  }
  await assert.rejects(list('owner', { storeId: 'other-store' }), { code: 'permission-denied' });
  await assert.rejects(list('outsider'), { code: 'permission-denied' });
  await base.collection('members').doc('editor').update({ status: 'suspended' });
  await assert.rejects(list('editor'), { code: 'permission-denied' });
  console.log('Archive calendar emulator — invalid dates, wrong store and missing/removed memberships blocked: PASS');
  const saved = await base.collection('dailyArchives').get();
  assert.deepEqual(
    saved.docs.map((doc) => doc.data()).sort((a, b) => a.id.localeCompare(b.id)),
    [...archives].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.equal((await base.collection('dailyClosingCounters').get()).size, 0);
  assert.equal((await base.collection('transactions').get()).size, 0);
  console.log('Archive calendar emulator — listing never writes cash, counters, balances or archive snapshots: PASS');
} finally {
  await db.terminate();
  await deleteApp(app);
}
