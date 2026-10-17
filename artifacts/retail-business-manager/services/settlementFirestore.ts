import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import { createCashTransaction, createPayment, type SettlementDraft, type SettlementResult } from '@/services/storage';
import { listDebtDocuments } from '@/services/debtFirestore';
import { listPaymentDocuments } from '@/services/paymentFirestore';
import type { Transaction } from '@/types/business';

let functions: Functions | null = null;

interface SettlementResponse {
  outcome: 'completed' | 'replayed';
  transactionId: string;
  paymentId: string;
  processedAt: string;
}

export async function settleCustomerDebtInCloud(
  spaceId: string,
  storeId: string,
  customerId: string,
  draft: SettlementDraft,
): Promise<SettlementResult> {
  if (!isFirebaseConfigured) {
    throw new Error('firebaseNotConfigured');
  }
  if (!spaceId.trim()) {
    throw new Error('debtWorkspaceUnavailable');
  }

  const now = new Date().toISOString();
  const transaction = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: draft.amount,
    currency: draft.currency,
    note: `payment_${customerId}`,
  }, now);
  const payment = createPayment(storeId, customerId, {
    amount: draft.amount,
    currency: draft.currency,
    transactionId: transaction.id,
  }, now);
  const operationId = `settlement_${transaction.id}`;

  const callable = httpsCallable<
    {
      spaceId: string;
      storeId: string;
      customerId: string;
      amount: number;
      currency: string;
      operationId: string;
      transactionId: string;
      paymentId: string;
    },
    SettlementResponse
  >(getFunctionsInstance(), 'settleCustomerDebt');

  const response = await callable({
    spaceId,
    storeId,
    customerId,
    amount: draft.amount,
    currency: draft.currency,
    operationId,
    transactionId: transaction.id,
    paymentId: payment.id,
  });

  const result = response.data;
  if (
    !result
    || (result.outcome !== 'completed' && result.outcome !== 'replayed')
    || result.transactionId !== transaction.id
    || result.paymentId !== payment.id
    || typeof result.processedAt !== 'string'
    || !Number.isFinite(Date.parse(result.processedAt))
  ) {
    throw new Error('invalidSettlementResponse');
  }

  const processedAt = result.processedAt;
  const savedTransaction: Transaction = {
    ...transaction,
    createdAt: processedAt,
    updatedAt: processedAt,
  };
  const savedPayment = {
    ...payment,
    paidAt: processedAt,
    createdAt: processedAt,
    updatedAt: processedAt,
  };
  const [debts, payments] = await Promise.all([
    listDebtDocuments(spaceId),
    listPaymentDocuments(spaceId),
  ]);

  return {
    debts: debts.filter((debt) => debt.storeId === storeId)
      .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)),
    payments: payments.filter((item) => item.storeId === storeId)
      .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt)),
    transaction: savedTransaction,
    payment: savedPayment,
  };
}

function getFunctionsInstance(): Functions {
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
  }
  return functions;
}
