import { describe, expect, it } from 'vitest';
import { dailyArchiveCommandHandler } from '../functions/src/dailyArchiveCommand';
import { merchantCommandHandler } from '../functions/src/merchantCommand';
import { workspaceBackend } from './fixtures/workspaceBackend';

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
  const queries: Filter[][] = [];
  let retry = false;
  let onRetry = () => {};
  function ref(path: string, filters?: Filter[]): any {
    return {
      path, filters,
      collection: (name: string) => ref(`${path}/${name}`, []),
      doc: (id: string) => ref(`${path}/${id}`),
      where: (field: string, op: string, value: any) => ref(path, [...(filters ?? []), [field, op, value]]),
      get: async () => { if (filters) queries.push(filters); return snapshot(path, filters); },
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
    documents, reads, writes, queries,
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

describe('read-only calendar-day archive listing', () => {
  function seed() {
    const db = fakeFirestore();
    for (const [id, date, storeId, closingNumber] of [
      ['first', data.date, 'store-a', 1], ['second', data.date, 'store-a', 2],
      ['previous', '2026-10-17', 'store-a', 1], ['other-store', data.date, 'other', 1],
    ] as const) db.documents[`spaces/space-a/dailyArchives/${id}`] = {
      id, date, storeId, workspaceId: 'space-a', closingNumber, closedAt: now,
      snapshot: [{ id: `debt:${id}`, note: 'Original note', amount: 13.25, currency: 'TRY' }],
      closingCashBalances: [{ currency: 'TRY', amount: -20 }],
    };
    return db;
  }
  it.each(['owner', 'editor', 'viewer'])('allows %s to read every selected-day closing only, with server-side filters and no writes', async (role) => {
    const db = seed();
    db.documents['spaces/space-a/members/user-a'].role = role;
    const before = structuredClone(db.documents);
    const result = await close(db, { action: 'list' });
    expect(result.date).toBe(data.date);
    expect(result.archives.map((row) => row.id)).toEqual(['second', 'first']);
    expect(result.archives[1]).toEqual(before['spaces/space-a/dailyArchives/first']);
    expect(db.queries).toEqual([[['storeId', '==', 'store-a'], ['date', '==', data.date]]]);
    expect(db.documents).toEqual(before);
    expect(db.writes).toEqual([]);
  });
  it('preserves the unfiltered list contract for old clients and full exports', async () => {
    const db = seed();
    const result = await close(db, { action: 'list', date: undefined });
    expect(result.date).toBeUndefined();
    expect(result.archives.map((row) => row.id)).toEqual(['second', 'first', 'previous']);
    expect(db.queries).toEqual([[['storeId', '==', 'store-a']]]);
  });
  it('returns an empty confirmed day without changing the existing snapshots', async () => {
    const db = seed();
    const before = structuredClone(db.documents);
    expect(await close(db, { action: 'list', date: '2024-02-29' })).toMatchObject({ date: '2024-02-29', archives: [] });
    expect(db.documents).toEqual(before);
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '', null, 20261018])('rejects invalid date %s without reading archive history', async (date) => {
    const db = seed();
    await expect(close(db, { action: 'list', date })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db.queries).toEqual([]);
    expect(db.writes).toEqual([]);
  });
  it.each(['removed', 'wrong-store', 'inactive-space', 'cross-space', 'unauthenticated'])('blocks %s before listing archives', async (fault) => {
    const db = seed();
    if (fault === 'removed') db.documents['spaces/space-a/members/user-a'].status = 'removed';
    if (fault === 'wrong-store') db.documents['spaces/space-a/storeProfile/profile'].storeId = 'other';
    if (fault === 'inactive-space') db.documents['spaces/space-a'].status = 'archived';
    await expect(dailyArchiveCommandHandler({
      auth: fault === 'unauthenticated' ? undefined : { uid: 'user-a' },
      data: { ...data, action: 'list', ...(fault === 'cross-space' ? { spaceId: 'other' } : {}) },
    } as never, { firestore: db as never, now: () => now })).rejects.toBeDefined();
    expect(db.queries).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe('merchant archive integration', () => {
  function setup() {
    const backend = workspaceBackend();
    backend.docs['spaces/s/merchants/m'] = { id: 'm', workspaceId: 's', storeId: 'store', name: 'Merchant', isActive: true };
    const command = (action: string, operationId: string, fields: Data) => merchantCommandHandler({
      auth: { uid: 'u' }, data: { action, operationId, spaceId: 's', storeId: 'store', merchantId: 'm', currency: 'TRY', ...fields },
    } as never, backend.runtime);
    const archive = () => dailyArchiveCommandHandler({ auth: { uid: 'u' }, data: {
      action: 'close', spaceId: 's', storeId: 'store', date: '2026-10-19',
      startAt: '2026-10-19T00:00:00.000Z', endAt: '2026-10-20T00:00:00.000Z',
    } } as never, backend.runtime);
    return { ...backend, command, archive };
  }
  it('captures a partially paid purchase once, preserving materials and actual drawer effect', async () => {
    const backend = setup();
    await backend.command('purchase', 'buy', { paidExact: '1000.00', source: 'cash', note: 'Goods description',
      lines: [{ name: 'Screens', quantity: '5', unitPrice: '900' }] });
    const first = (await backend.archive()).created!;
    const merchant = first.snapshot.filter((event) => event.type === 'merchant');
    expect(merchant).toHaveLength(1);
    expect(merchant[0]).toMatchObject({ id: 'merchant:buy', amountExact: '4500.00', cashDeltaExact: '-1000.00',
      balanceAfterExact: '3500.00', merchantName: 'Merchant', note: 'Goods description', createdByUserId: 'u',
      lines: [{ name: 'Screens', quantity: '5', unitPrice: '900', totalExact: '4500.00' }] });
    expect(first.snapshot.some((event) => event.id.startsWith('transaction:merchant-'))).toBe(false);
    expect(first.closingCashBalances).toEqual([{ currency: 'TRY', amount: -1000 }]);
    const original = JSON.stringify(first);
    const second = (await backend.archive()).created!;
    expect(second.snapshot).toEqual([]);
    expect(second.closingCashBalances).toEqual(first.closingCashBalances);
    expect(JSON.stringify(first)).toBe(original);
  });
  it('keeps a direct payment and its correction noncash and suppresses their linked payment/debt', async () => {
    const backend = setup();
    await backend.command('directPayment', 'direct', { amountExact: '130.00', customerId: 'c', note: 'Actual direct payment' });
    const first = (await backend.archive()).created!;
    expect(first.snapshot.map((event) => event.id).sort()).toEqual(['debt:d', 'merchant:direct']);
    expect(first.closingCashBalances).toEqual([]);
    const before = JSON.stringify(first);
    await backend.command('reverse', 'correction', { targetOperationId: 'direct', reason: 'Mistaken entry' });
    const second = (await backend.archive()).created!;
    expect(second.snapshot).toHaveLength(1);
    expect(second.snapshot[0]).toMatchObject({ id: 'merchant:correction', merchantAction: 'reverse', amountExact: '130.00',
      cashDeltaExact: '0.00', customerName: 'Test customer', reversesOperationId: 'direct', note: 'Mistaken entry' });
    expect(second.closingCashBalances).toEqual([]);
    expect(JSON.stringify(first)).toBe(before);
  });
  it('includes opening/external payments without adding cash or skipping a negative opening', async () => {
    const backend = setup();
    await backend.command('opening', 'opening', { amountExact: '-300.00' });
    await backend.command('payment', 'external', { amountExact: '200.00', source: 'external', note: 'Bank transfer' });
    const result = (await backend.archive()).created!;
    expect(result.snapshot.filter((event) => event.type === 'merchant').map((event) => [event.id, event.amountExact]))
      .toEqual([['merchant:opening', '-300.00'], ['merchant:external', '200.00']]);
    expect(result.closingCashBalances).toEqual([]);
  });
  it.each(['missing', 'wrong-currency', 'wrong-operation', 'wrong-time', 'wrong-amount', 'wrong-store'])
    ('rejects %s cash links without committing an archive/counter or losing the purchase', async (fault) => {
      const backend = setup();
      await backend.command('payment', 'paid', { amountExact: '80.00', source: 'cash' });
      const entry = Object.entries(backend.docs).find(([path]) => path.startsWith('spaces/s/transactions/'))!;
      if (fault === 'missing') delete backend.docs[entry[0]];
      else Object.assign(entry[1], fault === 'wrong-currency' ? { currency: 'USD' }
        : fault === 'wrong-operation' ? { merchantOperationId: 'other' }
          : fault === 'wrong-time' ? { createdAt: '2026-10-19T13:00:00.000Z' }
            : fault === 'wrong-store' ? { storeId: 'other' } : { amount: 81 });
      const before = backend.writes.length;
      await expect(backend.archive()).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(backend.writes).toHaveLength(before);
      expect(backend.docs['spaces/s/merchantOperations/paid']).toBeDefined();
    });
  it('does not silently hide an orphan merchant-linked payment', async () => {
    const backend = setup();
    await backend.command('directPayment', 'direct', { amountExact: '30.00', customerId: 'c' });
    delete backend.docs['spaces/s/merchantOperations/direct'];
    const before = backend.writes.length;
    await expect(backend.archive()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(backend.writes).toHaveLength(before);
  });
});
