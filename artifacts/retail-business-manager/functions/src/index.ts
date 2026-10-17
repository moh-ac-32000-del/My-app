import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { bootstrapPrimarySpaceHandler, createDefaultBootstrapRuntime } from './bootstrapPrimarySpace.js';
import { createSettlementRuntime, settleCustomerDebtHandler } from './settleCustomerDebt.js';
import { createCashTransactionRuntime, createCashTransactionHandler } from './createCashTransaction.js';

initializeApp();

const firestore = getFirestore();
const runtime = createDefaultBootstrapRuntime(firestore);
const settlementRuntime = createSettlementRuntime(firestore);
const cashTransactionRuntime = createCashTransactionRuntime(firestore);

export const bootstrapPrimarySpace = onCall({ invoker: 'public' }, async (request) => (
  bootstrapPrimarySpaceHandler(request, runtime)
));
export const settleCustomerDebt = onCall({ invoker: 'public' }, async (request) => (
  settleCustomerDebtHandler(request, settlementRuntime)
));

export const createCashTransaction = onCall({ invoker: 'public' }, async (request) => (
  createCashTransactionHandler(request, cashTransactionRuntime)
));
