import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { merchantCommandHandler } from '../functions/lib/functions/src/merchantCommand.js';
import { merchantSettingsCommandHandler } from '../functions/lib/functions/src/merchantSettingsCommand.js';
import { settleCustomerDebtHandler } from '../functions/lib/functions/src/settleCustomerDebt.js';
import { trustedDebtCommandHandler } from '../functions/lib/functions/src/trustedDebtCommand.js';
import { dailyArchiveCommandHandler } from '../functions/lib/functions/src/dailyArchiveCommand.js';
import { customerOperationCommandHandler } from '../functions/lib/functions/src/customerOperationCommand.js';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection as clientCollection,
  query as clientQuery,
  where as clientWhere,
  orderBy as clientOrderBy,
  documentId as clientDocumentId,
  limit as clientLimit,
  startAfter as clientStartAfter,
  getDocsFromServer,
} from 'firebase/firestore';

if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Demo local emulator required; never run against a live Firebase project');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'merchant-accounting-tests');
const db = getFirestore(app);
const runtime = { firestore: db, now: () => new Date().toISOString() };
let clientEnvironment;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const request = (data) => ({ auth: { uid: 'merchant-test-owner', token: {} }, data });
async function fixture(suffix) {
  const spaceId = `merchant-emulator-${suffix}`;
  const base = { spaceId, storeId: 'test-store', customerId: 'test-customer', currency: 'TRY' };
  const space = db.collection('spaces').doc(spaceId);
  const scope = { workspaceId: spaceId, storeId: base.storeId };
  const batch = db.batch();
  batch.set(space, { status: 'active' });
  batch.set(space.collection('members').doc('merchant-test-owner'), { role: 'owner', status: 'active' });
  batch.set(space.collection('storeProfile').doc('profile'), { storeId: base.storeId });
  batch.set(space.collection('merchants').doc('test-merchant'), {
    id: 'test-merchant',
    ...scope,
    name: 'Test merchant',
    isActive: true,
  });
  batch.set(space.collection('customers').doc(base.customerId), {
    id: base.customerId,
    ...scope,
    name: 'Test customer',
    isActive: true,
  });
  batch.set(space.collection('debts').doc('old-debt'), {
    id: 'old-debt',
    ...scope,
    customerId: base.customerId,
    amount: 100,
    originalAmount: 120,
    currency: 'TRY',
    createdAt: '2026-10-18T10:00:00.000Z',
  });
  await batch.commit();
  return {
    space,
    base,
    merchant: (action, operationId, extra) =>
      merchantCommandHandler(
        request({
          action,
          operationId,
          spaceId,
          storeId: base.storeId,
          merchantId: 'test-merchant',
          currency: 'TRY',
          ...extra,
        }),
        runtime,
      ),
    credit: () =>
      space
        .collection('customerCredits')
        .doc(hash([base.customerId, 'TRY']))
        .get(),
    balance: () =>
      space
        .collection('merchantBalances')
        .doc(hash(['test-merchant', 'TRY']))
        .get(),
  };
}
try {
  const customerEdit = await fixture('customer-operation-editor');
  const customerData = { kind: 'debt', spaceId: customerEdit.space.id, storeId: customerEdit.base.storeId,
    customerId: customerEdit.base.customerId, targetId: 'old-debt', expectedUpdatedAt: '2026-10-18T10:00:00.000Z', expectedRevision: 0 };
  const customerCommand = data => customerOperationCommandHandler(request(data), runtime);
  const customerInput = { ...customerData, action: 'edit', operationId: 'principal-edit', amountExact: '100.00',
    operationDate: '2026-09-01', note: 'Corrected principal' };
  const customerResults = await Promise.all([customerCommand(customerInput), customerCommand(customerInput)]);
  assert.deepEqual(customerResults.map(row => row.outcome).sort(), ['completed','replayed']);
  const editedDebt = (await customerEdit.space.collection('debts').doc('old-debt').get()).data();
  assert.equal(editedDebt.amountExact, '80.00');
  assert.equal(editedDebt.originalAmount, 100);
  await assert.rejects(customerCommand({ ...customerInput, operationId: 'stale-edit' }), { code: 'failed-precondition' });
  await customerCommand({ ...customerData, action: 'cancel', operationId: 'cancel-charge', expectedUpdatedAt: editedDebt.updatedAt, expectedRevision: 1 });
  assert.equal((await customerEdit.credit()).data().creditExact, '20.00');
  const archived = { id: 'immutable', workspaceId: customerEdit.space.id, storeId: customerEdit.base.storeId,
    date: '2026-10-18', closedAt: '2026-10-18T15:00:00Z', closingNumber: 1, closingCashBalances: [{ currency: 'TRY', amount: 300 }],
    snapshot: [{ id: 'debt:old-debt', sourceId: 'old-debt', storeId: customerEdit.base.storeId, type: 'debt', amount: 120, currency: 'TRY', occurredAt: '2026-10-18T10:00:00Z' }] };
  await customerEdit.space.collection('dailyArchives').doc(archived.id).set(archived);
  const annotated = await dailyArchiveCommandHandler(request({ action: 'list', spaceId: customerEdit.space.id,
    storeId: customerEdit.base.storeId, date: archived.date, includeCurrentStatuses: true }), runtime);
  assert.equal(annotated.archives[0].operationStatuses['debt:old-debt'], 'cancelled');
  assert.deepEqual(annotated.archives[0].snapshot, archived.snapshot);
  assert.deepEqual((await customerEdit.space.collection('dailyArchives').doc(archived.id).get()).data(), archived);
  console.log('Customer debt editor emulator — concurrent replay, stale edit rejection, credit refund and immutable archive annotations: PASS');

  const customerPayment = await fixture('customer-payment-editor');
  await settleCustomerDebtHandler(request({ ...customerPayment.base, operationId: 'settlement', transactionId: 'cash', paymentId: 'payment', amount: 80 }), runtime);
  const paymentRef = customerPayment.space.collection('payments').doc('payment');
  const originalPayment = (await paymentRef.get()).data();
  const paymentInput = { action: 'edit', kind: 'payment', operationId: 'payment-edit', spaceId: customerPayment.space.id,
    storeId: customerPayment.base.storeId, customerId: customerPayment.base.customerId, targetId: 'payment',
    expectedUpdatedAt: originalPayment.updatedAt, expectedRevision: 0, amountExact: '50.00', method: 'card', operationDate: '2026-09-01', note: 'Corrected payment' };
  await customerCommand(paymentInput);
  const currentPayment = (await paymentRef.get()).data();
  assert.equal(currentPayment.amountExact, '50.00');
  assert.equal(currentPayment.paidAt, originalPayment.paidAt);
  assert.equal((await customerPayment.space.collection('debts').get()).docs.reduce((sum,doc) => sum + doc.data().amount, 0), 50);
  await customerCommand({ action: 'cancel', kind: 'payment', operationId: 'payment-cancel', spaceId: customerPayment.space.id,
    storeId: customerPayment.base.storeId, customerId: customerPayment.base.customerId, targetId: 'payment',
    expectedUpdatedAt: currentPayment.updatedAt, expectedRevision: 1 });
  assert.equal((await paymentRef.get()).data().cancelled, true);
  assert.equal((await customerPayment.space.collection('debts').get()).docs.reduce((sum,doc) => sum + doc.data().amount, 0), 100);
  assert.equal((await customerPayment.space.collection('transactions').get()).docs.reduce((sum,doc) => sum + (doc.data().type === 'cash_in' ? doc.data().amount : -doc.data().amount), 0), 0);
  const paymentDay = originalPayment.paidAt.slice(0, 10);
  const paymentEnd = new Date(Date.parse(`${paymentDay}T00:00:00.000Z`) + 86400000).toISOString();
  const paymentArchive = await dailyArchiveCommandHandler(request({ action: 'close', spaceId: customerPayment.space.id,
    storeId: customerPayment.base.storeId, date: paymentDay, startAt: `${paymentDay}T00:00:00.000Z`, endAt: paymentEnd }), runtime);
  const cashEvents = paymentArchive.created.snapshot.filter(row => ['settlement','cash_in','cash_out'].includes(row.type));
  assert.equal(cashEvents.find(row => row.type === 'settlement').amount, 80);
  assert.equal(cashEvents.reduce((sum, row) => sum + (row.type === 'cash_out' ? -row.amount : row.amount), 0), 0);
  console.log('Customer payment editor emulator — provenance, current-period cash adjustment, cancelled payment retention and unduplicated closing journal: PASS');

  const amend = await fixture('atomic-edit');
  await amend.space.collection('debts').doc('old-debt').delete();
  await amend.merchant('directPayment', 'old-direct', { customerId: amend.base.customerId, amountExact: '300.00' });
  const editInput = { customerId: amend.base.customerId, amountExact: '100.00', replacesOperationId: 'old-direct' };
  const edited = await Promise.all([
    amend.merchant('directPayment', 'new-direct', editInput),
    amend.merchant('directPayment', 'new-direct', editInput),
  ]);
  assert.deepEqual(edited.map(row => row.outcome).sort(), ['completed', 'replayed']);
  assert.equal((await amend.credit()).data().creditExact, '100.00');
  assert.equal((await amend.credit()).data().revision, 3);
  assert.equal((await amend.balance()).data().balanceExact, '-100.00');
  assert.equal((await amend.balance()).data().revision, 3);
  assert.equal((await amend.space.collection('merchantOperations').get()).size, 3);
  assert.equal((await amend.space.collection('transactions').get()).size, 0);
  await assert.rejects(amend.merchant('directPayment', 'new-direct', { ...editInput, amountExact: '101.00' }), { code: 'already-exists' });
  await assert.rejects(amend.merchant('directPayment', 'other-edit', editInput), { code: 'failed-precondition' });
  const cancelInput = { targetOperationId: 'new-direct', cancelled: true, reason: 'Operation cancelled' };
  const cancelled = await Promise.all([
    amend.merchant('reverse', 'cancel-direct', cancelInput),
    amend.merchant('reverse', 'cancel-direct', cancelInput),
  ]);
  assert.deepEqual(cancelled.map(row => row.outcome).sort(), ['completed', 'replayed']);
  assert.equal((await amend.credit()).data().creditExact, '0.00');
  assert.equal((await amend.balance()).data().balanceExact, '0.00');
  assert.equal((await amend.space.collection('merchantOperations').doc('new-direct').get()).data().cancelled, true);
  console.log('Merchant edit/cancel emulator — atomic shared-credit preparation, concurrent replay, stale edit rejection and no cash: PASS');

  // A prior partial debt means preparation creates a positive correction debt,
  // which the replacement may consume in this SAME transaction (create + update).
  const partialEdit = await fixture('edit-partial-customer-debt');
  await partialEdit.merchant('directPayment', 'old-direct', { customerId: partialEdit.base.customerId, amountExact: '300.00' });
  assert.equal((await partialEdit.credit()).data().creditExact, '200.00');
  await partialEdit.merchant('directPayment', 'new-direct', { customerId: partialEdit.base.customerId,
    amountExact: '100.00', replacesOperationId: 'old-direct' });
  assert.equal((await partialEdit.credit()).data().creditExact, '0.00');
  const partialDebts = await partialEdit.space.collection('debts').get();
  assert.equal(partialDebts.docs.reduce((sum, doc) => sum + doc.data().amount, 0), 0);
  assert.equal((await partialEdit.balance()).data().balanceExact, '-100.00');
  assert.equal((await partialEdit.space.collection('transactions').get()).size, 0);
  console.log('Merchant edit emulator — prepared positive correction debt and replacement consume together without residual customer debt: PASS');

  const materials = await fixture('separate-materials');
  const materialInput = { separateLines: true, paidExact: '0.00', source: 'cash', lines: [
    { name: 'Screens', quantity: '2', unitPrice: '100.0050' },
    { name: 'Batteries', quantity: '3', unitPrice: '20.0000' },
  ] };
  const materialResults = await Promise.all([
    materials.merchant('purchase', 'atomic-materials', materialInput),
    materials.merchant('purchase', 'atomic-materials', materialInput),
  ]);
  assert.deepEqual(materialResults.map(row => row.outcome).sort(), ['completed', 'replayed']);
  assert.equal((await materials.balance()).data().balanceExact, '260.01');
  assert.equal((await materials.balance()).data().revision, 2);
  const materialRows = (await materials.space.collection('merchantOperations').get()).docs;
  assert.equal(materialRows.length, 2);
  assert.ok(materialRows.every(row => row.data().lines.length === 1));
  assert.equal((await materials.space.collection('transactions').get()).size, 0);
  await assert.rejects(materials.merchant('purchase', 'atomic-materials', {
    ...materialInput, lines: [{ name: 'Changed', quantity: '1', unitPrice: '1' }],
  }), { code: 'already-exists' });
  const battery = materialRows.find(row => row.data().lines[0].name === 'Batteries');
  await materials.merchant('reverse', 'one-material-only', { targetOperationId: battery.id, reason: 'Wrong material' });
  assert.equal((await materials.balance()).data().balanceExact, '200.01');
  assert.equal((await materials.balance()).data().revision, 3);
  console.log('Merchant material emulator — atomic separate rows, concurrent replay, changed-payload rejection and single-material correction: PASS');
  const beforeInvalid = (await materials.space.collection('merchantOperations').get()).size;
  await assert.rejects(materials.merchant('purchase', 'invalid-batch', {
    ...materialInput, lines: [...materialInput.lines, { name: 'Bad', quantity: '0.0001', unitPrice: '1' }],
  }), { code: 'invalid-argument' });
  assert.equal((await materials.space.collection('merchantOperations').get()).size, beforeInvalid);
  assert.equal((await materials.space.collection('operationReceipts').doc('invalid-batch').get()).exists, false);
  console.log('Merchant material emulator — an invalid material cannot leave a partial purchase or receipt: PASS');
  const statementRequest = request({ action: 'statement', operationId: 'statement-auth',
    spaceId: materials.space.id, storeId: materials.base.storeId, merchantId: 'test-merchant' });
  assert.deepEqual((await merchantCommandHandler(statementRequest, runtime)).balances,
    [{ currency: 'TRY', revision: 3, balanceExact: '200.01' }]);
  assert.equal((await materials.space.collection('operationReceipts').doc('statement-auth').get()).exists, false);
  await materials.space.collection('members').doc('merchant-test-owner').update({ role: 'viewer' });
  await assert.rejects(merchantCommandHandler(statementRequest, runtime), { code: 'permission-denied' });
  console.log('Merchant statement emulator — fresh Viewer rejection and read-only completeness authorization: PASS');
  const catalog = await fixture('shared-catalog');
  const catalogInput = {spaceId:catalog.space.id,storeId:catalog.base.storeId,operationId:'catalog-a',settings:{revision:0,materials:[{id:'goods',name:'Shared goods',prices:{TRY:'100.0000'},isActive:true}],paymentMethods:[{id:'bank-label',name:'Bank label only',isActive:true}]}};
  const saves = await Promise.allSettled(['catalog-a','catalog-b'].map(operationId=>merchantSettingsCommandHandler(request({...catalogInput,operationId}),runtime)));
  assert.equal(saves.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(saves.find(row=>row.status==='rejected').reason.code,'aborted');
  assert.equal((await catalog.space.collection('merchantSettings').doc('config').get()).data().revision,1);
  console.log('Merchant settings emulator — concurrent reference-list saves cannot overwrite the winning revision: PASS');
  await catalog.merchant('payment','labeled-payment',{amountExact:'50.00',source:'cash',operationDate:'2026-01-01',paymentMethodId:'bank-label',paymentMethodName:'Bank label only'});
  const labeled = (await catalog.space.collection('merchantOperations').doc('labeled-payment').get()).data();
  assert.equal(labeled.operationDate,'2026-01-01');
  assert.notEqual(labeled.createdAt.slice(0,10),'2026-01-01');
  assert.equal(labeled.cashDeltaExact,'-50.00');
  assert.equal((await catalog.space.collection('transactions').get()).docs[0].data().amount,50);
  console.log('Merchant settings emulator — descriptive payment method never changes cash effect or accounting date: PASS');
  const parallel = await fixture('parallel');
  await Promise.all([
    parallel.merchant('directPayment', 'direct', { customerId: parallel.base.customerId, amountExact: '130.00' }),
    settleCustomerDebtHandler(
      request({ ...parallel.base, amount: 70, operationId: 'cash', transactionId: 'cash', paymentId: 'cash' }),
      runtime,
    ),
  ]);
  assert.equal((await parallel.credit()).data().creditExact, '100.00');
  assert.equal((await parallel.balance()).data().balanceExact, '-130.00');
  assert.equal((await parallel.space.collection('debts').doc('old-debt').get()).data().amountExact, '0.00');
  const transactions = await parallel.space.collection('transactions').get();
  assert.equal(transactions.size, 1);
  assert.equal(transactions.docs[0].data().amount, 70);
  console.log(
    'Merchant emulator — concurrent direct and cash payments preserve both credits with one cash movement: PASS',
  );

  const race = await fixture('charge-race');
  await Promise.all([
    settleCustomerDebtHandler(
      request({ ...race.base, amount: 130, operationId: 'pay', transactionId: 'pay', paymentId: 'pay' }),
      runtime,
    ),
    trustedDebtCommandHandler(
      request({ ...race.base, action: 'create', amount: 20, debtId: 'new-debt', operationId: 'charge' }),
      runtime,
    ),
  ]);
  assert.equal((await race.credit()).data().creditExact, '10.00');
  assert.equal(
    (await race.space.collection('debts').get()).docs.reduce((sum, doc) => sum + doc.data().amount, 0),
    0,
  );
  console.log('Merchant emulator — concurrent charge and cash overpayment share the same credit revision: PASS');

  const replay = await fixture('replay');
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      replay.merchant('purchase', 'purchase', {
        lines: [{ name: 'Goods', quantity: '1', unitPrice: '100.00' }],
        source: 'cash',
        paidExact: '25.00',
      }),
    ),
  );
  assert.equal(results.filter((result) => result.outcome === 'completed').length, 1);
  assert.equal(results.filter((result) => result.outcome === 'replayed').length, 2);
  assert.equal((await replay.balance()).data().balanceExact, '75.00');
  assert.equal((await replay.space.collection('transactions').get()).size, 1);
  console.log('Merchant emulator — simultaneous identical purchases create one operation and linked cash record: PASS');
  await assert.rejects(
    replay.merchant('purchase', 'purchase', {
      lines: [{ name: 'Changed goods', quantity: '1', unitPrice: '100.00' }],
      source: 'cash',
      paidExact: '25.00',
    }),
    { code: 'already-exists' },
  );
  console.log('Merchant emulator — reused operation ID with a different description is rejected: PASS');

  const rejected = await fixture('scope');
  await rejected.space.collection('customers').doc(rejected.base.customerId).update({ workspaceId: 'other-space' });
  await assert.rejects(
    rejected.merchant('directPayment', 'bad', { customerId: rejected.base.customerId, amountExact: '130.00' }),
    { code: 'not-found' },
  );
  assert.equal((await rejected.space.collection('merchantOperations').get()).size, 0);
  assert.equal((await rejected.space.collection('merchantBalances').get()).size, 0);
  assert.equal((await rejected.space.collection('customerCredits').get()).size, 0);
  assert.equal((await rejected.space.collection('debts').doc('old-debt').get()).data().amount, 100);
  console.log('Merchant emulator — cross-space customer rejection leaves both financial accounts unchanged: PASS');

  const corrections = await fixture('reversal');
  await corrections.merchant('directPayment', 'direct', {
    customerId: corrections.base.customerId,
    amountExact: '130.00',
  });
  const reversed = await Promise.allSettled(
    ['one', 'two'].map((operationId) =>
      corrections.merchant('reverse', operationId, {
        targetOperationId: 'direct',
        reason: 'Correct erroneous direct payment',
      }),
    ),
  );
  assert.equal(reversed.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(reversed.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await corrections.balance()).data().balanceExact, '0.00');
  assert.equal((await corrections.credit()).data().creditExact, '0.00');
  assert.equal(
    (await corrections.space.collection('debts').get()).docs.reduce((sum, doc) => sum + doc.data().amount, 0),
    100,
  );
  assert.equal((await corrections.space.collection('transactions').get()).size, 0);
  assert.equal((await corrections.space.collection('merchantOperations').get()).size, 2);
  console.log(
    'Merchant emulator — competing reversals preserve original history and create exactly one noncash correction: PASS',
  );

  const journal = await fixture('journal-archive');
  const archiveDay = new Date();
  const archiveStart = new Date(Date.UTC(archiveDay.getUTCFullYear(), archiveDay.getUTCMonth(), archiveDay.getUTCDate()));
  const archiveEnd = new Date(archiveStart.getTime() + 24 * 60 * 60 * 1000);
  await journal.space.collection('debts').doc('old-debt').update({ createdAt: new Date(archiveStart.getTime() - 1000).toISOString() });
  await journal.merchant('purchase', 'purchase', { lines: [{ name: 'Goods', quantity: '1', unitPrice: '100.00' }],
    source: 'cash', paidExact: '25.00', note: 'Materials description' });
  await journal.merchant('payment', 'external', { source: 'external', amountExact: '30.00' });
  await journal.merchant('directPayment', 'direct', { customerId: journal.base.customerId, amountExact: '130.00' });
  const closeJournal = () => dailyArchiveCommandHandler(request({ action: 'close', spaceId: journal.space.id,
    storeId: journal.base.storeId, date: archiveStart.toISOString().slice(0, 10),
    startAt: archiveStart.toISOString(), endAt: archiveEnd.toISOString() }), runtime);
  const firstArchive = (await closeJournal()).created;
  assert.equal(firstArchive.snapshot.length, 3);
  assert(firstArchive.snapshot.every((event) => event.type === 'merchant'));
  assert.deepEqual(firstArchive.closingCashBalances, [{ currency: 'TRY', amount: -25 }]);
  assert.equal(firstArchive.snapshot.find((event) => event.id === 'merchant:purchase').lines[0].name, 'Goods');
  const firstSnapshot = structuredClone(firstArchive);
  await journal.merchant('reverse', 'purchase-correction', { targetOperationId: 'purchase', reason: 'Wrong invoice' });
  const secondArchive = (await closeJournal()).created;
  assert.equal(secondArchive.snapshot.length, 1);
  assert.equal(secondArchive.snapshot[0].id, 'merchant:purchase-correction');
  assert.equal(secondArchive.snapshot[0].amountExact, '100.00');
  assert.deepEqual(secondArchive.closingCashBalances, [{ currency: 'TRY', amount: 0 }]);
  assert.deepEqual((await closeJournal()).created.snapshot, []);
  assert.deepEqual((await journal.space.collection('dailyArchives').doc(firstArchive.id).get()).data(), firstSnapshot);
  console.log('Merchant archive emulator — purchases/direct/external payments and corrections remain distinct, cash counted once, prior snapshots immutable: PASS');
  const orphan = await fixture('archive-orphan');
  await orphan.merchant('payment', 'payment', { source: 'cash', amountExact: '10.00' });
  const orphanCash = (await orphan.space.collection('transactions').get()).docs[0];
  await orphanCash.ref.update({ merchantOperationId: 'missing' });
  await assert.rejects(dailyArchiveCommandHandler(request({ action: 'close', spaceId: orphan.space.id,
    storeId: orphan.base.storeId, date: archiveStart.toISOString().slice(0, 10),
    startAt: archiveStart.toISOString(), endAt: archiveEnd.toISOString() }), runtime), { code: 'failed-precondition' });
  assert.equal((await orphan.space.collection('dailyArchives').get()).size, 0);
  assert.equal((await orphan.space.collection('dailyClosingCounters').get()).size, 0);
  console.log('Merchant archive emulator — inconsistent linked cash aborts archive and counter atomically: PASS');

  const precision = await fixture('precision-edit');
  await precision.space.collection('debts').doc('old-debt').update({ amount: 1, amountExact: '1.0000000000000000001' });
  await trustedDebtCommandHandler(
    request({
      ...precision.base,
      action: 'update',
      amount: 1,
      debtId: 'old-debt',
      operationId: 'date-only-edit',
      dueDate: '2026-11-01',
    }),
    runtime,
  );
  assert.equal(
    (await precision.space.collection('debts').doc('old-debt').get()).data().amountExact,
    '1.0000000000000000001',
  );
  assert.equal(
    (await precision.space.collection('operationReceipts').doc('date-only-edit').get()).data().previousDebt.amountExact,
    '1.0000000000000000001',
  );
  console.log('Customer credit emulator — numeric-mirror date-only edits preserve exact remaining precision: PASS');

  const history = await fixture('history-pages');
  const historyBatch = db.batch();
  for (let index = 0; index < 205; index += 1) {
    const id = `row-${String(index).padStart(3, '0')}`;
    historyBatch.set(history.space.collection('merchantOperations').doc(id), {
      id,
      workspaceId: history.space.id,
      storeId: history.base.storeId,
      merchantId: 'test-merchant',
      merchantName: 'Test merchant',
      action: 'payment',
      currency: 'TRY',
      source: 'external',
      amountExact: '1.00',
      cashDeltaExact: '0.00',
      balanceBeforeExact: index ? `-${index}.00` : '0.00',
      balanceAfterExact: `-${index + 1}.00`,
      note: '',
      createdAt: '2026-10-18T12:00:00.000Z',
      createdByUserId: 'merchant-test-owner',
    });
  }
  await historyBatch.commit();
  clientEnvironment = await initializeTestEnvironment({
    projectId: 'demo-firestore-rules',
    firestore: { host: '127.0.0.1', port: 8080 },
  });
  const clientDb = clientEnvironment.authenticatedContext('merchant-test-owner').firestore();
  const historyCollection = clientCollection(clientDb, 'spaces', history.space.id, 'merchantOperations');
  const pageQuery = (cursor) =>
    clientQuery(
      historyCollection,
      clientWhere('merchantId', '==', 'test-merchant'),
      clientOrderBy('createdAt', 'desc'),
      clientOrderBy(clientDocumentId(), 'desc'),
      ...(cursor ? [clientStartAfter(cursor.data().createdAt, cursor.id)] : []),
      clientLimit(100),
    );
  const firstPage = await getDocsFromServer(pageQuery());
  assert.equal(firstPage.size, 100);
  assert.equal(firstPage.docs[0].id, 'row-204');
  await history.space
    .collection('merchantOperations')
    .doc('new-head')
    .set({
      ...firstPage.docs[0].data(),
      id: 'new-head',
      balanceBeforeExact: '-205.00',
      balanceAfterExact: '-206.00',
      createdAt: '2026-10-19T12:00:00.000Z',
    });
  const secondPage = await getDocsFromServer(pageQuery(firstPage.docs.at(-1)));
  const thirdPage = await getDocsFromServer(pageQuery(secondPage.docs.at(-1)));
  assert.equal(secondPage.size, 100);
  assert.equal(thirdPage.size, 5);
  const oldIds = [...firstPage.docs, ...secondPage.docs, ...thirdPage.docs].map((document) => document.id);
  assert.equal(new Set(oldIds).size, 205);
  assert.equal((await getDocsFromServer(pageQuery())).docs[0].id, 'new-head');
  const journalRows = await getDocsFromServer(clientQuery(historyCollection,
    clientWhere('storeId', '==', history.base.storeId), clientWhere('createdAt', '>=', '2026-10-19T00:00:00.000Z'),
    clientWhere('createdAt', '<', '2026-10-20T00:00:00.000Z')));
  assert.deepEqual(journalRows.docs.map((document) => document.id), ['new-head']);
  console.log('Merchant journal emulator — authenticated store/date range excludes older statement rows: PASS');
  console.log(
    'Merchant history emulator — authenticated SDK date/ID cursors cover 205 tied-time records without gaps as a new head arrives: PASS',
  );
  await assert.rejects(
    getDocsFromServer(
      clientQuery(
        clientCollection(clientDb, 'spaces', 'not-a-membership', 'merchantOperations'),
        clientWhere('merchantId', '==', 'test-merchant'),
        clientOrderBy('createdAt', 'desc'),
        clientLimit(100),
      ),
    ),
    { code: 'permission-denied' },
  );
  console.log('Merchant history emulator — historical queries cannot cross workspace membership: PASS');
} finally {
  if (clientEnvironment) await clientEnvironment.cleanup();
  await db.terminate();
  await deleteApp(app);
}
