import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSpreadsheetWorkbook, exportFileName, spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { exportLabels } from '@/constants/exportLabels';
import { exportSnapshotFixture as fixture } from './fixtures/spreadsheetSnapshot';

describe('local XLSX review export, not a restore backup', () => {
  it.each(['ar', 'en', 'tr'] as const)('round-trips every sheet and numeric value in %s', (language) => {
    const before = JSON.stringify(fixture);
    const bytes = spreadsheetBytes(fixture, language);
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
    const read = XLSX.read(bytes, { type: 'array', cellNF: true });
    expect(read.SheetNames).toHaveLength(8);
    const labels = exportLabels[language];
    expect(read.Sheets[labels.debts].E2).toMatchObject({ t: 'n', v: 70.25 });
    expect(read.Sheets[labels.debts].E3).toMatchObject({ t: 'n', v: 0 });
    expect(read.Sheets[labels.debts].D3).toBeUndefined(); // Missing original amount is not a fabricated zero.
    expect(read.Sheets[labels.closingBalances].C3.v).toBe(-20);
    expect(read.Sheets[labels.customers].F2).toMatchObject({ t: 'b', v: false });
    expect(read.Sheets[labels.dailyArchives].E3).toMatchObject({ t: 'b', v: false });
    expect(read.Sheets[labels.debts]['!autofilter']).toBeDefined();
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('stores user text and phone numbers literally, without formulas or hyperlinks', () => {
    const read = XLSX.read(spreadsheetBytes(fixture, 'en'), { type: 'array' });
    expect(read.Sheets.Customers.C2).toMatchObject({ t: 's', v: '+905001234567' });
    expect(read.Sheets.Customers.E2).toMatchObject({ t: 's', v: fixture.tables.customers[0][4] });
    for (const sheet of Object.values(read.Sheets)) for (const [key, cell] of Object.entries(sheet)) {
      if (!key.startsWith('!')) { expect(cell).not.toHaveProperty('f'); expect(cell).not.toHaveProperty('l'); }
    }
    expect(read).not.toHaveProperty('vbaraw');
  });
  it('uses sortable UTC timestamps and date-only values without local-day shifts', () => {
    const book = buildSpreadsheetWorkbook(fixture, 'en');
    const due = book.Sheets.Debts.F2;
    expect(due).toMatchObject({ t: 'n', z: 'yyyy-mm-dd' });
    expect(XLSX.SSF.format(due.z as string, due.v as number)).toBe('2026-10-20');
    expect(XLSX.SSF.format('yyyy-mm-dd hh:mm:ss', book.Sheets.Payments.H2.v as number)).toBe('2026-10-19 08:00:00');
  });
  it('rejects malformed rows rather than silently trimming them', () => {
    const bad = structuredClone(fixture); bad.tables.debts[0].pop();
    expect(() => spreadsheetBytes(bad, 'en')).toThrow('exportResponseInvalid');
    bad.tables.debts = [[...fixture.tables.debts[0]]]; bad.tables.debts[0][4] = NaN;
    expect(() => spreadsheetBytes(bad, 'en')).toThrow('exportResponseInvalid');
  });
  it('creates a neutral filename without customer/store names or filesystem path characters', () => {
    expect(exportFileName(fixture.exportedAt)).toBe('My-app-export-20261019-083000-123.xlsx');
  });
});
