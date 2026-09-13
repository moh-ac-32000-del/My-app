import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debt } from '@/types/business';

const firestoreMocks = vi.hoisted(() => ({
  db: { name: 'test-db' },
  collection: vi.fn((database: unknown, path: string) => ({ database, path })),
  doc: vi.fn((database: unknown, path: string) => ({ database, path })),
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: vi.fn(() => '__delete_field__'),
  nextSnapshot: null as ((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null,
  listenerError: null as ((error: Error) => void) | null,
  unsubscribe: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  getFirebaseApp: vi.fn(() => ({ name: 'test-app' })),
  getFirebaseAuth: vi.fn(() => ({ currentUser: { uid: 'user-A' } as { uid: string } | null })),
  isFirebaseConfigured: true,
}));

const storageMocks = vi.hoisted(() => ({
  reconcileDueDateReminders: vi.fn().mockResolvedValue(undefined),
  validateDebtInput: vi.fn(() => null),
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  deleteField: firestoreMocks.deleteField,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  getFirestore: firestoreMocks.getFirestore,
  onSnapshot: firestoreMocks.onSnapshot,
  runTransaction: firestoreMocks.runTransaction,
  setDoc: firestoreMocks.setDoc,
  updateDoc: firestoreMocks.updateDoc,
}));

vi.mock('@/services/firebase', () => firebaseMocks);
vi.mock('@/services/storage', () => storageMocks);

import {
  createDebtDocument,
  listDebtDocuments,
  normalizeDebtDocument,
  reconcileCloudDebtReminders,
  serializeDebtDocument,
  subscribeToDebts,
  updateDebtDocument,
} from '@/services/debtFirestore';

const debt: Debt = {
  id: 'debt-A',
  storeId: 'store-A',
  workspaceId: 'space-A',
  createdByUserId: 'user-A',
  customerId: 'customer-A',
  currency: 'TRY',
  amount: 1250,
  dueDate: '2026-09-30',
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

function snapshot(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

function serializedCustomer() {
  return {
    id: debt.customerId,
    storeId: debt.storeId,
    isActive: true,
  };
}

function configureTransaction(customerData: Record<string, unknown> | undefined = serializedCustomer(), debtData?: Record<string, unknown>) {
  const transaction = {
    get: vi.fn(async (reference: { path: string }) => (
      reference.path.includes('/customers/')
        ? snapshot(customerData)
        : snapshot(debtData)
    )),
    set: vi.fn(),
  };
  firestoreMocks.runTransaction.mockImplementationOnce(async (
    _database: unknown,
    callback: (value: typeof transaction) => Promise<void>,
  ) => callback(transaction));
  return transaction;
}

describe('Debt Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.nextSnapshot = null;
    firestoreMocks.listenerError = null;
    firestoreMocks.getDoc.mockResolvedValue(snapshot(serializedCustomer()));
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
    firestoreMocks.onSnapshot.mockImplementation((_reference, next, error) => {
      firestoreMocks.nextSnapshot = next;
      firestoreMocks.listenerError = error;
      return firestoreMocks.unsubscribe;
    });
    firebaseMocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'user-A' } });
    storageMocks.reconcileDueDateReminders.mockResolvedValue(undefined);
    storageMocks.validateDebtInput.mockReturnValue(null);
  });

  it('serializes the Cloud document with canonical Workspace and authenticated ownership metadata', () => {
    expect(serializeDebtDocument({ ...debt, workspaceId: 'spoofed-space', createdByUserId: 'spoofed-user' }, 'space-A', 'user-A')).toEqual({
      id: 'debt-A',
      storeId: 'store-A',
      workspaceId: 'space-A',
      createdByUserId: 'user-A',
      customerId: 'customer-A',
      currency: 'TRY',
      amount: 1250,
      dueDate: '2026-09-30',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    });
  });

  it('normalizes valid Cloud documents and rejects wrong document identity or Workspace', () => {
    const serialized = serializeDebtDocument(debt, 'space-A', 'user-A');

    expect(normalizeDebtDocument('debt-A', serialized, 'space-A')).toEqual(debt);
    expect(normalizeDebtDocument('different-id', serialized, 'space-A')).toBeNull();
    expect(normalizeDebtDocument('debt-A', serialized, 'space-B')).toBeNull();
  });

  it('creates a Debt at spaces/{spaceId}/debts/{debtId} only when the Customer exists', async () => {
    const transaction = configureTransaction();

    await createDebtDocument('space-A', debt);

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/debts/debt-A',
    );
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/debts/debt-A' }),
      expect.objectContaining({
        id: 'debt-A',
        workspaceId: 'space-A',
        createdByUserId: 'user-A',
      }),
    );
  });

  it('rejects a missing or inactive Customer before creating a Debt', async () => {
    configureTransaction({ id: 'customer-A', storeId: 'store-A', isActive: false });

    await expect(createDebtDocument('space-A', debt)).rejects.toThrow('customerNotFound');
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });

  it('rejects duplicate Debt document IDs without overwriting the existing document', async () => {
    const transaction = configureTransaction(serializedCustomer(), { id: 'debt-A' });

    await expect(createDebtDocument('space-A', debt)).rejects.toThrow('debtAlreadyExists');
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it.each([
    ['currencyInvalid', { currency: 'INVALID' as Debt['currency'] }],
    ['amountInvalid', { amount: -1 }],
    ['dueDateInvalid', { dueDate: '2026-02-31' }],
  ])('rejects a Debt with %s', async (error, changes) => {
    storageMocks.validateDebtInput.mockReturnValueOnce(error as never);

    await expect(createDebtDocument('space-A', { ...debt, ...changes })).rejects.toThrow(error);
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('updates editable fields without sending immutable identity fields and preserves the document ID', async () => {
    const updatedDebt = {
      ...debt,
      amount: 900,
      dueDate: undefined,
      updatedAt: '2026-09-11T10:00:00.000Z',
    };

    await updateDebtDocument('space-A', updatedDebt);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'spaces/space-A/debts/debt-A' }),
      expect.objectContaining({
        customerId: 'customer-A',
        amount: 900,
        updatedAt: '2026-09-11T10:00:00.000Z',
        dueDate: '__delete_field__',
      }),
    );
    const update = firestoreMocks.updateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update).not.toHaveProperty('id');
    expect(update).not.toHaveProperty('storeId');
    expect(update).not.toHaveProperty('workspaceId');
    expect(update).not.toHaveProperty('createdAt');
  });

  it('subscribes to the active Workspace and cleans up the listener', () => {
    const onDebts = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeToDebts('space-A', onDebts, onError);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      expect.anything(),
      'spaces/space-A/debts',
    );
    firestoreMocks.nextSnapshot?.({
      docs: [{ id: 'debt-A', data: () => serializeDebtDocument(debt, 'space-A', 'user-A') }],
    });

    expect(onDebts).toHaveBeenCalledWith([debt]);
    expect(unsubscribe).toBe(firestoreMocks.unsubscribe);
    unsubscribe();
    expect(firestoreMocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('surfaces Cloud read failures through the listener instead of reading AsyncStorage', () => {
    const onError = vi.fn();
    subscribeToDebts('space-A', vi.fn(), onError);

    firestoreMocks.listenerError?.(new Error('permission-denied'));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
    expect(storageMocks.reconcileDueDateReminders).not.toHaveBeenCalled();
  });

  it('lists Cloud Debts and reconciles local due-date reminders from the Cloud snapshot', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'debt-A', data: () => serializeDebtDocument(debt, 'space-A', 'user-A') }],
    });

    await reconcileCloudDebtReminders('space-A', 'store-A');

    expect(storageMocks.reconcileDueDateReminders).toHaveBeenCalledWith('store-A', [debt]);
  });

});