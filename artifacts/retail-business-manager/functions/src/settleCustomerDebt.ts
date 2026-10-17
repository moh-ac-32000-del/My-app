import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
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
  const customerRef = spaceRef.collection('customers').doc(input.customerId);
  const receiptRef = spaceRef.collection('operationReceipts').doc(input.operationId);
  const debtsQuery = spaceRef.collection('debts')
    .where('customerId', '==', input.customerId);

  try {
    return await db.runTransaction(async (transaction) => {
      const [spaceSnap, memberSnap, customerSnap, receiptSnap, debtSnaps] = await Promise.all([
        transaction.get(spaceRef),
        transaction.get(memberRef),
        transaction.get(customerRef),
        transaction.get(receiptRef),
        transaction.get(debtsQuery),
      ]);

      if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
      }
      if (!memberSnap.exists || memberSnap.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Active workspace membership is required', { code: 'FORBIDDEN' });
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
        if (receipt.operationId !== input.operationId || receipt.spaceId !== input.spaceId
          || receipt.actorUserId !== uid || receipt.status !== 'completed'
          || receipt.command !== 'settleCustomerDebt'
          || result?.transactionId !== input.transactionId || result?.paymentId !== input.paymentId) {
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
          && data.amount > 0)
        .sort((a, b) => {
          const createdA = typeof a.data.createdAt === 'string' ? a.data.createdAt : '';
          const createdB = typeof b.data.createdAt === 'string' ? b.data.createdAt : '';
          return createdB.localeCompare(createdA) || a.ref.id.localeCompare(b.ref.id);
        });

      const remaining = matchingDebts.reduce((sum, debt) => sum + Number(debt.data.amount), 0);
      if (input.amount > remaining) {
        throw new HttpsError('failed-precondition', 'Settlement exceeds the remaining debt', { code: 'SETTLEMENT_EXCEEDS_DEBT' });
      }

      const transactionRef = spaceRef.collection('transactions').doc(input.transactionId);
      const paymentRef = spaceRef.collection('payments').doc(input.paymentId);
      const [existingTransaction, existingPayment] = await Promise.all([
        transaction.get(transactionRef),
        transaction.get(paymentRef),
      ]);
      if (existingTransaction.exists || existingPayment.exists) {
        throw new HttpsError('already-exists', 'Settlement record ID already exists', { code: 'IDEMPOTENCY_CONFLICT' });
      }

      const now = runtime.now();
      let amountToApply = input.amount;
      const debtUpdates: Array<{ ref: typeof matchingDebts[number]['ref']; currentAmount: number; nextAmount: number }> = [];
      for (const debt of matchingDebts) {
        if (amountToApply <= 0) break;
        const currentAmount = Number(debt.data.amount);
        const applied = Math.min(currentAmount, amountToApply);
        const nextAmount = currentAmount - applied;
        amountToApply -= applied;
        debtUpdates.push({ ref: debt.ref, currentAmount, nextAmount });
      }
      if (Math.abs(amountToApply) > 0.000001) {
        throw new HttpsError('failed-precondition', 'Settlement could not be fully applied', { code: 'SETTLEMENT_EXCEEDS_DEBT' });
      }

      // Firestore transactions require every read to finish before the first write.
      for (const debt of debtUpdates) {
        transaction.update(debt.ref, {
          amount: debt.nextAmount,
          originalAmount: typeof matchingDebts.find((candidate) => candidate.ref.path === debt.ref.path)?.data.originalAmount === 'number'
            ? matchingDebts.find((candidate) => candidate.ref.path === debt.ref.path)?.data.originalAmount
            : debt.currentAmount,
          ...(debt.nextAmount === 0 ? { settledAt: now } : {}),
          updatedAt: now,
        });
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
