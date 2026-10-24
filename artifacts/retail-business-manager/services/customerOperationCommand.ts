import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from './firebase';

export type CustomerOperationDraft = { action: 'cancel'; kind: 'debt' | 'payment' } | {
  action: 'edit'; kind: 'debt' | 'payment'; amountExact: string; operationDate: string;
  note: string; dueDate?: string; method?: string;
};
export type CustomerOperationCommand = CustomerOperationDraft & { operationId: string; spaceId: string; storeId: string;
  customerId: string; targetId: string; expectedUpdatedAt: string; expectedRevision: number };

/** No local write, balance mutation, or success until the trusted transaction acknowledges. */
export async function sendCustomerOperationCommand(input: CustomerOperationCommand) {
  const response = await httpsCallable<CustomerOperationCommand, Record<string, unknown>>(getFunctions(getFirebaseApp()), 'customerOperationCommand')(input);
  const result = response.data;
  if (!result || !['completed','replayed'].includes(String(result.outcome)) || result.targetId !== input.targetId ||
    typeof result.processedAt !== 'string' || !Number.isFinite(Date.parse(result.processedAt))) throw new Error('invalidCustomerOperationResponse');
  return result;
}
