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
  it('blocks reminder updates when the linked debt is lifecycle-locked', async () => {
    const records = new Map<string, Record<string, unknown>>([
      ['spaces/space-a', { status: 'active' }],
      ['spaces/space-a/members/user-a', { role: 'editor', status: 'active' }],
      ['spaces/space-a/storeProfile/profile', { storeId: 'store-a' }],
      ['spaces/space-a/reminders/reminder-a', {
        id: 'reminder-a',
        storeId: 'store-a',
        workspaceId: 'space-a',
        debtId: 'debt-a',
        remindAt: '2026-10-18T09:00:00.000Z',
        status: 'pending',
        createdAt: '2026-10-17T10:00:00.000Z',
        updatedAt: '2026-10-17T10:00:00.000Z',
      }],
      ['spaces/space-a/debts/debt-a', {
        id: 'debt-a',
        storeId: 'store-a',
        workspaceId: 'space-a',
        lifecycleStatus: 'deleting',
      }],
    ]);
    const collection = (path: string): any => ({
      doc: (id: string) => ({
        path: `${path}/${id}`,
        collection: (name: string) => collection(`${path}/${id}/${name}`),
      }),
    });
    const firestore = {
      collection,
      runTransaction: async (work: (tx: any) => unknown) => work({
        get: async (reference: { path: string }) => {
          const value = records.get(reference.path);
          return { exists: value !== undefined, data: () => value };
        },
        update: () => { throw new Error('write-should-not-run'); },
      }),
    } as unknown as ReminderRuntime['firestore'];
    await expect(reminderCommandHandler(
      {
        auth: { uid: 'user-a' },
        data: {
          action: 'updateStatus',
          spaceId: 'space-a',
          storeId: 'store-a',
          reminderId: 'reminder-a',
          status: 'completed',
        },
      } as never,
      { firestore, now: runtime.now },
    )).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'DEBT_LIFECYCLE_LOCKED' },
    });
  });

});
