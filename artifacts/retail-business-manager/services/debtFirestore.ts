import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  workspaceBusinessCollectionPath,
  workspaceBusinessDocumentPath,
} from '@/data/firestoreWorkspace';
import { reconcileDueDateReminders } from '@/services/storage';
import { validateDebtInput } from '@/services/storage';
import type { Debt } from '@/types/business';
import { createTrustedDebt, updateTrustedDebt } from '@/services/trustedDebtFirestore';

type DebtSnapshot = {
  id: string;
  data: () => DocumentData;
};

type DebtCollectionSnapshot = {
  docs: DebtSnapshot[];
};

type DebtListenerError = (error: Error) => void;

let firestore: ReturnType<typeof getFirestore> | null = null;

export function subscribeToDebts(
  spaceId: string,
  onDebts: (debts: Debt[]) => void,
  onError: DebtListenerError,
): () => void {
  const debtsReference = collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'debts'),
  );

  return onSnapshot(
    debtsReference,
    (snapshot: DebtCollectionSnapshot) => {
      const debts = snapshot.docs
        .map((snapshotDocument) => normalizeDebtDocument(snapshotDocument.id, snapshotDocument.data(), spaceId))
        .filter((debt): debt is Debt => debt !== null)
        .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
      onDebts(debts);
    },
    (error) => {
      onError(error instanceof Error ? error : new Error('debtListenerFailed'));
    },
  );
}

export async function listDebtDocuments(spaceId: string): Promise<Debt[]> {
  const snapshot = await getDocs(collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'debts'),
  ));
  return snapshot.docs
    .map((snapshotDocument) => normalizeDebtDocument(snapshotDocument.id, snapshotDocument.data(), spaceId))
    .filter((debt): debt is Debt => debt !== null)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export async function createDebtDocument(spaceId: string, debt: Debt): Promise<void> {
  getAuthenticatedUid();
  assertValidDebt(debt);
  await createTrustedDebt(requireSpaceId(spaceId), debt);
}

export async function updateDebtDocument(spaceId: string, debt: Debt): Promise<void> {
  getAuthenticatedUid();
  assertValidDebt(debt);
  await updateTrustedDebt(requireSpaceId(spaceId), debt);
}

export function serializeDebtDocument(
  debt: Debt,
  spaceId: string,
  createdByUserId: string,
): Record<string, unknown> {
  assertValidDebt(debt);
  const normalizedSpaceId = requireSpaceId(spaceId);
  const uid = requireUid(createdByUserId);
  return {
    id: requireDebtId(debt.id),
    storeId: debt.storeId.trim(),
    workspaceId: normalizedSpaceId,
    createdByUserId: uid,
    customerId: requireCustomerId(debt.customerId),
    currency: debt.currency,
    amount: debt.amount,
    ...(debt.dueDate !== undefined ? { dueDate: debt.dueDate } : {}),
    ...(debt.originalAmount !== undefined ? { originalAmount: debt.originalAmount } : {}),
    ...(debt.settledAt !== undefined ? { settledAt: debt.settledAt } : {}),
    createdAt: debt.createdAt,
    updatedAt: debt.updatedAt,
  };
}

export function normalizeDebtDocument(
  documentId: string,
  value: DocumentData,
  spaceId: string,
): Debt | null {
  const normalizedSpaceId = requireSpaceId(spaceId);
  if (
    typeof value !== 'object'
    || value === null
    || value.id !== documentId
    || value.workspaceId !== normalizedSpaceId
    || typeof value.createdByUserId !== 'string'
    || value.createdByUserId.trim().length === 0
  ) {
    return null;
  }

  const debt: Debt = {
    id: documentId,
    storeId: value.storeId as string,
    workspaceId: normalizedSpaceId,
    createdByUserId: value.createdByUserId,
    customerId: value.customerId as string,
    currency: value.currency,
    amount: value.amount,
    ...(typeof value.dueDate === 'string' ? { dueDate: value.dueDate } : {}),
    ...(typeof value.originalAmount === 'number' ? { originalAmount: value.originalAmount } : {}),
    ...(typeof value.settledAt === 'string' ? { settledAt: value.settledAt } : {}),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };

  return validateDebtInput(debt) === null ? debt : null;
}

export async function reconcileCloudDebtReminders(
  spaceId: string,
  storeId: string,
  currentDebts?: Debt[],
): Promise<void> {
  const debts = currentDebts ?? await listDebtDocuments(spaceId);
  await reconcileDueDateReminders(storeId, debts);
}

function assertValidDebt(debt: Debt): void {
  const validation = validateDebtInput(debt);
  if (validation) {
    throw new Error(validation);
  }
}


function getFirestoreInstance(): ReturnType<typeof getFirestore> {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
  }
  return firestore;
}

function getAuthenticatedUid(): string {
  return requireUid(getFirebaseAuth().currentUser?.uid);
}

function requireUid(value: unknown): string {
  const uid = typeof value === 'string' ? value.trim() : '';
  if (!uid) {
    throw new Error('firebaseUserRequired');
  }
  return uid;
}

function requireSpaceId(value: string): string {
  const spaceId = typeof value === 'string' ? value.trim() : '';
  if (!spaceId || spaceId.includes('/')) {
    throw new Error('spaceIdInvalid');
  }
  return spaceId;
}

function requireDebtId(value: string): string {
  const debtId = typeof value === 'string' ? value.trim() : '';
  if (!debtId || debtId.includes('/')) {
    throw new Error('debtIdInvalid');
  }
  return debtId;
}

function requireCustomerId(value: string): string {
  const customerId = typeof value === 'string' ? value.trim() : '';
  if (!customerId || customerId.includes('/')) {
    throw new Error('customerIdInvalid');
  }
  return customerId;
}