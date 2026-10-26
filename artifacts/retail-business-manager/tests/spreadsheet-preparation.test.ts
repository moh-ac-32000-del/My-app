import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSpreadsheetExport, type SpreadsheetPreparationSource, type ExportProgress } from '../data/prepareSpreadsheetExport';
import { clearLocalExportCache, LOCAL_EXPORT_COLLECTIONS, localExportStatus, readLocalExportData,
  rememberLocalExportCollection, type LocalExportCollection, type StoredExportDocument } from '../services/localExportCache';
import { merchantExportFixture, exportScope as scope, exportTime } from './fixtures/merchantExportSnapshot';

function setup(missing: LocalExportCollection[] = ['merchantOperations'], many?: number) {
  const fixture = merchantExportFixture();
  if (many) {
    fixture.records.merchants = [fixture.records.merchants[0]];
    fixture.records.merchantBalances = [{ ...fixture.records.merchantBalances[0], data: { ...fixture.records.merchantBalances[0].data, revision: many, balanceExact: `${many}.00` } }];
    fixture.records.customers = []; fixture.records.debts = []; fixture.records.customerCredits = [];
    fixture.records.transactions = []; fixture.records.payments = []; fixture.records.dailyArchives = [];
    fixture.records.merchantOperations = Array.from({ length: many }, (_, index) => ({ id: `op-${index}`, data: {
      id: `op-${index}`, workspaceId: 's', storeId: 'store', merchantId: 'm', merchantName: 'Merchant',
      action: 'purchase', currency: 'TRY', balanceBeforeExact: `${index}.00`, balanceAfterExact: `${index + 1}.00`,
      cashDeltaExact: '0.00', totalExact: '1.00', paidExact: '0.00', note: '',
      lines: [{ name: 'Item', quantity: '1', unitPrice: '1', totalExact: '1.00' }],
      createdAt: new Date(Date.parse(exportTime) + index * 1000).toISOString(), createdByUserId: 'u',
    } }));
  }
  for (const name of LOCAL_EXPORT_COLLECTIONS) if (!missing.includes(name)) {
    rememberLocalExportCollection('u', 's', name, fixture.records[name], true, exportTime, 'store');
  }
  const source = {
    authorize: vi.fn(async () => {}),
    collection: vi.fn<SpreadsheetPreparationSource['collection']>(async (_scope, name) => structuredClone(fixture.records[name])),
    merchantPage: vi.fn<SpreadsheetPreparationSource['merchantPage']>(async (_scope, merchantId, cursor, size) => {
      const rows = fixture.records.merchantOperations.filter(row => row.data.merchantId === merchantId)
        .sort((a, b) => String(b.data.createdAt).localeCompare(String(a.data.createdAt)) || b.id.localeCompare(a.id));
      const offset = cursor ? rows.findIndex(row => row.id === cursor.id) + 1 : 0;
      return structuredClone(rows.slice(offset, offset + size));
    }),
  } satisfies SpreadsheetPreparationSource;
  let current = true;
  const progress: ExportProgress[] = [];
  const run = (allowReads = true) => prepareSpreadsheetExport(scope, 'Store', source, { allowReads, isCurrent: () => current, progress: value => progress.push(value) });
  return { fixture, source, run, progress, cancel: () => { current = false; } };
}
beforeEach(() => clearLocalExportCache());

describe('explicit spreadsheet preparation: fill gaps, never require manual navigation', () => {
  it('prepares 6/9 sections through one action and retains unchanged exact data', async () => {
    const task = setup(['merchants', 'merchantBalances', 'merchantOperations']);
    expect(localExportStatus(scope).filter(row => row.capturedAt)).toHaveLength(6);
    expect(task.source.collection).not.toHaveBeenCalled();
    const result = await task.run();
    expect(task.source.collection.mock.calls.map(call => call[1])).toEqual(['merchants', 'merchantBalances']);
    expect(task.source.merchantPage.mock.calls.map(call => call[1])).toEqual(['m', 'm2']);
    expect(task.source.authorize).toHaveBeenCalledTimes(2);
    expect(result.accountData?.operations).toHaveLength(3);
    expect(result.accountData?.credits[0].creditExact).toBe('200.005');
    expect(localExportStatus(scope).every(row => row.capturedAt)).toBe(true);
    expect(task.progress.at(-1)).toMatchObject({ completed: 9, total: 9 });
  });
  it('does not fetch or authorize for an already-complete session, including a second export', async () => {
    const task = setup(); await task.run();
    vi.clearAllMocks();
    await task.run(false);
    expect(task.source.authorize).not.toHaveBeenCalled();
    expect(task.source.collection).not.toHaveBeenCalled();
    expect(task.source.merchantPage).not.toHaveBeenCalled();
  });
  it('never starts reads without affirmative consent', async () => {
    const task = setup();
    await expect(task.run(false)).rejects.toThrow('exportConsentRequired');
    expect(task.source.authorize).not.toHaveBeenCalled();
    expect(task.source.merchantPage).not.toHaveBeenCalled();
  });
  it('automatically pages over 100 records and reuses a partial session without duplicates', async () => {
    const task = setup(['merchantOperations'], 201);
    const newest = [...task.fixture.records.merchantOperations].reverse();
    rememberLocalExportCollection('u', 's', 'merchantOperations', newest.slice(0, 100), true, exportTime, 'store');
    const result = await task.run();
    expect(task.source.merchantPage).toHaveBeenCalledTimes(3);
    expect(task.source.merchantPage.mock.calls.map(call => call[2]?.id ?? null)).toEqual([null, 'op-101', 'op-1']);
    expect(result.accountData?.operations).toHaveLength(201);
    expect(new Set(result.accountData?.operations.map(row => row.id)).size).toBe(201);
    expect(task.source.collection).not.toHaveBeenCalled();
  });
  it('skips a merchant whose complete history is already confirmed', async () => {
    const task = setup();
    rememberLocalExportCollection('u', 's', 'merchantOperations', task.fixture.records.merchantOperations.filter(row => row.data.merchantId === 'm2'), true, exportTime, 'store');
    await task.run();
    expect(task.source.merchantPage.mock.calls.map(call => call[1])).toEqual(['m']);
  });
  it('proves empty merchant collections without a history query', async () => {
    const task = setup(['merchants', 'merchantBalances', 'merchantOperations']);
    task.fixture.records.merchants = []; task.fixture.records.merchantBalances = [];
    task.fixture.records.merchantOperations = []; task.fixture.records.payments = []; task.fixture.records.transactions = [];
    // Use a fully empty, coherent fixture for linked financial projections.
    for (const name of LOCAL_EXPORT_COLLECTIONS) {
      task.fixture.records[name] = [];
      if (!['merchants', 'merchantBalances', 'merchantOperations'].includes(name)) rememberLocalExportCollection('u', 's', name, [], true, exportTime, 'store');
    }
    await task.run();
    expect(task.source.merchantPage).not.toHaveBeenCalled();
    expect(readLocalExportData(scope).records.merchantOperations).toEqual([]);
  });
});

describe('preparation failure/cancellation never publishes a partial file or stale scope', () => {
  it('keeps incomplete receipts unchanged on network failure', async () => {
    const task = setup(['merchantOperations'], 201);
    const real = task.source.merchantPage.getMockImplementation()!;
    task.source.merchantPage.mockImplementationOnce(real).mockRejectedValueOnce(new Error('offline'));
    await expect(task.run()).rejects.toThrow('offline');
    expect(localExportStatus(scope).find(row => row.collection === 'merchantOperations')?.capturedAt).toBeNull();
  });
  it('stops after cancellation/account change while a read is in flight', async () => {
    const task = setup(['merchantOperations'], 201);
    const real = task.source.merchantPage.getMockImplementation()!;
    task.source.merchantPage.mockImplementationOnce(async (...args) => { const rows = await real(...args); task.cancel(); return rows; });
    await expect(task.run()).rejects.toThrow('exportScopeChanged');
    expect(task.source.merchantPage).toHaveBeenCalledTimes(1);
    expect(localExportStatus(scope).find(row => row.collection === 'merchantOperations')?.capturedAt).toBeNull();
  });
  it('stops before financial reads if access is revoked', async () => {
    const task = setup(); task.source.authorize.mockRejectedValue(new Error('permission-denied'));
    await expect(task.run()).rejects.toThrow('permission-denied');
    expect(task.source.merchantPage).not.toHaveBeenCalled();
  });
  it('rechecks access before committing a completed preparation', async () => {
    const task = setup(); task.source.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(task.run()).rejects.toThrow('permission-denied');
    expect(localExportStatus(scope).find(row => row.collection === 'merchantOperations')?.capturedAt).toBeNull();
  });
  it('rejects excessive required history before loading pages', async () => {
    const task = setup();
    const balance = task.fixture.records.merchantBalances[0];
    rememberLocalExportCollection('u', 's', 'merchantBalances', [{ ...balance, data: { ...balance.data, revision: 1001 } }], true, exportTime, 'store');
    await expect(task.run()).rejects.toThrow('exportTooLarge');
    expect(task.source.merchantPage).not.toHaveBeenCalled();
  });
  it('rejects oversized collections instead of exporting the first 1,000', async () => {
    const task = setup(['customers']);
    task.source.collection.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => ({ id: String(index), data: { storeId: 'store' } })));
    await expect(task.run()).rejects.toThrow('exportTooLarge');
  });
  it.each([{ storeId: 'other' }, { workspaceId: 'other' }, { merchantId: 'other' }])('rejects mixed-scope history %j', async patch => {
    const task = setup();
    const row = task.fixture.records.merchantOperations[0];
    task.source.merchantPage.mockResolvedValue([{ ...row, data: { ...row.data, ...patch } }]);
    await expect(task.run()).rejects.toThrow();
    expect(localExportStatus(scope).find(value => value.collection === 'merchantOperations')?.capturedAt).toBeNull();
  });
  it('does not overwrite a live receipt that changed during preparation', async () => {
    const task = setup();
    const real = task.source.merchantPage.getMockImplementation()!;
    task.source.merchantPage.mockImplementationOnce(async (...args) => {
      const rows = await real(...args);
      rememberLocalExportCollection('u', 's', 'customers', task.fixture.records.customers, true, '2026-10-26T12:00:00Z', 'store');
      return rows;
    });
    await expect(task.run()).rejects.toThrow('exportChangedDuringPreparation');
    expect(localExportStatus(scope).find(row => row.collection === 'customers')?.capturedAt).toBe('2026-10-26T12:00:00Z');
    expect(localExportStatus(scope).find(row => row.collection === 'merchantOperations')?.capturedAt).toBeNull();
  });
  it('bounds retries when a page repeats instead of advancing', async () => {
    const task = setup(['merchantOperations'], 201);
    task.source.merchantPage.mockResolvedValue(task.fixture.records.merchantOperations.slice(-100).reverse());
    await expect(task.run()).rejects.toThrow('exportLocalIncomplete');
    expect(task.source.merchantPage).toHaveBeenCalledTimes(2);
  });
  it('refuses an ended session before authorization', async () => {
    const task = setup(); task.cancel();
    await expect(task.run()).rejects.toThrow('exportScopeChanged');
    expect(task.source.authorize).not.toHaveBeenCalled();
  });
});
