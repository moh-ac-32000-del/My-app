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

const trustedPaymentMocks = vi.hoisted(() => ({
  createTrustedPayment: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/services/trustedPaymentFirestore', () => trustedPaymentMocks);

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

describe('Payment Firestore service', () => {
  it('preserves noncash customer-to-merchant links, names and exact payment amounts', () => {
    expect(normalizePaymentDocument('payment-A', { ...payment, method: 'other', amountExact: '125.00',
      source: 'customer-to-merchant', merchantId: 'merchant', merchantName: 'Readable merchant', merchantOperationId: 'operation' }, 'space-A'))
      .toMatchObject({ amountExact: '125.00', source: 'customer-to-merchant', merchantName: 'Readable merchant', merchantOperationId: 'operation' });
  });
  it('rejects an unlinked claimed direct payment instead of displaying it as trusted noncash', () => {
    expect(normalizePaymentDocument('payment-A', { ...payment, source: 'customer-to-merchant' }, 'space-A')).toBeNull();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.nextSnapshot = null;
    firestoreMocks.listenerError = null;
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
    firestoreMocks.onSnapshot.mockImplementation((_reference, _options, next, error) => {
      firestoreMocks.nextSnapshot = next;
      firestoreMocks.listenerError = error;
      return firestoreMocks.unsubscribe;
    });
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'user-A' } });
    storageMocks.validatePaymentInput.mockReturnValue(null);
    trustedPaymentMocks.createTrustedPayment.mockResolvedValue(undefined);
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

  it('routes valid Payment creation through the trusted backend', async () => {
    await createPaymentDocument('space-A', payment);

    expect(trustedPaymentMocks.createTrustedPayment).toHaveBeenCalledWith('space-A', payment);
    expect(trustedPaymentMocks.createTrustedPayment).toHaveBeenCalledTimes(1);
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
    expect(trustedPaymentMocks.createTrustedPayment).not.toHaveBeenCalled();
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
