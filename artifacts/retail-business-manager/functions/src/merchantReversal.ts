import { createHash } from 'node:crypto';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CurrencyCode } from '../../constants/currencies.js';
import type { PartyBalance } from '../../data/merchantAccounting.js';
import { summarizeMerchantBalances } from '../../data/merchantAccounting.js';
import { legacyAmountExact, planCustomerCharge, subtractCustomerExact } from '../../data/customerCreditAccounting.js';
import { readCustomerCredit, writeCustomerCredit } from './customerCreditState.js';

/** Correction of an erroneous entry, not an assertion that goods or money physically changed hands.
 * Keep original values and archived snapshots intact. The offset is a new current-period entry.
 * Caller has freshly authorized canonical workspace/store/merchant membership before invoking this.
 */
export async function prepareMerchantReversal({
  tx,
  space,
  balanceRef,
  balance,
  revision,
  operationRef,
  uid,
  now,
  input,
}: {
  tx: Transaction;
  space: DocumentReference;
  balanceRef: DocumentReference;
  balance: PartyBalance;
  revision: number;
  operationRef: DocumentReference;
  uid: string;
  now: string;
  input: {
    spaceId: string;
    storeId: string;
    merchantId: string;
    operationId: string;
    currency: CurrencyCode;
    targetOperationId: string;
    reason: string;
    replacementOperationId?: string;
    cancelled?: true;
  };
}) {
  const originalRef = space.collection('merchantOperations').doc(input.targetOperationId);
  const originalSnap = await tx.get(originalRef);
  const original = originalSnap.data();
  if (
    !originalSnap.exists ||
    original?.id !== input.targetOperationId ||
    original?.workspaceId !== input.spaceId ||
    original?.storeId !== input.storeId ||
    original?.merchantId !== input.merchantId ||
    original?.currency !== input.currency
  ) {
    throw new HttpsError('not-found', 'Original operation not found in this account');
  }
  if (
    !['opening', 'purchase', 'payment', 'directPayment'].includes(original.action) ||
    original.reversedByOperationId
  ) {
    throw new HttpsError('failed-precondition', 'Operation already reversed or not reversible');
  }
  let next: string;
  let cashDeltaExact: string;
  let amountExact: string;
  try {
    // Validate every original balance before arithmetic; missing values must never mean zero.
    for (const value of [original.balanceBeforeExact, original.balanceAfterExact, original.cashDeltaExact]) {
      summarizeMerchantBalances(input.spaceId, [{ ...balance, balance: value }]);
    }
    next = subtractCustomerExact(
      balance.balance,
      subtractCustomerExact(original.balanceAfterExact, original.balanceBeforeExact),
    );
    cashDeltaExact = subtractCustomerExact('0.00', original.cashDeltaExact);
    amountExact = original.action === 'purchase' ? original.totalExact
      : original.action === 'opening' ? subtractCustomerExact(original.balanceAfterExact, original.balanceBeforeExact) : original.amountExact;
    summarizeMerchantBalances(input.spaceId, [{ ...balance, balance: amountExact }]);
    summarizeMerchantBalances(input.spaceId, [{ ...balance, balance: next }]);
  } catch {
    throw new HttpsError('data-loss', 'Original monetary values are invalid');
  }
  // Original commands only create cash out; refuse a corrupt or unknown source instead of guessing.
  if (cashDeltaExact.startsWith('-')) throw new HttpsError('data-loss', 'Original cash direction is invalid');
  const cashAmount = Number(cashDeltaExact);
  if (
    !Number.isFinite(cashAmount) ||
    (cashAmount &&
      (BigInt(cashDeltaExact.replace('.', '')) > BigInt(Number.MAX_SAFE_INTEGER) ||
        legacyAmountExact(cashAmount) !== cashDeltaExact))
  )
    throw new HttpsError('data-loss', 'Original cash precision is invalid');
  const linkedId = `merchant-reversal-${createHash('sha256').update(input.operationId).digest('hex')}`;
  const cashRef = space.collection('transactions').doc(linkedId);
  if ((original.action === 'directPayment' || original.action === 'opening') && cashAmount) {
    throw new HttpsError('data-loss', 'Noncash original operation has a cash effect');
  }
  if (cashAmount) {
    if (typeof original.transactionId !== 'string' || !original.transactionId || original.transactionId.includes('/')) {
      throw new HttpsError('data-loss', 'Original cash link is invalid');
    }
    const originalCash = (await tx.get(space.collection('transactions').doc(original.transactionId))).data();
    if (
      originalCash?.workspaceId !== input.spaceId ||
      originalCash?.storeId !== input.storeId ||
      originalCash?.merchantId !== input.merchantId ||
      originalCash?.merchantOperationId !== input.targetOperationId ||
      originalCash?.type !== 'cash_out' ||
      originalCash?.currency !== input.currency ||
      originalCash?.amount !== cashAmount ||
      originalCash?.amountExact !== cashDeltaExact
    ) {
      throw new HttpsError('data-loss', 'Original linked cash record is inconsistent');
    }
  }
  if (cashAmount && (await tx.get(cashRef)).exists)
    throw new HttpsError('already-exists', 'Correction cash ID already exists');
  const scope = { workspaceId: input.spaceId, storeId: input.storeId };
  let customerDetails: Record<string, unknown> = {};
  let credit: Awaited<ReturnType<typeof readCustomerCredit>> | null = null;
  let charge: ReturnType<typeof planCustomerCharge> | null = null;
  let originalPaymentRef: DocumentReference | null = null;
  const debtRef = space.collection('debts').doc(linkedId);
  if (original.action === 'directPayment') {
    if (typeof original.customerId !== 'string' || !original.customerId || original.customerId.includes('/')) {
      throw new HttpsError('data-loss', 'Original customer is invalid');
    }
    if (typeof original.paymentId !== 'string' || !original.paymentId || original.paymentId.includes('/'))
      throw new HttpsError('data-loss', 'Original linked payment is missing');
    originalPaymentRef = space.collection('payments').doc(original.paymentId);
    const originalPayment = (await tx.get(originalPaymentRef)).data();
    if (!originalPayment || originalPayment.workspaceId !== input.spaceId || originalPayment.storeId !== input.storeId ||
      originalPayment.customerId !== original.customerId || originalPayment.merchantId !== input.merchantId ||
      originalPayment.merchantOperationId !== input.targetOperationId || originalPayment.source !== 'customer-to-merchant' ||
      originalPayment.amount?.currency !== input.currency || originalPayment.amountExact !== original.amountExact || originalPayment.cancelled)
      throw new HttpsError('data-loss', 'Original linked payment is inconsistent');
    const customerSnap = await tx.get(space.collection('customers').doc(original.customerId));
    const customer = customerSnap.data();
    if (
      !customerSnap.exists ||
      customer?.id !== original.customerId ||
      customer?.workspaceId !== input.spaceId ||
      customer?.storeId !== input.storeId ||
      customer?.isActive !== true
    )
      throw new HttpsError('failed-precondition', 'Original customer must be active in this workspace');
    credit = await readCustomerCredit(tx, space, input.storeId, original.customerId, input.currency);
    try {
      if (
        typeof original.amountExact !== 'string' ||
        !/^(0|[1-9]\d*)\.\d{2}$/.test(original.amountExact) ||
        !Number.isFinite(Number(original.amountExact)) ||
        Number(original.amountExact) <= 0 ||
        BigInt(original.amountExact.replace('.', '')) > BigInt(Number.MAX_SAFE_INTEGER) ||
        legacyAmountExact(Number(original.amountExact)) !== original.amountExact
      )
        throw new Error('invalid');
      charge = planCustomerCharge(original.amountExact, credit.amount);
    } catch {
      throw new HttpsError('data-loss', 'Original direct payment amount is invalid');
    }
    if ((await tx.get(debtRef)).exists) throw new HttpsError('already-exists', 'Correction debt already exists');
    customerDetails = {
      customerId: original.customerId,
      customerName: customer?.name ?? '',
      debtId: linkedId,
      customerChargeExact: original.amountExact,
      customerCreditBeforeExact: credit.amount,
      customerCreditAfterExact: charge.creditExact,
    };
  }
  const correctionDebt = charge && credit ? {
      id: linkedId,
      ...scope,
      customerId: original.customerId,
      currency: input.currency,
      amount: Number(charge.amountExact),
      amountExact: charge.amountExact,
      originalAmount: Number(original.amountExact),
      creditAppliedExact: charge.creditAppliedExact,
      correctionOfMerchantOperationId: input.targetOperationId,
      merchantOperationId: input.operationId,
      note: input.reason,
      ...(charge.amountExact === '0.00' ? { settledAt: now } : {}),
      createdAt: now,
      updatedAt: now,
      createdByUserId: uid,
      updatedByUserId: uid,
    } : null;
  // Preparation performs every read. An edit may now prepare its replacement before
  // applying either half; a failure cannot leave an original cancelled on its own.
  const apply = () => {
  if (originalPaymentRef) tx.update(originalPaymentRef, { cancelled: true, updatedAt: now, updatedByUserId: uid,
    cancelledByMerchantOperationId: input.operationId });
  if (charge && credit && correctionDebt) {
    tx.create(debtRef, correctionDebt);
    writeCustomerCredit(tx, credit, charge.creditExact, uid, now);
  }
  tx.update(originalRef, { reversedByOperationId: input.operationId, reversedAt: now, reversedByUserId: uid,
    ...(input.replacementOperationId ? { replacementOperationId: input.replacementOperationId } : {}),
    ...(input.cancelled ? { cancelled: true } : {}),
  });
  tx.set(balanceRef, {
    id: balanceRef.id,
    ...scope,
    merchantId: input.merchantId,
    currency: input.currency,
    version: 1,
    revision: revision + 1,
    balanceExact: next,
    updatedAt: now,
    updatedByUserId: uid,
  });
  tx.create(operationRef, {
    id: input.operationId,
    ...scope,
    merchantId: input.merchantId,
    merchantName: original.merchantName,
    currency: input.currency,
    action: 'reverse',
    reversedAction: original.action,
    amountExact,
    reversesOperationId: input.targetOperationId,
    reason: input.reason,
    ...(input.replacementOperationId ? { replacementOperationId: input.replacementOperationId } : {}),
    ...(input.cancelled ? { cancelled: true } : {}),
    note: input.reason,
    balanceBeforeExact: balance.balance,
    balanceAfterExact: next,
    cashDeltaExact,
    ...(cashAmount ? { transactionId: linkedId } : {}),
    ...customerDetails,
    createdAt: now,
    createdByUserId: uid,
  });
  if (cashAmount)
    tx.create(cashRef, {
      id: linkedId,
      ...scope,
      merchantId: input.merchantId,
      merchantOperationId: input.operationId,
      correctionOfMerchantOperationId: input.targetOperationId,
      type: 'cash_in',
      amount: cashAmount,
      amountExact: cashDeltaExact,
      currency: input.currency,
      note: input.reason,
      createdAt: now,
      updatedAt: now,
      createdByUserId: uid,
    });
  };
  return { apply, correctionDebt: correctionDebt ? { ref: debtRef, data: correctionDebt } : null,
    customerCredit: credit && charge ? { ...credit, amount: charge.creditExact, revision: credit.revision + 1,
      createdAt: credit.createdAt ?? now, createdByUserId: credit.createdByUserId ?? uid } : null,
    result: {
    outcome: 'completed',
    merchantId: input.merchantId,
    operationId: input.operationId,
    balanceExact: next,
    cashDeltaExact,
    processedAt: now,
  } };
}

export async function reverseMerchantOperation(input: Parameters<typeof prepareMerchantReversal>[0]) {
  const plan = await prepareMerchantReversal(input);
  plan.apply();
  return plan.result;
}
