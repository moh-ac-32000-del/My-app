import { CURRENCY_OPTIONS } from '@/constants/currencies';
import { calculateDebtTotals } from '@/services/storage';
import type { Debt, MoneyValue } from '@/types/business';
import type { ExactMoney } from '@/data/merchantAccounting';
import type { CustomerCredit } from '@/types/merchant';
import { projectCustomerAccounts } from '@/data/customerAccountProjection';

export type CustomerDebtSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; balances: Array<MoneyValue | ExactMoney>; customerCredits?: ExactMoney[] };

/** Presentation projection of the existing Firebase debt snapshot, not a new ledger. */
export function selectCustomerDebtSummary(input: {
  debts: Debt[];
  storeId: string;
  activeSpaceId: string | null;
  debtSpaceId: string | null;
  isLoading: boolean;
  error: string | null;
  credits?: CustomerCredit[];
}): CustomerDebtSummaryState {
  if (input.error) return { status: 'error' };
  if (input.isLoading || !input.activeSpaceId || input.debtSpaceId !== input.activeSpaceId) {
    return { status: 'loading' };
  }
  if (input.credits !== undefined) {
    try {
      const { totals } = projectCustomerAccounts(input.debts, input.credits, input.activeSpaceId, input.storeId);
      return { status: 'ready', balances: totals.filter(total => total.payableExact !== '0.00')
        .map(total => ({ currency: total.currency, amount: total.payableExact })),
      customerCredits: totals.filter(total => total.creditExact !== '0.00')
        .map(total => ({ currency: total.currency, amount: total.creditExact })) };
    } catch { return { status: 'error' }; }
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
