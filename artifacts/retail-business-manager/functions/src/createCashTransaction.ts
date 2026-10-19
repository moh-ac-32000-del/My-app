import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { assertWorkspaceAccess } from './workspaceAccess.js';

const SUPPORTED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'SYP']);

export interface CreateCashTransactionRequest {
  spaceId: string;
  storeId: string;
  transactionId: string;
  operationId: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  currency: string;
  note?: string;
}

export interface CashTransactionRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function createCashTransactionHandler(
  request: CallableRequest<CreateCashTransactionRequest>,
  runtime: CashTransactionRuntime,
): Promise<{ outcome: 'created' | 'replayed'; transactionId: string; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Firebase Auth is required', { code: 'UNAUTHENTICATED' });
  }
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');
  const transactionRef = spaceRef.collection('transactions').doc(input.transactionId);
  const receiptRef = spaceRef.collection('operationReceipts').doc(input.operationId);

  try {
    return await db.runTransaction(async (transaction) => {
      const [spaceSnap, memberSnap, profileSnap, receiptSnap, transactionSnap] = await Promise.all([
        transaction.get(spaceRef),
        transaction.get(memberRef),
        transaction.get(profileRef),
        transaction.get(receiptRef),
        transaction.get(transactionRef),
      ]);
      if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
      }
      assertWorkspaceAccess(memberSnap.data(), 'write');
      if (!profileSnap.exists || profileSnap.data()?.storeId !== input.storeId) {
        throw new HttpsError('permission-denied', 'Store profile does not match workspace', { code: 'STORE_SCOPE_MISMATCH' });
      }
      if (receiptSnap.exists) {
        const receipt = receiptSnap.data() ?? {};
        const result = receipt.result as Record<string, unknown> | undefined;
        const payload = receipt.payload as Record<string, unknown> | undefined;
        const receiptMatches = payload
          ? samePayload(payload, input)
          : sameLegacyCashTransaction(receipt, transactionSnap.data() ?? {}, input);
        if (receipt.command !== 'createCashTransaction'
          || receipt.actorUserId !== uid
          || receipt.spaceId !== input.spaceId
          || result?.transactionId !== input.transactionId
          || !receiptMatches) {
          throw new HttpsError('already-exists', 'Operation ID was already used', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return {
          outcome: 'replayed',
          transactionId: input.transactionId,
          processedAt: String(receipt.processedAt ?? ''),
        };
      }
      if (transactionSnap.exists) {
        throw new HttpsError('already-exists', 'Transaction ID already exists', { code: 'TRANSACTION_ALREADY_EXISTS' });
      }

      const now = runtime.now();
      transaction.create(transactionRef, {
        id: input.transactionId,
        storeId: input.storeId,
        workspaceId: input.spaceId,
        createdByUserId: uid,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        ...(input.note ? { note: input.note } : {}),
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(receiptRef, {
        operationId: input.operationId,
        spaceId: input.spaceId,
        actorUserId: uid,
        command: 'createCashTransaction',
        status: 'completed',
        processedAt: now,
        payload: payloadForReceipt(input),
        result: { transactionId: input.transactionId },
      });
      return { outcome: 'created', transactionId: input.transactionId, processedAt: now };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createCashTransaction failed', error);
    throw new HttpsError('internal', 'Cash transaction could not be saved', { code: 'INTERNAL' });
  }
}

function validateRequest(value: unknown): CreateCashTransactionRequest {
  if (!isRecord(value)) {
    throw new HttpsError('invalid-argument', 'Transaction request is invalid', { code: 'INVALID_ARGUMENT' });
  }
  for (const field of ['spaceId', 'storeId', 'transactionId', 'operationId'] as const) {
    const candidate = value[field];
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.includes('/')) {
      throw new HttpsError('invalid-argument', `${field} is invalid`, { code: 'INVALID_ARGUMENT' });
    }
  }
  if (value.type !== 'cash_in' && value.type !== 'cash_out') {
    throw new HttpsError('invalid-argument', 'Transaction type is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0) {
    throw new HttpsError('invalid-argument', 'Transaction amount must be positive', { code: 'INVALID_ARGUMENT' });
  }
  if (typeof value.currency !== 'string' || !SUPPORTED_CURRENCIES.has(value.currency)) {
    throw new HttpsError('invalid-argument', 'Currency is not supported', { code: 'INVALID_ARGUMENT' });
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new HttpsError('invalid-argument', 'Transaction note is invalid', { code: 'INVALID_ARGUMENT' });
  }
  return {
    spaceId: (value.spaceId as string).trim(),
    storeId: (value.storeId as string).trim(),
    transactionId: (value.transactionId as string).trim(),
    operationId: (value.operationId as string).trim(),
    type: value.type,
    amount: value.amount,
    currency: value.currency,
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim().slice(0, 500) } : {}),
  };
}

function payloadForReceipt(input: CreateCashTransactionRequest): Record<string, unknown> {
  return {
    spaceId: input.spaceId,
    storeId: input.storeId,
    transactionId: input.transactionId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    note: input.note ?? null,
  };
}

function samePayload(receiptPayload: Record<string, unknown>, input: CreateCashTransactionRequest): boolean {
  return receiptPayload.spaceId === input.spaceId
    && receiptPayload.storeId === input.storeId
    && receiptPayload.transactionId === input.transactionId
    && receiptPayload.type === input.type
    && receiptPayload.amount === input.amount
    && receiptPayload.currency === input.currency
    && receiptPayload.note === (input.note ?? null);
}

function sameLegacyCashTransaction(
  receipt: Record<string, unknown>,
  transaction: Record<string, unknown>,
  input: CreateCashTransactionRequest,
): boolean {
  return transaction.id === input.transactionId
    && transaction.storeId === input.storeId
    && transaction.workspaceId === input.spaceId
    && transaction.type === input.type
    && transaction.amount === input.amount
    && transaction.currency === input.currency
    && (transaction.note ?? null) === (input.note ?? null)
    && transaction.createdAt === receipt.processedAt
    && transaction.updatedAt === receipt.processedAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createCashTransactionRuntime(firestore: Firestore): CashTransactionRuntime {
  return { firestore, now: () => new Date().toISOString() };
}
