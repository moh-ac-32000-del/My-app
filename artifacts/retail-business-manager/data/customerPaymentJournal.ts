import { legacyAmountExact } from './customerCreditAccounting';

/** Corrections already append current-period cash differences. The original
 * journal entry must retain its posted amount, not apply the difference twice.
 * This is a projection only; account balances still use the current payment.
 */
export function customerPaymentJournalAmount(payment: {
  amount?: { amount?: unknown }; transactionId?: unknown; cashBaseAmountExact?: unknown;
}): number {
  if (payment.cashBaseAmountExact === undefined) return payment.amount?.amount as number;
  const base = payment.cashBaseAmountExact;
  if (typeof payment.transactionId !== 'string' || !payment.transactionId ||
    typeof base !== 'string' || base === '0.00' || legacyAmountExact(Number(base), base) !== base) {
    throw new Error('invalidPaymentPostingAmount');
  }
  return Number(base);
}
