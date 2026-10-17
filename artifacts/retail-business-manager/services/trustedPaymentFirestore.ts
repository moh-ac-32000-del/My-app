import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { Payment } from '@/types/business';

interface TrustedPaymentResponse {
  outcome: 'created' | 'replayed';
  paymentId: string;
  processedAt: string;
}

let functions: Functions | null = null;

export async function createTrustedPayment(spaceId: string, payment: Payment): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  if (!spaceId.trim()) throw new Error('paymentWorkspaceUnavailable');
  const callable = httpsCallable<Record<string, unknown>, TrustedPaymentResponse>(
    getFunctionsInstance(),
    'createPayment',
  );
  const response = await callable({
    spaceId,
    storeId: payment.storeId,
    paymentId: payment.id,
    operationId: `payment_create_${payment.id}`,
    amount: payment.amount,
    direction: payment.direction,
    method: payment.method,
    ...(payment.customerId ? { customerId: payment.customerId } : {}),
    ...(payment.transactionId ? { transactionId: payment.transactionId } : {}),
    paidAt: payment.paidAt,
    ...(payment.note ? { note: payment.note } : {}),
  });
  const result = response.data;
  if (!result || !['created', 'replayed'].includes(result.outcome)
    || result.paymentId !== payment.id || !Number.isFinite(Date.parse(result.processedAt))) {
    throw new Error('invalidTrustedPaymentResponse');
  }
}

function getFunctionsInstance(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}
