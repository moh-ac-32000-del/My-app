import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ next: null as any, error: null as any, stop: vi.fn(), query: vi.fn((...parts: any[]) => parts),
  publish: vi.fn(), fail: vi.fn(), exportObservation: vi.fn() }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), collection: (_db: any, path: string) => path,
  query: mock.query, where: (...args: any[]) => args,
  onSnapshot: (_query: any, _options: any, next: any, error: any) => { mock.next = next; mock.error = error; return mock.stop; } }));
vi.mock('@/services/firebase', () => ({ getFirebaseApp: () => ({}), isFirebaseConfigured: true }));
vi.mock('@/services/localExportObservation', () => ({ observeForLocalExport: mock.exportObservation }));
import { subscribeArchiveDay } from '../services/archiveDayFirestore';
const archive = { id: 'a', workspaceId: 's', storeId: 'store', date: '2026-10-23', closedAt: '2026-10-23T12:00:00Z',
  closingNumber: 1, snapshot: [{ id: 'debt:d' }] };
const deliver = (rows = [archive], fromCache = false, hasPendingWrites = false) => mock.next({
  docs: rows.map(row => ({ id: row.id, data: () => row })), metadata: { fromCache, hasPendingWrites } });
beforeEach(() => vi.clearAllMocks());
describe('selected-day archive server observation', () => {
  it('queries only the chosen space/store/day, orders closings, never replaces complete export coverage', () => {
    const stop = subscribeArchiveDay('s', 'store', archive.date, mock.publish, mock.fail);
    expect(mock.query).toHaveBeenCalledWith('spaces/s/dailyArchives', ['storeId', '==', 'store'], ['date', '==', archive.date]);
    const second = { ...archive, id: 'b', closingNumber: 2 };
    deliver([archive, second]);
    expect(mock.publish).toHaveBeenCalledWith([second, archive]);
    expect(mock.exportObservation).not.toHaveBeenCalled();
    stop(); deliver(); mock.error(new Error('late'));
    expect(mock.publish).toHaveBeenCalledOnce();
    expect(mock.stop).toHaveBeenCalledOnce(); expect(mock.fail).not.toHaveBeenCalled();
  });
  it('rejects cached/pending, cross-space/store/day, malformed rows and permission failures', () => {
    subscribeArchiveDay('s', 'store', archive.date, mock.publish, mock.fail);
    deliver([archive], true); deliver([archive], false, true);
    deliver([{ ...archive, workspaceId: 'other' }]); deliver([{ ...archive, storeId: 'other' }]);
    deliver([{ ...archive, date: '2026-10-22' }]); deliver([{ ...archive, snapshot: [{} as any] }]);
    mock.error(new Error('permission-denied'));
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.fail).toHaveBeenCalledTimes(7);
    deliver([]); expect(mock.publish).toHaveBeenCalledWith([]);
  });
  it('rejects invalid dates before subscribing', () => {
    expect(() => subscribeArchiveDay('s', 'store', '2026-02-30', mock.publish, mock.fail)).toThrow('invalidArchiveDayScope');
    expect(mock.query).not.toHaveBeenCalled();
  });
});
