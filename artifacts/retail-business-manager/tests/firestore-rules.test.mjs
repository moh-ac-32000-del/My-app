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

async function clearFirestore() {
  await testEnvironment.clearFirestore();
}

async function seedSpace(context, spaceId, ownerUserId) {
  await assertSucceeds(setDoc(
    spaceReference(context, spaceId),
    spaceDocument(spaceId, ownerUserId),
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
  await seedSpace(userA, 'space-A', 'user-A');
  await seedSpace(userB, 'space-B', 'user-B');
  await runCase(
    'Additional — user A cannot list across space B',
    () => getDocs(collection(userA.firestore(), 'stores')),
    'DENY',
  );
} finally {
  await userA.cleanup();
  await userB.cleanup();
  await anonymous.cleanup();
  await testEnvironment.cleanup();
}