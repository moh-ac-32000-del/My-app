import { describe, expect, it } from 'vitest';
import { planCustomerDebtAmendment } from '../data/customerDebtAmendment';
import { customerBalanceExact, legacyAmountExact, subtractCustomerExact } from '../data/customerCreditAccounting';

const debt = (amount: number, originalAmount = 100) => ({ id: 'target', amount, originalAmount, createdAt: '2026-10-01T12:00:00Z' });
function plan(amount: number, original: number, principal: string, credit = '0.00', others: ReturnType<typeof debt>[] = []) {
  const target = debt(amount, original), debts = [target, ...others];
  const value = planCustomerDebtAmendment({ target, debts, principalExact: principal, creditExact: credit });
  const after = debts.map(row => { const changed = value.updates.find(update => update.id === row.id);
    return changed ? { ...row, amount: Number(changed.amountExact), amountExact: changed.amountExact } : row; });
  expect(subtractCustomerExact(customerBalanceExact(after, value.creditExact), customerBalanceExact(debts, credit))).toBe(value.deltaExact);
  return value;
}
describe('customer charge corrections use the original charge, not the remaining debt', () => {
  it('reduces a partially paid charge without subtracting its payment twice', () => {
    expect(plan(40, 100, '80.00')).toMatchObject({ updates: [{ id: 'target', amountExact: '20.00' }], creditExact: '0.00' });
  });
  it('returns payment excess as credit when the corrected principal is less than already paid', () => {
    expect(plan(40, 100, '30.00')).toMatchObject({ updates: [{ id: 'target', amountExact: '0.00' }], creditExact: '30.00' });
  });
  it('cancels a fully paid charge by preserving the cash received and returning credit', () => {
    expect(plan(0, 100, '0.00')).toMatchObject({ creditExact: '100.00', deltaExact: '-100.00' });
  });
  it('clears the target before other debts, then returns only the excess as credit', () => {
    const other = { ...debt(50, 50), id: 'newer', createdAt: '2026-10-20T12:00:00Z' };
    expect(plan(40, 100, '0.00', '0.00', [other])).toMatchObject({ creditExact: '10.00',
      updates: [{ id: 'target', amountExact: '0.00' }, { id: 'newer', amountExact: '0.00' }] });
  });
  it('uses existing credit first when increasing the original charge', () => {
    expect(plan(0, 100, '150.00', '20.00')).toMatchObject({ creditExact: '0.00', creditAppliedExact: '20.00',
      updates: [{ id: 'target', amountExact: '30.00' }] });
  });
  it('does not rewrite legacy precision for a metadata-only edit', () => {
    const target = { ...debt(1, 5), amountExact: '1.0000000000000000001' };
    const value = planCustomerDebtAmendment({ target, debts: [target], principalExact: '5.00', creditExact: '0.00' });
    expect(value.updates).toEqual([]);
    expect(legacyAmountExact(target.amount, target.amountExact)).toBe('1.0000000000000000001');
  });
  it('rejects corrupted principal/remaining and impossible consumed credit', () => {
    for (const target of [debt(101, 100), { ...debt(0, 100), creditAppliedExact: '101.00' }])
      expect(() => planCustomerDebtAmendment({ target, debts: [target], principalExact: '50.00', creditExact: '0.00' })).toThrow();
  });
});
