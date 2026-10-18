import { describe, expect, it } from 'vitest';
import { closingCashBalances } from '../functions/src/closingCashBalances';
import { calculateUsedCurrencyBalances } from '@/services/storage';
import type { Transaction } from '@/types/business';

describe('server closing cash snapshot', () => {
  it('uses the existing cash balance semantics, including negative and zero balances, with no conversion', () => {
    const movements = [
      { type: 'cash_in', amount: 100, currency: 'TRY' },
      { type: 'cash_out', amount: 30, currency: 'TRY' },
      { type: 'cash_out', amount: 20, currency: 'USD' },
      { type: 'cash_in', amount: 10, currency: 'EUR' },
      { type: 'cash_out', amount: 10, currency: 'EUR' },
      { type: 'cash_in', amount: 0.1, currency: 'SAR' },
      { type: 'cash_in', amount: 0.2, currency: 'SAR' },
    ];
    expect(closingCashBalances(movements)).toEqual(calculateUsedCurrencyBalances(movements as Transaction[]));
    expect(closingCashBalances(movements).slice(0, 3)).toEqual([
      { currency: 'TRY', amount: 70 }, { currency: 'USD', amount: -20 }, { currency: 'EUR', amount: 0 },
    ]);
  });

  it('distinguishes an empty recorded snapshot from a legacy missing snapshot', () => {
    expect(closingCashBalances([])).toEqual([]);
  });

  it.each([
    { type: 'debt', amount: 10, currency: 'TRY' },
    { type: 'cash_in', amount: NaN, currency: 'TRY' },
    { type: 'cash_in', amount: -10, currency: 'TRY' },
    { type: 'cash_in', amount: 10, currency: 'BAD' },
    { type: 'cash_in', amount: '10', currency: 'TRY' },
  ])('fails closed on invalid cash records rather than saving a false balance: %j', (record) => {
    expect(() => closingCashBalances([record])).toThrow('Invalid cash record');
  });

  it('rejects non-finite totals', () => {
    expect(() => closingCashBalances([
      { type: 'cash_in', amount: Number.MAX_VALUE, currency: 'TRY' },
      { type: 'cash_in', amount: Number.MAX_VALUE, currency: 'TRY' },
    ])).toThrow('Closing balance is not finite');
  });
});
