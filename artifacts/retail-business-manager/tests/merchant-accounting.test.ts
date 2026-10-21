import { describe, expect, it } from 'vitest';
import {
  calculateMerchantPurchase,
  projectPartyCharge,
  projectPartyPayment,
  projectMerchantPurchase,
  projectCustomerToMerchantPayment,
  summarizeMerchantBalances,
  type PartyBalance,
} from '@/data/merchantAccounting';

const merchant = (balance: string, patch: Partial<PartyBalance> = {}): PartyBalance => ({
  workspaceId: 'space-a',
  partyId: 'merchant-a',
  kind: 'merchant',
  currency: 'TRY',
  balance,
  ...patch,
});
const customer = (balance: string, patch: Partial<PartyBalance> = {}): PartyBalance =>
  merchant(balance, { kind: 'customer', partyId: 'customer-a', ...patch });
const money = (amount: string) => ({ amount, currency: 'TRY' as const });
const lines = [
  { quantity: '5', unitPrice: '400' },
  { quantity: '10', unitPrice: '150' },
  { quantity: '20', unitPrice: '50' },
];

describe('approved merchant accounting, pure projections only', () => {
  it('calculates the 4,500 purchase and linked 1,000 cash payment exactly', () => {
    const result = projectMerchantPurchase(merchant('0'), lines, money('1000'), 'cash');
    expect(result.lineTotals.map((line) => line.amount)).toEqual(['2000.00', '1500.00', '1000.00']);
    expect(result.total.amount).toBe('4500.00');
    expect(result.balance.balance).toBe('3500.00');
    expect(result.cashDelta.amount).toBe('-1000.00');
  });
  it('records the numerical result of a fully paid purchase without creating debt', () => {
    const result = projectMerchantPurchase(merchant('0'), lines, money('4500'), 'cash');
    expect(result.balance.balance).toBe('0.00');
    expect(result.cashDelta.amount).toBe('-4500.00');
  });
  it('allows an overpayment to produce merchant credit and deducts the actual cash only once', () => {
    const result = projectPartyPayment(merchant('1000'), money('1300'), 'cash');
    expect(result.balance.balance).toBe('-300.00');
    expect(result.cashDelta.amount).toBe('-1300.00');
  });
  it.each([
    ['200', '-100.00'],
    ['450', '150.00'],
  ])('consumes merchant credit with a new %s charge without cash', (charge, expected) => {
    const result = projectPartyCharge(merchant('-300'), money(charge));
    expect(result.balance.balance).toBe(expected);
    expect(result.cashDelta.amount).toBe('0.00');
  });
  it('preserves customer overpayments and consumes that credit on a later charge', () => {
    const paid = projectPartyPayment(customer('500'), money('800'), 'cash');
    expect(paid.balance.balance).toBe('-300.00');
    expect(paid.cashDelta.amount).toBe('800.00');
    const charged = projectPartyCharge(paid.balance, money('200'));
    expect(charged.balance.balance).toBe('-100.00');
    expect(charged.cashDelta.amount).toBe('0.00');
  });
  it('does not confuse an external payment with drawer cash', () => {
    expect(projectPartyPayment(merchant('500'), money('800'), 'external').cashDelta.amount).toBe('0.00');
    const purchase = projectMerchantPurchase(merchant('0'), lines, money('1000'), 'external');
    expect(purchase.balance.balance).toBe('3500.00');
    expect(purchase.cashDelta.amount).toBe('0.00');
  });
  it('direct new payment retains previous customer credit and reduces merchant balance with no cash', () => {
    const result = projectCustomerToMerchantPayment(customer('-200'), merchant('100'), money('300'));
    expect(result.customer.balance).toBe('-500.00');
    expect(result.merchant.balance).toBe('-200.00');
    expect(result.cashDelta.amount).toBe('0.00');
  });
  it('direct payment can overpay both parties without touching the drawer', () => {
    const result = projectCustomerToMerchantPayment(customer('500'), merchant('300'), money('700'));
    expect(result.customer.balance).toBe('-200.00');
    expect(result.merchant.balance).toBe('-400.00');
    expect(result.cashDelta.amount).toBe('0.00');
  });
  it('keeps merchant payables, credits and net separate, without mutating accounts', () => {
    const input = [merchant('1000'), merchant('-300', { partyId: 'b' }), merchant('500', { partyId: 'c' })];
    expect(summarizeMerchantBalances('space-a', input)).toEqual([
      { currency: 'TRY', payable: '1500.00', credit: '300.00', net: '1200.00' },
    ]);
    expect(input.map((row) => row.balance)).toEqual(['1000', '-300', '500']);
  });
  it('separates currencies rather than offsetting foreign balances', () => {
    expect(summarizeMerchantBalances('space-a', [merchant('100'), merchant('-300', { currency: 'USD' })])).toEqual([
      { currency: 'TRY', payable: '100.00', credit: '0.00', net: '100.00' },
      { currency: 'USD', payable: '0.00', credit: '300.00', net: '-300.00' },
    ]);
  });
  it('rejects duplicate party/currency projections and different-workspace totals', () => {
    expect(() => summarizeMerchantBalances('space-a', [merchant('100'), merchant('200')])).toThrow();
    expect(() => summarizeMerchantBalances('space-b', [merchant('100')])).toThrow();
  });
  it('uses approved per-line rounding, not rounding just the final sum', () => {
    const result = calculateMerchantPurchase(
      [
        { quantity: '1', unitPrice: '0.005' },
        { quantity: '1', unitPrice: '0.005' },
      ],
      'TRY',
    );
    expect(result.lineTotals.map((line) => line.amount)).toEqual(['0.01', '0.01']);
    expect(result.total.amount).toBe('0.02');
    expect(calculateMerchantPurchase([{ quantity: '0.333', unitPrice: '1.2500' }], 'TRY').total.amount).toBe('0.42');
  });
  it.each([
    ['0.0049', '0.00'],
    ['0.0050', '0.01'],
    ['0.0051', '0.01'],
    ['1.9999', '2.00'],
  ])('rounds %s half-up to %s', (unitPrice, expected) => {
    expect(calculateMerchantPurchase([{ quantity: '1', unitPrice }], 'TRY').total.amount).toBe(expected);
  });
  it('is exact beyond binary floating-point integer precision and returns JSON-safe strings', () => {
    const result = projectPartyPayment(merchant('9007199254740993.01'), money('0.02'), 'external');
    expect(result.balance.balance).toBe('9007199254740992.99');
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(calculateMerchantPurchase([{ quantity: '3', unitPrice: '0.1' }], 'TRY').total.amount).toBe('0.30');
  });
  it.each(['0', '-1', '1.001', 'NaN', 'Infinity', '1e2', ' 1', '+1', '01', '1,25'])(
    'rejects invalid payment %s without rounding it',
    (value) => {
      expect(() => projectPartyPayment(merchant('100'), money(value), 'cash')).toThrow();
    },
  );
  it.each([
    { quantity: '0', unitPrice: '1' },
    { quantity: '0.0001', unitPrice: '1' },
    { quantity: '1', unitPrice: '0.00001' },
    { quantity: '1', unitPrice: '-1' },
  ])('rejects invalid item precision/sign: %j', (line) => {
    expect(() => calculateMerchantPurchase([line], 'TRY')).toThrow();
  });
  it('rejects cross-workspace/currency transfer, wrong party kinds and unknown payment source', () => {
    expect(() =>
      projectCustomerToMerchantPayment(customer('500'), merchant('300', { workspaceId: 'other' }), money('100')),
    ).toThrow();
    expect(() =>
      projectCustomerToMerchantPayment(customer('500'), merchant('300', { currency: 'USD' }), money('100')),
    ).toThrow();
    expect(() => projectCustomerToMerchantPayment(merchant('500'), merchant('300'), money('100'))).toThrow();
    expect(() => projectPartyPayment(merchant('500'), { amount: '100', currency: 'USD' }, 'cash')).toThrow();
    expect(() => projectPartyPayment(merchant('500'), money('100'), 'bank' as never)).toThrow();
  });
  it('does not coerce JS numbers or malformed scopes into financial input', () => {
    expect(() => projectPartyPayment(merchant('1'), money(0.1 as never), 'cash')).toThrow();
    expect(() => projectPartyPayment(merchant('1', { workspaceId: '' }), money('0.1'), 'cash')).toThrow();
    expect(() => calculateMerchantPurchase([], 'TRY')).toThrow();
    expect(() => calculateMerchantPurchase(lines, 'INVALID' as never)).toThrow();
    expect(() => calculateMerchantPurchase(new Array(1), 'TRY')).toThrow();
    expect(() => projectPartyPayment(merchant('1.005'), money('0.1'), 'cash')).toThrow();
    expect(() => calculateMerchantPurchase([{ quantity: '9'.repeat(75), unitPrice: '9'.repeat(75) }], 'TRY')).toThrow();
  });
});
