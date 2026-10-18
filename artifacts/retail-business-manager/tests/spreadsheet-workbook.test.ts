import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSpreadsheetWorkbook, exportFileName, spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { exportLabels, exportReportLabels } from '@/constants/exportLabels';
import { exportSnapshotFixture as fixture } from './fixtures/spreadsheetSnapshot';

describe('local XLSX review export, not a restore backup', () => {
  it.each(['ar', 'en', 'tr'] as const)('round-trips every sheet and numeric value in %s', (language) => {
    const before = JSON.stringify(fixture);
    const bytes = spreadsheetBytes(fixture, language);
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
    const read = XLSX.read(bytes, { type: 'array', cellNF: true });
    expect(read.SheetNames).toHaveLength(8);
    const labels = exportLabels[language];
    expect(read.SheetNames[0]).toBe(labels.customers);
    expect(read.SheetNames.at(-1)).toBe(labels.info);
    expect(read.Sheets[labels.debts].E2).toMatchObject({ t: 'n', v: 70.25 });
    expect(read.Sheets[labels.debts].E3).toMatchObject({ t: 'n', v: 0 });
    expect(read.Sheets[labels.debts].D3).toBeUndefined(); // Missing original amount is not a fabricated zero.
    expect(read.Sheets[labels.closingBalances].C3.v).toBe(-20);
    expect(read.Sheets[labels.customers].C2).toMatchObject({ t: 's', v: exportReportLabels[language].inactive });
    expect(read.Sheets[labels.dailyArchives].D3).toMatchObject({ t: 's', v: exportReportLabels[language].no });
    expect(read.Sheets[labels.debts]['!autofilter']).toBeDefined();
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('stores user text and phone numbers literally, without formulas or hyperlinks', () => {
    const read = XLSX.read(spreadsheetBytes(fixture, 'en'), { type: 'array' });
    expect(read.Sheets.Customers.B2).toMatchObject({ t: 's', v: '+905001234567' });
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
    expect(XLSX.SSF.format('yyyy-mm-dd hh:mm:ss', book.Sheets.Payments.G2.v as number)).toBe('2026-10-19 08:00:00');
  });
  it.each(['ar', 'en', 'tr'] as const)('localizes report values, not just headings, in %s', (language) => {
    const labels = exportLabels[language]; const words = exportReportLabels[language];
    const book = XLSX.read(spreadsheetBytes(fixture, language), { type: 'array', cellStyles: true });
    expect(book.Sheets[labels.debts].A2.v).toBe('عميل تجريبي');
    expect(book.Sheets[labels.debts].B2.v).toBe('+905001234567');
    expect(book.Sheets[labels.payments].A2.v).toBe('عميل تجريبي');
    expect(book.Sheets[labels.payments].E2.v).toBe(words.in);
    expect(book.Sheets[labels.payments].F2.v).toBe(words.cash);
    expect(book.Sheets[labels.transactions].A2.v).toBe(words.cash_in);
    expect(book.Sheets[labels.archiveEvents].C2.v).toBe(words.settlement);
    expect(book.Sheets[labels.closingBalances].A2.v).toBe(`2026-10-19 — ${words.archiveLabel} 1`);
    expect(book.Sheets[labels.customers].A2.v).toBe('عميل تجريبي'); // User text is never translated.
    expect(book.Sheets[labels.debts].C2.v).toBe(language === 'ar' ? 'الليرة التركية (TRY)' : language === 'tr' ? 'Türk lirası (TRY)' : 'Turkish lira (TRY)');
    expect(book.Sheets[labels.debts].J2.v).toBe('d1'); // References preserved, hidden at the end.
    expect(book.Sheets[labels.debts]['!cols']?.[9].hidden).toBe(true);
    expect(book.Sheets[labels.debts]['!cols']?.[0].hidden).not.toBe(true);
    expect(JSON.stringify(book.Sheets[labels.info])).toContain(words.localSource);
    expect(JSON.stringify(book.Sheets[labels.info])).not.toContain('Firebase → local session copy');
  });
  it('joins by ID, retains duplicate names, and uses phone numbers to distinguish customers', () => {
    const copy = structuredClone(fixture);
    copy.tables.customers.push(['c2', 'عميل تجريبي', '+902222222222', null, null, true, '2026-10-18T09:00:00Z', '2026-10-19T08:00:00Z']);
    copy.tables.debts[1][1] = 'c2';
    const book = buildSpreadsheetWorkbook(copy, 'ar');
    expect(book.Sheets['الديون'].B2.v).toBe('+905001234567');
    expect(book.Sheets['الديون'].B3.v).toBe('+902222222222');
    expect(book.Sheets['الديون'].E3.v).toBe(0);
  });
  it.each(['ar', 'en', 'tr'] as const)('translates every supported payment method, direction and event type in %s', (language) => {
    const labels = exportLabels[language]; const words = exportReportLabels[language];
    for (const method of ['cash', 'card', 'bank-transfer', 'other'] as const) {
      for (const direction of ['in', 'out'] as const) {
        const copy = structuredClone(fixture); copy.tables.payments[0][5] = direction; copy.tables.payments[0][6] = method;
        const sheet = buildSpreadsheetWorkbook(copy, language).Sheets[labels.payments];
        expect(sheet.E2.v).toBe(words[direction]); expect(sheet.F2.v).toBe(words[method]);
        expect(sheet.D2).toMatchObject({ t: 'n', v: 50.25 });
      }
    }
    for (const type of ['cash_in', 'cash_out', 'debt', 'settlement'] as const) {
      const copy = structuredClone(fixture); copy.tables.archiveEvents[0][3] = type;
      expect(buildSpreadsheetWorkbook(copy, language).Sheets[labels.archiveEvents].C2.v).toBe(words[type]);
    }
  });
  it('preserves the customer name recorded in an archive even after a rename', () => {
    const copy = structuredClone(fixture); copy.tables.customers[0][1] = 'اسم جديد';
    const book = buildSpreadsheetWorkbook(copy, 'ar');
    expect(book.Sheets['الديون'].A2.v).toBe('اسم جديد');
    expect(book.Sheets['تفاصيل الإغلاقات'].B2.v).toBe('عميل تجريبي');
  });
  it('marks unavailable names and unlinked payments explicitly without losing records or fetching data', () => {
    const copy = structuredClone(fixture); copy.tables.customers = [];
    copy.tables.payments[0][1] = null;
    const book = buildSpreadsheetWorkbook(copy, 'ar');
    expect(book.Sheets['الديون'].A2.v).toBe(exportReportLabels.ar.missingCustomer);
    expect(book.Sheets['الديون'].A3.v).toBe(exportReportLabels.ar.missingCustomer);
    expect(book.Sheets['الدفعات'].A2.v).toBe(exportReportLabels.ar.noCustomer);
    expect(book.Sheets['الديون'].K2.v).toBe('c1');
    expect(book.Sheets['الديون'].E2.v).toBe(70.25);
  });
  it('rejects ambiguous duplicate IDs and unsupported enums rather than assigning a wrong name or label', () => {
    const copy = structuredClone(fixture); copy.tables.customers.push([...copy.tables.customers[0]]);
    expect(() => spreadsheetBytes(copy, 'ar')).toThrow('exportResponseInvalid');
    copy.tables.customers.pop(); copy.tables.payments[0][6] = 'unsupported';
    expect(() => spreadsheetBytes(copy, 'ar')).toThrow('exportResponseInvalid');
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
