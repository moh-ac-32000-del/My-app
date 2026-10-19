import { describe, expect, it } from 'vitest';
import { trustedDebtCommandHandler } from '../functions/src/trustedDebtCommand';

type Document = Record<string, unknown>;
type Snapshot = { exists: boolean; data: () => Document | undefined };

function reference(path: string) {
  return {
    id: path.split('/').at(-1)!,
    path,
    collection(name: string) {
      return { doc: (id: string) => reference(`${path}/${name}/${id}`) };
    },
  };
}

function fakeFirestore(documents: Record<string, Document> = {}) {
  const store: Record<string, Document> = {
    'spaces/space-A': { status: 'active' },
    'spaces/space-A/members/user-A': { status: 'active', role: 'owner' },
    'spaces/space-A/storeProfile/profile': { storeId: 'store-A' },
    'spaces/space-A/customers/customer-A': {
      id: 'customer-A',
      isActive: true,
      storeId: 'store-A',
      workspaceId: 'space-A',
    },
    ...documents,
  };

  return {
    collection: (name: string) => ({ doc: (id: string) => reference(`${name}/${id}`) }),
    async runTransaction<T>(callback: (tx: {
      get: (ref: { path: string }) => Promise<Snapshot>;
      create: (ref: { path: string }, data: Document) => void;
      set: (ref: { path: string }, data: Document) => void;
    }) => Promise<T>): Promise<T> {
      return callback({
        get: async (ref) => {
          const value = store[ref.path];
          return { exists: Boolean(value), data: () => value };
        },
        create: (ref, data) => {
          store[ref.path] = data;
        },
        set: (ref, data) => {
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
      action: 'create',
      spaceId: 'space-A',
      storeId: 'store-A',
      customerId: 'customer-A',
      debtId: 'debt-A',
      operationId: 'operation-A',
      currency: 'TRY',
      amount: 100,
      dueDate: '2026-11-01T00:00:00.000Z',
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: '2026-10-17T12:00:00.000Z',
      ...overrides,
    },
  };
}

const runtime = (firestore: ReturnType<typeof fakeFirestore>) => ({
  firestore: firestore as never,
  now: () => '2026-10-17T12:00:00.000Z',
});

describe('trustedDebtCommand idempotency', () => {
  it('rejects a reused operation ID when the debt payload changes', async () => {
    const firestore = fakeFirestore();

    await expect(trustedDebtCommandHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'created', debtId: 'debt-A' });

    await expect(trustedDebtCommandHandler(
      request({ amount: 125 }) as never,
      runtime(firestore),
    )).rejects.toMatchObject({
      code: 'already-exists',
      details: { code: 'IDEMPOTENCY_CONFLICT' },
    });

    await expect(trustedDebtCommandHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'replayed', debtId: 'debt-A' });
  });

  it('replays matching legacy receipts without stored payloads', async () => {
    const processedAt = '2026-10-17T12:00:00.000Z';
    const firestore = fakeFirestore({
      'spaces/space-A/debts/debt-A': {
        id: 'debt-A',
        workspaceId: 'space-A',
        storeId: 'store-A',
        customerId: 'customer-A',
        currency: 'TRY',
        amount: 100,
        dueDate: '2026-11-01T00:00:00.000Z',
        createdAt: processedAt,
        updatedAt: processedAt,
      },
      'spaces/space-A/operationReceipts/operation-A': {
        operationId: 'operation-A',
        spaceId: 'space-A',
        actorUserId: 'user-A',
        command: 'trustedDebtCommand',
        action: 'create',
        status: 'completed',
        processedAt,
        result: { debtId: 'debt-A' },
      },
    });

    await expect(trustedDebtCommandHandler(request() as never, runtime(firestore)))
      .resolves.toMatchObject({ outcome: 'replayed', debtId: 'debt-A' });
  });
});
