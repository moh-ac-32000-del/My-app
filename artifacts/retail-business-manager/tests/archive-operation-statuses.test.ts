import { describe, expect, it } from 'vitest';
import { dailyArchiveCommandHandler } from '../functions/src/dailyArchiveCommand';
import { workspaceBackend } from './fixtures/workspaceBackend';
const event = { id: 'debt:d', sourceId: 'd', type: 'debt', amount: 120, currency: 'TRY', storeId: 'store', occurredAt: '2026-10-18T12:00:00Z' };
function setup(role = 'owner') {
  const b = workspaceBackend(role);
  for (const id of ['one', 'two']) b.docs[`spaces/s/dailyArchives/${id}`] = { id, workspaceId: 's', storeId: 'store',
    date: '2026-10-18', closedAt: '2026-10-18T14:00:00Z', closingNumber: id === 'one' ? 1 : 2,
    closingCashBalances: [{ currency: 'TRY', amount: 300 }], snapshot: [event] };
  const read = (fields: Record<string, unknown> = {}) => dailyArchiveCommandHandler({ auth: { uid: 'u' },
    data: { action: 'list', spaceId: 's', storeId: 'store', date: '2026-10-18', includeCurrentStatuses: true, ...fields } } as never, b.runtime);
  return { ...b, read };
}
describe('read-time current status, immutable historical archive values', () => {
  it('annotates all selected-day closings, reading a repeated source only once and never writing', async () => {
    const b = setup('viewer'); b.docs['spaces/s/debts/d'].cancelled = true;
    const before = structuredClone(b.docs);
    const result = await b.read();
    expect(result.currentStatusesIncluded).toBe(true);
    expect(result.archives).toHaveLength(2);
    for (const archive of result.archives) {
      expect(archive).toMatchObject({ operationStatuses: { 'debt:d': 'cancelled' }, snapshot: [event], closingCashBalances: [{ currency: 'TRY', amount: 300 }] });
    }
    expect(b.reads.filter(path => path === 'spaces/s/debts/d')).toHaveLength(1);
    expect(b.batches).toEqual([['spaces/s/debts/d']]);
    expect(b.docs).toEqual(before); expect(b.writes).toHaveLength(0);
  });
  it('uses one batch for distinct sources, preserving type-specific labels and no writes', async () => {
    const b = setup();
    b.docs['spaces/s/payments/p'] = { id: 'p', workspaceId: 's', storeId: 'store', amendmentRevision: 1 };
    b.docs['spaces/s/merchantOperations/m'] = { id: 'm', workspaceId: 's', storeId: 'store', reversedByOperationId: 'reverse' };
    b.docs['spaces/s/dailyArchives/one'].snapshot = [event,
      { ...event, id: 'payment:p', sourceId: 'p', type: 'settlement' },
      { ...event, id: 'merchant:m', sourceId: 'm', type: 'merchant' }];
    const result = await b.read();
    expect(b.batches).toHaveLength(1);
    expect(b.batches[0]).toHaveLength(3);
    expect(result.archives.find(row => row.id === 'one')).toMatchObject({
      operationStatuses: { 'payment:p': 'edited', 'merchant:m': 'cancelled' },
    });
    expect(b.writes).toHaveLength(0);
  });
  it('does not invent cancellation for a missing or wrong-scope source', async () => {
    for (const missing of [true,false]) {
      const b = setup();
      if (missing) delete b.docs['spaces/s/debts/d'];
      else Object.assign(b.docs['spaces/s/debts/d'], { storeId: 'another', cancelled: true });
      const value = await b.read();
      expect(value.archives.every(archive => !('operationStatuses' in archive))).toBe(true);
    }
  });
  it('keeps the old unannotated list/export contract and rejects an all-history status scan', async () => {
    const b = setup(); b.docs['spaces/s/debts/d'].cancelled = true;
    const result = await b.read({ includeCurrentStatuses: undefined, date: undefined });
    expect(result.archives.every(archive => !('operationStatuses' in archive))).toBe(true);
    expect(b.reads).not.toContain('spaces/s/debts/d');
    await expect(b.read({ date: undefined })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('rejects revoked membership on a conflict retry, instead of returning cached archive/status data', async () => {
    const b = setup();
    b.retryOnce(() => { b.docs['spaces/s/members/u'].status = 'removed'; });
    await expect(b.read()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(b.writes).toHaveLength(0);
  });
  it('preserves archive access with an explicit unavailable-status flag when a day exceeds the bounded status budget', async () => {
    const b = setup();
    b.docs['spaces/s/dailyArchives/one'].snapshot = Array.from({ length: 501 }, (_,i) => ({ ...event, id: `debt:d${i}`, sourceId: `d${i}` }));
    const result = await b.read();
    expect(result.archives).toHaveLength(2);
    expect(result.archives.every(archive => 'operationStatusesUnavailable' in archive && archive.operationStatusesUnavailable === true)).toBe(true);
    expect(b.reads.filter(path => path.startsWith('spaces/s/debts/'))).toHaveLength(0);
  });
});
