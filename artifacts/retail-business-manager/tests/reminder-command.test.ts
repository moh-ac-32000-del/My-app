import { describe, expect, it } from 'vitest';
import { reminderCommandHandler, type ReminderRuntime } from '@/functions/src/reminderCommand';

const runtime = {
  firestore: {} as ReminderRuntime['firestore'],
  now: () => '2026-10-17T12:00:00.000Z',
};

describe('trusted reminder command', () => {
  it('rejects unauthenticated calls before accessing Firestore', async () => {
    await expect(reminderCommandHandler(
      { data: { action: 'list', spaceId: 'space-a', storeId: 'store-a' } } as never,
      runtime,
    )).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects invalid workspace and store identifiers', async () => {
    await expect(reminderCommandHandler(
      {
        auth: { uid: 'user-a' },
        data: { action: 'list', spaceId: 'space/a', storeId: 'store-a' },
      } as never,
      runtime,
    )).rejects.toMatchObject({ code: 'invalid-argument' });

    await expect(reminderCommandHandler(
      {
        auth: { uid: 'user-a' },
        data: { action: 'list', spaceId: 'space-a', storeId: '' },
      } as never,
      runtime,
    )).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects malformed reminder data before accessing Firestore', async () => {
    await expect(reminderCommandHandler(
      {
        auth: { uid: 'user-a' },
        data: {
          action: 'create',
          spaceId: 'space-a',
          storeId: 'store-a',
          reminder: { id: 'reminder-a', debtId: '', remindAt: 'tomorrow' },
        },
      } as never,
      runtime,
    )).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
