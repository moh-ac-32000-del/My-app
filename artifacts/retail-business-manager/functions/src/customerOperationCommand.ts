import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { readCustomerCredit, writeCustomerCredit } from './customerCreditState.js';
import { financialPostingTime } from '../../data/automaticClosing.js';
import { planCustomerDebtAmendment } from '../../data/customerDebtAmendment.js';
import { legacyAmountExact } from '../../data/customerCreditAccounting.js';
import { merchantOperationDate } from '../../data/merchantSettings.js';
import { isCurrencyCode } from '../../constants/currencies.js';
import { amendCustomerPayment } from './customerPaymentAmendment.js';

export type CustomerOperationInput = { action: 'edit' | 'cancel'; kind: 'debt' | 'payment'; spaceId: string; storeId: string;
  customerId: string; targetId: string; operationId: string; expectedUpdatedAt: string;
  expectedRevision: number;
  amountExact?: string; operationDate?: string; dueDate?: string; note?: string; method?: string };
type Input = CustomerOperationInput;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid(message = 'Invalid customer operation request'): never { throw new HttpsError('invalid-argument', message); }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 200 || value.includes('/') || ['.','..'].includes(value)) invalid();
  return value;
}
function validate(value: unknown): Input {
  if (!object(value) || !['edit', 'cancel'].includes(value.action) || !['debt','payment'].includes(value.kind)) invalid();
  const allowed = ['action', 'kind', 'spaceId', 'storeId', 'customerId', 'targetId', 'operationId', 'expectedUpdatedAt', 'expectedRevision',
    ...(value.action === 'edit' ? ['amountExact', 'operationDate', 'note', value.kind === 'debt' ? 'dueDate' : 'method'] : [])];
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
  const result: Input = { action: value.action, kind: value.kind, spaceId: id(value.spaceId), storeId: id(value.storeId),
    customerId: id(value.customerId), targetId: id(value.targetId), operationId: id(value.operationId), expectedUpdatedAt: value.expectedUpdatedAt, expectedRevision: value.expectedRevision };
  if (!Number.isSafeInteger(result.expectedRevision) || result.expectedRevision < 0 || result.expectedRevision >= Number.MAX_SAFE_INTEGER) invalid();
  if (typeof result.expectedUpdatedAt !== 'string' || result.expectedUpdatedAt.length > 50 || !Number.isFinite(Date.parse(result.expectedUpdatedAt))) invalid();
  if (value.action === 'edit') {
    if (typeof value.amountExact !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(value.amountExact) || value.amountExact === '0.00' ||
      value.amountExact.length > 20 || BigInt(value.amountExact.replace('.', '')) > BigInt(Number.MAX_SAFE_INTEGER) || legacyAmountExact(Number(value.amountExact)) !== value.amountExact) invalid();
    result.amountExact = value.amountExact;
    if (typeof value.note !== 'string' || value.note.length > 2000) invalid();
    result.note = value.note.trim();
    if (value.kind === 'payment') {
      if (!['cash','card','bank-transfer','other'].includes(value.method)) invalid('Invalid descriptive payment method');
      result.method = value.method;
    }
    try {
      result.operationDate = merchantOperationDate(value.operationDate);
      if (value.dueDate !== undefined) result.dueDate = merchantOperationDate(value.dueDate);
    } catch { invalid('Invalid documentary date'); }
  }
  return result;
}

/** Source registration/rollout is separate. All financial records stay in Firebase;
 * receipts preserve the previous source and actor without overwriting archive snapshots.
 */
export async function customerOperationCommandHandler(request: CallableRequest<unknown>, runtime: { firestore: Firestore; now: () => string }) {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth required');
  const input = validate(request.data), digest = hash(input);
  const space = runtime.firestore.collection('spaces').doc(input.spaceId);
  return runtime.firestore.runTransaction(async tx => {
    const targetRef = space.collection(input.kind === 'debt' ? 'debts' : 'payments').doc(input.targetId);
    const receiptRef = space.collection('operationReceipts').doc(input.operationId);
    const [spaceSnap, member, profile, targetSnap, receipt, customer] = await Promise.all([
      tx.get(space), tx.get(space.collection('members').doc(uid)), tx.get(space.collection('storeProfile').doc('profile')),
      tx.get(targetRef), tx.get(receiptRef), tx.get(space.collection('customers').doc(input.customerId)),
    ]);
    if (spaceSnap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Workspace unavailable');
    assertWorkspaceAccess(member.data(), 'write');
    if (profile.data()?.storeId !== input.storeId) throw new HttpsError('permission-denied', 'Store scope mismatch');
    const customerData = customer.data();
    if (!customer.exists || customerData?.id !== input.customerId || customerData.workspaceId !== input.spaceId ||
      customerData.storeId !== input.storeId || customerData.isActive !== true) throw new HttpsError('not-found', 'Active customer unavailable');
    if (receipt.exists) {
      const prior = receipt.data();
      if (prior?.command !== 'customerOperationCommand' || prior.actorUserId !== uid || prior.spaceId !== input.spaceId ||
        prior.operationId !== input.operationId || prior.payloadDigest !== digest || prior.status !== 'completed' ||
        prior.result?.targetId !== input.targetId) throw new HttpsError('already-exists', 'Operation ID already used', { code: 'IDEMPOTENCY_CONFLICT' });
      return { ...prior.result, outcome: 'replayed' };
    }
    const target = targetSnap.data();
    if (!targetSnap.exists || target?.id !== input.targetId || target.workspaceId !== input.spaceId ||
      target.storeId !== input.storeId || target.customerId !== input.customerId) throw new HttpsError('not-found', 'Operation unavailable');
    if (target.merchantOperationId || target.correctionOfMerchantOperationId || target.correctionOfPaymentId || target.source === 'customer-to-merchant')
      throw new HttpsError('failed-precondition', 'Edit the linked source operation instead', { code: 'LINKED_OPERATION_EDIT_REQUIRED' });
    if (target.cancelled || (target.amendmentRevision ?? 0) !== input.expectedRevision || (target.updatedAt ?? target.createdAt) !== input.expectedUpdatedAt)
      throw new HttpsError('failed-precondition', 'Operation changed; reload before editing', { code: 'STALE_OPERATION' });
    if (input.kind === 'payment') return amendCustomerPayment({ tx, space, targetRef, receiptRef, target, input, uid,
      now: financialPostingTime(spaceSnap.data()!, runtime.now()), digest });
    if (!isCurrencyCode(target.currency)) throw new HttpsError('data-loss', 'Invalid debt currency');
    const credit = await readCustomerCredit(tx, space, input.storeId, input.customerId, target.currency);
    const debts = (await tx.get(space.collection('debts').where('customerId', '==', input.customerId).limit(451))).docs
      .map(doc => ({ ref: doc.ref, data: doc.data() }));
    if (debts.length > 450) throw new HttpsError('resource-exhausted', 'Too many debt records for one correction');
    const scoped = debts.filter(row => row.data.workspaceId === input.spaceId && row.data.storeId === input.storeId && row.data.currency === target.currency);
    let plan;
    try { plan = planCustomerDebtAmendment({ target: { ...target, id: input.targetId } as any,
      debts: scoped.map(row => ({ ...row.data, id: row.ref.id } as any)), creditExact: credit.amount,
      principalExact: input.action === 'cancel' ? '0.00' : input.amountExact! }); }
    catch { throw new HttpsError('data-loss', 'Debt amounts are inconsistent; no correction was written'); }
    const now = financialPostingTime(spaceSnap.data()!, runtime.now());
    const byId = new Map(scoped.map(row => [row.ref.id, row]));
    for (const update of plan.updates) {
      const row = byId.get(update.id)!;
      tx.update(row.ref, { amount: Number(update.amountExact), amountExact: update.amountExact,
        originalAmount: row.data.originalAmount ?? row.data.amount,
        settledAt: update.amountExact === '0.00' ? now : FieldValue.delete(), updatedAt: now, updatedByUserId: uid });
    }
    if (plan.deltaExact !== '0.00') writeCustomerCredit(tx, credit, plan.creditExact, uid, now);
    tx.update(targetRef, { ...(input.action === 'cancel' ? { cancelled: true, cancelledAt: now, cancelledByUserId: uid }
      : { originalAmount: Number(input.amountExact), note: input.note, operationDate: input.operationDate,
        dueDate: input.dueDate ?? FieldValue.delete() }), creditAppliedExact: plan.creditAppliedExact,
      customerAmendmentId: input.operationId, amendmentRevision: input.expectedRevision + 1, updatedAt: now, updatedByUserId: uid });
    const result = { outcome: 'completed', targetId: input.targetId, processedAt: now };
    tx.create(receiptRef, { command: 'customerOperationCommand', operationId: input.operationId, spaceId: input.spaceId,
      actorUserId: uid, status: 'completed', payload: input, payloadDigest: digest, previousOperation: target,
      customerCreditBeforeExact: credit.amount, customerCreditAfterExact: plan.creditExact, debtApplications: plan.updates,
      processedAt: now, result });
    return result;
  });
}
