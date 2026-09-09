import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import {
  workspaceBusinessCollectionPath,
  workspaceBusinessDocumentPath,
} from '@/data/firestoreWorkspace';
import type { Customer } from '@/types/business';

type CustomerSnapshot = {
  id: string;
  data: () => DocumentData;
};

type CustomerCollectionSnapshot = {
  docs: CustomerSnapshot[];
};

type CustomerListenerError = (error: Error) => void;

let firestore: ReturnType<typeof getFirestore> | null = null;

export function subscribeToCustomers(
  spaceId: string,
  onCustomers: (customers: Customer[]) => void,
  onError: CustomerListenerError,
): () => void {
  const customersReference = collection(
    getFirestoreInstance(),
    workspaceBusinessCollectionPath(spaceId, 'customers'),
  );

  return onSnapshot(
    customersReference,
    (snapshot: CustomerCollectionSnapshot) => {
      const customers = snapshot.docs
        .map((snapshotDocument) => normalizeCustomer(snapshotDocument.id, snapshotDocument.data()))
        .filter((customer): customer is Customer => customer !== null && customer.isActive)
        .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
      onCustomers(customers);
    },
    (error) => {
      onError(error instanceof Error ? error : new Error('customerListenerFailed'));
    },
  );
}

export async function createCustomerDocument(spaceId: string, customer: Customer): Promise<void> {
  const authenticatedUid = getAuthenticatedUid();
  const customerId = requireCustomerId(customer.id);
  const customerReference = doc(
    getFirestoreInstance(),
    workspaceBusinessDocumentPath(spaceId, 'customers', customerId),
  );

  await setDoc(customerReference, toCustomerDocument(customer, spaceId, authenticatedUid));
}

export async function updateCustomerDocument(spaceId: string, customer: Customer): Promise<void> {
  const customerId = requireCustomerId(customer.id);
  const customerReference = doc(
    getFirestoreInstance(),
    workspaceBusinessDocumentPath(spaceId, 'customers', customerId),
  );

  await updateDoc(customerReference, {
    name: customer.name,
    ...(customer.phone !== undefined ? { phone: customer.phone } : {}),
    ...(customer.address !== undefined ? { address: customer.address } : {}),
    ...(customer.notes !== undefined ? { notes: customer.notes } : {}),
    updatedAt: customer.updatedAt,
  });
}

export async function softDeleteCustomerDocument(spaceId: string, customer: Customer): Promise<void> {
  const customerId = requireCustomerId(customer.id);
  const customerReference = doc(
    getFirestoreInstance(),
    workspaceBusinessDocumentPath(spaceId, 'customers', customerId),
  );

  await updateDoc(customerReference, {
    isActive: false,
    updatedAt: new Date().toISOString(),
  });
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
  const uid = getFirebaseAuth().currentUser?.uid.trim();
  if (!uid) {
    throw new Error('firebaseUserRequired');
  }
  return uid;
}

function requireCustomerId(value: string): string {
  const customerId = typeof value === 'string' ? value.trim() : '';
  if (!customerId || customerId.includes('/')) {
    throw new Error('customerIdInvalid');
  }
  return customerId;
}

function toCustomerDocument(
  customer: Customer,
  spaceId: string,
  createdByUserId?: string,
): Record<string, unknown> {
  return {
    id: requireCustomerId(customer.id),
    storeId: customer.storeId,
    ...(customer.workspaceId || createdByUserId
      ? { workspaceId: spaceId }
      : {}),
    ...(customer.createdByUserId || createdByUserId
      ? { createdByUserId: createdByUserId ?? customer.createdByUserId }
      : {}),
    name: customer.name,
    ...(customer.phone !== undefined ? { phone: customer.phone } : {}),
    ...(customer.address !== undefined ? { address: customer.address } : {}),
    ...(customer.notes !== undefined ? { notes: customer.notes } : {}),
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function normalizeCustomer(id: string, value: DocumentData): Customer | null {
  if (
    value.id !== id
    || typeof value.storeId !== 'string'
    || typeof value.name !== 'string'
    || typeof value.isActive !== 'boolean'
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id,
    storeId: value.storeId,
    ...(typeof value.workspaceId === 'string' ? { workspaceId: value.workspaceId } : {}),
    ...(typeof value.createdByUserId === 'string' ? { createdByUserId: value.createdByUserId } : {}),
    name: value.name,
    ...(typeof value.phone === 'string' ? { phone: value.phone } : {}),
    ...(typeof value.address === 'string' ? { address: value.address } : {}),
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    isActive: value.isActive,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}