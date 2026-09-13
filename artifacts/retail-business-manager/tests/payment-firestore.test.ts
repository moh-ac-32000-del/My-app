import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '@/types/business';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((database: unknown, path: string) => ({ database, path })),
  doc: vi.fn((database: unknown, path: string) => ({ database, path })),
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  listenerError: null as ((error: Error) => void) | null,
  nextSnapshot: null as ((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null,
  unsubscribe: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  getFirebaseApp: vi.fn(() => ({ name: 'test-app' })),
  getFirebaseAuth: vi.fn(() => ({ currentUser: { uid: 'user-A' } as { uid: string } | null })),
  isFirebaseConfigured: true,
}));

const storageMocks = vi.hoisted(() => ({
  validatePaymentInput: vi.fn(() => null),
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDocs: firestoreMocks.getDocs,
  getFirestore: firestoreMocks.getFirestore,
  onSnapshot: firestoreMocks.onSnapshot,
  runTransaction: firestoreMocks.runTransaction,
}));

vi.mock('@/services/firebase', () => firebaseMocks);
vi.mock('@/services/storage', () => storageMocks);

import {
  createPaymentDocument,
  listPaymentDocuments,
  normalizePaymentDocument,
  serializePaymentDocument,
  subscribeToPayments,
} from '@/services/paymentFirestore';

const payment: Payment = {
  id: 'payment-A',
  storeId: 'store-A',
  workspaceId: 'space-A',
  createdByUserId: 'user-A',
  amount: { amount: 125, currency: 'TRY' },
  direction: 'in',
  method: 'cash',
  customerId: 'customer-A',
  paidAt: '2026-09-10T10:00:00.000Z',
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

function configureTransaction(
  customerData: Record<string, unknown> | null | undefined = {
    id: 'customer-A',
    storeId: 'store-A',
    workspaceId: 'space-A',
    isActive: true,
  },
  paymentData?: Record<string, unknown>,
) {
  const transaction = {
    get: vi.fn(async (reference: { path: string }) => (
      reference.path.includes('/customers/')
        ? snapshot(customerData ?? undefined)
        : snapshot(paymentData)
    )),
    set: vi.fn(),
  };
  firestoreMocks.runTransaction.mockImplementationOnce(async (
    _database: unknown,
    callback: (value: typeof transaction) => Promise<void>,
  ) => callback(transaction));
  return transaction;
}

describe('Payment Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.nextSnapshot = null;
    firestoreMocks.listenerError = null;
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
    firestoreMocks.onSnapshot.mockImplementation((_reference, next, error) => {
      firestoreMocks.nextSnapshot = next;
      firestoreMocks.listenerError = error;
      return firestoreMocks.unsubscribe;
    });
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'user-A' } });
    storageMocks.validatePaymentInput.mockReturnValue(null);
  });

  it('serializes the Cloud document with canonical Workspace and authenticated ownership metadata', () => {
    expect(serializePaymentDocument(
      { ...payment, workspaceId: 'spoofed-space', createdByUserId: 'spoofed-user' },
      'space-A',
      'user-A',
    )).toEqual({
      id: 'payment-A',
      storeId: 'store-A',
      workspaceId: 'space-A',
      createdByUserId: 'user-A',
      amount: { amount: 125, currency: 'TRY' },
      direction: 'in',
      method: 'cash',
      customerId: 'customer-A',
      paidAt: '2026-09-10T10:00:00.000Z',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    });
  });

  it('normalizes valid Cloud documents and rejects wrong document identity or Workspace', () => {
    const serialized = serializePaymentDocument(payment, 'space-A', 'user-A');

    expect(normalizePaymentDocument('payment-A', serialized, 'space-A')).toEqual(payment);
    expect(normalizePaymentDocument('different-id', serialized, 'space-A')).toBeNull();
    expect(normalizePaymentDocument('payment-A', serialized, 'space-B')).toBeNull();
  });

  it('creates a Payment at spaces/{spaceId}/payments/{paymentId} after validating the Customer', async () => {
    const transaction = configureTransaction();

    await createPaymentDocument('space-A', payment);

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/payments/payment-A',
    );
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/payments/payment-A' }),
      expect.objectContaining({
        id: 'payment-A',
        workspaceId: 'space-A',
        createdByUserId: 'user-A',
      }),
    );
  });

  it.each([
    ['missing', null],
    ['inactive', { id: 'customer-A', storeId: 'store-A', isActive: false }],
    ['wrong store', { id: 'customer-A', storeId: 'store-B', isActive: true }],
  ])('rejects a %s Customer before creating a Payment', async (_label, customerData) => {
    const transaction = configureTransaction(customerData);

    await expect(createPaymentDocument('space-A', payment)).rejects.toThrow('customerNotFound');
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('rejects duplicate Payment document IDs without overwriting the existing document', async () => {
    const transaction = configureTransaction(undefined, { id: 'payment-A' });

    await expect(createPaymentDocument('space-A', payment)).rejects.toThrow('paymentAlreadyExists');
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it.each([
    ['currencyInvalid', { amount: { amount: 10, currency: 'INVALID' as Payment['amount']['currency'] } } as Partial<Payment>],
    ['amountInvalid', { amount: { amount: -1, currency: 'TRY' as Payment['amount']['currency'] } } as Partial<Payment>],
  ])('rejects a Payment with %s', async (error, changes) => {
    storageMocks.validatePaymentInput.mockReturnValueOnce(error as never);

    await expect(createPaymentDocument('space-A', {
      ...payment,
      ...changes,
    } as Payment)).rejects.toThrow(error);
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('subscribes to the active Workspace and cleans up the listener', () => {
    const onPayments = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeToPayments('space-A', onPayments, onError);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/payments',
    );
    firestoreMocks.nextSnapshot?.({
      docs: [{ id: 'payment-A', data: () => serializePaymentDocument(payment, 'space-A', 'user-A') }],
    });

    expect(onPayments).toHaveBeenCalledWith([payment]);
    expect(unsubscribe).toBe(firestoreMocks.unsubscribe);
    unsubscribe();
    expect(firestoreMocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('lists Cloud Payments in paidAt descending order', async () => {
    const older = { ...payment, id: 'payment-old', paidAt: '2026-09-10T09:00:00.000Z' };
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'payment-old', data: () => serializePaymentDocument(older, 'space-A', 'user-A') },
        { id: 'payment-A', data: () => serializePaymentDocument(payment, 'space-A', 'user-A') },
      ],
    });

    await expect(listPaymentDocuments('space-A')).resolves.toEqual([payment, older]);
  });

  it('surfaces Cloud read failures without falling back to AsyncStorage', () => {
    const onError = vi.fn();
    subscribeToPayments('space-A', vi.fn(), onError);

    firestoreMocks.listenerError?.(new Error('permission-denied'));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
  });
});