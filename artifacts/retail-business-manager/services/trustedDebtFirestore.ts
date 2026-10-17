import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { Debt } from '@/types/business';

interface TrustedDebtResponse {
  outcome: 'created' | 'updated' | 'replayed';
  debtId: string;
  processedAt: string;
}

let functions: Functions | null = null;

export async function createTrustedDebt(spaceId: string, debt: Debt): Promise<void> {
  await sendCommand(spaceId, debt, 'create', `debt_create_${debt.id}`);
}

export async function updateTrustedDebt(spaceId: string, debt: Debt): Promise<void> {
  const revision = debt.updatedAt || new Date().toISOString();
  await sendCommand(spaceId, debt, 'update', `debt_update_${debt.id}_${revision.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
}

async function sendCommand(
  spaceId: string,
  debt: Debt,
  action: 'create' | 'update',
  operationId: string,
): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  if (!spaceId.trim()) throw new Error('debtWorkspaceUnavailable');
  const callable = httpsCallable<Record<string, unknown>, TrustedDebtResponse>(
    getFunctionsInstance(),
    'trustedDebtCommand',
  );
  const response = await callable({
    action,
    spaceId,
    storeId: debt.storeId,
    customerId: debt.customerId,
    debtId: debt.id,
    operationId,
    currency: debt.currency,
    amount: debt.amount,
    ...(debt.dueDate ? { dueDate: debt.dueDate } : {}),
    ...(debt.createdAt ? { createdAt: debt.createdAt } : {}),
    ...(debt.updatedAt ? { updatedAt: debt.updatedAt } : {}),
    ...(typeof debt.originalAmount === 'number' ? { originalAmount: debt.originalAmount } : {}),
    ...(debt.settledAt ? { settledAt: debt.settledAt } : {}),
  });
  const result = response.data;
  if (!result || !['created', 'updated', 'replayed'].includes(result.outcome)
    || result.debtId !== debt.id || !Number.isFinite(Date.parse(result.processedAt))) {
    throw new Error('invalidTrustedDebtResponse');
  }
}

function getFunctionsInstance(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}
