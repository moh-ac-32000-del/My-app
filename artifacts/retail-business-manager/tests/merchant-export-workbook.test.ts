import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { exactExportCell } from '@/services/exactSpreadsheetReport';
import { groupedReportLabels } from '@/services/spreadsheetGroupedReport';
import { merchantExportLabels } from '@/constants/merchantExportLabels';
import { merchantExportFixture } from './fixtures/merchantExportSnapshot';
const rows = (sheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true, defval: null });
describe('readable exact merchant/customer-credit XLSX', () => {
  it('does not visually round a representable fine fraction to zero or underflow a subnormal value', () => {
    for (const value of ['1.005', '120.005', '0.000000000000001']) {
      const cell = exactExportCell(value);
      expect(XLSX.SSF.format(cell.z as string, cell.v as number)).toBe(value);
    }
    const tiny = `0.${'0'.repeat(323)}5`;
    expect(exactExportCell(tiny)).toMatchObject({ t: 's', v: tiny });
  });
  it.each(['ar', 'en', 'tr'] as const)(
    'round-trips complete statements and archived merchant details in %s',
    (language) => {
      const fixture = merchantExportFixture(),
        snapshot = fixture.snapshot(),
        before = JSON.stringify(snapshot);
      const book = XLSX.read(spreadsheetBytes(snapshot, language), { type: 'array', cellNF: true, cellStyles: true });
      const l = merchantExportLabels[language],
        g = groupedReportLabels[language];
      expect(book.SheetNames).toEqual([g.customers, l.merchants, g.cash]);
      const clients = rows(book.Sheets[g.customers]),
        merchants = rows(book.Sheets[l.merchants]),
        cash = rows(book.Sheets[g.cash]);
      expect(clients.some((row) => row[0] === l.balance && row[2] === 'TRY' && row[5] === -200.005)).toBe(true);
      expect(
        clients.some((row) => row[0] === l.balance && row[2] === 'USD' && row[5] === '1.0000000000000000001'),
      ).toBe(true);
      expect(merchants.some((row) => row[0] === 'تاجر تجريبي' && row[1] === '+905000000004')).toBe(true);
      expect(merchants.find((row) => row[9] === 'purchase')?.slice(3, 7)).toEqual([4500, -1000, 0, 3500]);
      expect(merchants.find((row) => row[9] === 'direct')?.slice(3, 7)).toEqual([130, 0, 3500, 3370]);
      expect(cash.some((row) => row[9] === 'merchant:purchase' && row[3] === 4500 && row[4] === -1000)).toBe(true);
      expect(cash.some((row) => row[9] === 'merchant:direct' && row[3] === 130 && row[4] === 0)).toBe(true);
      expect(cash.filter((row) => row[9] === 'cash')).toHaveLength(1);
      expect(JSON.stringify(book.Sheets)).toContain('شاشات');
      expect(JSON.stringify(snapshot)).toBe(before);
      for (const sheet of Object.values(book.Sheets))
        for (const [key, cell] of Object.entries(sheet)) {
          if (!key.startsWith('!')) {
            expect(cell).not.toHaveProperty('f');
            expect(cell).not.toHaveProperty('l');
          }
        }
      expect(book.Sheets[g.customers]['!cols']?.[9].hidden).toBe(true);
    },
  );
  it.each(['9007199254740993.00', '1.0000000000000000001', '0.30000000000000004', '0.0000000000000000001'])(
    'preserves %s as exact text instead of lossy Excel numeric storage',
    (value) => {
      const cell = exactExportCell(value);
      expect(cell).toMatchObject({ t: 's', v: value });
    },
  );
  it.each(['1000.00', '-300.00', '1.005', '0.00'])(
    'keeps representable %s numeric without rounding',
    (value) => {
      expect(exactExportCell(value)).toMatchObject({ t: 'n', v: Number(value) });
    },
  );
  it('rejects incomplete records, malformed credit, or linked-source mismatch before generating bytes', () => {
    const fixture = merchantExportFixture();
    fixture.records.merchantOperations.pop();
    expect(() => fixture.snapshot()).toThrow('exportLocalIncomplete');
    const invalid = merchantExportFixture();
    invalid.records.customerCredits[0].data.creditExact = '-1.00';
    expect(() => invalid.snapshot()).toThrow();
    const broken = merchantExportFixture();
    broken.records.transactions[0].data.merchantOperationId = 'wrong';
    expect(() => broken.snapshot()).toThrow();
  });
});
