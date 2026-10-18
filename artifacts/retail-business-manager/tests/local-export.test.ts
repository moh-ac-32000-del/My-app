import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalExportCache, LOCAL_EXPORT_COLLECTIONS, localExportStatus, readLocalExportData, rememberLocalExportCollection } from '@/services/localExportCache';
import { projectLocalExportSnapshot } from '@/services/localExportProjection';
const auth = vi.hoisted(() => ({ currentUser: { uid: 'u' } as { uid: string } | null }));
vi.mock('@/services/firebase', () => ({ isFirebaseConfigured: true, getFirebaseAuth: () => auth }));
// Any new data read/subscription from the export path fails the test.
vi.mock('firebase/firestore', () => ({ getDocs: () => { throw new Error('unexpected cloud read'); }, onSnapshot: () => { throw new Error('unexpected subscription'); } }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => { throw new Error('unexpected callable'); } }));
import { observeForLocalExport } from '@/services/localExportObservation';
const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
const stamp = '2026-10-19T08:00:00Z';
const customer = { id: 'c', data: { id: 'c', storeId: 'store', name: 'Customer', isActive: false, createdAt: stamp, updatedAt: stamp } };
function receiveAll() { for (const name of LOCAL_EXPORT_COLLECTIONS) rememberLocalExportCollection('u', 's', name, name === 'customers' ? [customer] : [], true, stamp); }

describe('zero-additional-read local export cache and projection', () => {
  beforeEach(() => { clearLocalExportCache(); auth.currentUser = { uid: 'u' }; });
  it('distinguishes unknown sections from verified empty collections and never fetches gaps', () => {
    expect(() => readLocalExportData(scope)).toThrow('exportLocalIncomplete');
    rememberLocalExportCollection('u', 's', 'customers', [], true, stamp);
    expect(localExportStatus(scope).filter((entry) => entry.capturedAt)).toHaveLength(1);
    expect(() => readLocalExportData(scope)).toThrow('exportLocalIncomplete');
    receiveAll(); expect(readLocalExportData(scope).records.debts).toEqual([]);
  });
  it('can export previously received data while offline without invoking any Firebase API', () => {
    receiveAll(); const local = readLocalExportData(scope);
    const result = projectLocalExportSnapshot(scope, 'Example', local.records, local.capturedAt, stamp);
    expect(result.tables.customers[0]).toEqual(['c', 'Customer', null, null, null, false, stamp, stamp]);
    expect(result.capturedAt.customers).toBe(stamp);
    expect(result.tables.debts).toEqual([]);
  });
  it('never treats cache-only/pending data as a confirmed full section', () => {
    receiveAll();
    const observer = observeForLocalExport('s', 'customers');
    observer.receive({ docs: [], metadata: { fromCache: true, hasPendingWrites: false } });
    expect(() => readLocalExportData(scope)).toThrow('exportLocalIncomplete');
    observer.receive({ docs: [], metadata: { fromCache: false, hasPendingWrites: true } });
    expect(() => readLocalExportData(scope)).toThrow('exportLocalIncomplete');
    observer.receive({ docs: [], metadata: { fromCache: false, hasPendingWrites: false } });
    expect(readLocalExportData(scope).records.customers).toEqual([]);
  });
  it('does not assign a late old-account snapshot to the new account', () => {
    const observer = observeForLocalExport('s', 'customers'); auth.currentUser = { uid: 'other' };
    observer.receive({ docs: [{ id: 'c', data: () => customer.data }], metadata: { fromCache: false, hasPendingWrites: false } });
    expect(localExportStatus({ ...scope, uid: 'other' }).every((entry) => entry.capturedAt === null)).toBe(true);
    expect(localExportStatus(scope).every((entry) => entry.capturedAt === null)).toBe(true);
  });
  it('isolates users/workspaces/stores and deep-copies received and returned data', () => {
    receiveAll();
    expect(() => readLocalExportData({ ...scope, uid: 'other' })).toThrow('exportLocalIncomplete');
    expect(() => readLocalExportData({ ...scope, spaceId: 'other' })).toThrow('exportLocalIncomplete');
    rememberLocalExportCollection('u', 's', 'dailyArchives', [], true, stamp, 'store');
    expect(() => readLocalExportData({ ...scope, storeId: 'other' })).toThrow('exportLocalIncomplete');
    const local = readLocalExportData(scope); local.records.customers[0].data.name = 'changed';
    expect(readLocalExportData(scope).records.customers[0].data.name).toBe('Customer');
  });
  it('invalidates terminal errors and clears session copies without touching cloud data', () => {
    receiveAll(); observeForLocalExport('s', 'customers').invalidate();
    expect(() => readLocalExportData(scope)).toThrow('exportLocalIncomplete');
    receiveAll(); clearLocalExportCache();
    expect(localExportStatus(scope).every((entry) => !entry.capturedAt)).toBe(true);
  });
  it('rejects oversized sections rather than silently keeping only the first records', () => {
    receiveAll(); rememberLocalExportCollection('u', 's', 'customers', Array.from({ length: 1001 }, () => customer), true, stamp);
    expect(() => readLocalExportData(scope)).toThrow('exportTooLarge');
  });
  it('keeps recorded remaining debt, missing originals and negative closing balances unchanged', () => {
    receiveAll();
    rememberLocalExportCollection('u', 's', 'debts', [{ id: 'd', data: { id: 'd', storeId: 'store', customerId: 'c', currency: 'USD', amount: 0, createdAt: stamp, updatedAt: stamp } }], true, stamp);
    rememberLocalExportCollection('u', 's', 'dailyArchives', [{ id: 'a', data: { id: 'a', storeId: 'store', date: '2026-10-19', closedAt: stamp, closingNumber: 1, snapshot: [], closingCashBalances: [{ currency: 'USD', amount: -10 }] } }], true, stamp);
    const local = readLocalExportData(scope); const before = JSON.stringify(local);
    const result = projectLocalExportSnapshot(scope, 'Example', local.records, local.capturedAt, stamp);
    expect(result.tables.debts[0]).toEqual(['d', 'c', 'USD', null, 0, null, null, stamp, stamp]);
    expect(result.tables.closingBalances).toEqual([['a', 'USD', -10]]);
    expect(JSON.stringify(local)).toBe(before);
  });
  it.each([{ workspaceId: 'other' }, { name: 123 }, { createdAt: 'invalid' }, { isActive: 'false' }])('refuses invalid local records instead of omitting them', (patch) => {
    receiveAll(); const local = readLocalExportData(scope);
    Object.assign(local.records.customers[0].data, patch);
    expect(() => projectLocalExportSnapshot(scope, 'Example', local.records, local.capturedAt, stamp)).toThrow('exportInvalidData');
  });
});
