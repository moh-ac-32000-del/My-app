import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workspaceCommandHandler } from '../functions/lib/functions/src/workspaceCommand.js';
import { bootstrapPrimarySpaceHandler } from '../functions/lib/functions/src/bootstrapPrimarySpace.js';
if (!['127.0.0.1:8080','localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Demo local emulator required');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-firestore-rules'},'workspace-concurrency-tests');
const db=getFirestore(app);
const runtime={firestore:db,now:()=>new Date().toISOString()};
const request=(uid,data)=>({auth:{uid,token:{}},data});
const command=(uid,data)=>workspaceCommandHandler(request(uid,data),runtime);
try {
  const created=await Promise.allSettled(['one','two'].map(operationId=>command('quota-owner',{action:'create',name:'Shop',mode:'private',operationId})));
  assert.equal(created.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(created.filter(r=>r.status==='rejected').length,1);
  assert.equal((await db.collection('spaces').where('ownerUserId','==','quota-owner').get()).size,1);
  console.log('Workspace emulator — concurrent private creation cannot exceed quota: PASS');

  const mixed=await Promise.allSettled([
    command('bootstrap-owner',{action:'create',name:'Shop',mode:'private',operationId:'explicit'}),
    bootstrapPrimarySpaceHandler(request('bootstrap-owner',{}),{firestore:db,serverTimestamp:()=>FieldValue.serverTimestamp()}),
  ]);
  assert(mixed.some(r=>r.status==='fulfilled'));
  assert.equal((await db.collection('spaces').where('ownerUserId','==','bootstrap-owner').get()).size,1);
  console.log('Workspace emulator — bootstrap and explicit creation share one quota boundary: PASS');

  const spaceId=created.find(r=>r.status==='fulfilled').value.spaceId;
  await db.doc(`spaces/${spaceId}/storeProfile/profile`).set({storeId:'emulator-store'});
  const invite=await command('quota-owner',{action:'invite',spaceId,role:'editor'});
  const accepted=await Promise.allSettled(['join-a','join-b'].map(uid=>command(uid,{action:'accept',token:invite.token})));
  assert.equal(accepted.filter(r=>r.status==='fulfilled').length,1);
  const members=await db.collection('spaces').doc(spaceId).collection('members').get();
  assert.equal(members.size,2);
  console.log('Workspace emulator — competing accounts consume invitation exactly once: PASS');

  const acceptedMember=members.docs.find(d=>d.id!=='quota-owner').id;
  await command('quota-owner',{action:'role',spaceId,userId:acceptedMember,role:'viewer'});
  await command('quota-owner',{action:'remove',spaceId,userId:acceptedMember});
  await assert.rejects(command(acceptedMember,{action:'accept',token:invite.token}),{code:'failed-precondition'});
  assert.equal((await db.doc(`spaces/${spaceId}/members/${acceptedMember}`).get()).data().status,'suspended');
  console.log('Workspace emulator — consumed invitation cannot restore removed access: PASS');

  const financialFixture = { id: 'kept', workspaceId: spaceId, storeId: 'emulator-store', amount: 12.5, note: 'Keep history', createdAt: '2026-10-21T12:00:00.000Z' };
  for (const name of ['debts', 'payments', 'transactions', 'dailyArchives']) await db.doc(`spaces/${spaceId}/${name}/kept`).set(financialFixture);
  const prepare = (uid, fields) => command(uid, { action: 'closingSettings', spaceId, closingSettings: fields });
  const initial = { timeZone: 'Europe/Istanbul', executionTime: '00:00', expectedRevision: 0 };
  const first = await prepare('quota-owner', initial);
  assert.equal(first.closingSettings.status, 'prepared');
  assert.equal(first.closingSettings.revision, 1);
  assert.deepEqual(await prepare('quota-owner', initial), first);
  console.log('Workspace closing emulator — owner prepares settings and retry does not duplicate revision: PASS');
  const changed = await Promise.allSettled(['America/New_York', 'UTC'].map(timeZone => prepare('quota-owner', { ...initial, expectedRevision: 1, timeZone })));
  assert.equal(changed.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(changed.filter(row => row.status === 'rejected').length, 1);
  console.log('Workspace closing emulator — conflicting devices cannot overwrite each other silently: PASS');
  for (const role of ['editor', 'viewer']) {
    const uid = `closing-${role}`;
    await db.doc(`spaces/${spaceId}/members/${uid}`).set({ role, status: 'active' });
    await assert.rejects(prepare(uid, { ...initial, expectedRevision: 2 }), { code: 'permission-denied' });
  }
  await assert.rejects(prepare(acceptedMember, initial), { code: 'permission-denied' });
  console.log('Workspace closing emulator — editors, viewers and removed users cannot configure closing: PASS');
  const savedSpace = (await db.doc(`spaces/${spaceId}`).get()).data();
  assert.equal(savedSpace.closingSettings.revision, 2);
  assert.equal(savedSpace.automaticClosing, undefined);
  assert.equal(savedSpace.nextClosingAt, undefined);
  for (const name of ['debts', 'payments', 'transactions', 'dailyArchives']) assert.deepEqual((await db.doc(`spaces/${spaceId}/${name}/kept`).get()).data(), financialFixture);
  assert.equal((await db.collection(`spaces/${spaceId}/dailyClosingCounters`).get()).size, 0);
  console.log('Workspace closing emulator — preparation never activates closing or modifies financial history: PASS');
}finally{
  await db.terminate();await deleteApp(app);
}
// Reuse this demo emulator invocation rather than starting another service/CI job.
await import('./merchant-backend.emulator.mjs');
await import('./archive-calendar.emulator.mjs');
