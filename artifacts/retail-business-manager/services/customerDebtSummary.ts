import { CURRENCY_OPTIONS } from '@/constants/currencies';
import { calculateDebtTotals } from '@/services/storage';
import type { Debt, MoneyValue } from '@/types/business';

export type CustomerDebtSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; balances: MoneyValue[] };

/** Presentation projection of the existing Firebase debt snapshot, not a new ledger. */
export function selectCustomerDebtSummary(input: {
  debts: Debt[];
  storeId: string;
  activeSpaceId: string | null;
  debtSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
}): CustomerDebtSummaryState {
  if (input.error) return { status: 'error' };
  if (input.isLoading || !input.activeSpaceId || input.debtSpaceId !== input.activeSpaceId) {
    return { status: 'loading' };
  }
  // Do not filter by customer search/visibility: outstanding liabilities must
  // not disappear just because a customer is hidden or a name is searched.
  const totals = calculateDebtTotals(input.debts.filter((debt) => debt.storeId === input.storeId));
  return {
    status: 'ready',
    balances: CURRENCY_OPTIONS.filter(({ code }) => totals[code] > 0)
      .map(({ code }) => ({ currency: code, amount: totals[code] })),
  };
}
