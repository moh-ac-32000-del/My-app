import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/types/business';

const firestoreMocks = vi.hoisted(() => ({
  db: { name: 'test-db' },
  collection: vi.fn((database: unknown, path: string) => ({ database, path })),
  doc: vi.fn((database: unknown, path: string) => ({ database, path })),
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  nextSnapshot: null as ((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null,
  listenerError: null as ((error: Error) => void) | null,
  unsubscribe: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  getFirebaseApp: vi.fn(() => ({ name: 'test-app' })),
  getFirebaseAuth: vi.fn(() => ({ currentUser: { uid: 'user-A' } as { uid: string } | null })),
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getFirestore: firestoreMocks.getFirestore,
  onSnapshot: firestoreMocks.onSnapshot,
  setDoc: firestoreMocks.setDoc,
  updateDoc: firestoreMocks.updateDoc,
}));

vi.mock('@/services/firebase', () => firebaseMocks);

import {
  createCustomerDocument,
  softDeleteCustomerDocument,
  subscribeToCustomers,
  updateCustomerDocument,
} from '@/services/customerFirestore';

const customer: Customer = {
  id: 'customer-A',
  storeId: 'store-A',
  workspaceId: 'space-A',
  createdByUserId: 'user-A',
  name: 'Customer A',
  phone: '+905001234567',
  address: 'Istanbul',
  notes: 'VIP',
  isActive: true,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
};

describe('customer Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.nextSnapshot = null;
    firestoreMocks.listenerError = null;
    firestoreMocks.onSnapshot.mockImplementation((_reference, next, error) => {
      firestoreMocks.nextSnapshot = next;
      firestoreMocks.listenerError = error;
      return firestoreMocks.unsubscribe;
    });
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'user-A' } });
  });

  it('subscribes to the Workspace-scoped Customer collection and excludes inactive records', () => {
    const onCustomers = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeToCustomers('space-A', onCustomers, onError);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/customers',
    );
    expect(firestoreMocks.onSnapshot).toHaveBeenCalled();
    expect(unsubscribe).toBe(firestoreMocks.unsubscribe);

    firestoreMocks.nextSnapshot?.({
      docs: [
        { id: 'customer-A', data: () => ({ ...customer }) },
        { id: 'customer-inactive', data: () => ({ ...customer, id: 'customer-inactive', isActive: false }) },
      ],
    });

    expect(onCustomers).toHaveBeenCalledWith([customer]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('creates a Customer under the canonical Workspace path with authenticated ownership metadata', async () => {
    await createCustomerDocument('space-A', { ...customer, workspaceId: undefined, createdByUserId: undefined });

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/customers/customer-A',
    );
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/customers/customer-A' }),
      expect.objectContaining({
        id: 'customer-A',
        workspaceId: 'space-A',
        createdByUserId: 'user-A',
        storeId: 'store-A',
      }),
    );
  });

  it('updates a Customer without deleting the document or changing its identity fields', async () => {
    await updateCustomerDocument('space-A', { ...customer, name: 'Updated Customer' });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/customers/customer-A' }),
      expect.objectContaining({
        name: 'Updated Customer',
      }),
    );
    expect(firestoreMocks.updateDoc.mock.calls[0]?.[1]).not.toHaveProperty('id');
    expect(firestoreMocks.updateDoc.mock.calls[0]?.[1]).not.toHaveProperty('storeId');
    expect(firestoreMocks.updateDoc.mock.calls[0]?.[1]).not.toHaveProperty('isActive');
  });

  it('soft-deletes a Customer by setting isActive false', async () => {
    await softDeleteCustomerDocument('space-A', customer);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/customers/customer-A' }),
      expect.objectContaining({
        isActive: false,
        updatedAt: expect.any(String),
      }),
    );
  });

  it('does not create a Customer without an authenticated Firebase user', async () => {
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(createCustomerDocument('space-A', customer)).rejects.toThrow('firebaseUserRequired');
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });
});