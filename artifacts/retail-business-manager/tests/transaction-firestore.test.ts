import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/types/business';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((database: unknown, path: string) => ({ database, path })),
  doc: vi.fn((database: unknown, path: string) => ({ database, path })),
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  nextSnapshot: null as ((snapshot: {
    docs: Array<{ id: string; data: () => Record<string, unknown> }>;
  }) => void) | null,
  listenerError: null as ((error: Error) => void) | null,
  unsubscribe: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  getFirebaseApp: vi.fn(() => ({ name: 'test-app' })),
  getFirebaseAuth: vi.fn(() => ({ currentUser: { uid: 'user-A' } as { uid: string } | null })),
  isFirebaseConfigured: true,
}));

const storageMocks = vi.hoisted(() => ({
  validateCashTransactionDraft: vi.fn(() => null),
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
  createTransactionDocument,
  listTransactionDocuments,
  normalizeTransactionDocument,
  serializeTransactionDocument,
  subscribeToTransactions,
} from '@/services/transactionFirestore';

const transaction: Transaction = {
  id: 'transaction-A',
  storeId: 'store-A',
  type: 'cash_in',
  amount: 125,
  currency: 'TRY',
  note: '  Cash received  ',
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

function configureTransaction(paymentData?: Record<string, unknown>) {
  const firestoreTransaction = {
    get: vi.fn(async () => snapshot(paymentData)),
    set: vi.fn(),
  };
  firestoreMocks.runTransaction.mockImplementationOnce(async (
    _database: unknown,
    callback: (value: typeof firestoreTransaction) => Promise<void>,
  ) => callback(firestoreTransaction));
  return firestoreTransaction;
}

describe('Transaction Firestore service', () => {
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
    storageMocks.validateCashTransactionDraft.mockReturnValue(null);
  });

  it('serializes the existing Transaction shape and preserves note normalization', () => {
    expect(serializeTransactionDocument(transaction)).toEqual({
      id: 'transaction-A',
      storeId: 'store-A',
      type: 'cash_in',
      amount: 125,
      currency: 'TRY',
      note: 'Cash received',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    });
  });

  it('normalizes valid Cloud documents and rejects mismatched document IDs', () => {
    const serialized = serializeTransactionDocument(transaction);

    expect(normalizeTransactionDocument('transaction-A', serialized, 'space-A')).toEqual({
      ...transaction,
      note: 'Cash received',
    });
    expect(normalizeTransactionDocument('different-id', serialized, 'space-A')).toBeNull();
  });

  it('creates a Transaction under the canonical Workspace path', async () => {
    const firestoreTransaction = configureTransaction();

    await createTransactionDocument('space-A', transaction);

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/transactions/transaction-A',
    );
    expect(firestoreTransaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/transactions/transaction-A' }),
      expect.objectContaining({
        id: 'transaction-A',
        storeId: 'store-A',
        type: 'cash_in',
        amount: 125,
        currency: 'TRY',
      }),
    );
  });

  it('rejects invalid Transaction type, currency, and amount before writing', async () => {
    const invalidCases = [
      ['transactionTypeInvalid', { type: 'invalid' }],
      ['currencyInvalid', { currency: 'INVALID' }],
      ['amountInvalid', { amount: -1 }],
    ] as const;

    for (const [error, changes] of invalidCases) {
      storageMocks.validateCashTransactionDraft.mockReturnValueOnce(error as never);
      await expect(createTransactionDocument(
        'space-A',
        { ...transaction, ...changes } as Transaction,
      )).rejects.toThrow(error);
    }

    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate Transaction ID atomically without overwriting', async () => {
    const firestoreTransaction = configureTransaction({ id: 'transaction-A' });

    await expect(createTransactionDocument('space-A', transaction))
      .rejects.toThrow('transactionAlreadyExists');
    expect(firestoreTransaction.set).not.toHaveBeenCalled();
  });

  it('requires an authenticated Firebase user for Cloud reads and writes', async () => {
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(listTransactionDocuments('space-A')).rejects.toThrow('firebaseUserRequired');
    await expect(createTransactionDocument('space-A', transaction)).rejects.toThrow('firebaseUserRequired');
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('subscribes to the Workspace and cleans up the listener', () => {
    const onTransactions = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeToTransactions('space-A', onTransactions, onError);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/transactions',
    );
    firestoreMocks.nextSnapshot?.({
      docs: [{ id: 'transaction-A', data: () => serializeTransactionDocument(transaction) }],
    });

    expect(onTransactions).toHaveBeenCalledWith([{
      ...transaction,
      note: 'Cash received',
    }]);
    unsubscribe();
    expect(firestoreMocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('lists Cloud Transactions newest first', async () => {
    const older = {
      ...transaction,
      id: 'transaction-old',
      note: undefined,
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z',
    };
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'transaction-old', data: () => serializeTransactionDocument(older) },
        { id: 'transaction-A', data: () => serializeTransactionDocument(transaction) },
      ],
    });

    await expect(listTransactionDocuments('space-A')).resolves.toEqual([
      { ...transaction, note: 'Cash received' },
      older,
    ]);
  });

  it('surfaces Cloud listener failures without local fallback', () => {
    const onError = vi.fn();
    subscribeToTransactions('space-A', vi.fn(), onError);

    firestoreMocks.listenerError?.(new Error('permission-denied'));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
  });
});