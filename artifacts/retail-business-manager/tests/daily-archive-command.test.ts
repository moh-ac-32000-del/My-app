import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  getFirebaseApp: vi.fn(() => ({ name: 'app' })),
  isFirebaseConfigured: true,
  observe: vi.fn(),
  rememberArchives: vi.fn(),
}));

vi.mock('@/services/localExportObservation', () => ({ observeForLocalExport: firebaseMocks.observe }));

vi.mock('firebase/functions', () => ({
  getFunctions: firebaseMocks.getFunctions,
  httpsCallable: firebaseMocks.httpsCallable,
}));
vi.mock('@/services/firebase', () => ({
  getFirebaseApp: firebaseMocks.getFirebaseApp,
  isFirebaseConfigured: firebaseMocks.isFirebaseConfigured,
}));

import { closeCloudDailyArchive, loadCloudDailyArchives, loadCloudDailyArchivesForDate } from '@/services/cloudDailyArchives';

const archive = {
  id: '2026-10-17_000001',
  storeId: 'store-a',
  workspaceId: 'space-a',
  date: '2026-10-17',
  closedAt: '2026-10-17T12:00:00.000Z',
  closingNumber: 1,
  snapshot: [],
};

describe('cloud daily archive client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.observe.mockReturnValue({ archives: firebaseMocks.rememberArchives });
    firebaseMocks.httpsCallable.mockReturnValue(firebaseMocks.callable);
    firebaseMocks.callable.mockResolvedValue({
      data: { archives: [archive], created: archive, processedAt: '2026-10-17T12:00:00.000Z' },
    });
  });

  it('closes a local calendar day through the trusted callable', async () => {
    const result = await closeCloudDailyArchive('space-a', 'store-a', new Date(2026, 9, 17, 13, 0));
    expect(result).toEqual(archive);
    expect(firebaseMocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'dailyArchiveCommand');
    expect(firebaseMocks.callable).toHaveBeenCalledWith(expect.objectContaining({
      action: 'close',
      spaceId: 'space-a',
      storeId: 'store-a',
      date: '2026-10-17',
      startAt: new Date(2026, 9, 17).toISOString(),
      endAt: new Date(2026, 9, 18).toISOString(),
    }));
  });

  it('rejects malformed cloud responses instead of treating them as an empty archive', async () => {
    firebaseMocks.callable.mockResolvedValueOnce({ data: { archives: [], processedAt: 'invalid' } });
    await expect(loadCloudDailyArchives('space-a', 'store-a')).rejects.toThrow('invalidCloudDailyArchiveResponse');
  });

  it('preserves zero and negative saved balances while accepting legacy archives', async () => {
    const saved = { ...archive, closingCashBalances: [{ currency: 'TRY', amount: 0 }, { currency: 'USD', amount: -20 }] };
    firebaseMocks.callable.mockResolvedValueOnce({ data: { archives: [saved, archive], processedAt: archive.closedAt } });
    expect(await loadCloudDailyArchives('space-a', 'store-a')).toEqual([saved, archive]);
  });

  it('requests exactly one day, retaining all its closings without claiming complete export coverage', async () => {
    const second = { ...archive, id: 'second', closingNumber: 2 };
    firebaseMocks.callable.mockResolvedValueOnce({ data: {
      date: archive.date, currentStatusesIncluded: true, archives: [second, archive], processedAt: archive.closedAt,
    } });
    expect(await loadCloudDailyArchivesForDate('space-a', 'store-a', archive.date)).toEqual([second, archive]);
    expect(firebaseMocks.callable).toHaveBeenCalledWith({ action: 'list', spaceId: 'space-a', storeId: 'store-a', date: archive.date, includeCurrentStatuses: true });
    expect(firebaseMocks.observe).not.toHaveBeenCalled();
    expect(firebaseMocks.rememberArchives).not.toHaveBeenCalled();
    await loadCloudDailyArchives('space-a', 'store-a');
    expect(firebaseMocks.rememberArchives).toHaveBeenCalledWith([archive], archive.closedAt, 'store-a');
  });

  it.each(['2026-02-30', '2026-13-01', '', '0000-01-01', '2026-1-01'])('rejects invalid day %s before network I/O', async (date) => {
    await expect(loadCloudDailyArchivesForDate('space-a', 'store-a', date)).rejects.toThrow('archiveDateInvalid');
    expect(firebaseMocks.callable).not.toHaveBeenCalled();
  });

  it.each([
    { archives: [] }, // An old server cannot silently ignore a day filter.
    { date: '2026-10-16', archives: [] },
    { date: archive.date, archives: [{ ...archive, date: '2026-10-16' }] },
    { date: archive.date, archives: [{ ...archive, workspaceId: 'other' }] },
    { date: archive.date, archives: [{ ...archive, storeId: 'other' }] },
  ])('rejects wrong day/scope or an unconfirmed day filter: %j', async (response) => {
    firebaseMocks.callable.mockResolvedValueOnce({ data: { ...response, processedAt: archive.closedAt } });
    await expect(loadCloudDailyArchivesForDate('space-a', 'store-a', archive.date)).rejects.toThrow('invalidCloudDailyArchiveResponse');
    expect(firebaseMocks.rememberArchives).not.toHaveBeenCalled();
  });

  it('accepts a confirmed empty day, but propagates a failed read rather than inventing an empty result', async () => {
    firebaseMocks.callable.mockResolvedValueOnce({ data: { date: archive.date, currentStatusesIncluded: true, archives: [], processedAt: archive.closedAt } });
    expect(await loadCloudDailyArchivesForDate('space-a', 'store-a', archive.date)).toEqual([]);
    firebaseMocks.callable.mockRejectedValueOnce(new Error('unavailable'));
    await expect(loadCloudDailyArchivesForDate('space-a', 'store-a', archive.date)).rejects.toThrow('unavailable');
  });

  it.each([
    null,
    [{ currency: 'BAD', amount: 10 }],
    [{ currency: 'TRY', amount: Infinity }],
    [{ currency: 'TRY', amount: '10' }],
    [{ currency: 'TRY', amount: 10 }, { currency: 'TRY', amount: 20 }],
  ])('rejects malformed saved balances %j', async (closingCashBalances) => {
    firebaseMocks.callable.mockResolvedValueOnce({ data: {
      archives: [{ ...archive, closingCashBalances }], processedAt: archive.closedAt,
    } });
    await expect(loadCloudDailyArchives('space-a', 'store-a')).rejects.toThrow('invalidCloudDailyArchiveResponse');
  });
});
