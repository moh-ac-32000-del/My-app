import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);
const PAYMENT_METHODS = new Set(['cash', 'card', 'bank-transfer', 'other']);

export interface CreatePaymentRequest {
  spaceId: string;
  storeId: string;
  paymentId: string;
  operationId: string;
  amount: { amount: number; currency: string };
  direction: 'in' | 'out';
  method: 'cash' | 'card' | 'bank-transfer' | 'other';
  customerId?: string;
  transactionId?: string;
  paidAt: string;
  note?: string;
}

export interface TrustedPaymentRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function createPaymentHandler(
  request: CallableRequest<CreatePaymentRequest>,
  runtime: TrustedPaymentRuntime,
): Promise<{ outcome: 'created' | 'replayed'; paymentId: string; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required', { code: 'UNAUTHENTICATED' });
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');
  const paymentRef = spaceRef.collection('payments').doc(input.paymentId);
  const receiptRef = spaceRef.collection('operationReceipts').doc(input.operationId);
  const customerRef = input.customerId ? spaceRef.collection('customers').doc(input.customerId) : null;
  const transactionRef = input.transactionId ? spaceRef.collection('transactions').doc(input.transactionId) : null;

  try {
    return await db.runTransaction(async (tx) => {
      const spaceSnap = await tx.get(spaceRef);
      const memberSnap = await tx.get(memberRef);
      const profileSnap = await tx.get(profileRef);
      const receiptSnap = await tx.get(receiptRef);

      if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
      }
      if (!memberSnap.exists || memberSnap.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Active workspace membership is required', { code: 'FORBIDDEN' });
      }
      if (!profileSnap.exists || profileSnap.data()?.storeId !== input.storeId) {
        throw new HttpsError('permission-denied', 'Store profile does not match workspace', { code: 'STORE_SCOPE_MISMATCH' });
      }

      if (receiptSnap.exists) {
        const receipt = receiptSnap.data() ?? {};
        const result = receipt.result as Record<string, unknown> | undefined;
        const payload = receipt.payload as Record<string, unknown> | undefined;
        if (receipt.command !== 'createPayment' || receipt.actorUserId !== uid
          || receipt.spaceId !== input.spaceId || result?.paymentId !== input.paymentId
          || !samePayload(payload, input)) {
          throw new HttpsError('already-exists', 'Operation ID was already used', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return { outcome: 'replayed', paymentId: input.paymentId, processedAt: String(receipt.processedAt ?? '') };
      }

      const paymentSnap = await tx.get(paymentRef);
      const customerSnap = customerRef ? await tx.get(customerRef) : null;
      const transactionSnap = transactionRef ? await tx.get(transactionRef) : null;
      if (paymentSnap.exists) {
        throw new HttpsError('already-exists', 'Payment ID already exists', { code: 'PAYMENT_ALREADY_EXISTS' });
      }
      if (customerRef) {
        const customer = customerSnap?.data();
        if (!customerSnap?.exists || customer?.id !== input.customerId || customer?.isActive !== true
          || customer?.storeId !== input.storeId
          || (typeof customer?.workspaceId === 'string' && customer.workspaceId !== input.spaceId)) {
          throw new HttpsError('not-found', 'Active customer was not found', { code: 'CUSTOMER_NOT_FOUND' });
        }
      }
      if (transactionRef) {
        const transaction = transactionSnap?.data();
        if (!transactionSnap?.exists || transaction?.id !== input.transactionId
          || transaction?.storeId !== input.storeId
          || transaction?.workspaceId !== input.spaceId
          || transaction?.type !== (input.direction === 'in' ? 'cash_in' : 'cash_out')
          || transaction?.amount !== input.amount.amount
          || transaction?.currency !== input.amount.currency) {
          throw new HttpsError('failed-precondition', 'Linked cash transaction does not match this payment', { code: 'TRANSACTION_SCOPE_MISMATCH' });
        }
      }

      const now = runtime.now();
      tx.create(paymentRef, {
        id: input.paymentId,
        storeId: input.storeId,
        workspaceId: input.spaceId,
        createdByUserId: uid,
        amount: input.amount,
        direction: input.direction,
        method: input.method,
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.transactionId ? { transactionId: input.transactionId } : {}),
        paidAt: input.paidAt,
        ...(input.note ? { note: input.note } : {}),
        createdAt: now,
        updatedAt: now,
      });
      tx.create(receiptRef, {
        operationId: input.operationId,
        spaceId: input.spaceId,
        actorUserId: uid,
        command: 'createPayment',
        status: 'completed',
        processedAt: now,
        payload: payloadForReceipt(input),
        result: { paymentId: input.paymentId },
      });
      return { outcome: 'created', paymentId: input.paymentId, processedAt: now };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createPayment failed', error);
    throw new HttpsError('internal', 'Payment could not be saved', { code: 'INTERNAL' });
  }
}

export function createTrustedPaymentRuntime(firestore: Firestore): TrustedPaymentRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): CreatePaymentRequest {
  if (!isRecord(value)) throw new HttpsError('invalid-argument', 'Payment request is invalid', { code: 'INVALID_ARGUMENT' });
  for (const field of ['spaceId', 'storeId', 'paymentId', 'operationId'] as const) {
    const candidate = value[field];
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.includes('/')) {
      throw new HttpsError('invalid-argument', `${field} is invalid`, { code: 'INVALID_ARGUMENT' });
    }
  }
  if (!isRecord(value.amount) || typeof value.amount.amount !== 'number'
    || !Number.isFinite(value.amount.amount) || value.amount.amount <= 0
    || typeof value.amount.currency !== 'string' || !SUPPORTED_CURRENCIES.has(value.amount.currency)) {
    throw new HttpsError('invalid-argument', 'Payment amount or currency is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (value.direction !== 'in' && value.direction !== 'out') {
    throw new HttpsError('invalid-argument', 'Payment direction is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.method !== 'string' || !PAYMENT_METHODS.has(value.method)) {
    throw new HttpsError('invalid-argument', 'Payment method is invalid', { code: 'INVALID_ARGUMENT' });
  }
  for (const field of ['customerId', 'transactionId'] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (typeof candidate !== 'string' || !candidate.trim() || candidate.includes('/'))) {
      throw new HttpsError('invalid-argument', `${field} is invalid`, { code: 'INVALID_ARGUMENT' });
    }
  }
  if (typeof value.paidAt !== 'string' || !Number.isFinite(Date.parse(value.paidAt))) {
    throw new HttpsError('invalid-argument', 'Payment date is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new HttpsError('invalid-argument', 'Payment note is invalid', { code: 'INVALID_ARGUMENT' });
  }
  return {
    spaceId: (value.spaceId as string).trim(),
    storeId: (value.storeId as string).trim(),
    paymentId: (value.paymentId as string).trim(),
    operationId: (value.operationId as string).trim(),
    amount: { amount: value.amount.amount, currency: value.amount.currency },
    direction: value.direction,
    method: value.method as CreatePaymentRequest['method'],
    ...(typeof value.customerId === 'string' ? { customerId: value.customerId.trim() } : {}),
    ...(typeof value.transactionId === 'string' ? { transactionId: value.transactionId.trim() } : {}),
    paidAt: value.paidAt,
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim().slice(0, 500) } : {}),
  };
}

function payloadForReceipt(input: CreatePaymentRequest): Record<string, unknown> {
  return {
    spaceId: input.spaceId,
    storeId: input.storeId,
    paymentId: input.paymentId,
    amount: input.amount,
    direction: input.direction,
    method: input.method,
    customerId: input.customerId ?? null,
    transactionId: input.transactionId ?? null,
    paidAt: input.paidAt,
    note: input.note ?? null,
  };
}

function samePayload(receiptPayload: Record<string, unknown> | undefined, input: CreatePaymentRequest): boolean {
  if (!receiptPayload) return false;
  const amount = receiptPayload.amount;
  return receiptPayload.spaceId === input.spaceId
    && receiptPayload.storeId === input.storeId
    && receiptPayload.paymentId === input.paymentId
    && isRecord(amount)
    && amount.amount === input.amount.amount
    && amount.currency === input.amount.currency
    && receiptPayload.direction === input.direction
    && receiptPayload.method === input.method
    && receiptPayload.customerId === (input.customerId ?? null)
    && receiptPayload.transactionId === (input.transactionId ?? null)
    && receiptPayload.paidAt === input.paidAt
    && receiptPayload.note === (input.note ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
