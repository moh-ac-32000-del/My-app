import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as Array<() => void>, space: 's', role: 'owner',
  next: null as null | ((value: any) => void), call: vi.fn(), read: vi.fn(), assert: vi.fn() }));
vi.mock('react', async original => ({ ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => { const index = state.cursor++; if (!(index in state.slots)) state.slots[index] = initial;
    return [state.slots[index], (value: any) => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; }]; },
  useRef: (initial: unknown) => { const index = state.cursor++; return state.slots[index] ?? (state.slots[index] = { current: initial }); },
  useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
    const index = state.cursor++, previous = state.slots[index];
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      const slot = state.slots[index] = { dependencies, cleanup: previous?.cleanup };
      state.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    }
  },
}));
vi.mock('@/context/StoreContext', () => ({ useStore: () => ({ activeSpaceId: state.space, sessionKey: `session-${state.space}`, profile: { id: 'store' },
  workspaceRole: state.role, isReady: true, isAuthenticated: true, activeSpaceLoading: false, activeSpaceError: null,
  canWriteBusiness: state.role === 'owner', assertBusinessAccess: state.assert }) }));
vi.mock('@/services/firebase', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => state.call }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_db: unknown, path: string) => path,
  onSnapshot: (_ref: unknown, _options: unknown, next: any) => { state.next = next; return () => {}; }, getDocFromServer: state.read }));
import { useMerchantSettings } from '../hooks/useMerchantSettings';
let current: ReturnType<typeof useMerchantSettings>;
function render() { state.cursor = 0; function Probe() { current = useMerchantSettings(); return null; } renderToStaticMarkup(React.createElement(Probe)); }
function effects() { for (const effect of state.effects.splice(0)) effect(); }
const settings = (revision: number, names: string[]) => ({ revision, materials: [], paymentMethods: names.map((name, i) => ({ id: `method-${i}`, name, isActive: true })) });
const snapshot = (revision: number, names: string[]) => ({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true,
  data: () => ({ ...settings(revision,names), workspaceId: 's', storeId: 'store', version: 1 }) });
const acknowledged = (revision = 2) => ({ data: { outcome: 'updated', operationId: 'op', revision, processedAt: '2026-10-27T12:00:00Z' } });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { state.cursor = 0; state.slots = []; state.effects = []; state.next = null; state.space = 's'; state.role = 'owner';
  state.call.mockReset().mockResolvedValue(acknowledged()); state.read.mockReset(); state.assert.mockReset(); });
describe('merchant reference-list acknowledgement and monotonic server revisions', () => {
  it('shows a second saved method without needing a third, even if the listener lags', async () => {
    render(); effects(); state.next!(snapshot(1,['First'])); render();
    let resolve!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = current.save(settings(1,['First','Second']), 'op'); await tick();
    state.next!(snapshot(1,['First'])); render(); expect(current.data).toBeNull();
    resolve(snapshot(2,['First','Second'])); const result = await pending; render();
    expect(result.settings.paymentMethods.map(row => row.name)).toEqual(['First','Second']);
    expect(current.data?.paymentMethods.map(row => row.name)).toEqual(['First','Second']);
    state.next!(snapshot(1,['First'])); render(); expect(current.data?.revision).toBe(2);
    expect(state.read).toHaveBeenCalledExactlyOnceWith('spaces/s/merchantSettings/config');
  });
  it('adds no read when the live listener already confirmed the saved revision', async () => {
    render(); effects(); state.next!(snapshot(2,['First','Second'])); render();
    const result = await current.save(settings(1,['First','Second']), 'op');
    expect(result.settings.revision).toBe(2); expect(state.read).not.toHaveBeenCalled();
  });
  it('does not regress a newer configuration delivered while the explicit read was in flight', async () => {
    render(); effects(); state.next!(snapshot(1,['First'])); render();
    let resolve!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = current.save(settings(1,['First','Second']), 'op'); await tick();
    state.next!(snapshot(3,['First','Second','Third'])); resolve(snapshot(2,['First','Second']));
    expect((await pending).settings.revision).toBe(3); render(); expect(current.data?.revision).toBe(3);
  });
  it('blocks a failed read instead of publishing the unsynchronized draft', async () => {
    render(); effects(); state.next!(snapshot(1,['First'])); render(); state.read.mockRejectedValue(new Error('offline'));
    await expect(current.save(settings(1,['First','Second']), 'op')).rejects.toThrow('offline');
    state.next!(snapshot(1,['First'])); render(); expect(current.data).toBeNull();
  });
  it('does not publish a completed read into another workspace', async () => {
    render(); effects(); state.next!(snapshot(1,['First'])); render();
    let resolve!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = current.save(settings(1,['First','Second']), 'op'); await tick();
    state.space = 'other'; render(); effects(); resolve(snapshot(2,['First','Second']));
    await expect(pending).rejects.toThrow('workspaceSessionChanged'); render(); expect(current.data).toBeNull();
  });
  it('does not send a save from a viewer', async () => { state.role = 'viewer'; render(); effects();
    await expect(current.save(settings(1,['First','Second']), 'op')).rejects.toThrow('workspaceReadOnly'); expect(state.call).not.toHaveBeenCalled(); });
});
