import { describe, expect, it } from 'vitest';
import { selectCustomerDebtSummary } from '@/services/customerDebtSummary';
import { calculateDebtTotals } from '@/services/storage';
import { translate } from '@/constants/i18n';
import type { Debt } from '@/types/business';

const debt: Debt = {
  id: 'debt-a', storeId: 'store-a', workspaceId: 'space-a', customerId: 'customer-a',
  currency: 'TRY', amount: 70, originalAmount: 100,
  createdAt: '2026-10-18T10:00:00.000Z', updatedAt: '2026-10-18T10:00:00.000Z',
};
const input = { debts: [debt], storeId: 'store-a', activeSpaceId: 'space-a', debtSpaceId: 'space-a', isLoading: false, error: null };

describe('customer page outstanding debt summary', () => {
  it('totals remaining amounts across all customers separately for every supported currency', () => {
    const debts: Debt[] = [debt, { ...debt, id: 'b', customerId: 'customer-b', amount: 30 },
      ...(['USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP'] as const).map((currency, index) => ({ ...debt, id: currency, currency, amount: index + 1 })),
    ];
    const before = JSON.stringify(debts);
    const result = selectCustomerDebtSummary({ ...input, debts });
    expect(result).toEqual({ status: 'ready', balances: [
      { currency: 'TRY', amount: 100 }, { currency: 'USD', amount: 1 }, { currency: 'EUR', amount: 2 },
      { currency: 'GBP', amount: 3 }, { currency: 'SAR', amount: 4 }, { currency: 'AED', amount: 5 }, { currency: 'SYP', amount: 6 },
    ] });
    const totals = calculateDebtTotals(debts);
    if (result.status === 'ready') result.balances.forEach(({ currency, amount }) => expect(amount).toBe(totals[currency]));
    expect(JSON.stringify(debts)).toBe(before);
  });

  it('uses current remaining debt, updates after settlement, and omits paid-off currencies', () => {
    expect(selectCustomerDebtSummary(input)).toEqual({ status: 'ready', balances: [{ currency: 'TRY', amount: 70 }] });
    expect(selectCustomerDebtSummary({ ...input, debts: [{ ...debt, amount: 20 }] }))
      .toEqual({ status: 'ready', balances: [{ currency: 'TRY', amount: 20 }] });
    expect(selectCustomerDebtSummary({ ...input, debts: [{ ...debt, amount: 0, settledAt: debt.updatedAt }] }))
      .toEqual({ status: 'ready', balances: [] });
  });

  it('shows a ready empty state only after a successful empty snapshot', () => {
    expect(selectCustomerDebtSummary({ ...input, debts: [] })).toEqual({ status: 'ready', balances: [] });
  });

  it('does not mix another store into the total', () => {
    expect(selectCustomerDebtSummary({ ...input, debts: [debt, { ...debt, storeId: 'store-b', amount: 999 }] }))
      .toEqual({ status: 'ready', balances: [{ currency: 'TRY', amount: 70 }] });
  });

  it('does not depend on customer search or hide debts whose customer is not visible', () => {
    expect(selectCustomerDebtSummary({ ...input, debts: [debt, { ...debt, id: 'hidden', customerId: 'hidden-customer', amount: 10 }] }))
      .toEqual({ status: 'ready', balances: [{ currency: 'TRY', amount: 80 }] });
  });

  it.each([
    { isLoading: true }, { activeSpaceId: null }, { debtSpaceId: null },
    { activeSpaceId: 'space-b' },
  ])('hides stale amounts while loading or switching workspace: %j', (changed) => {
    expect(selectCustomerDebtSummary({ ...input, ...changed })).toEqual({ status: 'loading' });
  });

  it('never represents listener failure as a zero balance', () => {
    expect(selectCustomerDebtSummary({ ...input, debts: [], error: 'permission-denied' })).toEqual({ status: 'error' });
  });

  it.each(['ar', 'en', 'tr'] as const)('has translated labels and distinct empty/error messages in %s', (language) => {
    const keys = ['customerDebtSummaryTitle', 'customerDebtSummaryHint', 'customerDebtSummaryEmpty', 'customerDebtSummaryError'] as const;
    keys.forEach((key) => expect(translate(key, language)).toBeTruthy());
    expect(translate(keys[2], language)).not.toBe(translate(keys[3], language));
  });
});
