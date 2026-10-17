import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDailyClosing } from '@/services/dailyClosing';
import { closeCloudDailyArchive } from '@/services/cloudDailyArchives';

vi.mock('@/services/cloudDailyArchives', () => ({
  closeCloudDailyArchive: vi.fn(),
}));

describe('daily closing action path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('closes the active store day through the trusted cloud command', async () => {
    vi.mocked(closeCloudDailyArchive).mockResolvedValue({
      id: '2026-08-29_000001',
      storeId: 'store-a',
      date: '2026-08-29',
      closedAt: '2026-08-29T17:00:00.000Z',
      closingNumber: 1,
      snapshot: [],
    });

    await expect(runDailyClosing('space-a', 'store-a')).resolves.toBe('created');
    expect(closeCloudDailyArchive).toHaveBeenCalledOnce();
    expect(closeCloudDailyArchive).toHaveBeenCalledWith('space-a', 'store-a');
  });

  it('rejects missing cloud scope instead of falling back to local storage', async () => {
    await expect(runDailyClosing('', 'store-a')).rejects.toThrow('archiveWorkspaceUnavailable');
    expect(closeCloudDailyArchive).not.toHaveBeenCalled();
  });

  it('propagates trusted cloud failures for visible UI handling', async () => {
    const failure = new Error('permission-denied');
    vi.mocked(closeCloudDailyArchive).mockRejectedValue(failure);
    await expect(runDailyClosing('space-a', 'store-a')).rejects.toBe(failure);
  });
});
