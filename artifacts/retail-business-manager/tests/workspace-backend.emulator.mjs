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
}finally{
  await db.terminate();await deleteApp(app);
}
// Reuse this demo emulator invocation rather than starting another service/CI job.
await import('./merchant-backend.emulator.mjs');
await import('./archive-calendar.emulator.mjs');
