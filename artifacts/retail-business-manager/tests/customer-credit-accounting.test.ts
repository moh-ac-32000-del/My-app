import { describe, expect, it } from 'vitest';
import {
  legacyAmountExact,
  customerBalanceExact,
  planCustomerPayment,
  planCustomerCharge,
  addCustomerExact,
  subtractCustomerExact,
  canonicalCredit,
} from '@/data/customerCreditAccounting';
const debt = (id: string, amount: number, amountExact?: string) => ({
  id,
  amount,
  ...(amountExact !== undefined ? { amountExact } : {}),
  createdAt: '2026-10-19T12:00:00.000Z',
});
describe('customer credits compatible with reduced legacy remaining debts', () => {
  it('uses 100 remaining, not 120 original minus already recorded historical payments', () => {
    expect(customerBalanceExact([debt('d', 100)], '0')).toBe('100.00');
    const result = planCustomerPayment([debt('d', 100)], '0', '130');
    expect(result.updates).toEqual([{ id: 'd', previousAmountExact: '100.00', amountExact: '0.00' }]);
    expect(result.creditExact).toBe('30.00');
    expect(result.balanceExact).toBe('-30.00');
  });
  it('preserves previous customer credit when new money is paid directly to a merchant', () => {
    expect(planCustomerPayment([], '200', '300')).toEqual({
      updates: [],
      creditExact: '500.00',
      balanceExact: '-500.00',
    });
  });
  it.each([
    ['200', '300', '0.00', '100.00'],
    ['450', '300', '150.00', '0.00'],
  ])('consumes credit for a new charge %s/%s', (charge, credit, remaining, nextCredit) => {
    const result = planCustomerCharge(charge, credit);
    expect(result.amountExact).toBe(remaining);
    expect(result.creditExact).toBe(nextCredit);
  });
  it('does not create binary-float dust while applying a 0.30 payment to 0.10 and 0.20', () => {
    const result = planCustomerPayment([debt('a', 0.1), debt('b', 0.2)], '0', '0.30');
    expect(result.updates.map((row) => row.amountExact)).toEqual(['0.00', '0.00']);
    expect(result.creditExact).toBe('0.00');
    expect(result.balanceExact).toBe('0.00');
  });
  it('preserves existing finer precision instead of rounding old records to cents', () => {
    const input = [debt('a', 1.005)];
    const result = planCustomerPayment(input, '0', '1.00');
    expect(result.updates[0].amountExact).toBe('0.005');
    expect(result.balanceExact).toBe('0.005');
    expect(input[0].amount).toBe(1.005);
  });
  it('retains pre-existing floating artifacts rather than silently forgiving them', () => {
    const result = planCustomerPayment([debt('a', 0.30000000000000004)], '0', '0.30');
    expect(result.balanceExact).toBe('0.00000000000000004');
    expect(result.creditExact).toBe('0.00');
  });
  it('prefers a consistent exact field over the approximate numeric compatibility mirror', () => {
    const exact = '9007199254740992.99';
    expect(legacyAmountExact(Number(exact), exact)).toBe(exact);
    expect(() => legacyAmountExact(10, '11.00')).toThrow();
    expect(() => legacyAmountExact(10, 10)).toThrow();
  });
  it('keeps newest-first allocation and stable ID ordering on equal dates', () => {
    const result = planCustomerPayment(
      [{ ...debt('old', 10), createdAt: '2026-10-18T12:00:00.000Z' }, debt('b', 10), debt('a', 10)],
      '0',
      '15',
    );
    expect(result.updates.map((row) => [row.id, row.amountExact])).toEqual([
      ['a', '0.00'],
      ['b', '5.00'],
    ]);
    expect(result.balanceExact).toBe('15.00');
  });
  it('does not consume old customer credit as if it were part of a newly paid amount', () => {
    const result = planCustomerPayment([debt('a', 100)], '20', '130');
    expect(result.creditExact).toBe('50.00');
    expect(result.balanceExact).toBe('-50.00');
  });
  it.each([1e-7, 1e21, Number.MIN_VALUE])(
    'preserves the decimal representation of legacy exponent value %s',
    (value) => {
      expect(Number(legacyAmountExact(value))).toBe(value);
      expect(legacyAmountExact(value)).not.toMatch(/[eE]/);
    },
  );
  it('adds/subtracts exact decimals with different scales and normalizes signed zero', () => {
    expect(addCustomerExact('-200.001', '0.001')).toBe('-200.00');
    expect(subtractCustomerExact('0.01', '0.005')).toBe('0.005');
    expect(canonicalCredit('-0.000')).toBe('0.00');
  });
  it.each(['-1', 'NaN', '1e2', '', '01', '1,2', ' 1'])('rejects malformed/negative credit %s', (credit) => {
    expect(() => planCustomerPayment([], credit, '1')).toThrow();
  });
  it('rejects duplicate/invalid debts and zero/negative new payments', () => {
    expect(() => planCustomerPayment([debt('a', 1), debt('a', 2)], '0', '1')).toThrow();
    expect(() => planCustomerPayment([debt('a', -1)], '0', '1')).toThrow();
    expect(() => planCustomerPayment([debt('a', 1, '2')], '0', '1')).toThrow();
    expect(() => planCustomerPayment([], '0', '0')).toThrow();
    expect(() => planCustomerCharge('0', '1')).toThrow();
  });
});
