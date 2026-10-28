import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  queries: [] as unknown[][],
  read: vi.fn(),
}));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseApp: () => ({}), getFirebaseAuth: () => ({ currentUser: { uid: 'u' } }) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => state.call }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown, ...constraints: unknown[]) => {
    state.constraints = constraints;
    state.queries.push(constraints);
    return ref;
  },
  where: (...values: unknown[]) => ({ where: values }),
  orderBy: (...values: unknown[]) => ({ orderBy: values }),
  limit: (value: number) => ({ limit: value }),
  documentId: () => '__name__',
  startAfter: (...values: unknown[]) => ({ startAfter: values }),
  getDocsFromServer: state.read,
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
import { loadMerchantHistoryPage, sendMerchantCommand, subscribeMerchantAccounts } from '@/services/merchantFirestore';
import { clearLocalExportCache, LOCAL_EXPORT_COLLECTIONS, readConfirmedCollection, readLocalExportData, rememberLocalExportCollection } from '@/services/localExportCache';
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
  clearLocalExportCache();
  state.listeners = [];
  state.call.mockReset();
  state.syncStop.mockReset();
  state.constraints = [];
  state.read.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('scoped merchant observations', () => {
  it('ends a cache-only stalled connection with an error instead of loading indefinitely', async () => {
    vi.useFakeTimers();
    const publish = vi.fn(), fail = vi.fn();
    subscribeMerchantAccounts('s', 'store', publish, fail, 'm');
    state.listeners[0].next(snapshot([merchant], true));
    state.listeners[1].next(snapshot([balance], true));
    state.listeners[2].next(snapshot([], true));
    state.sync();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'merchantServerConfirmationTimeout' }));
    expect(publish).not.toHaveBeenCalled();
    expect(state.listeners.every(listener => listener.stop.mock.calls.length === 1)).toBe(true);
    state.listeners[0].next(snapshot([merchant])); state.listeners[1].next(snapshot([balance])); state.listeners[2].next(snapshot([])); state.sync();
    expect(publish).not.toHaveBeenCalled();
  });
  it('cancels the initial deadline after server confirmation and on leaving the account', async () => {
    vi.useFakeTimers();
    const publish = vi.fn(), fail = vi.fn();
    const stop = subscribeMerchantAccounts('s', 'store', publish, fail);
    state.listeners[0].next(snapshot([merchant])); state.listeners[1].next(snapshot([balance])); state.sync();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publish).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled();
    stop();
    const stopPending = subscribeMerchantAccounts('s', 'store', vi.fn(), fail);
    stopPending(); await vi.advanceTimersByTimeAsync(60_000);
    expect(fail).not.toHaveBeenCalled();
  });
  const historyRow = (index: number) => ({ id: `history-${index}`, workspaceId: 's', storeId: 'store', merchantId: 'm', merchantName: 'Merchant',
    action: 'payment', source: 'external', currency: 'TRY', amountExact: '1.00', balanceBeforeExact: '0.00', balanceAfterExact: '-1.00',
    cashDeltaExact: '0.00', createdAt: '2026-10-19T12:00:00.000Z', createdByUserId: 'u', note: '' });
  it('reuses all 101 already read documents for export while displaying only 100 history rows', () => {
    for (const name of LOCAL_EXPORT_COLLECTIONS) if (!['merchants', 'merchantBalances', 'merchantOperations'].includes(name))
      rememberLocalExportCollection('u', 's', name, [], true);
    const publish = vi.fn();
    const stop = subscribeMerchantAccounts('s', 'store', publish, vi.fn(), 'm');
    rememberLocalExportCollection('u', 's', 'merchants', [{ id: merchant.id, data: merchant }], true);
    rememberLocalExportCollection('u', 's', 'merchantBalances', [{ id: balance.id, data: { ...balance, revision: 101 } }], true);
    state.listeners[0].next(snapshot([merchant]));
    state.listeners[1].next(snapshot([{ ...balance, revision: 101 }]));
    state.listeners[2].next(snapshot(Array.from({ length: 101 }, (_, index) => historyRow(index))));
    state.sync();
    expect(publish.mock.calls[0][0].operations).toHaveLength(100);
    expect(readLocalExportData({ uid: 'u', spaceId: 's', storeId: 'store' }).records.merchantOperations).toHaveLength(101);
    stop();
  });
  it('does not let a page that completes after session reset repopulate export data', async () => {
    let resolve!: (value: unknown) => void;
    state.read.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const page = loadMerchantHistoryPage('s', 'store', 'm', { id: 'cursor', createdAt: '2026-10-19T13:00:00.000Z' });
    clearLocalExportCache();
    for (const name of LOCAL_EXPORT_COLLECTIONS) rememberLocalExportCollection('u', 's', name, [], true);
    resolve(snapshot([historyRow(1)]));
    await page;
    expect(readLocalExportData({ uid: 'u', spaceId: 's', storeId: 'store' }).records.merchantOperations).toEqual([]);
  });
  it('validates a malformed lookahead row rather than hiding it behind the visible page', () => {
    const fail = vi.fn();
    const stop = subscribeMerchantAccounts('s', 'store', vi.fn(), fail, 'm');
    state.listeners[0].next(snapshot([merchant])); state.listeners[1].next(snapshot([balance]));
    state.listeners[2].next(snapshot([...Array.from({ length: 100 }, (_, index) => historyRow(index)), { ...historyRow(101), storeId: 'other' }]));
    state.sync(); expect(fail).toHaveBeenCalledOnce(); stop();
  });
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
    state.queries = [];
    subscribeMerchantAccounts('s', 'store', vi.fn(), vi.fn(), 'm');
    expect(state.queries.slice(0, 2)).toEqual([[{ where: ['id', '==', 'm'] }], [{ where: ['merchantId', '==', 'm'] }]]);
    expect(state.listeners[2].path).toBe('spaces/s/merchantOperations');
    expect(state.constraints).toEqual([
      { where: ['merchantId', '==', 'm'] },
      { orderBy: ['createdAt', 'desc'] },
      { orderBy: ['__name__', 'desc'] },
      { limit: 101 },
    ]);
  });
  it('does not replace full export coverage with one account detail', () => {
    const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
    const directory = [merchant, { ...merchant, id: 'other' }];
    rememberLocalExportCollection('u','s','merchants',directory.map(row => ({ id: row.id, data: row })),true);
    rememberLocalExportCollection('u','s','merchantBalances',[{ id: balance.id, data: balance }],true);
    const stop = subscribeMerchantAccounts('s','store',vi.fn(),vi.fn(),'m');
    state.listeners[0].next(snapshot([merchant])); state.listeners[1].next(snapshot([balance]));
    state.listeners[2].next(snapshot([])); state.sync();
    expect(readConfirmedCollection(scope,'merchants')?.map(row => row.id)).toEqual(['m','other']);
    expect(readConfirmedCollection(scope,'merchantBalances')?.map(row => row.id)).toEqual([balance.id]);
    stop();
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

describe('older merchant statement reads', () => {
  const cursor = { id: 'boundary', createdAt: '2026-10-19T12:00:00.000Z' };
  const operation = {
    id: 'older',
    workspaceId: 's',
    storeId: 'store',
    merchantId: 'm',
    merchantName: 'Merchant',
    action: 'payment',
    currency: 'TRY',
    balanceBeforeExact: '0.00',
    balanceAfterExact: '-10.00',
    cashDeltaExact: '-10.00',
    amountExact: '10.00',
    note: '',
    createdAt: '2026-10-18T12:00:00.000Z',
    createdByUserId: 'u',
  };
  it('requests one server-confirmed bounded page after the exact date/ID cursor', async () => {
    state.read.mockResolvedValue(snapshot([operation]));
    await expect(loadMerchantHistoryPage('s', 'store', 'm', cursor)).resolves.toMatchObject({
      operations: [operation],
      hasMore: false,
    });
    expect(state.constraints).toEqual([
      { where: ['merchantId', '==', 'm'] },
      { orderBy: ['createdAt', 'desc'] },
      { orderBy: ['__name__', 'desc'] },
      { startAfter: [cursor.createdAt, cursor.id] },
      { limit: 101 },
    ]);
    expect(state.listeners).toHaveLength(0);
  });
  it('reports more pages without exposing the extra lookahead record twice', async () => {
    state.read.mockResolvedValue(
      snapshot(Array.from({ length: 101 }, (_, index) => ({ ...operation, id: `old-${index}` }))),
    );
    const page = await loadMerchantHistoryPage('s', 'store', 'm', cursor);
    expect(page.operations).toHaveLength(100);
    expect(page.hasMore).toBe(true);
  });
  it('rejects local-pending or cache-only history instead of returning accepted financial data', async () => {
    state.read.mockResolvedValue(snapshot([operation], true));
    await expect(loadMerchantHistoryPage('s', 'store', 'm', cursor)).rejects.toThrow(
      'merchantHistoryNotServerConfirmed',
    );
    state.read.mockResolvedValue(snapshot([operation], false, true));
    await expect(loadMerchantHistoryPage('s', 'store', 'm', cursor)).rejects.toThrow();
  });
  it('rejects a historical record for another merchant', async () => {
    state.read.mockResolvedValue(snapshot([{ ...operation, merchantId: 'other' }]));
    await expect(loadMerchantHistoryPage('s', 'store', 'm', cursor)).rejects.toThrow('merchantHistoryScopeMismatch');
  });
  it('does not request a page with an invalid cursor', async () => {
    await expect(loadMerchantHistoryPage('s', 'store', 'm', { ...cursor, id: 'other/path' })).rejects.toThrow(
      'invalidMerchantHistoryCursor',
    );
    expect(state.read).not.toHaveBeenCalled();
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
