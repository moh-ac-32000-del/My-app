import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { Transaction } from '@/types/business';

interface CreateCashTransactionResponse {
  outcome: 'created' | 'replayed';
  transactionId: string;
  processedAt: string;
}

let functions: Functions | null = null;

export async function createTrustedCashTransaction(spaceId: string, transaction: Transaction): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  if (!spaceId.trim()) {
    throw new Error('transactionWorkspaceUnavailable');
  }

  const callable = httpsCallable<{
    spaceId: string;
    storeId: string;
    transactionId: string;
    operationId: string;
    type: 'cash_in' | 'cash_out';
    amount: number;
    currency: string;
    note?: string;
  }, CreateCashTransactionResponse>(getFunctionsInstance(), 'createCashTransaction');

  const response = await callable({
    spaceId,
    storeId: transaction.storeId,
    transactionId: transaction.id,
    operationId: `cash_transaction_${transaction.id}`,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    ...(transaction.note ? { note: transaction.note } : {}),
  });
  const result = response.data;
  if (!result
    || (result.outcome !== 'created' && result.outcome !== 'replayed')
    || result.transactionId !== transaction.id
    || typeof result.processedAt !== 'string'
    || !Number.isFinite(Date.parse(result.processedAt))) {
    throw new Error('invalidCashTransactionResponse');
  }
}

function getFunctionsInstance(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
  }
  return functions;
}
