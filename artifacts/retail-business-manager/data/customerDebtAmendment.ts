import { addCustomerExact, canonicalCredit, legacyAmountExact, planCustomerCharge, planCustomerPayment,
  subtractCustomerExact, type RemainingCustomerDebt } from './customerCreditAccounting';

type EditableDebt = RemainingCustomerDebt & { originalAmount?: number; creditAppliedExact?: string };

/** Correct the ORIGINAL charge, not its remaining balance. A reduction first
 * clears this debt, then other debts, then returns excess as customer credit.
 * Existing allocations and all exact arithmetic helpers retain their semantics.
 */
export function planCustomerDebtAmendment(input: {
  target: EditableDebt; debts: RemainingCustomerDebt[]; creditExact: string; principalExact: string;
}) {
  const { target } = input;
  const prior = legacyAmountExact(target.originalAmount ?? target.amount,
    target.originalAmount === undefined ? target.amountExact : undefined);
  const remaining = legacyAmountExact(target.amount, target.amountExact);
  const principal = canonicalCredit(input.principalExact);
  const credit = canonicalCredit(input.creditExact);
  if (subtractCustomerExact(prior, remaining).startsWith('-') ||
    input.debts.filter(row => row.id === target.id).length !== 1) throw new Error('invalidCustomerDebtAmendment');
  const delta = subtractCustomerExact(principal, prior);
  let creditExact = credit;
  let creditAppliedExact = canonicalCredit(target.creditAppliedExact ?? '0.00');
  if (subtractCustomerExact(prior, creditAppliedExact).startsWith('-')) throw new Error('invalidCustomerDebtAmendment');
  const updates: Array<{ id: string; amountExact: string; previousAmountExact: string }> = [];
  if (delta.startsWith('-')) {
    const first = planCustomerPayment([target], '0.00', delta.slice(1));
    updates.push(...first.updates);
    if (first.creditExact !== '0.00') {
      const rest = planCustomerPayment(input.debts.filter(row => row.id !== target.id), credit, first.creditExact);
      updates.push(...rest.updates);
      creditExact = rest.creditExact;
    }
  } else if (delta !== '0.00') {
    const charge = planCustomerCharge(delta, credit);
    creditExact = charge.creditExact;
    creditAppliedExact = addCustomerExact(creditAppliedExact, charge.creditAppliedExact);
    updates.push({ id: target.id, previousAmountExact: remaining, amountExact: addCustomerExact(remaining, charge.amountExact) });
  }
  if (subtractCustomerExact(principal, creditAppliedExact).startsWith('-')) creditAppliedExact = principal;
  return { updates, creditExact, creditAppliedExact, principalExact: principal, deltaExact: delta };
}
