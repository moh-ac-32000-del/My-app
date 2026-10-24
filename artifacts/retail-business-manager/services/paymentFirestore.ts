import { observeForLocalExport } from './localExportObservation';
import { legacyAmountExact } from '@/data/customerCreditAccounting';
import { operationCorrectionMetadata } from '@/data/operationCorrectionMetadata';
import { customerPaymentJournalAmount } from '@/data/customerPaymentJournal';
import {
  collection,
  getDocs,
  getFirestore,
  onSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import {
  workspaceBusinessCollectionPath,
} from '@/data/firestoreWorkspace';
import { validatePaymentInput } from '@/services/storage';
import type { Payment } from '@/types/business';
import { createTrustedPayment } from '@/services/trustedPaymentFirestore';

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

  const exportObservation = observeForLocalExport(spaceId, 'payments');
  return onSnapshot(
    paymentsReference,
    { includeMetadataChanges: true },
    (snapshot: PaymentCollectionSnapshot) => {
      exportObservation.receive(snapshot);
      const payments = snapshot.docs
        .map((snapshotDocument) => normalizePaymentDocument(snapshotDocument.id, snapshotDocument.data(), spaceId))
        .filter((payment): payment is Payment => payment !== null)
        .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt));
      onPayments(payments);
    },
    (error) => {
      exportObservation.invalidate();
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
  assertValidPayment(payment);
  requireSpaceId(spaceId);
  requirePaymentId(payment.id);
  requireStoreId(payment.storeId);
  if (payment.customerId !== undefined) requireCustomerId(payment.customerId);
  if (payment.transactionId !== undefined) requireTransactionId(payment.transactionId);
  await createTrustedPayment(spaceId, payment);
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
    ...(value.cashBaseAmountExact !== undefined ? { cashBaseAmountExact: value.cashBaseAmountExact } : {}),
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

  try {
    if (value.cashBaseAmountExact !== undefined) customerPaymentJournalAmount(payment);
    Object.assign(payment, operationCorrectionMetadata(value));
    if (value.amountExact !== undefined) payment.amountExact = legacyAmountExact(payment.amount.amount, value.amountExact);
    if (value.source !== undefined) {
      if (value.source !== 'customer-to-merchant' || typeof value.merchantId !== 'string' || !value.merchantId
        || typeof value.merchantOperationId !== 'string' || !value.merchantOperationId) return null;
      payment.source = value.source;
      payment.merchantId = value.merchantId;
      payment.merchantOperationId = value.merchantOperationId;
      if (typeof value.merchantName === 'string') payment.merchantName = value.merchantName;
    }
  } catch { return null; }
  return validatePaymentInput(payment) === null ? payment : null;
}

function assertValidPayment(payment: Payment): void {
  const validation = validatePaymentInput(payment);
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
