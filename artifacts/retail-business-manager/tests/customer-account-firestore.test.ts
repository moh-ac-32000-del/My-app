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
  receive: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}) }));
vi.mock('@/services/localExportObservation', () => ({
  observeForLocalExport: () => ({ receive: state.receive, invalidate: state.invalidate }),
}));
vi.mock('@/services/debtFirestore', () => ({
  normalizeDebtDocument: (id: string, value: any) => (value.invalid ? null : { ...value, id }),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (reference: { path: string }, _options: unknown, next: any, error: any) => {
    const stop = vi.fn();
    state.listeners.push({ path: reference.path, next, error, stop });
    return stop;
  },
  onSnapshotsInSync: (_db: unknown, sync: () => void) => {
    state.sync = sync;
    return state.syncStop;
  },
}));
import { subscribeCustomerAccounts } from '@/services/customerAccountFirestore';
const debt = {
  id: 'd',
  workspaceId: 's',
  storeId: 'store',
  customerId: 'c',
  currency: 'TRY',
  amount: 100,
  createdAt: '2026-10-19T12:00:00.000Z',
};
const credit = {
  id: 'credit',
  workspaceId: 's',
  storeId: 'store',
  customerId: 'c',
  currency: 'TRY',
  creditExact: '30.00',
  revision: 1,
  version: 1,
};
const snapshot = (values: any[], cached = false) => ({
  docs: values.map((value) => ({ id: value.id, data: () => value })),
  metadata: { fromCache: cached, hasPendingWrites: false },
});
beforeEach(() => {
  state.listeners = [];
  state.receive.mockReset();
  state.invalidate.mockReset();
  state.syncStop.mockReset();
});
describe('coherent customer debt/credit subscriptions', () => {
  it('stages debt and credit from the same sync barrier without an intermediate false balance', () => {
    const publish = vi.fn();
    subscribeCustomerAccounts('s', 'store', publish, vi.fn());
    expect(state.listeners.map((listener) => listener.path)).toEqual(['spaces/s/debts', 'spaces/s/customerCredits']);
    state.listeners[0].next(snapshot([debt]));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    state.listeners[1].next(snapshot([]));
    state.sync();
    expect(publish).toHaveBeenCalledOnce();
    state.listeners[0].next(snapshot([{ ...debt, amount: 0, amountExact: '0.00' }]));
    state.listeners[1].next(snapshot([credit]));
    expect(publish).toHaveBeenCalledOnce();
    state.sync();
    expect(publish).toHaveBeenLastCalledWith({
      debts: [expect.objectContaining({ amountExact: '0.00' })],
      credits: [credit],
    });
  });
  it('does not turn cache-only credit into an authoritative new balance', () => {
    const publish = vi.fn();
    subscribeCustomerAccounts('s', 'store', publish, vi.fn());
    state.listeners[0].next(snapshot([debt]));
    state.listeners[1].next(snapshot([credit], true));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
  });
  it('stops both observations and export coverage on permission loss', async () => {
    const fail = vi.fn();
    subscribeCustomerAccounts('s', 'store', vi.fn(), fail);
    state.listeners[1].error(new Error('permission-denied'));
    await Promise.resolve();
    expect(fail).toHaveBeenCalledOnce();
    expect(state.invalidate).toHaveBeenCalledOnce();
    expect(state.listeners.every((listener) => listener.stop.mock.calls.length === 1)).toBe(true);
    expect(state.syncStop).toHaveBeenCalledOnce();
  });
  it('rejects duplicate credits rather than silently doubling or omitting them', () => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeCustomerAccounts('s', 'store', publish, fail);
    state.listeners[0].next(snapshot([]));
    state.listeners[1].next(snapshot([credit, { ...credit, id: 'duplicate' }]));
    state.sync();
    expect(fail).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
  it('does not omit a malformed debt and report the account as successfully empty', () => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeCustomerAccounts('s', 'store', publish, fail);
    state.listeners[0].next(snapshot([{ ...debt, invalid: true }]));
    state.listeners[1].next(snapshot([]));
    state.sync();
    expect(fail).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
  it('ignores old-space callbacks after replacement without making additional reads', () => {
    const publish = vi.fn();
    const stop = subscribeCustomerAccounts('s', 'store', publish, vi.fn());
    stop();
    state.listeners[0].next(snapshot([debt]));
    state.listeners[1].next(snapshot([credit]));
    state.sync();
    expect(publish).not.toHaveBeenCalled();
    expect(state.receive).not.toHaveBeenCalled();
  });
});
