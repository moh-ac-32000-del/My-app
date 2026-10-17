import { describe, expect, it } from 'vitest';
import { createCashTransactionHandler } from '../functions/src/createCashTransaction';
import { createPaymentHandler } from '../functions/src/createPayment';

type Snapshot = { exists: boolean; data: () => Record<string, unknown> | undefined };

function reference(path: string) {
  return {
    path,
    collection(name: string) {
      return { doc: (id: string) => reference(`${path}/${name}/${id}`) };
    },
    doc(id: string) {
      return reference(`${path}/${id}`);
    },
  };
}

function fakeFirestore(storeId: string) {
  const documents: Record<string, Record<string, unknown>> = {
    'spaces/space-A': { status: 'active' },
    'spaces/space-A/members/user-A': { status: 'active' },
    'spaces/space-A/storeProfile/profile': { storeId },
  };
  return {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
    }),
    async runTransaction<T>(callback: (tx: {
      get: (ref: { path: string }) => Promise<Snapshot>;
      create: (ref: { path: string }, data: Record<string, unknown>) => void;
    }) => Promise<T>): Promise<T> {
      const tx = {
        get: async (ref: { path: string }): Promise<Snapshot> => {
          const value = documents[ref.path];
          return { exists: Boolean(value), data: () => value };
        },
        create: (ref: { path: string }, data: Record<string, unknown>) => {
          documents[ref.path] = data;
        },
      };
      return callback(tx);
    },
  };
}

describe('trusted financial commands enforce the canonical store scope', () => {
  it('rejects cash transactions when the requested store differs from the workspace profile', async () => {
    const handlerRequest = {
      auth: { uid: 'user-A' },
      data: {
        spaceId: 'space-A',
        storeId: 'store-forged',
        transactionId: 'transaction-A',
        operationId: 'operation-A',
        type: 'cash_in',
        amount: 100,
        currency: 'TRY',
      },
    };

    await expect(createCashTransactionHandler(
      handlerRequest as never,
      { firestore: fakeFirestore('store-canonical') as never, now: () => '2026-10-17T12:00:00.000Z' },
    )).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects payments when the requested store differs from the workspace profile', async () => {
    const handlerRequest = {
      auth: { uid: 'user-A' },
      data: {
        spaceId: 'space-A',
        storeId: 'store-forged',
        paymentId: 'payment-A',
        operationId: 'operation-A',
        amount: { amount: 100, currency: 'TRY' },
        direction: 'in',
        method: 'cash',
        paidAt: '2026-10-17T12:00:00.000Z',
      },
    };

    await expect(createPaymentHandler(
      handlerRequest as never,
      { firestore: fakeFirestore('store-canonical') as never, now: () => '2026-10-17T12:00:00.000Z' },
    )).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
