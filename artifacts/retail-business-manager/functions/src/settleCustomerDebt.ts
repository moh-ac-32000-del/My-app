import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { readCustomerCredit, writeCustomerCredit } from './customerCreditState.js';
import { legacyAmountExact, planCustomerPayment } from '../../data/customerCreditAccounting.js';
import type { Firestore } from 'firebase-admin/firestore';

const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);

export interface SettleCustomerDebtRequest {
  spaceId: string;
  storeId: string;
  customerId: string;
  amount: number;
  currency: string;
  operationId: string;
  transactionId: string;
  paymentId: string;
}

export interface SettlementRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function settleCustomerDebtHandler(
  request: CallableRequest<SettleCustomerDebtRequest>,
  runtime: SettlementRuntime,
): Promise<{ outcome: 'completed' | 'replayed'; transactionId: string; paymentId: string; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Firebase Auth is required', { code: 'UNAUTHENTICATED' });
  }

  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');
  const customerRef = spaceRef.collection('customers').doc(input.customerId);
  const receiptRef = spaceRef.collection('operationReceipts').doc(input.operationId);
  const transactionRef = spaceRef.collection('transactions').doc(input.transactionId);
  const paymentRef = spaceRef.collection('payments').doc(input.paymentId);
  const debtsQuery = spaceRef.collection('debts')
    .where('customerId', '==', input.customerId);

  try {
    return await db.runTransaction(async (transaction) => {
      const [spaceSnap, memberSnap, profileSnap, customerSnap, receiptSnap, debtSnaps, existingTransaction, existingPayment] = await Promise.all([
        transaction.get(spaceRef),
        transaction.get(memberRef),
        transaction.get(profileRef),
        transaction.get(customerRef),
        transaction.get(receiptRef),
        transaction.get(debtsQuery),
        transaction.get(transactionRef),
        transaction.get(paymentRef),
      ]);

      if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
      }
      assertWorkspaceAccess(memberSnap.data(), 'write');
      if (!profileSnap.exists || profileSnap.data()?.storeId !== input.storeId) {
        throw new HttpsError('permission-denied', 'Store profile does not match workspace', { code: 'STORE_SCOPE_MISMATCH' });
      }
      if (!customerSnap.exists || customerSnap.data()?.isActive !== true
        || customerSnap.data()?.id !== input.customerId
        || customerSnap.data()?.storeId !== input.storeId
        || (customerSnap.data()?.workspaceId && customerSnap.data()?.workspaceId !== input.spaceId)) {
        throw new HttpsError('not-found', 'Active customer was not found', { code: 'CUSTOMER_NOT_FOUND' });
      }

      if (receiptSnap.exists) {
        const receipt = receiptSnap.data() ?? {};
        const result = receipt.result as Record<string, unknown> | undefined;
        const payload = receipt.payload as Record<string, unknown> | undefined;
        const receiptMatches = payload
          ? samePayload(payload, input)
          : sameLegacySettlement(receipt, existingTransaction.data() ?? {}, existingPayment.data() ?? {}, input);
        if (receipt.operationId !== input.operationId || receipt.spaceId !== input.spaceId
          || receipt.actorUserId !== uid || receipt.status !== 'completed'
          || receipt.command !== 'settleCustomerDebt'
          || result?.transactionId !== input.transactionId || result?.paymentId !== input.paymentId
          || !receiptMatches) {
          throw new HttpsError('already-exists', 'Operation ID was already used', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return {
          outcome: 'replayed',
          transactionId: input.transactionId,
          paymentId: input.paymentId,
          processedAt: String(receipt.processedAt ?? ''),
        };
      }

      const matchingDebts = debtSnaps.docs
        .map((snapshot) => ({ ref: snapshot.ref, data: snapshot.data() }))
        .filter(({ data }) => data.storeId === input.storeId
          && data.workspaceId === input.spaceId
          && data.customerId === input.customerId
          && data.currency === input.currency
          && typeof data.amount === 'number'
          && Number.isFinite(data.amount)
          && data.amount >= 0)
        .sort((a, b) => {
          const createdA = typeof a.data.createdAt === 'string' ? a.data.createdAt : '';
          const createdB = typeof b.data.createdAt === 'string' ? b.data.createdAt : '';
          return createdB.localeCompare(createdA) || a.ref.id.localeCompare(b.ref.id);
        });

      if (existingTransaction.exists || existingPayment.exists) {
        throw new HttpsError('already-exists', 'Settlement record ID already exists', { code: 'IDEMPOTENCY_CONFLICT' });
      }

      const now = runtime.now();
      const credit = await readCustomerCredit(transaction, spaceRef, input.storeId, input.customerId, input.currency);
      const plan = planCustomerPayment(matchingDebts.map(({ ref, data }) => ({
        id: ref.id, amount: data.amount, amountExact: data.amountExact, createdAt: data.createdAt,
      })), credit.amount, legacyAmountExact(input.amount));
      if (plan.updates.length > 450) throw new HttpsError('resource-exhausted', 'Too many debts for one settlement');
      const byId = new Map(matchingDebts.map(debt => [debt.ref.id, debt]));

      // Firestore transactions require every read to finish before the first write.
      for (const update of plan.updates) {
        const debt = byId.get(update.id)!;
        transaction.update(debt.ref, {
          updatedByUserId: uid,
          amount: Number(update.amountExact),
          amountExact: update.amountExact,
          originalAmount: typeof debt.data.originalAmount === 'number' ? debt.data.originalAmount : debt.data.amount,
          ...(update.amountExact === '0.00' ? { settledAt: now } : {}),
          updatedAt: now,
        });
      }
      writeCustomerCredit(transaction, credit, plan.creditExact, uid, now);
      transaction.create(transactionRef, {
        id: input.transactionId,
        storeId: input.storeId,
        workspaceId: input.spaceId,
        createdByUserId: uid,
        type: 'cash_in',
        amount: input.amount,
        currency: input.currency,
        note: `payment_${input.customerId}`,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(paymentRef, {
        id: input.paymentId,
        storeId: input.storeId,
        workspaceId: input.spaceId,
        createdByUserId: uid,
        customerId: input.customerId,
        transactionId: input.transactionId,
        amount: { amount: input.amount, currency: input.currency },
        direction: 'in',
        method: 'cash',
        paidAt: now,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(receiptRef, {
        operationId: input.operationId,
        spaceId: input.spaceId,
        actorUserId: uid,
        command: 'settleCustomerDebt',
        status: 'completed',
        processedAt: now,
        payload: payloadForReceipt(input),
        customerCreditBeforeExact: credit.amount,
        customerCreditAfterExact: plan.creditExact,
        debtApplications: plan.updates,
        result: { transactionId: input.transactionId, paymentId: input.paymentId },
      });

      return {
        outcome: 'completed',
        transactionId: input.transactionId,
        paymentId: input.paymentId,
        processedAt: now,
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('settleCustomerDebt failed', error);
    throw new HttpsError('internal', 'Settlement failed', { code: 'INTERNAL' });
  }
}

export function createSettlementRuntime(firestore: Firestore): SettlementRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): SettleCustomerDebtRequest {
  if (!isRecord(value)) {
    throw new HttpsError('invalid-argument', 'Settlement request is invalid', { code: 'INVALID_ARGUMENT' });
  }
  const stringFields = ['spaceId', 'storeId', 'customerId', 'currency', 'operationId', 'transactionId', 'paymentId'] as const;
  for (const field of stringFields) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'string' || !fieldValue.trim() || fieldValue.includes('/')) {
      throw new HttpsError('invalid-argument', `${field} is invalid`, { code: 'INVALID_ARGUMENT' });
    }
  }
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0) {
    throw new HttpsError('invalid-argument', 'Settlement amount must be positive', { code: 'INVALID_ARGUMENT' });
  }
  if (!SUPPORTED_CURRENCIES.has(value.currency as string)) {
    throw new HttpsError('invalid-argument', 'Currency is not supported', { code: 'INVALID_ARGUMENT' });
  }
  return {
    spaceId: (value.spaceId as string).trim(),
    storeId: (value.storeId as string).trim(),
    customerId: (value.customerId as string).trim(),
    amount: value.amount,
    currency: value.currency as string,
    operationId: (value.operationId as string).trim(),
    transactionId: (value.transactionId as string).trim(),
    paymentId: (value.paymentId as string).trim(),
  };
}

function payloadForReceipt(input: SettleCustomerDebtRequest): Record<string, unknown> {
  return {
    spaceId: input.spaceId,
    storeId: input.storeId,
    customerId: input.customerId,
    amount: input.amount,
    currency: input.currency,
    transactionId: input.transactionId,
    paymentId: input.paymentId,
  };
}

function samePayload(receiptPayload: Record<string, unknown>, input: SettleCustomerDebtRequest): boolean {
  return receiptPayload.spaceId === input.spaceId
    && receiptPayload.storeId === input.storeId
    && receiptPayload.customerId === input.customerId
    && receiptPayload.amount === input.amount
    && receiptPayload.currency === input.currency
    && receiptPayload.transactionId === input.transactionId
    && receiptPayload.paymentId === input.paymentId;
}

function sameLegacySettlement(
  receipt: Record<string, unknown>,
  transaction: Record<string, unknown>,
  payment: Record<string, unknown>,
  input: SettleCustomerDebtRequest,
): boolean {
  const paymentAmount = payment.amount;
  return transaction.id === input.transactionId
    && transaction.storeId === input.storeId
    && transaction.workspaceId === input.spaceId
    && transaction.type === 'cash_in'
    && transaction.amount === input.amount
    && transaction.currency === input.currency
    && transaction.note === `payment_${input.customerId}`
    && payment.id === input.paymentId
    && payment.storeId === input.storeId
    && payment.workspaceId === input.spaceId
    && payment.customerId === input.customerId
    && payment.transactionId === input.transactionId
    && isRecord(paymentAmount)
    && paymentAmount.amount === input.amount
    && paymentAmount.currency === input.currency
    && payment.direction === 'in'
    && payment.method === 'cash'
    && payment.paidAt === receipt.processedAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
