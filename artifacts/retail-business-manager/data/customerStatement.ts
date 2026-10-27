import type { Customer, Debt, Payment } from '../types/business';
import type { CustomerCredit } from '../types/merchant';
import type { MerchantStatement } from './merchantStatement';
import { addCustomerExact, customerBalanceExact, legacyAmountExact, subtractCustomerExact } from './customerCreditAccounting';
import { isCurrencyCode } from '../constants/currencies';

/** Current-state statement, not an as-of historical reconstruction. Never invent an opening to make history reconcile. */
export function customerStatement(input: { spaceId: string; storeId: string; customer: Customer;
  debts: Debt[]; payments: Payment[]; credits: CustomerCredit[]; paymentMethodLabels?: ReadonlyMap<string, string> }): MerchantStatement {
  const fail = (): never => { throw new Error('customerStatementIncomplete'); };
  if (input.customer.storeId !== input.storeId) fail();
  const rows: MerchantStatement['rows'] = [], totals: MerchantStatement['totals'] = [];
  const ids = new Set<string>();
  for (const [kind, source] of [['debt', input.debts], ['payment', input.payments], ['credit', input.credits]] as const) {
    for (const row of source) {
      if (row.customerId !== input.customer.id || row.workspaceId !== input.spaceId || row.storeId !== input.storeId || ids.has(`${kind}:${row.id}`)) fail();
      ids.add(`${kind}:${row.id}`);
    }
  }
  const currencies = new Set([...input.debts.map(row => row.currency), ...input.payments.map(row => row.amount.currency), ...input.credits.map(row => row.currency)]);
  const dated: Array<{ at: string; row: MerchantStatement['rows'][number] }> = [];
  for (const currency of currencies) {
    if (!isCurrencyCode(currency)) fail();
    const debts = input.debts.filter(row => row.currency === currency), payments = input.payments.filter(row => row.amount.currency === currency);
    const credits = input.credits.filter(row => row.currency === currency);
    if (credits.length > 1) fail();
    let purchases = '0.00', paid = '0.00';
    for (const debt of debts) {
      if (debt.cancelled || debt.correctionOfPaymentId || debt.correctionOfMerchantOperationId) continue;
      const amount = debt.originalAmount === undefined ? legacyAmountExact(debt.amount, debt.amountExact) : legacyAmountExact(debt.originalAmount);
      purchases = addCustomerExact(purchases, amount);
      dated.push({ at: debt.createdAt, row: { date: debt.operationDate ?? debt.createdAt.slice(0, 10), recordedDate: debt.createdAt.slice(0, 10),
        currency, kind: 'purchase', description: debt.note ?? '', quantity: '', unitPrice: '', method: '', amount, corrected: false } });
    }
    for (const payment of payments) {
      if (payment.cancelled) continue;
      // Outgoing generic payments are not proof of a customer-credit refund; fail rather than silently omit them.
      if (payment.direction !== 'in') fail();
      const amount = legacyAmountExact(payment.amount.amount, payment.amountExact);
      paid = addCustomerExact(paid, amount);
      dated.push({ at: payment.paidAt, row: { date: payment.operationDate ?? payment.paidAt.slice(0, 10), recordedDate: payment.paidAt.slice(0, 10),
        currency, kind: 'payment', description: '', quantity: '', unitPrice: '', method: payment.method,
        ...(input.paymentMethodLabels?.has(payment.id) ? { methodLabel: input.paymentMethodLabels.get(payment.id)! } : {}), amount, corrected: false } });
    }
    const closing = subtractCustomerExact(purchases, paid);
    if (closing !== customerBalanceExact(debts, credits[0]?.creditExact ?? '0.00')) fail();
    totals.push({ currency, opening: '0.00', purchases, payments: paid, adjustments: '0.00', closing });
  }
  if (dated.some(value => !Number.isFinite(Date.parse(value.at)))) fail();
  dated.sort((a, b) => a.at.localeCompare(b.at));
  rows.push(...dated.map(value => value.row));
  return { rows, totals: totals.sort((a, b) => a.currency.localeCompare(b.currency)) };
}
