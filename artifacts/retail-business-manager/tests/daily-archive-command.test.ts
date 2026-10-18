import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  getFirebaseApp: vi.fn(() => ({ name: 'app' })),
  isFirebaseConfigured: true,
}));

vi.mock('firebase/functions', () => ({
  getFunctions: firebaseMocks.getFunctions,
  httpsCallable: firebaseMocks.httpsCallable,
}));
vi.mock('@/services/firebase', () => ({
  getFirebaseApp: firebaseMocks.getFirebaseApp,
  isFirebaseConfigured: firebaseMocks.isFirebaseConfigured,
}));

import { closeCloudDailyArchive, loadCloudDailyArchives } from '@/services/cloudDailyArchives';

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
