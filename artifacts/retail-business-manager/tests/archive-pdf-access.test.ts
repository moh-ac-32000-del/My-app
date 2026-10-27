import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'u', role: 'owner', status: 'active', store: 'store', space: 'active', switched: false }));
const read = vi.hoisted(() => vi.fn());
vi.mock('../services/firebase', () => ({ getFirebaseApp: () => ({}), getFirebaseAuth: () => ({ currentUser: state.uid ? { uid: state.uid } : null }) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_db: unknown, path: string) => path, getDocFromServer: read }));
import { authorizeArchivePdf } from '../services/archivePdfAccess';
const archive = { id: 'closing', workspaceId: 's', storeId: 'store', date: '2026-10-27', closingNumber: 1, closedAt: '2026-10-27T12:00:00Z', snapshot: [] };
beforeEach(() => {
  Object.assign(state, { uid: 'u', role: 'owner', status: 'active', store: 'store', space: 'active', switched: false });
  read.mockReset().mockImplementation(async path => {
    if (state.switched) state.uid = 'other';
    return { data: () => path.includes('/members/') ? { role: state.role, status: state.status }
      : path.includes('/storeProfile/') ? { storeId: state.store } : path.includes('/dailyArchives/') ? archive : { status: state.space } };
  });
});
describe('fresh selected archive PDF authorization', () => {
  it.each(['owner','editor','viewer'])('authorizes %s with only four document gets', async role => {
    state.role = role; await authorizeArchivePdf('s', 'store', archive);
    expect(read.mock.calls.map(row => row[0])).toEqual(['spaces/s','spaces/s/members/u','spaces/s/storeProfile/profile','spaces/s/dailyArchives/closing']);
  });
  it.each([{ role: 'admin' },{ status: 'removed' },{ store: 'other' },{ space: 'archived' },{ switched: true }])('rejects stale or revoked access %j', async patch => {
    Object.assign(state, patch); await expect(authorizeArchivePdf('s','store',archive)).rejects.toThrow();
  });
  it('rejects altered closing content, wrong store and failed server access', async () => {
    await expect(authorizeArchivePdf('s','store',{ ...archive, snapshot: [], closingNumber: 2 })).rejects.toThrow();
    await expect(authorizeArchivePdf('s','other',archive)).rejects.toThrow();
    read.mockRejectedValue(new Error('offline')); await expect(authorizeArchivePdf('s','store',archive)).rejects.toThrow('offline');
  });
  it('rejects anonymous or forged scope before reading', async () => {
    state.uid = ''; await expect(authorizeArchivePdf('s','store',archive)).rejects.toThrow();
    state.uid = 'u'; await expect(authorizeArchivePdf('s/other','store',archive)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
