import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { pushDeviceCommandHandler } from './pushDeviceCommand.js';
import { onCall } from 'firebase-functions/v2/https';
import { bootstrapPrimarySpaceHandler, createDefaultBootstrapRuntime } from './bootstrapPrimarySpace.js';
import { createSettlementRuntime, settleCustomerDebtHandler } from './settleCustomerDebt.js';
import { createCashTransactionRuntime, createCashTransactionHandler } from './createCashTransaction.js';
import { createTrustedDebtRuntime, trustedDebtCommandHandler } from './trustedDebtCommand.js';
import { createTrustedPaymentRuntime, createPaymentHandler } from './createPayment.js';
import { createStoreProfileRuntime, storeProfileCommandHandler } from './storeProfileCommand.js';
import { createReminderRuntime, reminderCommandHandler } from './reminderCommand.js';
import { createDailyArchiveRuntime, dailyArchiveCommandHandler } from './dailyArchiveCommand.js';

initializeApp();

const firestore = getFirestore();
export const pushDeviceCommand = onCall({ invoker: 'public', minInstances: 0, maxInstances: 1, concurrency: 1, memory: '256MiB', cpu: 'gcf_gen1', timeoutSeconds: 30 }, (request) => (
  pushDeviceCommandHandler(request, { firestore, messaging: getMessaging(), now: () => Date.now() })
));
const runtime = createDefaultBootstrapRuntime(firestore);
const settlementRuntime = createSettlementRuntime(firestore);
const cashTransactionRuntime = createCashTransactionRuntime(firestore);
const trustedDebtRuntime = createTrustedDebtRuntime(firestore);
const trustedPaymentRuntime = createTrustedPaymentRuntime(firestore);
const storeProfileRuntime = createStoreProfileRuntime(firestore);
const reminderRuntime = createReminderRuntime(firestore);
const dailyArchiveRuntime = createDailyArchiveRuntime(firestore);

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

export const storeProfileCommand = onCall({ invoker: 'public' }, async (request) => (
  storeProfileCommandHandler(request, storeProfileRuntime)
));

export const reminderCommand = onCall({ invoker: 'public' }, async (request) => (
  reminderCommandHandler(request, reminderRuntime)
));

export const dailyArchiveCommand = onCall({ invoker: 'public' }, async (request) => (
  dailyArchiveCommandHandler(request, dailyArchiveRuntime)
));
