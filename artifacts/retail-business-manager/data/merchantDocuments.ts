import { isCurrencyCode } from '../constants/currencies';
import { canonicalCredit } from './customerCreditAccounting';
import { merchantOperationDate } from './merchantSettings';
import type { Merchant, MerchantBalance, MerchantOperation, CustomerCredit } from '@/types/merchant';

function invalid(): never {
  throw new Error('invalidCloudMerchantDocument');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, required = true): string {
  if (typeof value !== 'string' || (required && !value.trim())) invalid();
  return value;
}
function scope(id: string, value: unknown, spaceId: string, storeId: string) {
  const record = object(value);
  if (record.id !== id || record.workspaceId !== spaceId || record.storeId !== storeId) invalid();
  return record;
}
function exact(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || !/^-?(0|[1-9]\d*)\.\d{2}$/.test(value)) invalid();
  return value;
}
function revision(value: Record<string, unknown>) {
  if (value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) invalid();
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}
export function merchantFromDocument(id: string, value: unknown, spaceId: string, storeId: string): Merchant {
  const record = scope(id, value, spaceId, storeId);
  if (typeof record.isActive !== 'boolean') invalid();
  return {
    id,
    workspaceId: spaceId,
    storeId,
    name: text(record.name),
    phone: text(record.phone, false),
    ...(record.address !== undefined ? { address: text(record.address, false) } : {}),
    ...(record.notes !== undefined ? { notes: text(record.notes, false) } : {}),
    isActive: record.isActive,
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt),
    createdByUserId: text(record.createdByUserId),
    updatedByUserId: text(record.updatedByUserId),
  };
}
export function merchantBalanceFromDocument(
  id: string,
  value: unknown,
  spaceId: string,
  storeId: string,
): MerchantBalance {
  const record = scope(id, value, spaceId, storeId);
  revision(record);
  if (!isCurrencyCode(record.currency)) invalid();
  return {
    id,
    workspaceId: spaceId,
    storeId,
    merchantId: text(record.merchantId),
    currency: record.currency,
    balanceExact: exact(record.balanceExact),
    revision: Number(record.revision),
    version: 1,
  };
}
export function customerCreditFromDocument(
  id: string,
  value: unknown,
  spaceId: string,
  storeId: string,
): CustomerCredit {
  const record = scope(id, value, spaceId, storeId);
  revision(record);
  if (!isCurrencyCode(record.currency) || typeof record.creditExact !== 'string') invalid();
  return {
    id,
    workspaceId: spaceId,
    storeId,
    customerId: text(record.customerId),
    currency: record.currency,
    creditExact: canonicalCredit(record.creditExact),
    revision: Number(record.revision),
    version: 1,
  };
}
export function merchantOperationFromDocument(
  id: string,
  value: unknown,
  spaceId: string,
  storeId: string,
): MerchantOperation {
  const record = scope(id, value, spaceId, storeId);
  if (
    !isCurrencyCode(record.currency) ||
    !['opening', 'purchase', 'payment', 'directPayment', 'reverse'].includes(String(record.action))
  )
    invalid();
  const result: MerchantOperation = {
    id,
    workspaceId: spaceId,
    storeId,
    merchantId: text(record.merchantId),
    merchantName: text(record.merchantName),
    action: record.action as MerchantOperation['action'],
    currency: record.currency,
    balanceBeforeExact: exact(record.balanceBeforeExact),
    balanceAfterExact: exact(record.balanceAfterExact),
    cashDeltaExact: exact(record.cashDeltaExact),
    note: text(record.note, false),
    createdAt: date(record.createdAt),
    createdByUserId: text(record.createdByUserId),
  };
  for (const key of ['amountExact', 'totalExact', 'paidExact', 'customerChargeExact'] as const) {
    if (record[key] !== undefined) result[key] = exact(record[key]);
  }
  for (const key of [
    'source',
    'customerId',
    'customerName',
    'reversedByOperationId',
    'reversesOperationId',
    'reason',
    'transactionId',
    'paymentId',
    'debtId',
    'paymentMethodId',
    'paymentMethodName',
    'replacementOperationId',
    'replacesOperationId',
  ] as const) {
    if (record[key] !== undefined) result[key] = text(record[key], key !== 'customerName');
  }
  if ((record.paymentMethodId === undefined) !== (record.paymentMethodName === undefined)) invalid();
  if (record.cancelled !== undefined) {
    if (typeof record.cancelled !== 'boolean') invalid();
    result.cancelled = record.cancelled;
  }
  if (record.operationDate !== undefined) result.operationDate = merchantOperationDate(record.operationDate);
  if (record.reversedAction !== undefined) {
    if (!['opening', 'purchase', 'payment', 'directPayment'].includes(String(record.reversedAction))) invalid();
    result.reversedAction = record.reversedAction as MerchantOperation['reversedAction'];
  }
  if (record.lines !== undefined) {
    if (!Array.isArray(record.lines) || record.lines.length > 100) invalid();
    result.lines = record.lines.map((value) => {
      const line = object(value);
      if (
        typeof line.quantity !== 'string' ||
        !/^(0|[1-9]\d*)(?:\.\d{1,3})?$/.test(line.quantity) ||
        typeof line.unitPrice !== 'string' ||
        !/^(0|[1-9]\d*)(?:\.\d{1,4})?$/.test(line.unitPrice)
      )
        invalid();
      return {
        name: text(line.name),
        quantity: text(line.quantity),
        unitPrice: text(line.unitPrice),
        totalExact: exact(line.totalExact),
      };
    });
  }
  return result;
}
