import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  cursor: 0, slots: [] as any[], effects: [] as Array<() => void>, result: null as any, refresh: 0,
  store: {} as any, debts: [] as any[], callbacks: [] as Array<{ next: (rows: any[]) => void; error: (e: Error) => void }>,
  subscribe: vi.fn(), stop: vi.fn(),
}));
// Bounded hook lifecycle harness: tests subscription counts and late-response isolation,
// not native rendering speed or a live network connection.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useState: (initial: any) => {
      const slot = state.cursor++;
      if (!(slot in state.slots)) state.slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [state.slots[slot], (value: any) => { state.slots[slot] = typeof value === 'function' ? value(state.slots[slot]) : value; }];
    },
    useEffect: (effect: () => void | (() => void), deps: any[]) => {
      const slot = state.cursor++, previous = state.slots[slot];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        state.effects.push(() => { previous?.cleanup?.(); state.slots[slot] = { deps, cleanup: effect() }; });
      }
    },
  };
});
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('@/services/journalArchiveFirestore', () => ({ subscribeJournalArchives: (...args: any[]) => state.subscribe(...args) }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => state.store }));
vi.mock('@/context/CustomerContext', () => ({ useCustomers: () => ({ customers: [], canonicalSpaceId: state.store.activeSpaceId, isLoading: false }) }));
vi.mock('@/context/DebtContext', () => ({ useDebts: () => ({ debts: state.debts, canonicalSpaceId: state.store.activeSpaceId, isLoading: false }) }));
vi.mock('@/context/PaymentContext', () => ({ usePayments: () => ({ payments: [], canonicalSpaceId: state.store.activeSpaceId, isLoading: false }) }));
vi.mock('@/hooks/useMerchantJournal', () => ({ useMerchantJournal: () => ({ operations: [], loading: false, error: null, key: 'day',
  window: { date: '2026-10-23', startAt: '2026-10-23T00:00:00Z', endAt: '2026-10-24T00:00:00Z', timeZone: 'UTC' } }) }));
import { useDailyJournalProjection } from '../hooks/useDailyJournalProjection';
function Probe() { state.result = useDailyJournalProjection(state.refresh); return null; }
function render() {
  state.cursor = 0; state.effects = [];
  renderToStaticMarkup(React.createElement(Probe));
  for (const effect of state.effects) effect();
}
beforeEach(() => {
  vi.clearAllMocks(); state.cursor = 0; state.slots = []; state.effects = []; state.callbacks = []; state.refresh = 0; state.debts = [];
  state.store = { isReady: true, isAuthenticated: true, activeSpaceId: 's', profile: { id: 'store' }, workspaceRole: 'owner',
    sessionKey: 'session-s', transactions: [] };
  state.subscribe.mockImplementation((_space, _store, next, error) => { state.callbacks.push({ next, error }); return state.stop; });
});
describe('journal recomputation is independent of archive I/O', () => {
  it('uses one subscription across 100 financial-source updates and reacts to new closings', () => {
    render(); state.callbacks[0].next([]); render();
    expect(state.result).toMatchObject({ isLoading: false, error: null });
    for (let index = 0; index < 100; index++) {
      state.store.transactions = [{ id: 'cash', storeId: 'store', type: 'cash_in', amount: index + 1, currency: 'TRY', createdAt: '2026-10-23T10:00:00Z' }];
      render();
    }
    expect(state.subscribe).toHaveBeenCalledOnce();
    expect(state.result.events).toHaveLength(1);
    expect(state.result.events[0].amount).toBe(100);
    state.callbacks[0].next([{ date: '2026-10-23', snapshot: [{ id: 'transaction:cash' }] }]); render();
    expect(state.result.events).toEqual([]);
    expect(state.subscribe).toHaveBeenCalledOnce();
  });
  it('does not expose old-space data or accept late results after switching or role loss', () => {
    render(); const old = state.callbacks[0]; old.next([]); render();
    state.store = { ...state.store, activeSpaceId: 'new', sessionKey: 'session-new' }; render();
    expect(state.result.events).toEqual([]); expect(state.result.isLoading).toBe(true);
    old.next([{ date: '2026-10-23', snapshot: [] }]); render();
    expect(state.result.isLoading).toBe(true); expect(state.stop).toHaveBeenCalledOnce();
    state.callbacks[1].next([]); render(); expect(state.result.isLoading).toBe(false);
    state.store = { ...state.store, workspaceRole: null }; render();
    expect(state.result.events).toEqual([]); expect(state.stop).toHaveBeenCalledTimes(2);
  });
  it('fails closed on snapshot errors and makes an explicit retry a new subscription', () => {
    render(); state.callbacks[0].error(new Error('permission-denied')); render();
    expect(state.result).toMatchObject({ events: [], isLoading: false, error: 'permission-denied' });
    state.refresh++; render();
    expect(state.result.isLoading).toBe(true);
    expect(state.subscribe).toHaveBeenCalledTimes(2);
    state.callbacks[1].next([]); render(); expect(state.result.error).toBeNull();
  });
});
