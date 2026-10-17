import { describe, expect, it } from 'vitest';
import { dailyArchiveCommandHandler, type DailyArchiveRuntime } from '@/functions/src/dailyArchiveCommand';

const runtime = {
  firestore: {} as DailyArchiveRuntime['firestore'],
  now: () => '2026-10-17T12:00:00.000Z',
};

describe('trusted daily archive command', () => {
  it('rejects unauthenticated requests before accessing Firestore', async () => {
    await expect(dailyArchiveCommandHandler({
      data: { action: 'list', spaceId: 'space-a', storeId: 'store-a' },
    } as never, runtime)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects invalid workspace IDs before accessing Firestore', async () => {
    await expect(dailyArchiveCommandHandler({
      auth: { uid: 'user-a' },
      data: { action: 'list', spaceId: 'space/a', storeId: 'store-a' },
    } as never, runtime)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects malformed day boundaries before accessing Firestore', async () => {
    await expect(dailyArchiveCommandHandler({
      auth: { uid: 'user-a' },
      data: {
        action: 'close', spaceId: 'space-a', storeId: 'store-a',
        date: '2026-10-17', startAt: 'not-a-date', endAt: '2026-10-18T00:00:00.000Z',
      },
    } as never, runtime)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
