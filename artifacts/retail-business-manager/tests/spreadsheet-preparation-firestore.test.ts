import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'u', role: 'owner', member: 'active', space: 'active', storeId: 'store', cached: false, pending: false }));
const docs = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
vi.mock('../services/firebase', () => ({ getFirebaseApp: () => ({}), getFirebaseAuth: () => ({ currentUser: state.uid ? { uid: state.uid } : null }) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: (_db: unknown, path: string) => path, doc: (_db: unknown, path: string) => path,
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  where: (...args: unknown[]) => ({ where: args }), orderBy: (...args: unknown[]) => ({ orderBy: args }),
  documentId: () => '__name__', limit: (size: number) => ({ limit: size }), startAfter: (...args: unknown[]) => ({ startAfter: args }),
  getDocsFromServer: docs, getDocFromServer: read,
  setDoc: () => { throw new Error('write forbidden'); }, updateDoc: () => { throw new Error('write forbidden'); },
}));
import { spreadsheetPreparationSource as source } from '../services/spreadsheetPreparationFirestore';
const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
beforeEach(() => {
  Object.assign(state, { uid: 'u', role: 'owner', member: 'active', space: 'active', storeId: 'store', cached: false, pending: false });
  read.mockReset().mockImplementation(async path => ({ data: () => path.includes('/members/') ? { status: state.member, role: state.role }
    : path.includes('/storeProfile/') ? { storeId: state.storeId } : { status: state.space } }));
  docs.mockReset().mockImplementation(async () => ({ docs: [], metadata: { fromCache: state.cached, hasPendingWrites: state.pending } }));
});
describe('explicit spreadsheet server reader uses existing scoped read permissions only', () => {
  it.each(['owner', 'editor', 'viewer'])('checks active %s membership and store mapping', async role => {
    state.role = role; await source.authorize(scope);
    expect(read.mock.calls.map(call => call[0])).toEqual(['spaces/s', 'spaces/s/members/u', 'spaces/s/storeProfile/profile']);
  });
  it.each([{ member: 'removed' }, { space: 'archived' }, { role: 'admin' }, { storeId: 'other' }])('rejects invalid access %j', async patch => {
    Object.assign(state, patch); await expect(source.authorize(scope)).rejects.toThrow('exportScopeChanged');
  });
  it('caps collection reads and applies the selected space/store', async () => {
    await source.collection(scope, 'merchants');
    expect(docs).toHaveBeenCalledWith({ path: 'spaces/s/merchants', constraints: [{ where: ['storeId', '==', 'store'] }, { limit: 1001 }] });
  });
  it('uses the existing merchant history index, deterministic cursor and bounded pages', async () => {
    await source.merchantPage(scope, 'm', { id: 'last', createdAt: '2026-10-26T10:00:00Z' }, 100);
    expect(docs).toHaveBeenCalledWith({ path: 'spaces/s/merchantOperations', constraints: [
      { where: ['merchantId', '==', 'm'] }, { orderBy: ['createdAt', 'desc'] }, { orderBy: ['__name__', 'desc'] },
      { startAfter: ['2026-10-26T10:00:00Z', 'last'] }, { limit: 100 },
    ] });
  });
  it.each([{ cached: true }, { pending: true }])('refuses unconfirmed replies %j', async patch => {
    Object.assign(state, patch);
    await expect(source.collection(scope, 'merchants')).rejects.toThrow('exportServerUnconfirmed');
    await expect(source.merchantPage(scope, 'm', null, 100)).rejects.toThrow('exportServerUnconfirmed');
  });
  it('discards a response received after an account change', async () => {
    docs.mockImplementationOnce(async () => { state.uid = 'other'; return { docs: [], metadata: { fromCache: false, hasPendingWrites: false } }; });
    await expect(source.collection(scope, 'merchants')).rejects.toThrow('exportScopeChanged');
  });
  it('rejects anonymous or forged scope before financial reads', async () => {
    state.uid = '';
    await expect(source.collection(scope, 'merchants')).rejects.toThrow('exportScopeChanged');
    state.uid = 'other';
    await expect(source.merchantPage(scope, 'm', null, 100)).rejects.toThrow('exportScopeChanged');
    expect(docs).not.toHaveBeenCalled();
  });
  it.each([0, 101, -1])('rejects an excessive or invalid page size %s', async size => {
    await expect(source.merchantPage(scope, 'm', null, size)).rejects.toThrow('exportScopeInvalid');
    expect(docs).not.toHaveBeenCalled();
  });
});
