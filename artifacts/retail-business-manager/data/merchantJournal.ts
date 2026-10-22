import type { MerchantOperation } from '../types/merchant';
import type { DailyJournalEvent } from '../types/journal';
import { legacyAmountExact, subtractCustomerExact } from './customerCreditAccounting';

type Source = Record<string, any> & { id: string };
export interface MerchantJournalSources {
  transactions: Source[];
  payments: Source[];
  debts: Source[];
}

function invalid(): never {
  throw new Error('invalidMerchantJournalLinks');
}
function amount(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || !/^-?(0|[1-9]\d*)\.\d{2}$/.test(value)) invalid();
  return value;
}

/** One business event, including any linked cash/payment, not a second monetary posting. */
export function merchantJournalEvent(operation: MerchantOperation): DailyJournalEvent {
  const primary = amount(
    operation.action === 'purchase'
      ? operation.totalExact
      : operation.action === 'opening'
        ? operation.amountExact ?? subtractCustomerExact(operation.balanceAfterExact, operation.balanceBeforeExact)
        : operation.amountExact,
  );
  if (!Number.isFinite(Number(primary))) invalid();
  amount(operation.cashDeltaExact);
  return {
    id: `merchant:${operation.id}`,
    storeId: operation.storeId,
    type: 'merchant',
    amount: Number(primary),
    amountExact: primary,
    currency: operation.currency,
    merchantId: operation.merchantId,
    merchantName: operation.merchantName,
    merchantAction: operation.action,
    cashDeltaExact: operation.cashDeltaExact,
    balanceBeforeExact: operation.balanceBeforeExact,
    balanceAfterExact: operation.balanceAfterExact,
    createdByUserId: operation.createdByUserId,
    occurredAt: operation.createdAt,
    sourceId: operation.id,
    ...(operation.note ? { note: operation.note } : {}),
    ...(operation.operationDate ? { operationDate: operation.operationDate } : {}),
    ...(operation.paymentMethodId ? { paymentMethodId: operation.paymentMethodId, paymentMethodName: operation.paymentMethodName } : {}),
    ...(operation.customerId ? { customerId: operation.customerId } : {}),
    ...(operation.customerName ? { customerName: operation.customerName } : {}),
    ...(operation.lines ? { lines: operation.lines.map((line) => ({ ...line })) } : {}),
    ...(operation.reversesOperationId ? { reversesOperationId: operation.reversesOperationId } : {}),
  };
}

/** Validate both directions before suppressing a linked record. Missing/invalid links fail closed.
 * Inputs must cover the same server-confirmed time interval; this function performs no reads/writes.
 */
export function mergeMerchantJournal(
  spaceId: string,
  storeId: string,
  operations: MerchantOperation[],
  legacyEvents: DailyJournalEvent[],
  sources: MerchantJournalSources,
): DailyJournalEvent[] {
  const operationIds = new Map<string, MerchantOperation>();
  const suppressed = new Set<string>();
  const maps = Object.fromEntries(
    Object.entries(sources).map(([key, records]) => {
      const result = new Map<string, Source>();
      for (const record of records) {
        if (result.has(record.id)) invalid();
        result.set(record.id, record);
      }
      return [key, result];
    }),
  ) as Record<keyof MerchantJournalSources, Map<string, Source>>;
  const linked = (op: MerchantOperation, key: keyof MerchantJournalSources, id: string | undefined, prefix: string) => {
    if (!id || id.includes('/')) invalid();
    const record = maps[key].get(id);
    if (
      !record ||
      record.workspaceId !== spaceId ||
      record.storeId !== storeId ||
      record.merchantOperationId !== op.id ||
      (key !== 'debts' && record.merchantId !== op.merchantId) ||
      (key === 'payments' ? record.paidAt : record.createdAt) !== op.createdAt
    )
      invalid();
    const eventId = `${prefix}:${id}`;
    if (suppressed.has(eventId)) invalid();
    suppressed.add(eventId);
    return record;
  };
  for (const op of operations) {
    if (op.workspaceId !== spaceId || op.storeId !== storeId || operationIds.has(op.id)) invalid();
    operationIds.set(op.id, op);
    const cash = amount(op.cashDeltaExact);
    if (cash !== '0.00') {
      if (op.action === 'opening' || op.action === 'directPayment' || cash === '-0.00') invalid();
      if (op.action === 'reverse' ? cash.startsWith('-') : !cash.startsWith('-')) invalid();
      const record = linked(op, 'transactions', op.transactionId, 'transaction');
      if (
        record.currency !== op.currency ||
        record.type !== (cash.startsWith('-') ? 'cash_out' : 'cash_in') ||
        legacyAmountExact(record.amount, record.amountExact) !== cash.replace(/^-/, '')
      )
        invalid();
    } else if (op.transactionId) invalid();
    if (op.action === 'directPayment') {
      const record = linked(op, 'payments', op.paymentId, 'settlement');
      if (
        !op.customerId ||
        record.customerId !== op.customerId ||
        record.direction !== 'in' ||
        record.source !== 'customer-to-merchant' ||
        record.transactionId ||
        record.amount?.currency !== op.currency ||
        legacyAmountExact(record.amount?.amount, record.amountExact) !== op.amountExact
      )
        invalid();
    } else if (op.paymentId) invalid();
    if (op.action === 'reverse' && op.customerId) {
      const record = linked(op, 'debts', op.debtId, 'debt');
      if (
        record.customerId !== op.customerId ||
        record.currency !== op.currency ||
        record.correctionOfMerchantOperationId !== op.reversesOperationId ||
        legacyAmountExact(record.originalAmount) !== op.customerChargeExact
      )
        invalid();
    } else if (op.debtId) invalid();
  }
  for (const [key, records] of Object.entries(sources)) {
    for (const record of records) {
      if (record.merchantOperationId !== undefined) {
        const prefix = key === 'transactions' ? 'transaction' : key === 'payments' ? 'settlement' : 'debt';
        if (!operationIds.has(record.merchantOperationId) || !suppressed.has(`${prefix}:${record.id}`)) invalid();
      }
    }
  }
  return [...legacyEvents.filter((event) => !suppressed.has(event.id)), ...operations.map(merchantJournalEvent)].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}
