import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isCurrencyCode } from '../../constants/currencies.js';
import { legacyAmountExact, planCustomerCharge, planCustomerPayment, subtractCustomerExact } from '../../data/customerCreditAccounting.js';
import { readCustomerCredit, writeCustomerCredit } from './customerCreditState.js';
import type { CustomerOperationInput } from './customerOperationCommand.js';

/** Already authorized against current membership by the outer transaction.
 * A payment document alone is NOT evidence that it reduced the customer debt.
 * The sealed creation receipt determines its accounting effect; the actual cash
 * link, not the descriptive payment method, determines the drawer effect.
 */
export async function amendCustomerPayment({ tx, space, targetRef, receiptRef, target, input, uid, now, digest }: {
  tx: Transaction; space: DocumentReference; targetRef: DocumentReference; receiptRef: DocumentReference;
  target: Record<string, any>; input: CustomerOperationInput; uid: string; now: string; digest: string;
}) {
  const currency = target.amount?.currency;
  if (!isCurrencyCode(currency) || !['in', 'out'].includes(target.direction)) throw new HttpsError('data-loss', 'Invalid payment scope');
  let original: string;
  try { original = legacyAmountExact(target.amount.amount, target.amountExact); }
  catch { throw new HttpsError('data-loss', 'Invalid payment amount'); }
  const next = input.action === 'cancel' ? '0.00' : input.amountExact!;
  const difference = subtractCustomerExact(next, original);
  const proofs = (await tx.get(space.collection('operationReceipts').where('result.paymentId', '==', input.targetId).limit(2))).docs.map(doc => doc.data());
  const proof = proofs.length === 1 ? proofs[0] : null;
  const trustedProof = proof && proof.spaceId === input.spaceId && proof.status === 'completed' &&
    proof.result?.paymentId === input.targetId && proof.payload?.storeId === input.storeId &&
    proof.payload?.customerId === input.customerId && proof.actorUserId === target.createdByUserId &&
    ['settleCustomerDebt', 'createPayment'].includes(proof.command);
  if (!trustedProof && (difference !== '0.00' || input.action === 'cancel'))
    throw new HttpsError('failed-precondition', 'The original accounting effect cannot be verified; no financial correction was written');
  const settlesDebt = trustedProof && proof.command === 'settleCustomerDebt';
  const paymentBaseAmountExact = target.paymentBaseAmountExact ?? original;
  if (trustedProof) {
    try {
      const baseAmount = settlesDebt ? proof.payload.amount : proof.payload.amount.amount;
      if (legacyAmountExact(baseAmount) !== paymentBaseAmountExact) throw new Error('mismatch');
    } catch { throw new HttpsError('data-loss', 'Original payment provenance amount is inconsistent'); }
  }
  if (settlesDebt && (target.direction !== 'in' || proof.payload.currency !== currency ||
    proof.payload.transactionId !== target.transactionId)) throw new HttpsError('data-loss', 'Settlement provenance is inconsistent');
  if (trustedProof && proof.command === 'createPayment' && (proof.payload.amount?.currency !== currency ||
    proof.payload.direction !== target.direction || (proof.payload.transactionId ?? null) !== (target.transactionId ?? null)))
    throw new HttpsError('data-loss', 'Payment provenance is inconsistent');
  const scope = { workspaceId: input.spaceId, storeId: input.storeId };
  const suffix = createHash('sha256').update(input.operationId).digest('hex');
  const cashRef = space.collection('transactions').doc(`customer-edit-${suffix}`);
  const correctionRef = space.collection('debts').doc(`customer-edit-${suffix}`);
  let cashDelta = '0.00';
  let cashBaseAmountExact: string | undefined;
  if (target.transactionId) {
    if (typeof target.transactionId !== 'string' || target.transactionId.includes('/')) throw new HttpsError('data-loss', 'Invalid cash link');
    const cash = (await tx.get(space.collection('transactions').doc(target.transactionId))).data();
    const linkedPayments = await tx.get(space.collection('payments').where('transactionId', '==', target.transactionId).limit(2));
    if (linkedPayments.docs.length !== 1 || linkedPayments.docs[0].id !== input.targetId)
      throw new HttpsError('failed-precondition', 'Cash entry is shared; no unilateral correction is allowed');
    try {
      cashBaseAmountExact = target.cashBaseAmountExact ?? original;
      if (!cash || cash.id !== target.transactionId || cash.workspaceId !== input.spaceId || cash.storeId !== input.storeId ||
        cash.currency !== currency || cash.type !== (target.direction === 'in' ? 'cash_in' : 'cash_out') || cash.merchantOperationId ||
        legacyAmountExact(cash.amount, cash.amountExact) !== cashBaseAmountExact) throw new Error('mismatch');
    } catch { throw new HttpsError('data-loss', 'Original cash transaction is inconsistent'); }
    cashDelta = target.direction === 'in' ? difference : subtractCustomerExact('0.00', difference);
    if (cashDelta !== '0.00' && (await tx.get(cashRef)).exists) throw new HttpsError('already-exists', 'Correction cash already exists');
  }
  const credit = settlesDebt && difference !== '0.00' ? await readCustomerCredit(tx, space, input.storeId, input.customerId, currency) : null;
  const debtRows = credit && !difference.startsWith('-')
    ? (await tx.get(space.collection('debts').where('customerId', '==', input.customerId).limit(451))).docs
    : [];
  if (debtRows.length > 450) throw new HttpsError('resource-exhausted', 'Too many debts in one correction');
  const debts = debtRows.map(doc => ({ ref: doc.ref, data: doc.data() }))
    .filter(row => row.data.workspaceId === input.spaceId && row.data.storeId === input.storeId && row.data.currency === currency);
  const repayment = credit && !difference.startsWith('-') ? planCustomerPayment(debts.map(row => ({ id: row.ref.id,
    amount: row.data.amount, amountExact: row.data.amountExact, createdAt: row.data.createdAt })), credit.amount, difference) : null;
  const charge = credit && difference.startsWith('-') ? planCustomerCharge(difference.slice(1), credit.amount) : null;
  if (charge && (await tx.get(correctionRef)).exists) throw new HttpsError('already-exists', 'Correction debt already exists');
  // All reads finished. The target, current-period drawer adjustment and account correction commit together.
  if (repayment && credit) {
    const byId = new Map(debts.map(row => [row.ref.id, row]));
    for (const update of repayment.updates) {
      const row = byId.get(update.id)!;
      tx.update(row.ref, { amount: Number(update.amountExact), amountExact: update.amountExact,
        originalAmount: row.data.originalAmount ?? row.data.amount, settledAt: update.amountExact === '0.00' ? now : FieldValue.delete(),
        updatedAt: now, updatedByUserId: uid });
    }
    writeCustomerCredit(tx, credit, repayment.creditExact, uid, now);
  }
  if (charge && credit) {
    tx.create(correctionRef, { id: correctionRef.id, ...scope, customerId: input.customerId, currency,
      amount: Number(charge.amountExact), amountExact: charge.amountExact, originalAmount: Number(charge.principalExact),
      creditAppliedExact: charge.creditAppliedExact, correctionOfPaymentId: input.targetId, customerAmendmentId: input.operationId,
      note: input.note ?? target.note ?? '', ...(charge.amountExact === '0.00' ? { settledAt: now } : {}),
      createdAt: now, updatedAt: now, createdByUserId: uid, updatedByUserId: uid });
    writeCustomerCredit(tx, credit, charge.creditExact, uid, now);
  }
  if (cashDelta !== '0.00') {
    const amountExact = cashDelta.replace(/^-/, '');
    tx.create(cashRef, { id: cashRef.id, ...scope, type: cashDelta.startsWith('-') ? 'cash_out' : 'cash_in',
      amount: Number(amountExact), amountExact, currency, customerId: input.customerId,
      correctionOfPaymentId: input.targetId, customerAmendmentId: input.operationId, note: input.note ?? target.note ?? '',
      createdAt: now, updatedAt: now, createdByUserId: uid });
  }
  tx.update(targetRef, { ...(input.action === 'cancel' ? { cancelled: true, cancelledAt: now, cancelledByUserId: uid }
    : { amount: { amount: Number(next), currency }, amountExact: next, method: input.method,
      operationDate: input.operationDate, note: input.note }),
    ...(cashBaseAmountExact !== undefined ? { cashBaseAmountExact } : {}),
    paymentBaseAmountExact,
    amendmentRevision: input.expectedRevision + 1, customerAmendmentId: input.operationId, updatedAt: now, updatedByUserId: uid });
  const result = { outcome: 'completed', targetId: input.targetId, processedAt: now };
  tx.create(receiptRef, { command: 'customerOperationCommand', operationId: input.operationId, spaceId: input.spaceId,
    actorUserId: uid, status: 'completed', payload: input, payloadDigest: digest, previousOperation: target,
    ...(credit ? { customerCreditBeforeExact: credit.amount, customerCreditAfterExact: repayment?.creditExact ?? charge!.creditExact } : {}),
    ...(repayment ? { debtApplications: repayment.updates } : {}), ...(charge ? { correctionDebtId: correctionRef.id } : {}),
    cashDeltaExact: cashDelta, processedAt: now, result });
  return result;
}
