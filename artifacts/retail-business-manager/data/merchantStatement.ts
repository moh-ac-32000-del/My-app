import { addCustomerExact, subtractCustomerExact } from './customerCreditAccounting';
import { localMerchantDate, merchantOperationDate } from './merchantSettings';
import type { CurrencyCode } from '../constants/currencies';
import type { MerchantOperation } from '../types/merchant';

export interface StatementProof {
  currency: CurrencyCode;
  revision: number;
  balanceExact: string;
}
export interface MerchantStatement {
  rows: Array<{
    date: string;
    recordedDate: string;
    kind: 'purchase' | 'payment' | 'opening' | 'correctionPurchase' | 'correctionPayment' | 'correctionOpening';
    description: string;
    quantity: string;
    unitPrice: string;
    method: string;
    amount: string;
    currency: CurrencyCode;
    corrected: boolean;
  }>;
  totals: Array<{
    currency: CurrencyCode;
    opening: string;
    purchases: string;
    payments: string;
    adjustments: string;
    closing: string;
  }>;
}
const fail = () => {
  throw new Error('merchantStatementIncomplete');
};
const negative = (value: string) => subtractCustomerExact('0.00', value);

/** Whitelist projection: never spread a financial record into a merchant-facing export.
 * Periods use actual recording days; edited documentary dates never backpost the ledger.
 * All history must be complete against a freshly authorized server revision proof.
 */
export function merchantStatement(input: {
  spaceId: string;
  storeId: string;
  merchantId: string;
  operations: MerchantOperation[];
  proof: StatementProof[];
  from?: string;
  to?: string;
}): MerchantStatement {
  if (input.from) merchantOperationDate(input.from);
  if (input.to) merchantOperationDate(input.to);
  if (input.from && input.to && input.from > input.to) throw new Error('merchantStatementPeriod');
  const ids = new Map<string, MerchantOperation>();
  for (const operation of input.operations) {
    if (
      ids.has(operation.id) ||
      operation.workspaceId !== input.spaceId ||
      operation.storeId !== input.storeId ||
      operation.merchantId !== input.merchantId ||
      !Number.isFinite(Date.parse(operation.createdAt))
    )
      fail();
    ids.set(operation.id, operation);
  }
  for (const operation of ids.values()) {
    if (
      operation.reversedByOperationId &&
      ids.get(operation.reversedByOperationId)?.reversesOperationId !== operation.id
    )
      fail();
    if (
      operation.action === 'reverse' &&
      ids.get(operation.reversesOperationId ?? '')?.reversedByOperationId !== operation.id
    )
      fail();
  }
  if (new Set(input.proof.map((row) => row.currency)).size !== input.proof.length) fail();
  for (const proof of input.proof) {
    const operations = input.operations.filter((row) => row.currency === proof.currency);
    if (!Number.isSafeInteger(proof.revision) || proof.revision < 1 || operations.length !== proof.revision) fail();
    const delta = operations.reduce(
      (value, row) => addCustomerExact(value, subtractCustomerExact(row.balanceAfterExact, row.balanceBeforeExact)),
      '0.00',
    );
    if (subtractCustomerExact(delta, proof.balanceExact) !== '0.00') fail();
  }
  if (input.operations.some((row) => !input.proof.some((proof) => proof.currency === row.currency))) fail();
  const result: MerchantStatement = {
    rows: [],
    totals: input.proof.map((row) => ({
      currency: row.currency,
      opening: '0.00',
      purchases: '0.00',
      payments: '0.00',
      adjustments: '0.00',
      closing: '0.00',
    })),
  };
  const sorted = [...ids.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const operation of sorted) {
    const recordedDate = localMerchantDate(new Date(operation.createdAt));
    const totals = result.totals.find((row) => row.currency === operation.currency)!;
    const delta = subtractCustomerExact(operation.balanceAfterExact, operation.balanceBeforeExact);
    if (input.from && recordedDate < input.from) {
      totals.opening = addCustomerExact(totals.opening, delta);
      continue;
    }
    if (input.to && recordedDate > input.to) continue;
    const base = {
      date: operation.operationDate ?? recordedDate,
      recordedDate,
      currency: operation.currency,
      method: operation.paymentMethodName ?? '',
      corrected: !!operation.reversedByOperationId,
    };
    let purchases = '0.00',
      payments = '0.00',
      adjustments = '0.00';
    if (operation.action === 'purchase') {
      if (!operation.totalExact || !operation.lines?.length || operation.paidExact === undefined) fail();
      purchases = operation.totalExact!;
      payments = operation.paidExact!;
      let lineSum = '0.00';
      for (const line of operation.lines!) {
        lineSum = addCustomerExact(lineSum, line.totalExact);
        result.rows.push({
          ...base,
          kind: 'purchase',
          description: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.totalExact,
        });
      }
      if (subtractCustomerExact(lineSum, purchases) !== '0.00') fail();
      if (payments !== '0.00')
        result.rows.push({ ...base, kind: 'payment', description: '', quantity: '', unitPrice: '', amount: payments });
    } else if (operation.action === 'payment' || operation.action === 'directPayment') {
      if (!operation.amountExact) fail();
      payments = operation.amountExact!;
      // Direct payments are deliberately indistinguishable from other payments in this public projection.
      result.rows.push({ ...base, kind: 'payment', description: '', quantity: '', unitPrice: '', amount: payments });
    } else if (operation.action === 'opening') {
      adjustments = delta;
      result.rows.push({ ...base, kind: 'opening', description: '', quantity: '', unitPrice: '', amount: delta });
    } else {
      const original = ids.get(operation.reversesOperationId ?? '');
      if (
        !original ||
        original.action === 'reverse' ||
        original.currency !== operation.currency ||
        original.reversedByOperationId !== operation.id ||
        subtractCustomerExact(
          delta,
          negative(subtractCustomerExact(original.balanceAfterExact, original.balanceBeforeExact)),
        ) !== '0.00'
      )
        fail();
      if (original!.action === 'purchase') {
        if (!original!.totalExact || original!.paidExact === undefined) fail();
        purchases = negative(original!.totalExact!);
        payments = negative(original!.paidExact!);
        result.rows.push({
          ...base,
          kind: 'correctionPurchase',
          description: '',
          quantity: '',
          unitPrice: '',
          amount: purchases,
        });
        if (payments !== '0.00')
          result.rows.push({
            ...base,
            kind: 'correctionPayment',
            description: '',
            quantity: '',
            unitPrice: '',
            amount: payments,
          });
      } else if (original!.action === 'opening') {
        adjustments = delta;
        result.rows.push({
          ...base,
          kind: 'correctionOpening',
          description: '',
          quantity: '',
          unitPrice: '',
          amount: delta,
        });
      } else {
        if (!original!.amountExact) fail();
        payments = negative(original!.amountExact!);
        result.rows.push({
          ...base,
          kind: 'correctionPayment',
          description: '',
          quantity: '',
          unitPrice: '',
          amount: payments,
        });
      }
    }
    if (
      subtractCustomerExact(addCustomerExact(subtractCustomerExact(purchases, payments), adjustments), delta) !== '0.00'
    )
      fail();
    totals.purchases = addCustomerExact(totals.purchases, purchases);
    totals.payments = addCustomerExact(totals.payments, payments);
    totals.adjustments = addCustomerExact(totals.adjustments, adjustments);
  }
  for (const totals of result.totals)
    totals.closing = addCustomerExact(
      addCustomerExact(totals.opening, subtractCustomerExact(totals.purchases, totals.payments)),
      totals.adjustments,
    );
  return result;
}
