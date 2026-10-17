import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);

export interface TrustedDebtCommandRequest {
  action: 'create' | 'update';
  spaceId: string;
  storeId: string;
  customerId: string;
  debtId: string;
  operationId: string;
  currency: string;
  amount: number;
  dueDate?: string;
  updatedAt?: string;
  createdAt?: string;
  originalAmount?: number;
  settledAt?: string;
}

export interface TrustedDebtRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function trustedDebtCommandHandler(
  request: CallableRequest<TrustedDebtCommandRequest>,
  runtime: TrustedDebtRuntime,
): Promise<{ outcome: 'created' | 'updated' | 'replayed'; debtId: string; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required');
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');
  const customerRef = spaceRef.collection('customers').doc(input.customerId);
  const debtRef = spaceRef.collection('debts').doc(input.debtId);
  const receiptRef = spaceRef.collection('operationReceipts').doc(input.operationId);

  try {
    return await db.runTransaction(async (tx) => {
      const spaceSnap = await tx.get(spaceRef);
      const memberSnap = await tx.get(memberRef);
      const profileSnap = await tx.get(profileRef);
      const customerSnap = await tx.get(customerRef);
      const debtSnap = await tx.get(debtRef);
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
      const customer = customerSnap.data();
      if (!customerSnap.exists || customer?.id !== input.customerId || customer?.isActive !== true
        || customer?.storeId !== input.storeId
        || (typeof customer?.workspaceId === 'string' && customer.workspaceId !== input.spaceId)) {
        throw new HttpsError('not-found', 'Active customer was not found', { code: 'CUSTOMER_NOT_FOUND' });
      }

      if (receiptSnap.exists) {
        const receipt = receiptSnap.data() ?? {};
        const result = receipt.result as Record<string, unknown> | undefined;
        if (receipt.command !== 'trustedDebtCommand' || receipt.actorUserId !== uid
          || receipt.spaceId !== input.spaceId || result?.debtId !== input.debtId
          || receipt.action !== input.action) {
          throw new HttpsError('already-exists', 'Operation ID was already used', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return { outcome: 'replayed', debtId: input.debtId, processedAt: String(receipt.processedAt ?? '') };
      }

      if (input.action === 'create' && debtSnap.exists) {
        throw new HttpsError('already-exists', 'Debt ID already exists', { code: 'DEBT_ALREADY_EXISTS' });
      }
      if (input.action === 'update' && !debtSnap.exists) {
        throw new HttpsError('not-found', 'Debt was not found', { code: 'DEBT_NOT_FOUND' });
      }
      if (input.action === 'update') {
        const current = debtSnap.data() ?? {};
        if (current.workspaceId !== input.spaceId || current.storeId !== input.storeId
          || current.customerId !== input.customerId) {
          throw new HttpsError('failed-precondition', 'Debt scope cannot be changed', { code: 'DEBT_SCOPE_MISMATCH' });
        }
      }

      const now = runtime.now();
      if (input.action === 'create') {
        tx.create(debtRef, {
          id: input.debtId,
          storeId: input.storeId,
          workspaceId: input.spaceId,
          createdByUserId: uid,
          customerId: input.customerId,
          currency: input.currency,
          amount: input.amount,
          ...(input.dueDate ? { dueDate: input.dueDate } : {}),
          ...(typeof input.originalAmount === 'number' ? { originalAmount: input.originalAmount } : {}),
          ...(input.settledAt ? { settledAt: input.settledAt } : {}),
          createdAt: input.createdAt ?? now,
          updatedAt: input.updatedAt ?? now,
        });
      } else {
        tx.update(debtRef, {
          currency: input.currency,
          amount: input.amount,
          dueDate: input.dueDate ?? FieldValue.delete(),
          updatedAt: input.updatedAt ?? now,
        });
      }
      tx.create(receiptRef, {
        operationId: input.operationId,
        spaceId: input.spaceId,
        actorUserId: uid,
        command: 'trustedDebtCommand',
        action: input.action,
        status: 'completed',
        processedAt: now,
        result: { debtId: input.debtId },
      });
      return { outcome: input.action === 'create' ? 'created' : 'updated', debtId: input.debtId, processedAt: now };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('trustedDebtCommand failed', error);
    throw new HttpsError('internal', 'Debt could not be saved', { code: 'INTERNAL' });
  }
}

export function createTrustedDebtRuntime(firestore: Firestore): TrustedDebtRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): TrustedDebtCommandRequest {
  if (!isRecord(value)) throw new HttpsError('invalid-argument', 'Debt request is invalid');
  if (value.action !== 'create' && value.action !== 'update') {
    throw new HttpsError('invalid-argument', 'Debt action is invalid');
  }
  for (const field of ['spaceId', 'storeId', 'customerId', 'debtId', 'operationId'] as const) {
    const candidate = value[field];
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.includes('/')) {
      throw new HttpsError('invalid-argument', `${field} is invalid`);
    }
  }
  if (typeof value.currency !== 'string' || !SUPPORTED_CURRENCIES.has(value.currency)) {
    throw new HttpsError('invalid-argument', 'Currency is not supported');
  }
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0) {
    throw new HttpsError('invalid-argument', 'Debt amount must be positive');
  }
  if (value.dueDate !== undefined && (typeof value.dueDate !== 'string' || !Number.isFinite(Date.parse(value.dueDate)))) {
    throw new HttpsError('invalid-argument', 'Due date is invalid');
  }
  for (const field of ['createdAt', 'updatedAt', 'settledAt'] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field] as string)))) {
      throw new HttpsError('invalid-argument', `${field} is invalid`);
    }
  }
  if (value.originalAmount !== undefined && (typeof value.originalAmount !== 'number'
    || !Number.isFinite(value.originalAmount) || value.originalAmount < value.amount)) {
    throw new HttpsError('invalid-argument', 'Original amount is invalid');
  }
  return {
    action: value.action,
    spaceId: (value.spaceId as string).trim(),
    storeId: (value.storeId as string).trim(),
    customerId: (value.customerId as string).trim(),
    debtId: (value.debtId as string).trim(),
    operationId: (value.operationId as string).trim(),
    currency: value.currency,
    amount: value.amount,
    ...(typeof value.dueDate === 'string' ? { dueDate: value.dueDate } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.originalAmount === 'number' ? { originalAmount: value.originalAmount } : {}),
    ...(typeof value.settledAt === 'string' ? { settledAt: value.settledAt } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
