import { describe, expect, it } from 'vitest';
import { settleCustomerDebtHandler } from '../functions/src/settleCustomerDebt';

type Data = Record<string, unknown>;
type FakeQuery = { path: string; query: { collectionPath: string; field: string; value: unknown } };
type FakeReference = {
  id: string;
  path: string;
  collection: (name: string) => FakeCollection;
  doc: (id: string) => FakeReference;
  where: (field: string, operator: string, value: unknown) => FakeQuery;
};
type FakeCollection = {
  path: string;
  doc: (id: string) => FakeReference;
  where: (field: string, operator: string, value: unknown) => FakeQuery;
};

function fakeReference(path: string): FakeReference {
  return {
    id: path.split('/').at(-1)!,
    path,
    collection: (name) => fakeCollection(`${path}/${name}`),
    doc: (id) => fakeReference(`${path}/${id}`),
    where: (field, _operator, value) => ({
      path: `${path}?${field}==${String(value)}`,
      query: { collectionPath: path, field, value },
    }),
  };
}

function fakeCollection(path: string): FakeCollection {
  return {
    path,
    doc: (id) => fakeReference(`${path}/${id}`),
    where: (field, _operator, value) => ({
      path: `${path}?${field}==${String(value)}`,
      query: { collectionPath: path, field, value },
    }),
  };
}

function createFakeFirestore(seed: Record<string, Data>) {
  const documents = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  const created: Array<{ path: string; data: Data }> = [];
  const updated: Array<{ path: string; data: Data }> = [];

  const firestore = {
    collection: (name: string) => fakeCollection(name),
    async runTransaction<T>(callback: (transaction: {
      get: (reference: FakeReference | FakeQuery) => Promise<unknown>;
      create: (reference: FakeReference, data: Data) => void;
      update: (reference: FakeReference, data: Data) => void;
      set: (reference: FakeReference, data: Data) => void;
    }) => Promise<T>): Promise<T> {
      const transaction = {
        get: async (reference: FakeReference | FakeQuery): Promise<unknown> => {
          if ('query' in reference) {
            const { collectionPath, field, value } = reference.query;
            const docs = [...documents.entries()]
              .filter(([path, data]) => path.startsWith(`${collectionPath}/`)
                && !path.slice(collectionPath.length + 1).includes('/')
                && data[field] === value)
              .map(([path, data]) => ({
                ref: fakeReference(path),
                id: path.slice(collectionPath.length + 1),
                data: () => ({ ...data }),
              }));
            return { docs };
          }
          const data = documents.get(reference.path);
          return { exists: Boolean(data), data: () => data ? { ...data } : undefined };
        },
        create: (reference: FakeReference, data: Data) => {
          if (documents.has(reference.path)) throw new Error(`already exists: ${reference.path}`);
          documents.set(reference.path, { ...data });
          created.push({ path: reference.path, data: { ...data } });
        },
        update: (reference: FakeReference, data: Data) => {
          const current = documents.get(reference.path);
          if (!current) throw new Error(`missing document: ${reference.path}`);
          documents.set(reference.path, { ...current, ...data });
          updated.push({ path: reference.path, data: { ...data } });
        },
        set: (reference: FakeReference, data: Data) => {
          documents.set(reference.path, { ...data });
        },
      };
      return callback(transaction);
    },
  };

  return { firestore, documents, created, updated };
}

function baseSeed(): Record<string, Data> {
  return {
    'spaces/space-A': { status: 'active' },
    'spaces/space-A/members/user-A': { status: 'active', role: 'owner' },
    'spaces/space-A/storeProfile/profile': { storeId: 'store-A' },
    'spaces/space-A/customers/customer-A': {
      id: 'customer-A', storeId: 'store-A', workspaceId: 'space-A', isActive: true,
    },
    'spaces/space-A/debts/debt-A': {
      id: 'debt-A',
      storeId: 'store-A',
      workspaceId: 'space-A',
      customerId: 'customer-A',
      currency: 'TRY',
      amount: 150,
      originalAmount: 150,
      createdAt: '2026-10-16T10:00:00.000Z',
      updatedAt: '2026-10-16T10:00:00.000Z',
    },
  };
}

function request(amount: number) {
  return {
    auth: { uid: 'user-A' },
    data: {
      spaceId: 'space-A',
      storeId: 'store-A',
      customerId: 'customer-A',
      amount,
      currency: 'TRY',
      operationId: 'operation-A',
      transactionId: 'transaction-A',
      paymentId: 'payment-A',
    },
  };
}

describe('trusted debt settlement command', () => {
  it('atomically updates debt and creates its linked cash transaction, payment, and idempotency receipt', async () => {
    const fake = createFakeFirestore(baseSeed());

    const result = await settleCustomerDebtHandler(
      request(50) as never,
      { firestore: fake.firestore as never, now: () => '2026-10-17T12:00:00.000Z' },
    );

    expect(result).toMatchObject({
      outcome: 'completed',
      transactionId: 'transaction-A',
      paymentId: 'payment-A',
      processedAt: '2026-10-17T12:00:00.000Z',
    });
    expect(fake.documents.get('spaces/space-A/debts/debt-A')).toMatchObject({
      amount: 100,
      originalAmount: 150,
      updatedAt: '2026-10-17T12:00:00.000Z',
    });
    expect(fake.documents.get('spaces/space-A/transactions/transaction-A')).toMatchObject({
      type: 'cash_in',
      amount: 50,
      currency: 'TRY',
      workspaceId: 'space-A',
      createdByUserId: 'user-A',
    });
    expect(fake.documents.get('spaces/space-A/payments/payment-A')).toMatchObject({
      customerId: 'customer-A',
      transactionId: 'transaction-A',
      amount: { amount: 50, currency: 'TRY' },
      direction: 'in',
    });
    expect(fake.documents.get('spaces/space-A/operationReceipts/operation-A')).toMatchObject({
      command: 'settleCustomerDebt',
      actorUserId: 'user-A',
      status: 'completed',
      payload: {
        spaceId: 'space-A',
        storeId: 'store-A',
        customerId: 'customer-A',
        amount: 50,
        currency: 'TRY',
        transactionId: 'transaction-A',
        paymentId: 'payment-A',
      },
      result: { transactionId: 'transaction-A', paymentId: 'payment-A' },
    });
    expect(fake.created.map((entry) => entry.path).sort()).toEqual([
      'spaces/space-A/operationReceipts/operation-A',
      'spaces/space-A/payments/payment-A',
      'spaces/space-A/transactions/transaction-A',
    ]);
    expect(fake.updated).toHaveLength(1);
  });


  it('rejects a reused operation ID when the settlement payload changes', async () => {
    const fake = createFakeFirestore(baseSeed());
    const runtime = { firestore: fake.firestore as never, now: () => '2026-10-17T12:00:00.000Z' };

    await settleCustomerDebtHandler(request(50) as never, runtime);

    await expect(settleCustomerDebtHandler(request(60) as never, runtime))
      .rejects.toMatchObject({
        code: 'already-exists',
        details: { code: 'IDEMPOTENCY_CONFLICT' },
      });

    await expect(settleCustomerDebtHandler(request(50) as never, runtime))
      .resolves.toMatchObject({ outcome: 'replayed' });
    expect(fake.documents.get('spaces/space-A/debts/debt-A')?.amount).toBe(100);
  });

  it('preserves an overpayment as customer credit and records only the actual cash received', async () => {
    const fake = createFakeFirestore(baseSeed());

    await expect(settleCustomerDebtHandler(
      request(151) as never,
      { firestore: fake.firestore as never, now: () => '2026-10-17T12:00:00.000Z' },
    )).resolves.toMatchObject({ outcome: 'completed' });
    expect(fake.documents.get('spaces/space-A/debts/debt-A')?.amount).toBe(0);
    expect(fake.documents.get('spaces/space-A/transactions/transaction-A')?.amount).toBe(151);
    expect([...fake.documents.entries()].find(([path]) => path.includes('/customerCredits/'))?.[1]).toMatchObject({ creditExact: '1.00' });
  });

  it('replays the same completed operation without applying the settlement twice', async () => {
    const seed = baseSeed();
    seed['spaces/space-A/debts/debt-A'].amount = 100;
    seed['spaces/space-A/debts/debt-A'].updatedAt = '2026-10-17T11:00:00.000Z';
    seed['spaces/space-A/transactions/transaction-A'] = {
      id: 'transaction-A',
      storeId: 'store-A',
      workspaceId: 'space-A',
      createdByUserId: 'user-A',
      type: 'cash_in',
      amount: 50,
      currency: 'TRY',
      note: 'payment_customer-A',
      createdAt: '2026-10-17T11:00:00.000Z',
      updatedAt: '2026-10-17T11:00:00.000Z',
    };
    seed['spaces/space-A/payments/payment-A'] = {
      id: 'payment-A',
      storeId: 'store-A',
      workspaceId: 'space-A',
      createdByUserId: 'user-A',
      customerId: 'customer-A',
      transactionId: 'transaction-A',
      amount: { amount: 50, currency: 'TRY' },
      direction: 'in',
      method: 'cash',
      paidAt: '2026-10-17T11:00:00.000Z',
      createdAt: '2026-10-17T11:00:00.000Z',
      updatedAt: '2026-10-17T11:00:00.000Z',
    };
    seed['spaces/space-A/operationReceipts/operation-A'] = {
      operationId: 'operation-A',
      spaceId: 'space-A',
      actorUserId: 'user-A',
      command: 'settleCustomerDebt',
      status: 'completed',
      processedAt: '2026-10-17T11:00:00.000Z',
      result: { transactionId: 'transaction-A', paymentId: 'payment-A' },
    };
    const fake = createFakeFirestore(seed);

    const result = await settleCustomerDebtHandler(
      request(50) as never,
      { firestore: fake.firestore as never, now: () => '2026-10-17T12:00:00.000Z' },
    );

    expect(result).toMatchObject({
      outcome: 'replayed',
      transactionId: 'transaction-A',
      paymentId: 'payment-A',
      processedAt: '2026-10-17T11:00:00.000Z',
    });
    expect(fake.created).toHaveLength(0);
    expect(fake.updated).toHaveLength(0);
    expect(fake.documents.get('spaces/space-A/debts/debt-A')?.amount).toBe(100);
  });
});
