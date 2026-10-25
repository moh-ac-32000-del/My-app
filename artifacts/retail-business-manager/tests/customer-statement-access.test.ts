import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'u', role: 'owner', status: 'active', space: 's', switched: false, fail: false }));
const read = vi.hoisted(() => vi.fn());
vi.mock('../services/firebase', () => ({ getFirebaseApp: () => ({}), getFirebaseAuth: () => ({ currentUser: state.uid ? { uid: state.uid } : null }) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_db: unknown, path: string) => path, getDocFromServer: read }));
import { authorizeCustomerStatement } from '../services/customerStatementAccess';
beforeEach(() => {
  Object.assign(state, { uid: 'u', role: 'owner', status: 'active', space: 's', switched: false, fail: false });
  read.mockReset().mockImplementation(async (path: string) => {
    if (state.fail) throw new Error('offline');
    if (state.switched) state.uid = 'other';
    const data = path.includes('/members/') ? { status: state.status, role: state.role }
      : path.includes('/storeProfile/') ? { storeId: 'store' }
      : path.includes('/customers/') ? { id: 'c', storeId: 'store', workspaceId: state.space }
      : { status: 'active' };
    return { data: () => data };
  });
});
describe('customer PDF fresh authorization, without financial-history queries', () => {
  it.each(['owner', 'editor'])('allows active %s with four explicit document checks', async role => {
    state.role = role;
    await authorizeCustomerStatement('s', 'store', 'c');
    expect(read.mock.calls.map(call => call[0]).sort()).toEqual(['spaces/s', 'spaces/s/customers/c', 'spaces/s/members/u', 'spaces/s/storeProfile/profile'].sort());
  });
  it.each(['viewer', 'admin', ''])('rejects %s even if the page was previously loaded', async role => {
    state.role = role;
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow('exportScopeChanged');
  });
  it('rejects revoked membership, wrong workspace, user switch and offline checks', async () => {
    state.status = 'removed';
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow();
    state.status = 'active'; state.space = 'other';
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow();
    state.space = 's'; state.switched = true;
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow();
    state.switched = false; state.uid = 'u'; state.fail = true;
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow('offline');
  });
  it('rejects invalid scope and anonymous access before any reads', async () => {
    await expect(authorizeCustomerStatement('s/other', 'store', 'c')).rejects.toThrow();
    state.uid = '';
    await expect(authorizeCustomerStatement('s', 'store', 'c')).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
