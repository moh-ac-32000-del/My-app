import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn(), next: null as any, error: null as any, stop: vi.fn() }));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, path: string) => ({ path }),
  where: (...args: unknown[]) => args,
  query: state.query,
  onSnapshot: (_ref: unknown, _opts: unknown, next: any, error: any) => {
    state.next = next;
    state.error = error;
    return state.stop;
  },
}));
import { subscribeMerchantJournal } from '@/services/merchantJournalFirestore';
const start = '2026-10-19T00:00:00.000Z',
  end = '2026-10-20T00:00:00.000Z';
const row = {
  id: 'op',
  workspaceId: 's',
  storeId: 'store',
  merchantId: 'm',
  merchantName: 'Merchant',
  action: 'payment',
  currency: 'TRY',
  amountExact: '5.00',
  cashDeltaExact: '0.00',
  balanceBeforeExact: '0.00',
  balanceAfterExact: '-5.00',
  createdAt: '2026-10-19T12:00:00.000Z',
  createdByUserId: 'u',
  note: '',
  source: 'external',
};
const snapshot = (rows = [row], fromCache = false, hasPendingWrites = false) => ({
  docs: rows.map((value) => ({ id: value.id, data: () => value })),
  metadata: { fromCache, hasPendingWrites },
});
beforeEach(() => vi.clearAllMocks());
describe('current-day merchant journal subscription', () => {
  it('restricts reads to canonical store and a half-open current day, without a hidden record limit', () => {
    const publish = vi.fn();
    subscribeMerchantJournal('s', 'store', start, end, publish, vi.fn());
    expect(state.query).toHaveBeenCalledWith(
      { path: 'spaces/s/merchantOperations' },
      ['storeId', '==', 'store'],
      ['createdAt', '>=', start],
      ['createdAt', '<', end],
    );
    state.next(snapshot(Array.from({ length: 205 }, (_, i) => ({ ...row, id: `row-${i}` }))));
    expect(publish.mock.calls[0][0]).toHaveLength(205);
  });
  it.each([
    [true, false],
    [false, true],
  ])('does not publish cached/pending financial views (%s/%s)', (cache, pending) => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeMerchantJournal('s', 'store', start, end, publish, fail);
    state.next(snapshot([row], cache, pending));
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'journalAwaitingServer' }));
    state.next(snapshot());
    expect(publish).toHaveBeenCalledOnce();
  });
  it.each([
    { ...row, workspaceId: 'other' },
    { ...row, storeId: 'other' },
    { ...row, amountExact: 'NaN' },
  ])('rejects a malformed or cross-scope snapshot %j', (value) => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeMerchantJournal('s', 'store', start, end, publish, fail);
    state.next(snapshot([value]));
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
  });
  it('ignores data and permission errors arriving after workspace teardown', () => {
    const publish = vi.fn(),
      fail = vi.fn();
    const stop = subscribeMerchantJournal('s', 'store', start, end, publish, fail);
    stop();
    state.next(snapshot());
    state.error(new Error('permission-denied'));
    expect(state.stop).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
  it('reports permission removal without presenting a successful empty financial view', () => {
    const publish = vi.fn(),
      fail = vi.fn();
    subscribeMerchantJournal('s', 'store', start, end, publish, fail);
    state.error(new Error('permission-denied'));
    expect(fail).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
});
