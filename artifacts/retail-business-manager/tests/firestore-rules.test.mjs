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
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

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
    await setDoc(multiSpaceReference(context, spaceId), spaceDocument(spaceId, ownerUserId));
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
  await assertSucceeds(setDoc(
    spaceReference(context, spaceId),
    legacySpaceDocument(spaceId, ownerUserId),
  ));
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
    'Test 5 — user B creates space A as user B',
    () => setDoc(
      spaceReference(userB, 'space-A'),
      spaceDocument('space-A', 'user-B'),
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
    { uid: 'user-C', role: 'manager' },
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
      { uid: 'user-C', role: 'viewer' },
      { uid: 'user-D', role: 'viewer', status: 'suspended' },
    ]);
    await seedMultiSpace('space-B', 'user-B', [
      { uid: 'user-B', role: 'owner' },
    ]);
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        customerReference(context, 'space-A', 'customer-A'),
        customerDocument('customer-A', { workspaceId: 'space-A' }),
      );
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
        'Customer — active member can update a valid document',
        () => updateDoc(
          customerReference(userCForCustomers, 'space-A', 'customer-A'),
          { name: 'Updated Customer' },
        ),
        'ALLOW',
      );
      await runCase(
        'Customer — active member can delete a document',
        () => deleteDoc(customerReference(userCForCustomers, 'space-A', 'customer-C')),
        'ALLOW',
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
        'debts',
        'payments',
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
    } finally {
      await userCForCustomers.cleanup();
      await userDForCustomers.cleanup();
    }

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