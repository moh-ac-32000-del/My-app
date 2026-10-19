import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ uid: 'u' }));
vi.mock('@/services/firebase', () => ({
  isFirebaseConfigured: true,
  getFirebaseAuth: () => ({ currentUser: { uid: auth.uid } }),
}));
import { observeForLocalExport } from '@/services/localExportObservation';
import { clearLocalExportCache, localExportStatus } from '@/services/localExportCache';
beforeEach(() => clearLocalExportCache());
it('cannot repopulate an old export snapshot from a delayed callback after session invalidation', () => {
  const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
  const old = observeForLocalExport('s', 'customers');
  const snapshot = {
    docs: [{ id: 'c', data: () => ({ storeId: 'store', name: 'Customer' }) }],
    metadata: { fromCache: false, hasPendingWrites: false },
  };
  old.receive(snapshot);
  expect(localExportStatus(scope)[0].capturedAt).not.toBeNull();
  clearLocalExportCache();
  old.receive(snapshot);
  expect(localExportStatus(scope)[0].capturedAt).toBeNull();
  observeForLocalExport('s', 'customers').receive(snapshot);
  expect(localExportStatus(scope)[0].capturedAt).not.toBeNull();
});
