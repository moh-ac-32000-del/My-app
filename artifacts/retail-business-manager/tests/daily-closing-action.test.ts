import { describe, expect, it, vi } from 'vitest';
import { runDailyClosing } from '@/services/dailyClosing';
import type { DailyArchiveCloseResult } from '@/services/storage';

const archive = {
  id: 'archive:store-a:2026-08-29',
  storeId: 'store-a',
  date: '2026-08-29',
  closedAt: '2026-08-29T17:00:00.000Z',
  snapshot: [],
};

describe('daily closing action path', () => {
  it('calls the archive closing path with the active store and returns the visible result state', async () => {
    const closeArchive = vi.fn<(storeId: string) => Promise<DailyArchiveCloseResult>>()
      .mockResolvedValue({ archive, created: true });

    await expect(runDailyClosing('store-a', closeArchive)).resolves.toBe('created');
    expect(closeArchive).toHaveBeenCalledOnce();
    expect(closeArchive).toHaveBeenCalledWith('store-a');
  });

  it('returns the duplicate state and propagates storage failures for visible UI handling', async () => {
    const duplicateClose = vi.fn<(storeId: string) => Promise<DailyArchiveCloseResult>>()
      .mockResolvedValue({ archive, created: false });
    await expect(runDailyClosing('store-a', duplicateClose)).resolves.toBe('alreadyClosed');

    const failure = new Error('storage unavailable');
    const failedClose = vi.fn<(storeId: string) => Promise<DailyArchiveCloseResult>>()
      .mockRejectedValue(failure);
    await expect(runDailyClosing('store-a', failedClose)).rejects.toBe(failure);
  });
});