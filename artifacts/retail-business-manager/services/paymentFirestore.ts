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
import { validatePaymentInput } from '@/services/storage';
import type { Payment } from '@/types/business';

type PaymentSnapshot = {
  id: string;
  data: () => DocumentData;
};

type PaymentCollectionSnapshot = {
  docs: PaymentSnapshot[];
};

type PaymentListenerError = (error: Error) => void;

let firestore: ReturnType<typeof getFirestore> | null = null;

export function subscribeToPayments(
  spaceId: string,
  onPayments: (payments: Payment[]) => void,
  onError: PaymentListenerError,
): () => void {
  const paymentsReference = collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'payments'),
  );

  return onSnapshot(
    paymentsReference,
    (snapshot: PaymentCollectionSnapshot) => {
      const payments = snapshot.docs
        .map((snapshotDocument) => normalizePaymentDocument(snapshotDocument.id, snapshotDocument.data(), spaceId))
        .filter((payment): payment is Payment => payment !== null)
        .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt));
      onPayments(payments);
    },
    (error) => {
      onError(error instanceof Error ? error : new Error('paymentListenerFailed'));
    },
  );
}

export async function listPaymentDocuments(spaceId: string): Promise<Payment[]> {
  const snapshot = await getDocs(collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'payments'),
  ));
  return snapshot.docs
    .map((snapshotDocument) => normalizePaymentDocument(snapshotDocument.id, snapshotDocument.data(), spaceId))
    .filter((payment): payment is Payment => payment !== null)
    .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt));
}

export async function createPaymentDocument(spaceId: string, payment: Payment): Promise<void> {
  const authenticatedUid = getAuthenticatedUid();
  const paymentId = requirePaymentId(payment.id);
  const paymentReference = doc(
    getFirestoreInstance(),
    workspaceBusinessDocumentPath(spaceId, 'payments', paymentId),
  );
  const customerId = payment.customerId ? requireCustomerId(payment.customerId) : null;
  const customerReference = customerId
    ? doc(
      getFirestoreInstance(),
      workspaceBusinessDocumentPath(spaceId, 'customers', customerId),
    )
    : null;
  const serializedPayment = serializePaymentDocument(payment, spaceId, authenticatedUid);

  await runTransaction(getFirestoreInstance(), async (transaction) => {
    if (customerReference && customerId) {
      const customerSnapshot = await transaction.get(customerReference);
      assertActiveCustomer(customerSnapshot, customerId, payment.storeId, spaceId);
    }

    const paymentSnapshot = await transaction.get(paymentReference);
    if (paymentSnapshot.exists()) {
      throw new Error('paymentAlreadyExists');
    }

    transaction.set(paymentReference, serializedPayment);
  });
}

export function serializePaymentDocument(
  payment: Payment,
  spaceId: string,
  createdByUserId: string,
): Record<string, unknown> {
  assertValidPayment(payment);
  const normalizedSpaceId = requireSpaceId(spaceId);
  const uid = requireUid(createdByUserId);

  return {
    id: requirePaymentId(payment.id),
    storeId: requireStoreId(payment.storeId),
    workspaceId: normalizedSpaceId,
    createdByUserId: uid,
    amount: {
      amount: payment.amount.amount,
      currency: payment.amount.currency,
    },
    direction: payment.direction,
    method: payment.method,
    ...(payment.customerId !== undefined ? { customerId: requireCustomerId(payment.customerId) } : {}),
    ...(payment.transactionId !== undefined ? { transactionId: requireTransactionId(payment.transactionId) } : {}),
    paidAt: payment.paidAt,
    ...(payment.note !== undefined ? { note: payment.note } : {}),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function normalizePaymentDocument(
  documentId: string,
  value: DocumentData,
  spaceId: string,
): Payment | null {
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

  const payment: Payment = {
    id: documentId,
    storeId: value.storeId as string,
    workspaceId: normalizedSpaceId,
    createdByUserId: value.createdByUserId,
    amount: value.amount as Payment['amount'],
    direction: value.direction,
    method: value.method,
    ...(typeof value.customerId === 'string' ? { customerId: value.customerId } : {}),
    ...(typeof value.transactionId === 'string' ? { transactionId: value.transactionId } : {}),
    paidAt: value.paidAt as string,
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };

  return validatePaymentInput(payment) === null ? payment : null;
}

function assertValidPayment(payment: Payment): void {
  const validation = validatePaymentInput(payment);
  if (validation) {
    throw new Error(validation);
  }
}

function assertActiveCustomer(
  snapshot: { exists: () => boolean; data: () => DocumentData | undefined },
  customerId: string,
  storeId: string,
  spaceId: string,
): void {
  const data = snapshot.exists() ? snapshot.data() : undefined;
  if (
    !snapshot.exists()
    || !data
    || data.id !== customerId
    || data.isActive !== true
    || data.storeId !== storeId
    || (typeof data.workspaceId === 'string' && data.workspaceId !== spaceId)
  ) {
    throw new Error('customerNotFound');
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

function requirePaymentId(value: string): string {
  const paymentId = typeof value === 'string' ? value.trim() : '';
  if (!paymentId || paymentId.includes('/')) {
    throw new Error('paymentIdInvalid');
  }
  return paymentId;
}

function requireCustomerId(value: string): string {
  const customerId = typeof value === 'string' ? value.trim() : '';
  if (!customerId || customerId.includes('/')) {
    throw new Error('customerIdInvalid');
  }
  return customerId;
}

function requireTransactionId(value: string): string {
  const transactionId = typeof value === 'string' ? value.trim() : '';
  if (!transactionId || transactionId.includes('/')) {
    throw new Error('transactionIdInvalid');
  }
  return transactionId;
}

function requireStoreId(value: string): string {
  const storeId = typeof value === 'string' ? value.trim() : '';
  if (!storeId) {
    throw new Error('storeIdRequired');
  }
  return storeId;
}