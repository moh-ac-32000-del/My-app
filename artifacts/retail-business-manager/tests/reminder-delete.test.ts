import { describe, expect, it } from 'vitest';
import { reminderCommandHandler } from '@/functions/src/reminderCommand';

type Doc = Record<string, any>;
const now = '2026-10-18T12:00:00.000Z';
const base = 'spaces/space-a';
const reminder = { id: 'reminder-a', workspaceId: 'space-a', storeId: 'store-a', debtId: 'debt-a', status: 'pending', remindAt: now, createdAt: now, updatedAt: now };
const debt = { id: 'debt-a', storeId: 'store-a', amount: 70, dueDate: '2026-10-19' };

function database(extra: Record<string, Doc> = {}) {
  const docs: Record<string, Doc> = {
    [base]: { status: 'active' },
    [`${base}/members/user-a`]: { status: 'active' },
    [`${base}/storeProfile/profile`]: { storeId: 'store-a' },
    [`${base}/debts/debt-a`]: debt,
    [`${base}/reminders/reminder-a`]: { ...reminder },
    ...extra,
  };
  const writes: string[] = [];
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: !!docs[path], data: () => docs[path] });
  const write = (path: string, value: Doc, merge: boolean) => { writes.push(path); docs[path] = merge ? { ...docs[path], ...value } : value; };
  const collection = (path: string): any => ({
    doc: (id: string) => reference(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: Object.keys(docs).filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/') && docs[key][field] === value).map(snapshot) }),
    }),
  });
  const reference = (path: string): any => ({ path, collection: (name: string) => collection(`${path}/${name}`), get: async () => snapshot(path), create: async (value: Doc) => write(path, value, false) });
  return {
    docs, writes,
    collection,
    runTransaction: async (fn: any) => fn({ get: async (ref: any) => snapshot(ref.path), update: (ref: any, value: Doc) => write(ref.path, value, true) }),
    batch: () => ({ create: (ref: any, value: Doc) => { if (docs[ref.path]) throw new Error('already-exists'); write(ref.path, value, false); }, update: (ref: any, value: Doc) => write(ref.path, value, true), delete: (ref: any) => { writes.push(ref.path); delete docs[ref.path]; }, commit: async () => {} }),
  };
}
const request = (changes: Doc = {}) => ({ auth: { uid: 'user-a' }, data: { action: 'delete', spaceId: 'space-a', storeId: 'store-a', reminderId: 'reminder-a', ...changes } });
const call = (db: ReturnType<typeof database>, changes: Doc = {}) => reminderCommandHandler(request(changes) as never, { firestore: db as never, now: () => now });

describe('reminder-only deletion', () => {
  it('requires authentication and validates the target identifier', async () => {
    const runtime = { firestore: {} as never, now: () => now };
    await expect(reminderCommandHandler({ data: request().data } as never, runtime)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call(database(), { reminderId: 'other/id' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it.each([
    { [`${base}/members/user-a`]: { status: 'inactive' } },
    { [`${base}/storeProfile/profile`]: { storeId: 'other' } },
    { [`${base}/reminders/reminder-a`]: { ...reminder, storeId: 'other' } },
    { [`${base}/reminders/reminder-a`]: { ...reminder, workspaceId: 'other' } },
  ])('rejects an unauthorized or mismatched scope without writes', async (extra) => {
    const db = database(extra);
    await expect(call(db)).rejects.toBeDefined();
    expect(db.writes).toEqual([]);
  });

  it('hides manual reminders, safely retries deletion, and never writes financial documents', async () => {
    const db = database();
    const before = JSON.stringify(db.docs[`${base}/debts/debt-a`]);
    const result = await call(db);
    expect(result.reminders.some((r) => r.id === reminder.id)).toBe(false);
    expect(db.docs[`${base}/reminders/reminder-a`]).toMatchObject({ deletedAt: now, status: 'dismissed' });
    await call(db);
    expect(JSON.stringify(db.docs[`${base}/debts/debt-a`])).toBe(before);
    expect(db.writes.every((path) => path.startsWith(`${base}/reminders/`))).toBe(true);
  });

  it('does not regenerate or reschedule a deleted automatic due-date reminder', async () => {
    const id = 'due-date_debt-a';
    const db = database({ [`${base}/reminders/${id}`]: { ...reminder, id, note: 'system:due-date' } });
    await call(db, { reminderId: id });
    const afterDelete = { ...db.docs[`${base}/reminders/${id}`] };
    const result = await call(db, { action: 'list', notificationTime: '15:30' });
    expect(result.reminders.some((r) => r.id === id)).toBe(false);
    expect(db.docs[`${base}/reminders/${id}`]).toEqual(afterDelete);
    await expect(call(db, { action: 'updateStatus', reminderId: id, status: 'pending' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('does not revive a deleted manual ID through a retried create', async () => {
    const db = database();
    await call(db);
    await expect(call(db, { action: 'create', reminder })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('still creates automatic reminders for other outstanding debts', async () => {
    const db = database();
    const result = await call(db);
    expect(result.reminders).toEqual([expect.objectContaining({ id: 'due-date_debt-a', status: 'pending' })]);
  });
});
