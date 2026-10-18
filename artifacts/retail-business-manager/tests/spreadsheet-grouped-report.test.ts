import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSpreadsheetWorkbook, spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { groupedReportLabels } from '@/services/spreadsheetGroupedReport';
import { exportLabels, exportReportLabels } from '@/constants/exportLabels';
import { exportSnapshotFixture as fixture } from './fixtures/spreadsheetSnapshot';

function rows(sheet: XLSX.WorkSheet) { return XLSX.utils.sheet_to_json<(string|number|null)[]>(sheet,{header:1,raw:true,defval:null}); }
describe('two readable grouped reports, local data only', () => {
  it.each(['ar','en','tr'] as const)('downloads exactly two localized grouped sheets in %s', language => {
    const before=JSON.stringify(fixture); const l=groupedReportLabels[language];
    const book=XLSX.read(spreadsheetBytes(fixture,language),{type:'array',cellNF:true,cellStyles:true});
    expect(book.SheetNames).toEqual([l.customers,l.cash]);
    const clients=rows(book.Sheets[l.customers]); const cash=rows(book.Sheets[l.cash]);
    expect(clients.some(r=>r[0]==='عميل تجريبي' && r[1]==='+905001234567')).toBe(true);
    expect(clients.find(r=>r[0]===l.current && String(r[2]).includes('TRY'))?.[5]).toBe(70.25);
    expect(clients.find(r=>r[0]===l.current && String(r[2]).includes('USD'))?.[5]).toBe(0);
    const debt=clients.find(r=>r[9]==='debts'&&r[10]==='d1')!;
    const payment=clients.find(r=>r[9]==='payments'&&r[10]==='p1')!;
    expect(debt[3]).toBe(120.5); expect(debt[5]).toBe(70.25); expect(debt[4]).toBeNull();
    expect(payment[4]).toBe(50.25); expect(payment[5]).toBeNull(); // Never manufacture a post-payment historical balance.
    expect(payment[7]).toBe(exportReportLabels[language].cash);
    const closing=cash.find(r=>r[9]==='closingBalances'&&String(r[2]).includes('USD'))!;
    expect(closing[5]).toBe(-20);
    expect(cash.some(r=>r[0]===l.unavailable)).toBe(true); // Old closing balance absent, not zero.
    expect(cash.filter(r=>r[9]==='transactions')).toHaveLength(1);
    expect(cash.filter(r=>r[9]==='archiveEvents')).toHaveLength(1);
    expect(book.Sheets[l.customers]['!cols']?.slice(9).every(c=>c.hidden)).toBe(true);
    for (const sheet of Object.values(book.Sheets)) for (const [key,c] of Object.entries(sheet)) if(!key.startsWith('!')) {expect(c).not.toHaveProperty('f');expect(c).not.toHaveProperty('l');}
    expect(JSON.stringify(fixture)).toBe(before);
    expect(clients.some(r=>r[0]===exportLabels[language].source)).toBe(true);
  });
  it('keeps same-name customers separate and does not move payments between them', () => {
    const copy=structuredClone(fixture);
    copy.tables.customers.push(['c2','عميل تجريبي','+902222222222',null,null,true,'2026-10-18T09:00:00Z','2026-10-19T08:00:00Z']);
    copy.tables.debts[1][1]='c2';
    const clients=rows(buildSpreadsheetWorkbook(copy,'ar').Sheets[groupedReportLabels.ar.customers]);
    const first=clients.findIndex(r=>r[0]==='عميل تجريبي'&&r[1]==='+905001234567');
    const second=clients.findIndex(r=>r[0]==='عميل تجريبي'&&r[1]==='+902222222222');
    const payment=clients.findIndex(r=>r[9]==='payments');
    expect(first).toBeLessThan(payment); expect(payment).toBeLessThan(second);
    expect(clients.filter(r=>r[9]==='debts')).toHaveLength(2);
  });
  it('preserves missing-customer debts, unlinked payments and chronological history', () => {
    const copy=structuredClone(fixture); copy.tables.customers=[]; copy.tables.payments[0][1]=null;
    const r=rows(buildSpreadsheetWorkbook(copy,'ar').Sheets[groupedReportLabels.ar.customers]);
    expect(r.some(row=>row[0]===exportReportLabels.ar.missingCustomer)).toBe(true);
    expect(r.some(row=>row[0]===exportReportLabels.ar.noCustomer)).toBe(true);
    expect(r.filter(row=>row[9]==='debts')).toHaveLength(2);
    expect(r.filter(row=>row[9]==='payments')).toHaveLength(1);
    const normal=rows(buildSpreadsheetWorkbook(fixture,'ar').Sheets[groupedReportLabels.ar.customers]);
    const dates=normal.filter(row=>row[9]==='debts'||row[9]==='payments').map(row=>{const value:unknown=row[1]; return value instanceof Date?value.getTime():Number(value);});
    expect(dates).toEqual([...dates].sort((a,b)=>a-b));
  });
  it('shows stored debt balances, not original debt minus all payments, and keeps a blank unknown original amount', () => {
    const copy=structuredClone(fixture); copy.tables.payments[0][4]=999; copy.tables.payments[0][5]='out';
    const r=rows(buildSpreadsheetWorkbook(copy,'ar').Sheets[groupedReportLabels.ar.customers]);
    expect(r.find(row=>row[0]===groupedReportLabels.ar.current&&String(row[2]).includes('TRY'))?.[5]).toBe(70.25);
    expect(r.find(row=>row[9]==='debts'&&row[10]==='d2')?.[3]).toBeNull();
    expect(r.find(row=>row[9]==='payments')?.[0]).toBe(groupedReportLabels.ar.paymentOut);
  });
  it('supports empty collections without inventing a customer or closing balance', () => {
    const copy=structuredClone(fixture); for(const key of Object.keys(copy.tables) as (keyof typeof copy.tables)[])copy.tables[key]=[];
    const book=buildSpreadsheetWorkbook(copy,'ar'); expect(book.SheetNames).toHaveLength(2);
    expect(rows(book.Sheets[groupedReportLabels.ar.customers]).some(r=>r[0]===groupedReportLabels.ar.empty)).toBe(true);
  });
});
