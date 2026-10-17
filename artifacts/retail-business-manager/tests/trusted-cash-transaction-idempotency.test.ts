import { describe, expect, it } from 'vitest';
import { createCashTransactionHandler } from '../functions/src/createCashTransaction';

type Document = Record<string, unknown>;
type Snapshot = { exists: boolean; data: () => Document | undefined };

function reference(path: string) {
  return {
    path,
    collection(name: string) {
      return { doc: (id: string) => reference(`${path}/${name}/${id}`) };
    },
  };
}

function fakeFirestore(documents: Record<string, Document> = {}) {
  const store: Record<string, Document> = {
    'spaces/space-A': { status: 'active' },
    'spaces/space-A/members/user-A': { status: 'active' },
    'spaces/space-A/storeProfile/profile': { storeId: 'store-A' },
    ...documents,
  };

  return {
    collection: (name: string) => ({ doc: (id: string) => reference(`${name}/${id}`) }),
    async runTransaction<T>(callback: (tx: {
      get: (ref: { path: string }) => Promise<Snapshot>;
      create: (ref: { path: string }, data: Document) => void;
    }) => Promise<T>): Promise<T> {
      return callback({
        get: async (ref) => {
          const value = store[ref.path];
          return { exists: Boolean(value), data: () => value };
        },
        create: (ref, data) => {
          store[ref.path] = data;
        },
      });
    },
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    auth: { uid: 'user-A' },
    data: {
      spaceId: 'space-A',
      storeId: 'store-A',
      transactionId: 'transaction-A',
      operationId: 'operation-A',
      type: 'cash_in',
      amount: 100,
      currency: 'TRY',
      note: 'opening balance',
      ...overrides,
    },
  };
}

const runtime = (firestore: ReturnType<typeof fakeFirestore>) => ({
  firestore: firestore as never,
  now: () => '2026-10-17T12:00:00.000Z',
});

describe('createCashTransaction idempotency', () => {
  it('rejects a reused operation ID when the cash transaction payload changes', async () => {
    const firestore = fakeFirestore();

    await expect(createCashTransactionHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'created', transactionId: 'transaction-A' });

    await expect(createCashTransactionHandler(
      request({ amount: 125 }) as never,
      runtime(firestore),
    )).rejects.toMatchObject({
      code: 'already-exists',
      details: { code: 'IDEMPOTENCY_CONFLICT' },
    });

    await expect(createCashTransactionHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'replayed', transactionId: 'transaction-A' });
  });

  it('replays matching legacy receipts without stored payloads', async () => {
    const processedAt = '2026-10-17T12:00:00.000Z';
    const firestore = fakeFirestore({
      'spaces/space-A/transactions/transaction-A': {
        id: 'transaction-A',
        storeId: 'store-A',
        workspaceId: 'space-A',
        createdByUserId: 'user-A',
        type: 'cash_in',
        amount: 100,
        currency: 'TRY',
        note: 'opening balance',
        createdAt: processedAt,
        updatedAt: processedAt,
      },
      'spaces/space-A/operationReceipts/operation-A': {
        operationId: 'operation-A',
        spaceId: 'space-A',
        actorUserId: 'user-A',
        command: 'createCashTransaction',
        status: 'completed',
        processedAt,
        result: { transactionId: 'transaction-A' },
      },
    });

    await expect(createCashTransactionHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'replayed', transactionId: 'transaction-A' });
  });
});
