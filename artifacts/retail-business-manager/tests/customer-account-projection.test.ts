import { describe, expect, it } from 'vitest';
import { projectCustomerAccounts } from '@/data/customerAccountProjection';
import { selectCustomerDebtSummary } from '@/services/customerDebtSummary';
import type { Debt } from '@/types/business';
import type { CustomerCredit } from '@/types/merchant';

const debt: Debt = {
  id: 'debt',
  workspaceId: 's',
  storeId: 'store',
  customerId: 'c',
  currency: 'TRY',
  amount: 100,
  originalAmount: 120,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};
const credit: CustomerCredit = {
  id: 'credit',
  workspaceId: 's',
  storeId: 'store',
  customerId: 'c',
  currency: 'TRY',
  creditExact: '30.00',
  revision: 1,
  version: 1,
};
describe('signed customer account presentation', () => {
  it('uses remaining debt rather than subtracting old payments a second time', () => {
    expect(projectCustomerAccounts([debt], [], 's', 'store').accounts).toEqual([
      { customerId: 'c', currency: 'TRY', balanceExact: '100.00' },
    ]);
  });
  it('shows credit without requiring an outstanding debt record', () => {
    expect(projectCustomerAccounts([], [credit], 's', 'store').accounts).toEqual([
      { customerId: 'c', currency: 'TRY', balanceExact: '-30.00' },
    ]);
  });
  it('separates customer debts from credits instead of netting different customers', () => {
    const result = projectCustomerAccounts([debt], [{ ...credit, customerId: 'other' }], 's', 'store');
    expect(result.totals).toEqual([{ currency: 'TRY', payableExact: '100.00', creditExact: '30.00' }]);
  });
  it('uses exact authoritative amounts without rounding a legacy fraction', () => {
    const result = projectCustomerAccounts(
      [{ ...debt, amount: 1, amountExact: '1.0000000000000000001' }],
      [],
      's',
      'store',
    );
    expect(result.accounts[0].balanceExact).toBe('1.0000000000000000001');
  });
  it('keeps currencies independent', () => {
    const result = projectCustomerAccounts([debt], [{ ...credit, currency: 'USD' }], 's', 'store');
    expect(result.totals).toEqual([
      { currency: 'TRY', payableExact: '100.00', creditExact: '0.00' },
      { currency: 'USD', payableExact: '0.00', creditExact: '30.00' },
    ]);
  });
  it.each([
    { debts: [debt, debt], credits: [] },
    { debts: [{ ...debt, workspaceId: 'other' }], credits: [] },
    { debts: [debt], credits: [credit, credit] },
    { debts: [], credits: [{ ...credit, storeId: 'other' }] },
  ])('fails closed on duplicate or cross-scope account data', (input) => {
    expect(() => projectCustomerAccounts(input.debts, input.credits, 's', 'store')).toThrow();
  });
  it('returns exact separate totals for the customer page summary', () => {
    expect(
      selectCustomerDebtSummary({
        debts: [debt],
        credits: [{ ...credit, customerId: 'other' }],
        activeSpaceId: 's',
        debtSpaceId: 's',
        storeId: 'store',
        isLoading: false,
        error: null,
      }),
    ).toEqual({
      status: 'ready',
      balances: [{ currency: 'TRY', amount: '100.00' }],
      customerCredits: [{ currency: 'TRY', amount: '30.00' }],
    });
  });
  it('does not display invalid credit data as a successful zero', () => {
    expect(
      selectCustomerDebtSummary({
        debts: [debt],
        credits: [{ ...credit, storeId: 'foreign' }],
        activeSpaceId: 's',
        debtSpaceId: 's',
        storeId: 'store',
        isLoading: false,
        error: null,
      }),
    ).toEqual({ status: 'error' });
  });
});
