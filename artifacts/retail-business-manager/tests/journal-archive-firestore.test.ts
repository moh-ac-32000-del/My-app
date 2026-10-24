import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ next: null as any, error: null as any, stop: vi.fn(), query: vi.fn((...parts: any[]) => parts),
  publish: vi.fn(), fail: vi.fn(), archives: vi.fn(), invalidate: vi.fn() }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), collection: (_db: any, path: string) => path,
  query: mock.query, where: (...args: any[]) => args,
  onSnapshot: (_query: any, _options: any, next: any, error: any) => { mock.next = next; mock.error = error; return mock.stop; } }));
vi.mock('@/services/firebase', () => ({ getFirebaseApp: () => ({}), isFirebaseConfigured: true }));
vi.mock('@/services/localExportObservation', () => ({ observeForLocalExport: () => ({ archives: mock.archives, invalidate: mock.invalidate }) }));
import { subscribeJournalArchives } from '../services/journalArchiveFirestore';
const archive = { id: 'a', workspaceId: 's', storeId: 'store', date: '2026-10-23', closedAt: '2026-10-23T12:00:00Z',
  closingNumber: 1, snapshot: [{ id: 'debt:d' }] };
const deliver = (rows = [archive], fromCache = false, hasPendingWrites = false) => mock.next({
  docs: rows.map(row => ({ id: row.id, data: () => row })), metadata: { fromCache, hasPendingWrites } });
beforeEach(() => vi.clearAllMocks());
describe('live journal archive observation, no repeated callable history fetch', () => {
  it('keeps store/space filtering and complete export coverage without another export read', () => {
    const stop = subscribeJournalArchives('s', 'store', mock.publish, mock.fail);
    expect(mock.query).toHaveBeenCalledWith('spaces/s/dailyArchives', ['storeId', '==', 'store']);
    deliver();
    expect(mock.publish).toHaveBeenCalledWith([archive]);
    expect(mock.archives).toHaveBeenCalledWith([archive], expect.any(String), 'store');
    stop(); deliver(); mock.error(new Error('late'));
    expect(mock.publish).toHaveBeenCalledTimes(1);
    expect(mock.stop).toHaveBeenCalledOnce();
    expect(mock.fail).not.toHaveBeenCalled();
  });
  it('clears trust on cached/pending snapshots, permission errors and malformed/cross-space records', () => {
    subscribeJournalArchives('s', 'store', mock.publish, mock.fail);
    deliver([archive], true); deliver([archive], false, true);
    deliver([{ ...archive, workspaceId: 'other' }]);
    deliver([{ ...archive, storeId: 'other' }]);
    mock.error(new Error('permission-denied'));
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.archives).not.toHaveBeenCalled();
    expect(mock.invalidate).toHaveBeenCalledTimes(5);
    deliver();
    expect(mock.publish).toHaveBeenCalledOnce();
  });
});
