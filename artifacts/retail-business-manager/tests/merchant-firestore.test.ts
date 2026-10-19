import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  listeners: [] as Array<{
    path: string;
    next: (value: any) => void;
    error: (value: any) => void;
    stop: ReturnType<typeof vi.fn>;
  }>,
  sync: (() => {}) as () => void,
  syncStop: vi.fn(),
  call: vi.fn(),
  constraints: [] as unknown[],
}));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => state.call }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown, ...constraints: unknown[]) => {
    state.constraints = constraints;
    return ref;
  },
  where: (...values: unknown[]) => ({ where: values }),
  orderBy: (...values: unknown[]) => ({ orderBy: values }),
  limit: (value: number) => ({ limit: value }),
  onSnapshot: (ref: { path: string }, _options: unknown, next: any, error: any) => {
    const stop = vi.fn();
    state.listeners.push({ path: ref.path, next, error, stop });
    return stop;
  },
  onSnapshotsInSync: (_db: unknown, sync: () => void) => {
    state.sync = sync;
    return state.syncStop;
  },
}));
import { sendMerchantCommand, subscribeMerchantAccounts } from '@/services/merchantFirestore';
const snapshot = (values: unknown[] = [], fromCache = false, hasPendingWrites = false) => ({
  docs: values.map((value: any) => ({ id: value.id, data: () => value })),
  metadata: { fromCache, hasPendingWrites },
});
const merchant = {
  id: 'm',
  workspaceId: 's',
  storeId: 'store',
  name: 'Merchant',
  phone: '',
  isActive: true,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
  createdByUserId: 'u',
  updatedByUserId: 'u',
};
const balance = {
  id: 'balance',
  workspaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  currency: 'TRY',
  balanceExact: '-300.00',
  revision: 1,
  version: 1,
};
beforeEach(() => {
  state.listeners = [];
  state.call.mockReset();
  state.syncStop.mockReset();
  state.constraints = [];
});

describe('scoped merchant observations', () => {
  it('reads only current-space metadata/balances on the list, not historical operations', () => {
    const publish = vi.fn();
    const stop = subscribeMerchantAccounts('s', 'store', publish, vi.fn());
    expect(state.listeners.map((listener) => listener.path)).toEqual([
      'spaces/s/merchants',
      'spaces/s/merchantBalances',
    ]);
    state.listeners[0].next(snapshot([merchant]));
    state.listeners[1].next(snapshot([balance]));
    expect(publish).not.toHaveBeenCalled();
    state.sync();
    expect(publish).toHaveBeenCalledWith({
      merchants: [merchant],
      balances: [balance],
      operations: [],
      operationsLimited: false,
    });
    stop();
    state.listeners[0].next(snapshot([]));
    state.sync();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(state.listeners.every((listener) => listener.stop.mock.calls.length === 1)).toBe(true);
    expect(state.syncStop).toHaveBeenCalledOnce();
  });
  it('bounds detail history by merchant and date, without scanning all workspace operations', () => {
    subscribeMerchantAccounts('s', 'store', vi.fn(), vi.fn(), 'm');
    expect(state.listeners[2].path).toBe('spaces/s/merchantOperations');
    expect(state.constraints).toEqual([
      { where: ['merchantId', '==', 'm'] },
      { orderBy: ['createdAt', 'desc'] },
      { limit: 101 },
    ]);
  });
  it('does not publish local pending writes or cache-only initial financial values', () => {
    const publish = vi.fn();
    subscribeMerchantAccounts('s', 'store', publish, vi.fn());
    state.listeners[0].next(snapshot([merchant]));
    state.listeners[1].next(snapshot([balance], true));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    state.listeners[1].next(snapshot([balance], false, true));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    state.listeners[1].next(snapshot([balance]));
    state.sync();
    expect(publish).toHaveBeenCalledOnce();
  });
  it('invalidates the full financial view and stops listeners on permission loss', async () => {
    const fail = vi.fn(),
      publish = vi.fn();
    subscribeMerchantAccounts('s', 'store', publish, fail);
    state.listeners[0].error(new Error('permission-denied'));
    await Promise.resolve();
    state.listeners[0].next(snapshot([merchant]));
    state.listeners[1].next(snapshot([balance]));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    expect(state.listeners.every((listener) => listener.stop.mock.calls.length === 1)).toBe(true);
  });
  it.each([
    { rows: [{ ...balance, workspaceId: 'other' }] },
    { rows: [balance, { ...balance, id: 'duplicate' }] },
    { rows: [{ ...balance, merchantId: 'missing' }] },
  ])('rejects wrong-space, duplicate or orphaned account data', ({ rows }) => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeMerchantAccounts('s', 'store', publish, fail);
    state.listeners[0].next(snapshot([merchant]));
    state.listeners[1].next(snapshot(rows));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
  });
});

describe('trusted merchant command boundary', () => {
  const command = {
    action: 'payment' as const,
    merchantId: 'm',
    operationId: 'operation',
    currency: 'TRY' as const,
    amountExact: '10.00',
    source: 'cash' as const,
  };
  it('keeps the operation ID and exact string payload when retrying the same request', async () => {
    state.call.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValue({
      data: {
        outcome: 'completed',
        merchantId: 'm',
        operationId: 'operation',
        balanceExact: '-10.00',
        cashDeltaExact: '-10.00',
        processedAt: '2026-10-19T12:00:00.000Z',
      },
    });
    await expect(sendMerchantCommand('s', 'store', command)).rejects.toMatchObject({ code: 'functions/unavailable' });
    await sendMerchantCommand('s', 'store', command);
    expect(state.call.mock.calls).toEqual([
      [{ ...command, spaceId: 's', storeId: 'store' }],
      [{ ...command, spaceId: 's', storeId: 'store' }],
    ]);
  });
  it('does not accept an uncorrelated operation response as success', async () => {
    state.call.mockResolvedValue({
      data: {
        outcome: 'completed',
        merchantId: 'm',
        operationId: 'other',
        balanceExact: '-10.00',
        cashDeltaExact: '-10.00',
        processedAt: '2026-10-19T12:00:00.000Z',
      },
    });
    await expect(sendMerchantCommand('s', 'store', command)).rejects.toThrow('invalidMerchantCommandResponse');
  });
});
