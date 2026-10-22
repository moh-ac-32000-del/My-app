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
import { workspaceCommandHandler } from './workspaceCommand.js';
import { merchantCommandHandler } from './merchantCommand.js';
import { merchantSettingsCommandHandler } from './merchantSettingsCommand.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean } from 'firebase-functions/params';
import { dispatchAutomaticClosings } from './automaticClosing.js';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { dispatchNotifications, wakeNotificationEvent } from './notificationDispatch.js';

// Explicit rollout gate: deploy all trusted writers and indexes before enabling activation/dispatch.
const automaticClosingReady = defineBoolean('AUTOMATIC_CLOSING_READY', { default: false });
const notificationDispatchReady = defineBoolean('NOTIFICATION_DISPATCH_READY', { default: false });

initializeApp();

const firestore = getFirestore();
export const merchantSettingsCommand = onCall({ invoker: 'public', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 },
  (request) => merchantSettingsCommandHandler(request, { firestore, now: () => new Date().toISOString() }),
);
// Source registration only. Deploy this reviewed feature with its rules/indexes and matching clients.
export const merchantCommand = onCall({ invoker: 'public', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 },
  (request) => merchantCommandHandler(request, { firestore, now: () => new Date().toISOString() }),
);
export const workspaceCommand = onCall(
  { invoker: 'public', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 },
  (request) =>
    workspaceCommandHandler(request, {
      firestore,
      now: () => new Date().toISOString(),
      automaticClosingReady: automaticClosingReady.value(),
    }),
);
export const automaticDailyClosing = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'UTC',
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 120,
    retryCount: 0,
  },
  async () => {
    if (!automaticClosingReady.value()) return;
    const result = await dispatchAutomaticClosings({ firestore, now: () => new Date().toISOString() });
    console.info('Automatic closing bounded dispatch', result);
  },
);
export const pushDeviceCommand = onCall(
  {
    invoker: 'public',
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 30,
  },
  (request) => pushDeviceCommandHandler(request, { firestore, messaging: getMessaging(), now: () => Date.now(), notificationDispatchReady: notificationDispatchReady.value() }),
);
// No deployed behavior until this independently reviewed opt-in gate is enabled.
export const notificationDispatch = onSchedule({ schedule: '*/5 * * * *', timeZone: 'UTC', minInstances: 0,
  maxInstances: 1, concurrency: 1, memory: '256MiB', cpu: 'gcf_gen1', timeoutSeconds: 120, retryCount: 0 }, async () => {
  if (!notificationDispatchReady.value()) return;
  const result = await dispatchNotifications({ firestore, messaging: getMessaging(), now: () => new Date().toISOString() });
  console.info('Notification bounded dispatch', result);
});
const notificationSourceOptions = { minInstances: 0, maxInstances: 1, concurrency: 1, memory: '256MiB' as const,
  cpu: 'gcf_gen1' as const, timeoutSeconds: 60, retry: true };
export const notificationDebtChanged = onDocumentWritten({ ...notificationSourceOptions, document: 'spaces/{spaceId}/debts/{documentId}' }, async event => {
  if (!notificationDispatchReady.value()) return;
  console.info('Notification source wake', await wakeNotificationEvent({ firestore, now: () => new Date().toISOString() }, event.params.spaceId, event.time));
});
export const notificationReminderChanged = onDocumentWritten({ ...notificationSourceOptions, document: 'spaces/{spaceId}/reminders/{documentId}' }, async event => {
  if (!notificationDispatchReady.value()) return;
  console.info('Notification source wake', await wakeNotificationEvent({ firestore, now: () => new Date().toISOString() }, event.params.spaceId, event.time));
});
const runtime = createDefaultBootstrapRuntime(firestore);
const settlementRuntime = createSettlementRuntime(firestore);
const cashTransactionRuntime = createCashTransactionRuntime(firestore);
const trustedDebtRuntime = createTrustedDebtRuntime(firestore);
const trustedPaymentRuntime = createTrustedPaymentRuntime(firestore);
const storeProfileRuntime = createStoreProfileRuntime(firestore);
const reminderRuntime = createReminderRuntime(firestore);
const dailyArchiveRuntime = createDailyArchiveRuntime(firestore);

export const bootstrapPrimarySpace = onCall({ invoker: 'public' }, async (request) =>
  bootstrapPrimarySpaceHandler(request, runtime),
);
export const settleCustomerDebt = onCall({ invoker: 'public' }, async (request) =>
  settleCustomerDebtHandler(request, settlementRuntime),
);

export const createCashTransaction = onCall({ invoker: 'public' }, async (request) =>
  createCashTransactionHandler(request, cashTransactionRuntime),
);
export const trustedDebtCommand = onCall({ invoker: 'public' }, async (request) =>
  trustedDebtCommandHandler(request, trustedDebtRuntime),
);

export const createPayment = onCall({ invoker: 'public' }, async (request) =>
  createPaymentHandler(request, trustedPaymentRuntime),
);

export const storeProfileCommand = onCall({ invoker: 'public' }, async (request) =>
  storeProfileCommandHandler(request, storeProfileRuntime),
);

export const reminderCommand = onCall({ invoker: 'public' }, async (request) =>
  reminderCommandHandler(request, reminderRuntime),
);

export const dailyArchiveCommand = onCall({ invoker: 'public' }, async (request) =>
  dailyArchiveCommandHandler(request, dailyArchiveRuntime),
);
