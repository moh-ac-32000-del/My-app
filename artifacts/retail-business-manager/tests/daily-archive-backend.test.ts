import { describe, expect, it } from 'vitest';
import { dailyArchiveCommandHandler } from '../functions/src/dailyArchiveCommand';

type Data = Record<string, any>;
type Filter = [string, string, any];

function fakeFirestore() {
  const documents: Record<string, Data> = {
    'spaces/space-a': { status: 'active' },
    'spaces/space-a/members/user-a': { status: 'active', role: 'owner' },
    'spaces/space-a/storeProfile/profile': { storeId: 'store-a' },
  };
  const reads: string[] = [];
  const writes: string[] = [];
  let retry = false;
  let onRetry = () => {};
  function ref(path: string, filters?: Filter[]): any {
    return {
      path, filters,
      collection: (name: string) => ref(`${path}/${name}`, []),
      doc: (id: string) => ref(`${path}/${id}`),
      where: (field: string, op: string, value: any) => ref(path, [...(filters ?? []), [field, op, value]]),
      get: async () => snapshot(path, filters),
    };
  }
  function snapshot(path: string, filters?: Filter[]): any {
    if (!filters) return { exists: !!documents[path], data: () => documents[path] };
    return { docs: Object.entries(documents)
      .filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1
        && filters.every(([field, op, value]) => op === '==' ? data[field] === value : op === '>=' ? data[field] >= value : data[field] < value))
      .map(([key, data]) => ({ id: key.split('/').at(-1), exists: true, data: () => data })) };
  }
  return {
    documents, reads, writes,
    simulateRetry(callback: () => void) { retry = true; onRetry = callback; },
    collection: (name: string) => ref(name, []),
    async runTransaction(callback: (tx: any) => Promise<any>) {
      for (;;) {
        const pending: Array<[string, Data]> = [];
        const result = await callback({
          get: async (reference: any) => {
            if (pending.length) throw new Error('Reads must precede writes');
            reads.push(reference.path);
            return snapshot(reference.path, reference.filters);
          },
          set: (reference: any, data: Data) => pending.push([reference.path, data]),
          create: (reference: any, data: Data) => {
            if (documents[reference.path]) throw new Error('Already exists');
            pending.push([reference.path, data]);
          },
        });
        if (retry) { retry = false; onRetry(); continue; }
        for (const [path, data] of pending) { documents[path] = data; writes.push(path); }
        return result;
      }
    },
  };
}

const data = {
  action: 'close', spaceId: 'space-a', storeId: 'store-a', date: '2026-10-18',
  startAt: '2026-10-18T00:00:00.000Z', endAt: '2026-10-19T00:00:00.000Z',
};
const now = '2026-10-18T12:00:00.000Z';
function cash(id: string, amount: number, createdAt: string, extra: Data = {}) {
  return { id, storeId: 'store-a', type: 'cash_in', currency: 'TRY', amount, createdAt, ...extra };
}
function close(db: ReturnType<typeof fakeFirestore>, extra: Data = {}) {
  return dailyArchiveCommandHandler({ auth: { uid: 'user-a' }, data: { ...data, ...extra } } as never,
    { firestore: db as never, now: () => now });
}

describe('daily archive trusted balance capture', () => {
  it('captures all-date cash once, including linked settlements, excluding debt/payment double counting and other scopes', async () => {
    const db = fakeFirestore();
    const path = 'spaces/space-a/transactions/';
    db.documents[path + 'opening'] = cash('opening', 100, '2026-10-17T10:00:00.000Z');
    db.documents[path + 'expense'] = cash('expense', 30, now, { type: 'cash_out' });
    db.documents[path + 'settlement'] = cash('settlement', 20, now);
    db.documents[path + 'other-store'] = cash('other-store', 999, now, { storeId: 'other-store' });
    db.documents['spaces/other-space/transactions/other'] = cash('other', 999, now);
    db.documents['spaces/space-a/payments/paid'] = {
      storeId: 'store-a',
      direction: 'in', transactionId: 'settlement', customerId: 'customer-a', paidAt: now,
      amount: { amount: 20, currency: 'TRY' },
    };
    db.documents['spaces/space-a/customers/customer-a'] = { name: 'Test' };
    const result = await close(db, { closingCashBalances: [{ currency: 'TRY', amount: 9999 }] });
    expect(result.created?.closingCashBalances).toEqual([{ currency: 'TRY', amount: 90 }]);
    expect(result.created?.snapshot.map((event) => event.id)).toEqual(['transaction:expense', 'settlement:paid']);
    expect(db.reads).toContain('spaces/space-a/transactions');
    expect(db.writes).toEqual(['spaces/space-a/dailyClosingCounters/store-a_2026-10-18', 'spaces/space-a/dailyArchives/2026-10-18_000001']);
  });

  it('keeps previous snapshots immutable and rereads cash when the archive transaction retries', async () => {
    const db = fakeFirestore();
    db.documents['spaces/space-a/transactions/one'] = cash('one', 100, now);
    const first = (await close(db)).created!;
    const before = JSON.stringify(first);
    db.simulateRetry(() => { db.documents['spaces/space-a/transactions/two'] = cash('two', 20, now); });
    const second = (await close(db)).created!;
    expect(second.closingNumber).toBe(2);
    expect(second.closingCashBalances).toEqual([{ currency: 'TRY', amount: 120 }]);
    expect(second.snapshot.map((event) => event.id)).toEqual(['transaction:two']);
    expect(JSON.stringify(first)).toBe(before);
    expect(first.closingCashBalances).toEqual([{ currency: 'TRY', amount: 100 }]);
    expect(db.reads.filter((path) => path.endsWith('/transactions'))).toHaveLength(6);
  });

  it('does not write an archive or counter when a cash record is invalid', async () => {
    const db = fakeFirestore();
    db.documents['spaces/space-a/transactions/bad'] = cash('bad', NaN, now);
    await expect(close(db)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writes).toEqual([]);
  });

  it('retains legacy archives without inventing or backfilling a cash balance', async () => {
    const db = fakeFirestore();
    const legacy = { id: 'old', workspaceId: 'space-a', storeId: 'store-a', date: data.date, closedAt: now, closingNumber: 1, snapshot: [] };
    db.documents['spaces/space-a/dailyArchives/old'] = legacy;
    const result = await close(db, { action: 'list' });
    expect(result.archives).toEqual([legacy]);
    expect(result.archives[0].closingCashBalances).toBeUndefined();
    expect(db.writes).toEqual([]);
  });
});
