import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workspaceCommandHandler } from '../functions/lib/functions/src/workspaceCommand.js';
if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST))
  throw new Error('Demo emulator required');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'member-identity-tests');
const db = getFirestore(app);
const runtime = { firestore: db, now: () => '2026-10-22T16:00:00.000Z', token: () => 'd'.repeat(64) };
const command = (uid, data) =>
  workspaceCommandHandler({ auth: { uid, token: { email: 'private@example.test' } }, data }, runtime);
try {
  const owner = 'identity-owner',
    viewer = 'identity-viewer';
  const a = await command(owner, {
    action: 'create',
    operationId: 'identity-a',
    mode: 'shared',
    name: 'A',
    displayName: 'أحمد',
  });
  const b = await command(owner, {
    action: 'create',
    operationId: 'identity-b',
    mode: 'private',
    name: 'B',
    displayName: 'Ahmet',
  });
  // Synthetic demo-only profile initialization, matching the normal owner onboarding prerequisite.
  await db.doc(`spaces/${a.spaceId}/storeProfile/profile`).set({ storeId: 'identity-store' });
  const invitation = await command(owner, { action: 'invite', spaceId: a.spaceId, role: 'viewer' });
  await command(viewer, { action: 'accept', token: invitation.token, displayName: 'Ayşe' });
  const namesA = await command(viewer, { action: 'memberNames', spaceId: a.spaceId });
  const namesB = await command(owner, { action: 'memberNames', spaceId: b.spaceId });
  assert(namesA.members.some((m) => m.userId === owner && m.displayName === 'أحمد'));
  assert(namesA.members.some((m) => m.userId === viewer && m.displayName === 'Ayşe'));
  assert.deepEqual(namesB.members, [{ userId: owner, displayName: 'Ahmet' }]);
  await assert.rejects(command(viewer, { action: 'memberNames', spaceId: b.spaceId }), { code: 'permission-denied' });
  assert(!JSON.stringify(namesA).includes('@'));
  console.log(
    'Member identity emulator — same account has separate space names, Viewer reads scoped names without email exposure: PASS',
  );
  const space = db.doc(`spaces/${a.spaceId}`);
  const old = { id: 'kept', amount: 12.5, note: 'Unchanged history' };
  for (const collection of ['debts', 'payments', 'transactions', 'dailyArchives'])
    await space.collection(collection).doc('kept').set(old);
  const fresh = 'identity-first-name';
  await space.collection('members').doc(fresh).set({ status: 'active', role: 'viewer', userId: fresh });
  const races = await Promise.allSettled(
    ['Name A', 'Name B'].map((displayName) =>
      command(fresh, {
        action: 'setMemberName',
        spaceId: a.spaceId,
        displayName,
        userId: owner,
        role: 'owner',
      }),
    ),
  );
  assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(races.filter((r) => r.status === 'rejected').length, 1);
  assert.equal((await space.collection('members').doc(fresh).get()).data().role, 'viewer');
  assert.equal((await space.collection('members').doc(owner).get()).data().displayName, 'أحمد');
  await command(owner, { action: 'remove', spaceId: a.spaceId, userId: viewer });
  await assert.rejects(command(viewer, { action: 'memberNames', spaceId: a.spaceId }), { code: 'permission-denied' });
  const after = await command(owner, { action: 'memberNames', spaceId: a.spaceId });
  assert(after.members.some((m) => m.userId === viewer && m.displayName === 'Ayşe'));
  for (const collection of ['debts', 'payments', 'transactions', 'dailyArchives'])
    assert.deepEqual((await space.collection(collection).doc('kept').get()).data(), old);
  console.log(
    'Member identity emulator — concurrent self-name confirmation, no role escalation, revoked access and preserved history/financial rows: PASS',
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
