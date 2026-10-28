import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as Array<() => void>, date: '2026-10-27', store: {} as any,
  subscribe: vi.fn(), callbacks: [] as Array<{ next: (rows: any[]) => void; fail: (error: Error) => void; stop: ReturnType<typeof vi.fn> }>, reads: null as any }));
vi.mock('react', async original => ({ ...(await original<typeof import('react')>()),
  useState: (initial: any) => { const i = state.cursor++; if (!(i in state.slots)) state.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [state.slots[i], (value: any) => { state.slots[i] = typeof value === 'function' ? value(state.slots[i]) : value; }]; },
  useRef: (initial: any) => { const i = state.cursor++; return state.slots[i] ?? (state.slots[i] = { current: initial }); },
  useEffect: (effect: () => void | (() => void), deps: any[]) => { const i = state.cursor++, previous = state.slots[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) state.effects.push(() => {
      previous?.cleanup?.(); state.slots[i] = { deps, cleanup: effect() }; }); },
}));
vi.mock('@/context/StoreContext', () => ({ useStore: () => state.store }));
vi.mock('@/context/SessionLiveReadsContext', () => ({ useSessionLiveReads: () => state.reads }));
vi.mock('@/hooks/useFinancialWindow', () => ({ useFinancialWindow: () => ({ error: null, window: {
  date: '2026-10-29', startAt: '2026-10-28T21:00:00.000Z', endAt: '2026-10-29T21:00:00.000Z', timeZone: 'Europe/Istanbul' } }) }));
vi.mock('@/services/merchantJournalFirestore', () => ({ subscribeMerchantJournal: state.subscribe }));
import { useMerchantJournal } from '../hooks/useMerchantJournal';
import { createSessionLiveReads } from '../data/sessionLiveReads';
let value: ReturnType<typeof useMerchantJournal>;
function render() { state.cursor = 0; function Probe() { value = useMerchantJournal(0, state.date); return null; }
  renderToStaticMarkup(React.createElement(Probe)); for (const effect of state.effects.splice(0)) effect(); }
beforeEach(() => {
  state.reads?.clear(); state.reads = createSessionLiveReads(); state.cursor = 0; state.slots = []; state.effects = []; state.callbacks = []; state.date = '2026-10-27';
  state.store = { isReady: true, isAuthenticated: true, activeSpaceId: 's', profile: { id: 'store' }, workspaceRole: 'viewer', sessionKey: 'session', cloudSpace: {} };
  state.subscribe.mockReset().mockImplementation((_space, _store, _from, _to, next, fail) => { const stop = vi.fn(); state.callbacks.push({ next, fail, stop }); return stop; });
});
describe('historical merchant journal is a scoped independent read', () => {
  it('does not replace the live dashboard channel and scopes the read to the selected day', () => {
    const homeStop = vi.fn(), home = vi.fn();
    state.reads.subscribe('merchantJournal', 'home', (next: any) => { next(['home']); return homeStop; }, home, vi.fn());
    const shared = vi.spyOn(state.reads, 'subscribe');
    render();
    expect(shared).not.toHaveBeenCalled(); expect(homeStop).not.toHaveBeenCalled();
    expect(state.subscribe.mock.calls[0].slice(0, 4)).toEqual(['s', 'store', '2026-10-26T21:00:00.000Z', '2026-10-27T21:00:00.000Z']);
    state.callbacks[0].next([{ id: 'old-day' }]); render(); expect(value.operations[0].id).toBe('old-day');
    state.date = '2026-10-28'; render(); render();
    expect(state.callbacks[0].stop).toHaveBeenCalledOnce(); expect(value.operations).toEqual([]);
    state.callbacks[0].next([{ id: 'late' }]); render(); expect(value.operations).toEqual([]);
    expect(homeStop).not.toHaveBeenCalled(); state.reads.clear();
  });
  it('clears the selected day on membership loss and ignores a late result', () => {
    render(); state.callbacks[0].next([{ id: 'old-day' }]); render();
    state.store.workspaceRole = null; render(); render();
    state.callbacks[0].next([{ id: 'late' }]); render();
    expect(value.operations).toEqual([]); expect(state.callbacks[0].stop).toHaveBeenCalledOnce();
  });
});
