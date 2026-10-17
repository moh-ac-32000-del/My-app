import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { bootstrapPrimarySpaceHandler, createDefaultBootstrapRuntime } from './bootstrapPrimarySpace.js';
import { createSettlementRuntime, settleCustomerDebtHandler } from './settleCustomerDebt.js';
import { createCashTransactionRuntime, createCashTransactionHandler } from './createCashTransaction.js';
import { createTrustedDebtRuntime, trustedDebtCommandHandler } from './trustedDebtCommand.js';
import { createTrustedPaymentRuntime, createPaymentHandler } from './createPayment.js';
import { createStoreProfileRuntime, storeProfileCommandHandler } from './storeProfileCommand.js';
import { createReminderRuntime, reminderCommandHandler } from './reminderCommand.js';

initializeApp();

const firestore = getFirestore();
const runtime = createDefaultBootstrapRuntime(firestore);
const settlementRuntime = createSettlementRuntime(firestore);
const cashTransactionRuntime = createCashTransactionRuntime(firestore);
const trustedDebtRuntime = createTrustedDebtRuntime(firestore);
const trustedPaymentRuntime = createTrustedPaymentRuntime(firestore);
const storeProfileRuntime = createStoreProfileRuntime(firestore);
const reminderRuntime = createReminderRuntime(firestore);

export const bootstrapPrimarySpace = onCall({ invoker: 'public' }, async (request) => (
  bootstrapPrimarySpaceHandler(request, runtime)
));
export const settleCustomerDebt = onCall({ invoker: 'public' }, async (request) => (
  settleCustomerDebtHandler(request, settlementRuntime)
));

export const createCashTransaction = onCall({ invoker: 'public' }, async (request) => (
  createCashTransactionHandler(request, cashTransactionRuntime)
));
export const trustedDebtCommand = onCall({ invoker: 'public' }, async (request) => (
  trustedDebtCommandHandler(request, trustedDebtRuntime)
));

export const createPayment = onCall({ invoker: 'public' }, async (request) => (
  createPaymentHandler(request, trustedPaymentRuntime)
));

export const storeProfileCommand = onCall({ invoker: 'public' }, async (request) => (\n  storeProfileCommandHandler(request, storeProfileRuntime)\n));\n\nexport const reminderCommand = onCall({ invoker: 'public' }, async (request) => (
  reminderCommandHandler(request, reminderRuntime)
));
