import { describe, expect, it } from 'vitest';
import { accentOptions, createTheme } from '../constants/colors';
import { normalizeAppearance, resolveAppearance } from '../data/appearance';
import { journalDrawerDetail } from '../data/journalDrawerDetail';
import { customerStatement } from '../data/customerStatement';
import type { Customer, Debt, Payment } from '../types/business';
import type { DailyJournalEvent } from '../types/journal';
import { merchantStatementHtml } from '../services/merchantStatementHtml';
import { clearLocalExportCache, rememberLocalExportCollection, readConfirmedCollection } from '../services/localExportCache';

const at = (hour: string) => `2026-10-25T${hour}:00:00.000Z`;
const cash = (id: string, hour: string, amount: number, extra: Record<string, unknown> = {}) => ({ id,
  data: { id, workspaceId: 's', storeId: 'store', createdAt: at(hour), amount, currency: 'TRY', type: 'cash_in', ...extra } });
const event = (extra: Partial<DailyJournalEvent> = {}): DailyJournalEvent => ({ id: 'event', storeId: 'store',
  type: 'cash_in', amount: 20, currency: 'TRY', occurredAt: at('12'), sourceId: 'current', ...extra });
const scope = { workspaceId: 's', storeId: 'store', createdAt: at('10'), updatedAt: at('10') };
const customer: Customer = { ...scope, id: 'c', name: 'Customer', isActive: true };
const debt = (extra: Partial<Debt> = {}): Debt => ({ ...scope, id: 'd', customerId: 'c', currency: 'TRY', amount: 70,
  amountExact: '70.00', originalAmount: 100, ...extra });
const payment = (extra: Partial<Payment> = {}): Payment => ({ ...scope, id: 'p', customerId: 'c', amount: { amount: 30, currency: 'TRY' },
  amountExact: '30.00', direction: 'in', method: 'cash', paidAt: at('11'), ...extra });
const statement = (debts = [debt()], payments = [payment()]) => customerStatement({ spaceId: 's', storeId: 'store', customer, debts, payments, credits: [] });

describe('appearance preferences preserve the six existing accents', () => {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + .05) / (values[0] + .05);
  };
  for (const { key } of accentOptions) for (const scheme of ['light', 'dark'] as const) {
    it(`${key}/${scheme} has readable primary, body and secondary text`, () => {
      const value = createTheme(key, scheme);
      for (const [foreground, background] of [[value.primaryForeground, value.primary], [value.foreground, value.background],
        [value.cardForeground, value.card], [value.mutedForeground, value.card], [value.accentForeground, value.accent]]) {
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it('defaults to device appearance and rejects unknown stored values', () => {
    expect(normalizeAppearance('purple')).toBe('system');
    expect(normalizeAppearance(null)).toBe('system');
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('system', null)).toBe('light');
    expect(resolveAppearance('light', 'dark')).toBe('light');
    expect(resolveAppearance('dark', 'light')).toBe('dark');
  });
});

describe('journal drawer explanation is a confirmed-history display, never a new balance', () => {
  it('uses posting order, exact amounts and the event currency, not an edited business date', () => {
    const rows = [cash('first', '10', 100), cash('out', '11', 30, { type: 'cash_out' }), cash('usd', '09', 900, { currency: 'USD' }), cash('current', '12', 20)];
    expect(journalDrawerDetail('s', event({ operationDate: '2020-01-01' }), rows, null))
      .toEqual({ before: '70.00', effect: '20.00', after: '90.00' });
  });
  it('links a settlement to its original cash posting, not its currently edited amount', () => {
    expect(journalDrawerDetail('s', event({ type: 'settlement', sourceId: 'p', amount: 50 }), [cash('current', '12', 30)],
      [{ id: 'p', data: { storeId: 'store', workspaceId: 's', transactionId: 'current' } }]))
      .toEqual({ before: '0.00', effect: '30.00', after: '30.00' });
  });
  it('shows no cash effect for a direct merchant payment', () => {
    expect(journalDrawerDetail('s', event({ type: 'merchant', sourceId: 'direct', cashDeltaExact: '0.00' }), [cash('old', '10', 100)], null))
      .toEqual({ before: '100.00', effect: '0.00', after: '100.00' });
  });
  it('refuses ambiguous simultaneous postings, duplicate ids, wrong spaces and missing sources', () => {
    for (const rows of [[cash('current', '12', 20), cash('other', '12', 10)], [cash('current', '12', 20), cash('current', '12', 20)],
      [cash('current', '12', 20, { workspaceId: 'other' })], [], [cash('current', '12', -20)]]) {
      expect(journalDrawerDetail('s', event(), rows, null)).toBeNull();
    }
    expect(journalDrawerDetail('s', event({ type: 'settlement', sourceId: 'p' }), [cash('current', '12', 20)],
      [{ id: 'p', data: { storeId: 'store', workspaceId: 'other', transactionId: 'current' } }])).toBeNull();
  });
});

describe('customer-facing statement reconciles without rescanning Firebase or inventing opening balances', () => {
  it('shows original debt and current active payments without subtracting payments twice', () => {
    const result = statement();
    expect(result.totals).toEqual([{ currency: 'TRY', opening: '0.00', purchases: '100.00', payments: '30.00', adjustments: '0.00', closing: '70.00' }]);
    expect(result.rows.map(row => row.kind)).toEqual(['purchase', 'payment']);
  });
  it('includes direct payments as ordinary payments without merchant or actor provenance', () => {
    const result = statement([debt()], [payment({ source: 'customer-to-merchant', merchantName: 'PRIVATE_MERCHANT', createdByUserId: 'PRIVATE_USER' })]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(result.rows[1].kind).toBe('payment');
  });
  it('excludes cancelled operations and internal correction debt rows', () => {
    const result = statement([debt({ amount: 0, amountExact: '0.00', cancelled: true }), debt({ id: 'correction', amount: 0, amountExact: '0.00', correctionOfPaymentId: 'p' })],
      [payment({ cancelled: true })]);
    expect(result.rows).toEqual([]);
    expect(result.totals[0].closing).toBe('0.00');
  });
  it('refuses incomplete, duplicate and mixed-space/party records', () => {
    for (const rows of [[debt({ amount: 60, amountExact: '60.00' })], [debt(), debt()], [debt({ workspaceId: 'other' })], [debt({ customerId: 'other' })]]) {
      expect(() => statement(rows)).toThrow('customerStatementIncomplete');
    }
    expect(() => statement([debt()], [payment({ direction: 'out' })])).toThrow('customerStatementIncomplete');
  });
  it('reconciles an overpayment as customer credit without a fake opening balance', () => {
    const result = customerStatement({ spaceId: 's', storeId: 'store', customer,
      debts: [debt({ amount: 0, amountExact: '0.00' })],
      payments: [payment({ amount: { amount: 130, currency: 'TRY' }, amountExact: '130.00' })],
      credits: [{ id: 'credit', workspaceId: 's', storeId: 'store', customerId: 'c', currency: 'TRY', creditExact: '30.00', revision: 1, version: 1 }] });
    expect(result.totals[0]).toMatchObject({ opening: '0.00', closing: '-30.00' });
  });
  it.each(['ar', 'en', 'tr'] as const)('preserves long descriptions and escapes party names in %s PDF HTML', language => {
    const description = 'LONG_BUSINESS_NOTE '.repeat(100);
    const value = statement([debt({ note: description })]);
    const html = merchantStatementHtml({ statement: value, language, merchantName: '<unsafe>', storeName: 'Store', issuedAt: at('12'), kind: 'customer' });
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).not.toContain('<unsafe>');
    const bodyRows = [...html.matchAll(/<tr class="[^"]+">(.*?)<\/tr>/g)].map(match => match[1]);
    const notes = bodyRows.map(row => [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)][2][1]).join('');
    expect(notes).toBe(description);
    expect(bodyRows.filter(row => row.includes('4,500'))).toHaveLength(0);
    expect(bodyRows.filter(row => row.includes('100.00') || row.includes('100,00'))).toHaveLength(1);
  });
});

describe('display/export source completeness and session isolation', () => {
  it('refuses unconfirmed, oversized and different-session snapshots and returns isolated copies', () => {
    clearLocalExportCache();
    const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
    rememberLocalExportCollection('u', 's', 'transactions', [cash('current', '12', 20)], false);
    expect(readConfirmedCollection(scope, 'transactions')).toBeNull();
    rememberLocalExportCollection('u', 's', 'transactions', [cash('current', '12', 20)], true);
    const result = readConfirmedCollection(scope, 'transactions')!;
    result[0].data.amount = 999;
    expect(readConfirmedCollection(scope, 'transactions')![0].data.amount).toBe(20);
    expect(readConfirmedCollection({ ...scope, uid: 'other' }, 'transactions')).toBeNull();
    rememberLocalExportCollection('u', 's', 'transactions', Array.from({ length: 1001 }, (_, index) => cash(String(index), '12', 20)), true);
    expect(readConfirmedCollection(scope, 'transactions')).toBeNull();
    clearLocalExportCache();
    expect(readConfirmedCollection(scope, 'transactions')).toBeNull();
  });
});
