import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  workspaceBusinessCollectionPath,
  workspaceBusinessDocumentPath,
} from '@/data/firestoreWorkspace';
import { validateCashTransactionDraft } from '@/services/storage';
import type { Transaction } from '@/types/business';

type TransactionSnapshot = {
  id: string;
  data: () => DocumentData;
};

type TransactionCollectionSnapshot = {
  docs: TransactionSnapshot[];
};

let firestore: ReturnType<typeof getFirestore> | null = null;

export function subscribeToTransactions(
  spaceId: string,
  onTransactions: (transactions: Transaction[]) => void,
  onError: (error: Error) => void,
): () => void {
  getAuthenticatedUid();
  const transactionsReference = collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'transactions'),
  );

  return onSnapshot(
    transactionsReference,
    (snapshot: TransactionCollectionSnapshot) => {
      const transactions = snapshot.docs
        .map((snapshotDocument) => normalizeTransactionDocument(
          snapshotDocument.id,
          snapshotDocument.data(),
          spaceId,
        ))
        .filter((transaction): transaction is Transaction => transaction !== null)
        .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
      onTransactions(transactions);
    },
    (error) => {
      onError(error instanceof Error ? error : new Error('transactionListenerFailed'));
    },
  );
}

export async function listTransactionDocuments(spaceId: string): Promise<Transaction[]> {
  getAuthenticatedUid();
  const snapshot = await getDocs(collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'transactions'),
  ));
  return snapshot.docs
    .map((snapshotDocument) => normalizeTransactionDocument(
      snapshotDocument.id,
      snapshotDocument.data(),
      spaceId,
    ))
    .filter((transaction): transaction is Transaction => transaction !== null)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export async function createTransactionDocument(
  spaceId: string,
  transaction: Transaction,
): Promise<void> {
  getAuthenticatedUid();
  const transactionId = requireTransactionId(transaction.id);
  const transactionReference = doc(
    getFirestoreInstance(),
    workspaceBusinessDocumentPath(spaceId, 'transactions', transactionId),
  );
  const serializedTransaction = serializeTransactionDocument(transaction);

  await runTransaction(getFirestoreInstance(), async (firestoreTransaction) => {
    const existingTransaction = await firestoreTransaction.get(transactionReference);
    if (existingTransaction.exists()) {
      throw new Error('transactionAlreadyExists');
    }

    firestoreTransaction.set(transactionReference, serializedTransaction);
  });
}

export function serializeTransactionDocument(
  transaction: Transaction,
): Record<string, unknown> {
  assertValidTransaction(transaction);
  const note = typeof transaction.note === 'string' ? transaction.note.trim() : '';

  return {
    id: requireTransactionId(transaction.id),
    storeId: requireStoreId(transaction.storeId),
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    ...(note ? { note } : {}),
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

export function normalizeTransactionDocument(
  documentId: string,
  value: DocumentData,
  spaceId: string,
): Transaction | null {
  requireSpaceId(spaceId);
  if (
    typeof value !== 'object'
    || value === null
    || value.id !== documentId
  ) {
    return null;
  }

  const transaction: Transaction = {
    id: documentId,
    storeId: value.storeId as string,
    type: value.type,
    amount: value.amount,
    currency: value.currency,
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };

  return isValidTransaction(transaction) ? transaction : null;
}

function assertValidTransaction(transaction: Transaction): void {
  const validation = getTransactionValidationError(transaction);
  if (validation) {
    throw new Error(validation);
  }
}

function isValidTransaction(transaction: Transaction): boolean {
  return getTransactionValidationError(transaction) === null;
}

function getTransactionValidationError(transaction: Transaction): string | null {
  const draftValidation = validateCashTransactionDraft({
    storeId: transaction.storeId,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
  });
  if (draftValidation) {
    return draftValidation;
  }
  if (!requireNonEmptyString(transaction.id)) {
    return 'transactionIdRequired';
  }
  if (!isValidDateString(transaction.createdAt) || !isValidDateString(transaction.updatedAt)) {
    return 'timestampInvalid';
  }
  return null;
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
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!requireNonEmptyString(uid)) {
    throw new Error('firebaseUserRequired');
  }
  return uid.trim();
}

function requireSpaceId(value: string): string {
  const spaceId = typeof value === 'string' ? value.trim() : '';
  if (!requireNonEmptyString(spaceId) || spaceId.includes('/')) {
    throw new Error('spaceIdInvalid');
  }
  return spaceId;
}

function requireTransactionId(value: string): string {
  const transactionId = typeof value === 'string' ? value.trim() : '';
  if (!requireNonEmptyString(transactionId) || transactionId.includes('/')) {
    throw new Error('transactionIdInvalid');
  }
  return transactionId;
}

function requireStoreId(value: string): string {
  const storeId = typeof value === 'string' ? value.trim() : '';
  if (!requireNonEmptyString(storeId)) {
    throw new Error('storeIdRequired');
  }
  return storeId;
}

function requireNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDateString(value: unknown): value is string {
  return requireNonEmptyString(value) && Number.isFinite(Date.parse(value));
}