import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalExportCache,
  LOCAL_EXPORT_COLLECTIONS,
  localExportStatus,
  readLocalExportData,
  rememberLocalExportCollection,
  rememberLocalMerchantOperations,
} from '@/services/localExportCache';
import { merchantExportFixture, exportScope, exportTime } from './fixtures/merchantExportSnapshot';
const actor = vi.hoisted(() => ({ uid: 'u' }));
vi.mock('@/services/firebase', () => ({
  isFirebaseConfigured: true,
  getFirebaseAuth: () => ({ currentUser: { uid: actor.uid } }),
}));
vi.mock('firebase/firestore', () => ({
  getDocs: () => {
    throw new Error('unexpected read');
  },
  onSnapshot: () => {
    throw new Error('unexpected listener');
  },
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => {
    throw new Error('unexpected callable');
  },
}));
import { observeForLocalExport } from '@/services/localExportObservation';
const complete = () => {
  const fixture = merchantExportFixture();
  for (const name of LOCAL_EXPORT_COLLECTIONS)
    rememberLocalExportCollection('u', 's', name, fixture.records[name], true, exportTime, 'store');
  return fixture;
};
beforeEach(() => {
  clearLocalExportCache();
  actor.uid = 'u';
});
describe('complete merchant export coverage without cloud reads', () => {
  it('requires all nine confirmed sections and includes inactive parties and credits', () => {
    const fixture = complete();
    expect(localExportStatus(exportScope).every((row) => row.capturedAt)).toBe(true);
    expect(readLocalExportData(exportScope).records.merchantOperations).toHaveLength(3);
    expect(fixture.snapshot().accountData?.credits[0].creditExact).toBe('200.005');
  });
  it('does not accept a first page or operations for a different merchant/currency as complete', () => {
    const fixture = complete();
    rememberLocalExportCollection(
      'u',
      's',
      'merchantOperations',
      fixture.records.merchantOperations.slice(0, 1),
      true,
      exportTime,
    );
    expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
    rememberLocalMerchantOperations('u', 's', 'store', fixture.records.merchantOperations.slice(1), true, exportTime);
    expect(readLocalExportData(exportScope).records.merchantOperations).toHaveLength(3);
  });
  it('unions already viewed pages across merchants without duplicate rows or new data queries', () => {
    const fixture = complete();
    rememberLocalExportCollection('u', 's', 'merchantOperations', [], false);
    for (const row of fixture.records.merchantOperations)
      rememberLocalMerchantOperations('u', 's', 'store', [row, row], true, exportTime);
    expect(readLocalExportData(exportScope).records.merchantOperations).toHaveLength(3);
  });
  it('blocks a newly advanced balance until the corresponding operation has arrived', () => {
    const fixture = complete();
    fixture.records.merchantBalances[0].data.revision = 3;
    rememberLocalExportCollection('u', 's', 'merchantBalances', fixture.records.merchantBalances, true, exportTime);
    expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
  });
  it('blocks a new operation arriving before its matching balance revision', () => {
    const fixture = complete();
    const extra = {
      ...fixture.records.merchantOperations[1],
      id: 'extra',
      data: { ...fixture.records.merchantOperations[1].data, id: 'extra' },
    };
    rememberLocalMerchantOperations('u', 's', 'store', [extra], true, exportTime);
    expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
  });
  it('blocks a fresh reversal marker even when its new balance revision has not arrived yet', () => {
    const fixture = complete();
    fixture.records.merchantOperations[0].data.reversedByOperationId = 'new-correction';
    rememberLocalExportCollection('u', 's', 'merchantOperations', fixture.records.merchantOperations, true);
    expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
  });
  it('rejects incompatible payload reuse rather than replacing a previously received operation', () => {
    const fixture = complete();
    const row = fixture.records.merchantOperations[0];
    rememberLocalMerchantOperations(
      'u',
      's',
      'store',
      [{ ...row, data: { ...row.data, note: 'Changed immutable note' } }],
      true,
    );
    expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
  });
  it('allows verified empty merchants without inventing a history query', () => {
    for (const name of LOCAL_EXPORT_COLLECTIONS.filter((name) => name !== 'merchantOperations'))
      rememberLocalExportCollection('u', 's', name, [], true, exportTime);
    expect(readLocalExportData(exportScope).records.merchantOperations).toEqual([]);
  });
  it.each(['customerCredits', 'merchants', 'merchantBalances'] as const)(
    'blocks missing/pending %s rather than substituting zero',
    (name) => {
      complete();
      rememberLocalExportCollection('u', 's', name, [], false);
      expect(() => readLocalExportData(exportScope)).toThrow('exportLocalIncomplete');
    },
  );
  it('rejects excessive required history even if only the first page is in memory', () => {
    const fixture = complete();
    fixture.records.merchantBalances[0].data.revision = 1001;
    rememberLocalExportCollection('u', 's', 'merchantBalances', fixture.records.merchantBalances, true, exportTime);
    expect(() => readLocalExportData(exportScope)).toThrow('exportTooLarge');
  });
  it('cannot place a late page into a different user or a reset session', () => {
    const fixture = complete(),
      old = observeForLocalExport('s', 'merchantOperations');
    clearLocalExportCache();
    actor.uid = 'other';
    old.merchantOperations(
      {
        docs: fixture.records.merchantOperations.map((doc) => ({ id: doc.id, data: () => doc.data })),
        metadata: { fromCache: false, hasPendingWrites: false },
      },
      'store',
    );
    expect(localExportStatus({ ...exportScope, uid: 'other' }).every((row) => row.capturedAt === null)).toBe(true);
    expect(localExportStatus(exportScope).every((row) => row.capturedAt === null)).toBe(true);
  });
  it('never exports outside a received store or workspace', () => {
    complete();
    expect(() => readLocalExportData({ ...exportScope, storeId: 'other' })).toThrow('exportLocalIncomplete');
    expect(() => readLocalExportData({ ...exportScope, spaceId: 'other' })).toThrow('exportLocalIncomplete');
  });
});
