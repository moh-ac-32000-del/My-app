import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

// This suite clears its database between cases; refuse every non-local target.
if (!['127.0.0.1:8080', 'localhost:8080'].includes(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Run test:rules against the local Firestore emulator on port 8080');
}
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnvironment = await initializeTestEnvironment({
  projectId: 'demo-firestore-rules',
  firestore: { rules },
});

const userA = testEnvironment.authenticatedContext('user-A');
const userB = testEnvironment.authenticatedContext('user-B');
const anonymous = testEnvironment.unauthenticatedContext();

function legacySpaceDocument(spaceId, ownerUserId) {
  return {
    spaceId,
    name: `Space ${spaceId}`,
    mode: 'private',
    status: 'active',
    ownerUserId,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
  };
}

function membershipDocument(spaceId, userId, role, status = 'active') {
  return {
    spaceId,
    userId,
    role,
    status,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    joinedAt: '2026-08-30T10:00:00.000Z',
  };
}

function membershipIndexDocument(spaceId, role) {
  return {
    spaceId,
    role,
    status: 'active',
    spaceNameSnapshot: `Space ${spaceId}`,
    joinedAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
  };
}

function spaceDocument(spaceId, ownerUserId) {
  return {
    spaceId,
    ownerUserId,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
  };
}

function spaceReference(context, spaceId) {
  return doc(context.firestore(), 'stores', spaceId);
}

function multiSpaceReference(context, spaceId) {
  return doc(context.firestore(), 'spaces', spaceId);
}

function memberReference(context, spaceId, uid) {
  return doc(context.firestore(), 'spaces', spaceId, 'members', uid);
}

function membershipIndexReference(context, uid, spaceId) {
  return doc(context.firestore(), 'users', uid, 'memberships', spaceId);
}

function customerReference(context, spaceId, customerId) {
  return doc(context.firestore(), 'spaces', spaceId, 'customers', customerId);
}

function topLevelCustomerReference(context, customerId) {
  return doc(context.firestore(), 'customers', customerId);
}

function customerDocument(customerId, overrides = {}) {
  return {
    id: customerId,
    storeId: 'store-A',
    name: 'Customer A',
    phone: '+905001234567',
    address: 'Istanbul',
    notes: 'VIP',
    isActive: true,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

function paymentDocument(paymentId, overrides = {}) {
  return {
    id: paymentId,
    storeId: 'store-A',
    workspaceId: 'space-A',
    createdByUserId: 'user-A',
    amount: { amount: 100, currency: 'TRY' },
    direction: 'in',
    method: 'cash',
    customerId: 'customer-A',
    paidAt: '2026-08-30T10:00:00.000Z',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

function transactionDocument(transactionId, overrides = {}) {
  return {
    id: transactionId,
    storeId: 'store-A',
    type: 'cash_in',
    amount: 100,
    currency: 'TRY',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

function debtDocument(debtId) {
  return {
    id: debtId,
    storeId: 'store-A',
    workspaceId: 'space-A',
    createdByUserId: 'user-A',
    customerId: 'customer-A',
    amount: 100,
    currency: 'TRY',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
  };
}

function userReference(context, uid) {
  return doc(context.firestore(), 'users', uid);
}

async function clearFirestore() {
  await testEnvironment.clearFirestore();
}

async function seedUser(uid, data = {}) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(userReference(context, uid), {
      primarySpaceId: 'space-A',
      ...data,
    });
  });
}

async function seedMultiSpace(spaceId, ownerUserId, members = []) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(multiSpaceReference(context, spaceId), {
      ...spaceDocument(spaceId, ownerUserId),
      status: 'active',
    });
    for (const member of members) {
      await setDoc(
        memberReference(context, spaceId, member.uid),
        membershipDocument(spaceId, member.uid, member.role, member.status ?? 'active'),
      );
      await setDoc(
        membershipIndexReference(context, member.uid, spaceId),
        membershipIndexDocument(spaceId, member.role),
      );
    }
  });
}

async function seedSpace(context, spaceId, ownerUserId) {
  // Existing legacy records can contain fields no longer allowed on creation.
  await testEnvironment.withSecurityRulesDisabled(async (seedContext) => {
    await setDoc(spaceReference(seedContext, spaceId), legacySpaceDocument(spaceId, ownerUserId));
  });
}

async function runCase(name, operation, expected) {
  try {
    if (expected === 'ALLOW') {
      await assertSucceeds(operation());
    } else {
      await assertFails(operation());
    }
    console.log(`${name}: PASS`);
  } catch (error) {
    console.error(`${name}: FAIL`);
    throw error;
  }
}

try {
  await clearFirestore();
  for(const context of [userA,userB,anonymous]) {
    await runCase('Workspace privacy — invitation tokens cannot be read directly',()=>getDoc(doc(context.firestore(),'spaceInvitations','synthetic-hash')),'DENY');
    await runCase('Workspace privacy — invitations cannot be listed directly',()=>getDocs(collection(context.firestore(),'spaceInvitations')),'DENY');
    await runCase('Workspace privacy — invitations cannot be created directly',()=>setDoc(doc(context.firestore(),'spaceInvitations','synthetic-hash'),{spaceId:'space-A',role:'owner',status:'pending'}),'DENY');
    await runCase('Workspace privacy — quota and plan fields cannot be forged',()=>setDoc(doc(context.firestore(),'users','user-A'),{workspaceLimits:{private:100,shared:100}}),'DENY');
  }
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pushDevices', 'device-test'), { uid: 'user-A', token: 'synthetic-private-token', enabled: true });
  });
  for (const [label, context] of [['owner', userA], ['other user', userB], ['anonymous', anonymous]]) {
    const reference = doc(context.firestore(), 'pushDevices', 'device-test');
    for (const [operation, run] of [
      ['read', () => getDoc(reference)],
      ['list', () => getDocs(collection(context.firestore(), 'pushDevices'))],
      ['write', () => setDoc(reference, { uid: 'user-A', enabled: true })],
      ['update', () => updateDoc(reference, { enabled: false })],
      ['delete', () => deleteDoc(reference)],
    ]) {
      await runCase(`Push privacy — ${label} cannot ${operation} server-only device records`, run, 'DENY');
    }
  }
  await clearFirestore();
  await runCase(
    'Readiness — new user can list its empty discovery index before bootstrap',
    () => getDocs(collection(userA.firestore(), 'users', 'user-A', 'memberships')),
    'ALLOW',
  );
  await runCase(
    'Readiness — anonymous cannot list a discovery index',
    () => getDocs(collection(anonymous.firestore(), 'users', 'user-A', 'memberships')),
    'DENY',
  );
  await runCase(
    'Readiness — user cannot list another empty discovery index',
    () => getDocs(collection(userA.firestore(), 'users', 'user-B', 'memberships')),
    'DENY',
  );
  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await runCase(
    'Test 1 — user A reads space A',
    () => getDoc(spaceReference(userA, 'space-A')),
    'ALLOW',
  );

  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await runCase(
    'Test 2 — user B reads space A',
    () => getDoc(spaceReference(userB, 'space-A')),
    'DENY',
  );

  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await runCase(
    'Test 3 — anonymous reads space A',
    () => getDoc(spaceReference(anonymous, 'space-A')),
    'DENY',
  );

  await clearFirestore();
  await runCase(
    'Test 4 — user A creates space A',
    () => setDoc(
      spaceReference(userA, 'space-A'),
      spaceDocument('space-A', 'user-A'),
    ),
    'ALLOW',
  );

  await clearFirestore();
  await runCase(
    'Test 5 — user B cannot forge user A as owner',
    () => setDoc(
      spaceReference(userB, 'space-A'),
      spaceDocument('space-A', 'user-A'),
    ),
    'DENY',
  );

  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await runCase(
    'Test 6 — user A changes owner to user B',
    () => updateDoc(spaceReference(userA, 'space-A'), { ownerUserId: 'user-B' }),
    'DENY',
  );

  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await runCase(
    'Test 7 — user A deletes space A',
    () => deleteDoc(spaceReference(userA, 'space-A')),
    'DENY',
  );

  await clearFirestore();
  await seedSpace(userB, 'space-B', 'user-B');
  await runCase(
    'Test 8 — user A reads space B',
    () => getDoc(spaceReference(userA, 'space-B')),
    'DENY',
  );

  await clearFirestore();
  await seedUser('user-A');
  await runCase(
    'Test 9 — user A reads own user document',
    () => getDoc(userReference(userA, 'user-A')),
    'ALLOW',
  );
  await runCase(
    'Test 10 — user A cannot read user B document',
    () => getDoc(userReference(userA, 'user-B')),
    'DENY',
  );
  await runCase(
    'Test 11 — client cannot create user document',
    () => setDoc(userReference(userA, 'user-B'), { primarySpaceId: 'space-B' }),
    'DENY',
  );
  await runCase(
    'Test 12 — client cannot update user document',
    () => updateDoc(userReference(userA, 'user-A'), { primarySpaceId: 'space-B' }),
    'DENY',
  );
  await runCase(
    'Test 13 — client cannot delete user document',
    () => deleteDoc(userReference(userA, 'user-A')),
    'DENY',
  );

  await clearFirestore();
  await seedSpace(userA, 'space-A', 'user-A');
  await seedSpace(userB, 'space-B', 'user-B');
  await runCase(
    'Additional — user A cannot list across space B',
    () => getDocs(collection(userA.firestore(), 'stores')),
    'DENY',
  );

  await clearFirestore();
  await seedMultiSpace('space-A', 'user-A', [
    { uid: 'user-A', role: 'owner' },
    { uid: 'user-C', role: 'editor' },
  ]);
  await seedMultiSpace('space-B', 'user-B', [
    { uid: 'user-B', role: 'owner' },
  ]);
  const userC = testEnvironment.authenticatedContext('user-C');
  try {
    await runCase(
      'Test 14 — owner reads Space A',
      () => getDoc(multiSpaceReference(userA, 'space-A')),
      'ALLOW',
    );
    await runCase(
      'Test 15 — active member reads Space A',
      () => getDoc(multiSpaceReference(userC, 'space-A')),
      'ALLOW',
    );
    await runCase(
      'Test 16 — user from another Space is denied',
      () => getDoc(multiSpaceReference(userB, 'space-A')),
      'DENY',
    );
    await runCase(
      'Test 17 — anonymous is denied',
      () => getDoc(multiSpaceReference(anonymous, 'space-A')),
      'DENY',
    );
    await runCase(
      'Test 18 — active member reads own membership',
      () => getDoc(memberReference(userC, 'space-A', 'user-C')),
      'ALLOW',
    );
    await runCase(
      'Test 19 — member cannot read another member membership',
      () => getDoc(memberReference(userC, 'space-A', 'user-A')),
      'DENY',
    );
    await runCase(
      'Additional — anonymous cannot read a member document',
      () => getDoc(memberReference(anonymous, 'space-A', 'user-A')),
      'DENY',
    );
    await runCase(
      'Test 20 — user A reads own membership discovery index',
      () => getDoc(membershipIndexReference(userA, 'user-A', 'space-A')),
      'ALLOW',
    );
    await runCase(
      'Readiness — signed-in user can list own membership discovery index',
      () => getDocs(collection(userA.firestore(), 'users', 'user-A', 'memberships')),
      'ALLOW',
    );
    await runCase(
      'Readiness — user cannot list another user discovery index',
      () => getDocs(collection(userA.firestore(), 'users', 'user-B', 'memberships')),
      'DENY',
    );
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(membershipIndexReference(context, 'user-A', 'space-stale'), membershipIndexDocument('space-stale', 'owner'));
      await setDoc(multiSpaceReference(context, 'space-stale'), spaceDocument('space-stale', 'user-B'));
    });
    await runCase(
      'Readiness — own stale discovery hint can be listed',
      () => getDocs(collection(userA.firestore(), 'users', 'user-A', 'memberships')),
      'ALLOW',
    );
    await runCase(
      'Readiness — discovery hint does not authorize workspace access',
      () => getDoc(multiSpaceReference(userA, 'space-stale')),
      'DENY',
    );
    await runCase(
      'Readiness — discovery hint does not authorize customer access',
      () => getDocs(collection(userA.firestore(), 'spaces', 'space-stale', 'customers')),
      'DENY',
    );
    await runCase(
      'Test 21 — user A cannot read another user membership discovery index',
      () => getDoc(membershipIndexReference(userA, 'user-C', 'space-A')),
      'DENY',
    );
    await runCase(
      'Test 22 — owner cannot change ownerUserId',
      () => updateDoc(multiSpaceReference(userA, 'space-A'), { ownerUserId: 'user-C' }),
      'DENY',
    );
    await runCase(
      'Test 23 — member cannot promote itself to owner',
      () => updateDoc(memberReference(userC, 'space-A', 'user-C'), { role: 'owner' }),
      'DENY',
    );
    await runCase(
      'Test 24 — client cannot change membership index',
      () => updateDoc(membershipIndexReference(userA, 'user-A', 'space-A'), { role: 'manager' }),
      'DENY',
    );
    await runCase(
      'Test 25 — client cannot add itself as a member',
      () => setDoc(memberReference(userC, 'space-A', 'user-C'), membershipDocument('space-A', 'user-C', 'manager')),
      'DENY',
    );
    await runCase(
      'Test 26 — client cannot delete Owner Membership',
      () => deleteDoc(memberReference(userA, 'space-A', 'user-A')),
      'DENY',
    );

    await clearFirestore();
    await seedMultiSpace('space-A', 'user-A', [
      { uid: 'user-A', role: 'owner' },
      { uid: 'user-C', role: 'editor' },
      { uid: 'user-D', role: 'viewer', status: 'suspended' },
    ]);
    await seedMultiSpace('space-B', 'user-B', [
      { uid: 'user-B', role: 'owner' },
    ]);
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'spaces', 'space-A', 'storeProfile', 'profile'),
        { storeId: 'store-A' },
      );
      await setDoc(
        customerReference(context, 'space-A', 'customer-A'),
        customerDocument('customer-A', { workspaceId: 'space-A' }),
      );
      await setDoc(doc(context.firestore(), 'spaces', 'space-A', 'debts', 'debt-A'), debtDocument('debt-A'));
    });
    const userCForCustomers = testEnvironment.authenticatedContext('user-C');
    const userDForCustomers = testEnvironment.authenticatedContext('user-D');
    try {
      await runCase(
        'Customer — active owner can read',
        () => getDoc(customerReference(userA, 'space-A', 'customer-A')),
        'ALLOW',
      );
      await runCase(
        'Customer — active member can read',
        () => getDoc(customerReference(userCForCustomers, 'space-A', 'customer-A')),
        'ALLOW',
      );
      await runCase(
        'Customer — active member can list its Workspace',
        () => getDocs(collection(userCForCustomers.firestore(), 'spaces', 'space-A', 'customers')),
        'ALLOW',
      );
      await runCase(
        'Customer — active member can create a valid document',
        () => setDoc(
          customerReference(userCForCustomers, 'space-A', 'customer-C'),
          customerDocument('customer-C', { workspaceId: 'space-A' }),
        ),
        'ALLOW',
      );
      await runCase(
        'Customer — mismatched store ID on create is denied',
        () => setDoc(
          customerReference(userCForCustomers, 'space-A', 'customer-wrong-store'),
          customerDocument('customer-wrong-store', { workspaceId: 'space-A', storeId: 'store-forged' }),
        ),
        'DENY',
      );
      await runCase(
        'Customer — mismatched store ID on update is denied',
        () => updateDoc(
          customerReference(userCForCustomers, 'space-A', 'customer-A'),
          { storeId: 'store-forged' },
        ),
        'DENY',
      );
      await runCase(
        'Customer — active member can update a valid document',
        () => updateDoc(
          customerReference(userCForCustomers, 'space-A', 'customer-A'),
          { name: 'Updated Customer' },
        ),
        'ALLOW',
      );
      await runCase(
        'Customer — active member cannot hard-delete a document',
        () => deleteDoc(customerReference(userCForCustomers, 'space-A', 'customer-C')),
        'DENY',
      );
      await runCase(
        'Customer — cross-Workspace read is denied',
        () => getDoc(customerReference(userA, 'space-B', 'customer-B')),
        'DENY',
      );
      await runCase(
        'Customer — inactive member read is denied',
        () => getDoc(customerReference(userDForCustomers, 'space-A', 'customer-A')),
        'DENY',
      );
      await runCase(
        'Customer — inactive member create is denied',
        () => setDoc(
          customerReference(userDForCustomers, 'space-A', 'customer-D'),
          customerDocument('customer-D'),
        ),
        'DENY',
      );
      await runCase(
        'Customer — unauthenticated read is denied',
        () => getDoc(customerReference(anonymous, 'space-A', 'customer-A')),
        'DENY',
      );
      await runCase(
        'Customer — unauthenticated create is denied',
        () => setDoc(
          customerReference(anonymous, 'space-A', 'customer-E'),
          customerDocument('customer-E'),
        ),
        'DENY',
      );
      await runCase(
        'Customer — unauthenticated update is denied',
        () => updateDoc(
          customerReference(anonymous, 'space-A', 'customer-A'),
          { name: 'Anonymous Update' },
        ),
        'DENY',
      );
      await runCase(
        'Customer — unauthenticated delete is denied',
        () => deleteDoc(customerReference(anonymous, 'space-A', 'customer-A')),
        'DENY',
      );
      await runCase(
        'Customer — contradictory document ID on create is denied',
        () => setDoc(
          customerReference(userA, 'space-A', 'customer-id'),
          customerDocument('different-id'),
        ),
        'DENY',
      );
      await runCase(
        'Customer — contradictory document ID on update is denied',
        () => updateDoc(
          customerReference(userA, 'space-A', 'customer-A'),
          { id: 'different-id' },
        ),
        'DENY',
      );
      await runCase(
        'Customer — contradictory Workspace boundary on create is denied',
        () => setDoc(
          customerReference(userA, 'space-A', 'customer-boundary'),
          customerDocument('customer-boundary', { workspaceId: 'space-B' }),
        ),
        'DENY',
      );
      await runCase(
        'Customer — changing Workspace boundary on update is denied',
        () => updateDoc(
          customerReference(userA, 'space-A', 'customer-A'),
          { workspaceId: 'space-B' },
        ),
        'DENY',
      );
      await runCase(
        'Customer — unknown field is denied',
        () => setDoc(
          customerReference(userA, 'space-A', 'customer-unknown'),
          customerDocument('customer-unknown', { role: 'owner' }),
        ),
        'DENY',
      );
      await runCase(
        'Customer — top-level customer path remains denied',
        () => getDoc(topLevelCustomerReference(userA, 'customer-A')),
        'DENY',
      );

      for (const collectionName of [
        'cashTransactions',
        'dailyClosings',
        'reminders',
        'notificationRecords',
        'operationReceipts',
        'auditEvents',
      ]) {
        await runCase(
          `Nested financial deny — ${collectionName}`,
          () => getDoc(doc(userA.firestore(), 'spaces', 'space-A', collectionName, 'record-A')),
          'DENY',
        );
      }

      await runCase(
        'Debt — active member can read',
        () => getDoc(doc(userA.firestore(), 'spaces', 'space-A', 'debts', 'debt-A')),
        'ALLOW',
      );
      await runCase(
        'Debt — direct client create is denied',
        () => setDoc(doc(userA.firestore(), 'spaces', 'space-A', 'debts', 'debt-new'), debtDocument('debt-new')),
        'DENY',
      );
      await runCase(
        'Debt — cross-Workspace read is denied',
        () => getDoc(doc(userB.firestore(), 'spaces', 'space-A', 'debts', 'debt-A')),
        'DENY',
      );
      await runCase(
        'Debt — inactive member read is denied',
        () => getDoc(doc(userDForCustomers.firestore(), 'spaces', 'space-A', 'debts', 'debt-A')),
        'DENY',
      );
      await runCase(
        'Debt — anonymous read is denied',
        () => getDoc(doc(anonymous.firestore(), 'spaces', 'space-A', 'debts', 'debt-A')),
        'DENY',
      );
      await runCase(
        'Debt — direct client update is denied',
        () => updateDoc(doc(userA.firestore(), 'spaces', 'space-A', 'debts', 'debt-A'), { amount: 200 }),
        'DENY',
      );
      await runCase(
        'Debt — direct client delete is denied',
        () => deleteDoc(doc(userA.firestore(), 'spaces', 'space-A', 'debts', 'debt-A')),
        'DENY',
      );

      await runCase(
        'Transaction — active member can read',
        () => getDoc(doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-A')),
        'ALLOW',
      );
      await runCase(
        'Transaction — direct client create is denied; use trusted backend',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-A'),
          transactionDocument('transaction-A'),
        ),
        'DENY',
      );
      await runCase(
        'Transaction — nonmember cannot read',
        () => getDoc(doc(userB.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-A')),
        'DENY',
      );
      await runCase(
        'Transaction — contradictory document ID on create is denied',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-B'),
          transactionDocument('transaction-A'),
        ),
        'DENY',
      );
      await runCase(
        'Transaction — invalid type is denied',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-invalid'),
          transactionDocument('transaction-invalid', { type: 'invalid' }),
        ),
        'DENY',
      );
      await runCase(
        'Transaction — update is denied',
        () => updateDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-A'),
          { amount: 200 },
        ),
        'DENY',
      );
      await runCase(
        'Transaction — delete is denied',
        () => deleteDoc(doc(userA.firestore(), 'spaces', 'space-A', 'transactions', 'transaction-A')),
        'DENY',
      );
      await runCase(
        'Payment — active member can read',
        () => getDoc(doc(userA.firestore(), 'spaces', 'space-A', 'payments', 'payment-A')),
        'ALLOW',
      );
      await runCase(
        'Payment — direct client payment creation is denied',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'payments', 'payment-A'),
          paymentDocument('payment-A'),
        ),
        'DENY',
      );
      await runCase(
        'Payment — contradictory document ID on create is denied',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'payments', 'payment-B'),
          paymentDocument('payment-A'),
        ),
        'DENY',
      );
      await runCase(
        'Payment — inactive Customer is denied',
        () => setDoc(
          doc(userA.firestore(), 'spaces', 'space-A', 'payments', 'payment-inactive'),
          paymentDocument('payment-inactive', { customerId: 'customer-inactive' }),
        ),
        'DENY',
      );
      await runCase(
        'Payment — delete is denied',
        () => deleteDoc(doc(userA.firestore(), 'spaces', 'space-A', 'payments', 'payment-A')),
        'DENY',
      );
    } finally {
      await userCForCustomers.cleanup();
      await userDForCustomers.cleanup();
    }

    await seedMultiSpace('role-space', 'role-owner', [
      { uid: 'role-owner', role: 'owner' }, { uid: 'role-editor', role: 'editor' },
      { uid: 'role-viewer', role: 'viewer' }, { uid: 'role-legacy', role: 'manager' },
    ]);
    await testEnvironment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db,'spaces','role-space','storeProfile','profile'),{storeId:'store-A'});
      await setDoc(doc(db,'spaces','role-space','customers','base'),customerDocument('base',{workspaceId:'role-space'}));
      for(const name of ['debts','payments','transactions','dailyArchives'])await setDoc(doc(db,'spaces','role-space',name,'history'),{createdByUserId:'role-editor',amount:100});
    });
    const roleOwner=testEnvironment.authenticatedContext('role-owner');
    const roleEditor=testEnvironment.authenticatedContext('role-editor');
    const roleViewer=testEnvironment.authenticatedContext('role-viewer');
    const roleLegacy=testEnvironment.authenticatedContext('role-legacy');
    try {
      for(const name of ['customers','debts','payments','transactions','dailyArchives']) {
        await runCase(`Roles — viewer reads ${name}`,()=>getDocFromServer(doc(roleViewer.firestore(),'spaces','role-space',name,name==='customers'?'base':'history')),'ALLOW');
      }
      await runCase('Roles — viewer cannot create customer directly',()=>setDoc(customerReference(roleViewer,'role-space','viewer-created'),customerDocument('viewer-created',{workspaceId:'role-space'})),'DENY');
      await runCase('Roles — viewer cannot edit customer directly',()=>updateDoc(customerReference(roleViewer,'role-space','base'),{name:'forged'}),'DENY');
      await runCase('Roles — viewer cannot soft delete',()=>updateDoc(customerReference(roleViewer,'role-space','base'),{isActive:false}),'DENY');
      await runCase('Roles — viewer cannot hard delete',()=>deleteDoc(customerReference(roleViewer,'role-space','base')),'DENY');
      for(const [context,id] of [[roleOwner,'owner-created'],[roleEditor,'editor-created']]) {
        await runCase(`Roles — ${id} business create`,()=>setDoc(customerReference(context,'role-space',id),customerDocument(id,{workspaceId:'role-space'})),'ALLOW');
        await runCase(`Roles — ${id} business update`,()=>updateDoc(customerReference(context,'role-space',id),{name:'Updated'}),'ALLOW');
      }
      await runCase('Roles — editor cannot change role directly',()=>updateDoc(memberReference(roleEditor,'role-space','role-editor'),{role:'owner'}),'DENY');
      await runCase('Roles — editor cannot change ownership directly',()=>updateDoc(multiSpaceReference(roleEditor,'role-space'),{ownerUserId:'role-editor'}),'DENY');
      await runCase('Roles — legacy manager is not silently promoted',()=>getDocFromServer(customerReference(roleLegacy,'role-space','base')),'DENY');
      // Discovery deliberately stays editor; authorization must read the canonical membership again.
      await testEnvironment.withSecurityRulesDisabled(context=>updateDoc(memberReference(context,'role-space','role-editor'),{role:'viewer'}));
      await runCase('Roles — downgrade blocks the next direct write on the same device',()=>updateDoc(customerReference(roleEditor,'role-space','editor-created'),{name:'after downgrade'}),'DENY');
      await testEnvironment.withSecurityRulesDisabled(context=>deleteDoc(memberReference(context,'role-space','role-editor')));
      await runCase('Roles — removal blocks server reads despite stale discovery',()=>getDocFromServer(customerReference(roleEditor,'role-space','base')),'DENY');
      await runCase('Roles — removal retains historical actor and amount',async()=>{
        const saved=await getDocFromServer(doc(roleOwner.firestore(),'spaces','role-space','payments','history'));
        if(saved.data()?.createdByUserId!=='role-editor'||saved.data()?.amount!==100)throw new Error('Historical data changed');
      },'ALLOW');
      await testEnvironment.withSecurityRulesDisabled(context=>updateDoc(multiSpaceReference(context,'role-space'),{status:'suspended'}));
      await runCase('Roles — suspended space blocks financial reads',()=>getDocFromServer(customerReference(roleOwner,'role-space','base')),'DENY');
      await runCase('Roles — suspended space blocks customer writes',()=>updateDoc(customerReference(roleOwner,'role-space','base'),{name:'suspended write'}),'DENY');
    } finally {await roleOwner.cleanup();await roleEditor.cleanup();await roleViewer.cleanup();await roleLegacy.cleanup();}

    for (const collectionName of [
      'customers',
      'transactions',
      'debts',
      'payments',
      'ledgerEntries',
      'settlements',
      'dailyClosings',
      'operationReceipts',
      'auditEvents',
    ]) {
      await runCase(
        `Financial deny — ${collectionName}`,
        () => getDoc(doc(userA.firestore(), collectionName, 'record-A')),
        'DENY',
      );
    }
  } finally {
    await userC.cleanup();
  }
} finally {
  await userA.cleanup();
  await userB.cleanup();
  await anonymous.cleanup();
  await testEnvironment.cleanup();
}
