import { describe, expect, it } from 'vitest';
import { formatMoney } from '../constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime, formatLocalizedTime } from '../constants/i18n';
import { formatExactDecimal, formatExactMoney } from '../data/exactMoneyPresentation';
import { merchantStatementHtml } from '../services/merchantStatementHtml';
import { archiveExportFingerprint, archivePdfHtml } from '../services/archivePdf';
import type { DailyArchive } from '../types/business';

const closing: DailyArchive = { id: 'closing-2', storeId: 'store', date: '2026-10-27', closingNumber: 2,
  closedAt: '2026-10-27T15:00:00Z', timeZone: 'Europe/Istanbul',
  closingCashBalances: [{ currency: 'TRY', amount: 1234.5 }, { currency: 'USD', amount: 25 }],
  snapshot: [{ id: 'saved-event', sourceId: 'saved', storeId: 'store', type: 'debt', currency: 'TRY', amount: 3,
    amountExact: '3.005', customerName: '<Customer>', note: 'Saved <notes> & materials', occurredAt: '2026-10-27T12:00:00Z' }] };

describe('reported number and PDF defects', () => {
  it.each(['ar', 'en', 'tr'] as const)('uses 12345 digits in money, dates and time for %s', language => {
    const date = new Date('2026-10-27T12:34:00Z');
    const labels = [formatMoney(12345.67, 'TRY', language), formatExactMoney('9007199254740993.005', 'USD', language),
      formatLocalizedDate(date, language), formatLocalizedDateTime(date, language, 'Europe/Istanbul'), formatLocalizedTime(date, language, 'Europe/Istanbul')];
    expect(labels.join('')).not.toMatch(/[٠-٩۰-۹]/);
    expect(labels[0]).toMatch(/12.*345/);
  });
  it.each([['1.000','1'],['5000.0000','5000'],['1.250','1.25'],['0.001','0.001'],['9007199254740993.0001','9007199254740993.0001']])('displays %s as %s without rounding', (value, expected) => {
    expect(formatExactDecimal(value)).toBe(expected);
  });
  it('prints compact quantity/unit price without altering the financial amount', () => {
    const html = merchantStatementHtml({ language: 'ar', storeName: 'Store', merchantName: 'Merchant', issuedAt: closing.closedAt,
      statement: { totals: [{ currency: 'TRY', opening: '0.00', purchases: '5000.00', payments: '0.00', adjustments: '0.00', closing: '5000.00' }],
        rows: [{ currency: 'TRY', kind: 'purchase', date: closing.date, recordedDate: closing.date, description: 'Item', quantity: '1.000', unitPrice: '5000.0000', amount: '5000.00', method: '', corrected: false }] } });
    expect(html).toContain('<td dir="ltr">1</td><td dir="ltr">5000</td>');
    expect(html).not.toMatch(/[٠-٩۰-۹]/);
    expect(html).toContain('5,000.00');
  });
  it.each(['ar', 'en', 'tr'] as const)('exports only the selected immutable closing, including noncash notes (%s)', language => {
    const before = JSON.stringify(closing), html = archivePdfHtml(closing, 'Test <Store>', language);
    expect(html).toContain('#2');
    expect(html).toContain('Saved &lt;notes&gt; &amp; materials');
    expect(html).toContain('&lt;Customer&gt;');
    expect(html).toContain(formatExactMoney('3.005', 'TRY', language));
    expect(html).toContain(formatMoney(1234.5, 'TRY', language));
    expect(html).not.toContain('closing-2');
    expect(html).not.toMatch(/[٠-٩۰-۹]/);
    expect(JSON.stringify(closing)).toBe(before);
  });
  it('never guesses missing legacy closing balances or derives cash from noncash rows', () => {
    const html = archivePdfHtml({ ...closing, closingCashBalances: undefined }, 'Store', 'en');
    expect(html).not.toContain('1,234.5');
    expect(html).toContain('3.005');
  });
  it('ignores status decorations and property order, but detects changed saved values', () => {
    const reordered = JSON.parse(JSON.stringify(closing), (_key, value) => value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse()) : value);
    expect(archiveExportFingerprint(reordered)).toBe(archiveExportFingerprint(closing));
    expect(archiveExportFingerprint({ ...closing, operationStatuses: { 'saved-event': 'cancelled' } })).toBe(archiveExportFingerprint(closing));
    expect(archiveExportFingerprint({ ...closing, closingCashBalances: [] })).not.toBe(archiveExportFingerprint(closing));
  });
});
