import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { merchantCommandHandler } from '../functions/lib/functions/src/merchantCommand.js';
import { settleCustomerDebtHandler } from '../functions/lib/functions/src/settleCustomerDebt.js';
import { trustedDebtCommandHandler } from '../functions/lib/functions/src/trustedDebtCommand.js';

if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Demo local emulator required; never run against a live Firebase project');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-firestore-rules' }, 'merchant-accounting-tests');
const db = getFirestore(app);
const runtime = { firestore: db, now: () => new Date().toISOString() };
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

  const precision = await fixture('precision-edit');
  await precision.space.collection('debts').doc('old-debt').update({ amount: 1, amountExact: '1.0000000000000000001' });
  await trustedDebtCommandHandler(request({ ...precision.base, action: 'update', amount: 1,
    debtId: 'old-debt', operationId: 'date-only-edit', dueDate: '2026-11-01' }), runtime);
  assert.equal((await precision.space.collection('debts').doc('old-debt').get()).data().amountExact, '1.0000000000000000001');
  assert.equal((await precision.space.collection('operationReceipts').doc('date-only-edit').get()).data().previousDebt.amountExact, '1.0000000000000000001');
  console.log('Customer credit emulator — numeric-mirror date-only edits preserve exact remaining precision: PASS');
} finally {
  await db.terminate();
  await deleteApp(app);
}
