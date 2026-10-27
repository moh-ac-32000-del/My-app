import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as Array<() => void>,
  subscribe: vi.fn(), send: vi.fn(), next: [] as Array<(value: any) => void>, stops: [] as Array<ReturnType<typeof vi.fn>> }));
vi.mock('react', async original => ({ ...(await original<typeof import('react')>()),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [state.slots[index], (value: any) => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; }];
  },
  useRef: (initial: unknown) => { const index = state.cursor++; return state.slots[index] ?? (state.slots[index] = { current: initial }); },
  useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
    const index = state.cursor++, previous = state.slots[index];
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      const slot = state.slots[index] = { dependencies, cleanup: previous?.cleanup };
      state.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    }
  },
}));
vi.mock('@/context/SessionLiveReadsContext', () => ({ useSessionLiveReads: () => null }));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ profile: { id: 'store' }, activeSpaceId: 's', sessionKey: 'session',
  isAuthenticated: true, isReady: true, activeSpaceLoading: false, activeSpaceError: null, initializationError: null,
  workspaceRole: 'owner', canWriteBusiness: true, assertBusinessAccess: () => {} }) }));
vi.mock('@/services/merchantFirestore', () => ({ subscribeMerchantAccounts: state.subscribe, sendMerchantCommand: state.send, loadMerchantHistoryPage: vi.fn() }));
import { useMerchantAccounts } from '../hooks/useMerchantAccounts';
let current: ReturnType<typeof useMerchantAccounts>;
function render() { state.cursor = 0; function Probe() { current = useMerchantAccounts('m'); return null; } renderToStaticMarkup(React.createElement(Probe)); }
function effects() { for (const effect of state.effects.splice(0)) effect(); }
const snapshot = (balance: string) => ({ merchants: [{ id: 'm' }], balances: [{ merchantId: 'm', currency: 'TRY', balanceExact: balance }], operations: [], operationsLimited: false });
beforeEach(() => {
  state.cursor = 0; state.slots = []; state.effects = []; state.next = []; state.stops = [];
  state.send.mockReset(); state.subscribe.mockReset().mockImplementation((_space, _store, next) => {
    const stop = vi.fn(); state.next.push(next); state.stops.push(stop); return stop;
  });
});
describe('merchant account command refresh, without route changes or optimistic amounts', () => {
  it('reconfirms the current account after an acknowledged payment and ignores the old listener', async () => {
    render(); effects(); state.next[0](snapshot('100.00')); render();
    expect(current.balances[0].balanceExact).toBe('100.00');
    let resolve!: (value: unknown) => void;
    state.send.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = current.command({ action: 'payment', merchantId: 'm', operationId: 'op', currency: 'TRY', amountExact: '25.00', source: 'cash' });
    render(); effects(); expect(state.subscribe).toHaveBeenCalledTimes(1);
    resolve({ outcome: 'completed' }); await pending; render(); effects(); render();
    expect(state.subscribe).toHaveBeenCalledTimes(2); expect(state.stops[0]).toHaveBeenCalledOnce();
    expect(current.isLoading).toBe(true); expect(current.balances).toEqual([]);
    state.next[0](snapshot('999.00')); render(); expect(current.balances).toEqual([]);
    state.next[1](snapshot('75.00')); render();
    expect(current.isLoading).toBe(false); expect(current.balances[0].balanceExact).toBe('75.00');
    expect(state.subscribe.mock.calls[1][4]).toBe('m');
  });
  it('does not publish success or restart subscriptions for a failed command', async () => {
    render(); effects(); state.next[0](snapshot('100.00')); render();
    state.send.mockRejectedValue(new Error('offline'));
    await expect(current.command({ action: 'payment', merchantId: 'm', operationId: 'op', currency: 'TRY', amountExact: '25.00', source: 'cash' })).rejects.toThrow('offline');
    render(); effects(); expect(state.subscribe).toHaveBeenCalledTimes(1); expect(current.balances[0].balanceExact).toBe('100.00');
  });
});
