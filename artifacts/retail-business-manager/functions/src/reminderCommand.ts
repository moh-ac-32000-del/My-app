import type { CollectionReference, DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { activeWorkspaceRole } from '../../data/workspaceAccess.js';

const SYSTEM_DUE_DATE_NOTE = 'system:due-date';
const STATUSES = new Set(['pending', 'completed', 'dismissed']);

type ReminderCommandRequest = {
  action: 'list' | 'create' | 'updateStatus' | 'delete';
  spaceId: string;
  storeId: string;
  reminder?: {
    id: string;
    debtId: string;
    remindAt: string;
    note?: string;
  };
  reminderId?: string;
  status?: 'pending' | 'completed' | 'dismissed';
  notificationTime?: string;
};

type ReminderRecord = {
  id: string;
  storeId: string;
  workspaceId: string;
  debtId: string;
  remindAt: string;
  status: 'pending' | 'completed' | 'dismissed';
  note?: string;
  completedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export interface ReminderRuntime {
  firestore: Firestore;
  now: () => string;
}

export async function reminderCommandHandler(
  request: CallableRequest<ReminderCommandRequest>,
  runtime: ReminderRuntime,
): Promise<{ reminders: ReminderRecord[]; processedAt: string }> {
  const uid = request.auth?.uid?.trim();
  if (!uid)
    throw new HttpsError('unauthenticated', 'Firebase Auth is required', {
      code: 'UNAUTHENTICATED',
    });
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const remindersRef = spaceRef.collection('reminders');

  if (input.action === 'create') {
    await db.runTransaction(async (transaction) => {
      await authorizeReminderScope(transaction, spaceRef, uid, input.storeId, 'write');
      const reminder = input.reminder!;
      const debtRef = spaceRef.collection('debts').doc(reminder.debtId);
      const [debtSnap, existingSnap] = await Promise.all([transaction.get(debtRef), transaction.get(remindersRef.doc(reminder.id))]);
      if (!debtSnap.exists || debtSnap.data()?.storeId !== input.storeId) {
        throw new HttpsError('not-found', 'Debt was not found in this store', {
          code: 'DEBT_NOT_FOUND',
        });
      }
      const debt = debtSnap.data()!;
      if (typeof debt.amount !== 'number' || debt.amount <= 0 || debt.settledAt) {
        throw new HttpsError('failed-precondition', 'A reminder requires an outstanding debt', { code: 'DEBT_NOT_OUTSTANDING' });
      }
      if (existingSnap.exists) {
        const existing = normalizeReminder(reminder.id, existingSnap.data(), input.spaceId, input.storeId);
        if (
          existing &&
          !existing.deletedAt &&
          existing.debtId === reminder.debtId &&
          existing.remindAt === reminder.remindAt &&
          existing.note === reminder.note
        ) {
          return;
        }
        throw new HttpsError('already-exists', 'Reminder ID already exists', {
          code: 'REMINDER_EXISTS',
        });
      }
      const now = runtime.now();
      const record: ReminderRecord = {
        id: reminder.id,
        storeId: input.storeId,
        workspaceId: input.spaceId,
        debtId: reminder.debtId,
        remindAt: reminder.remindAt,
        status: 'pending',
        ...(reminder.note ? { note: reminder.note } : {}),
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(remindersRef.doc(record.id), {
        ...record,
        createdByUserId: uid,
        updatedByUserId: uid,
      });
    });
  } else if (input.action === 'updateStatus' || input.action === 'delete') {
    const reminderRef = remindersRef.doc(input.reminderId!);
    await db.runTransaction(async (transaction) => {
      await authorizeReminderScope(transaction, spaceRef, uid, input.storeId, 'write');
      const snapshot = await transaction.get(reminderRef);
      const existing = normalizeReminder(input.reminderId!, snapshot.data(), input.spaceId, input.storeId);
      if (!snapshot.exists || !existing || (existing.deletedAt && input.action !== 'delete')) {
        throw new HttpsError('not-found', 'Reminder was not found', {
          code: 'REMINDER_NOT_FOUND',
        });
      }
      if (existing.deletedAt) return;
      if (existing.note === SYSTEM_DUE_DATE_NOTE && input.status === 'pending') {
        throw new HttpsError('failed-precondition', 'Generated reminders cannot be reset manually', { code: 'SYSTEM_REMINDER_STATUS' });
      }
      const now = runtime.now();
      transaction.update(
        reminderRef,
        input.action === 'delete'
          ? {
              deletedAt: now,
              status: 'dismissed',
              updatedAt: now,
              updatedByUserId: uid,
            }
          : {
              status: input.status,
              updatedAt: now,
              completedAt: input.status === 'completed' ? now : null,
              updatedByUserId: uid,
            },
      );
    });
  }

  return {
    reminders: await listAndReconcile(input, runtime, remindersRef, spaceRef, uid),
    processedAt: runtime.now(),
  };
}

async function authorizeReminderScope(
  tx: Transaction,
  spaceRef: DocumentReference,
  uid: string,
  storeId: string,
  action: 'read' | 'write',
) {
  const [space, member, profile] = await Promise.all([
    tx.get(spaceRef),
    tx.get(spaceRef.collection('members').doc(uid)),
    tx.get(spaceRef.collection('storeProfile').doc('profile')),
  ]);
  if (space.data()?.status !== 'active')
    throw new HttpsError('failed-precondition', 'Workspace is unavailable', {
      code: 'SPACE_NOT_FOUND',
    });
  assertWorkspaceAccess(member.data(), action);
  if (profile.data()?.storeId !== storeId)
    throw new HttpsError('permission-denied', 'Store profile does not match workspace', { code: 'STORE_MISMATCH' });
  return activeWorkspaceRole(member.data());
}

export function createReminderRuntime(firestore: Firestore): ReminderRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): ReminderCommandRequest {
  if (
    !isRecord(value) ||
    !['list', 'create', 'updateStatus', 'delete'].includes(String(value.action)) ||
    typeof value.spaceId !== 'string' ||
    !value.spaceId.trim() ||
    value.spaceId.includes('/') ||
    typeof value.storeId !== 'string' ||
    !value.storeId.trim() ||
    value.storeId.includes('/')
  ) {
    throw new HttpsError('invalid-argument', 'Reminder command is invalid', {
      code: 'INVALID_ARGUMENT',
    });
  }
  const input = value as unknown as ReminderCommandRequest;
  if (input.action === 'create') {
    const reminder = input.reminder;
    if (
      !reminder ||
      !validId(reminder.id) ||
      !validId(reminder.debtId) ||
      !validTimestamp(reminder.remindAt) ||
      (reminder.note !== undefined &&
        (typeof reminder.note !== 'string' || reminder.note.length > 500 || reminder.note === SYSTEM_DUE_DATE_NOTE))
    ) {
      throw new HttpsError('invalid-argument', 'Reminder details are invalid', {
        code: 'INVALID_ARGUMENT',
      });
    }
  }
  if (input.action === 'updateStatus' && (!validId(input.reminderId) || !STATUSES.has(String(input.status)))) {
    throw new HttpsError('invalid-argument', 'Reminder status update is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (input.action === 'delete' && !validId(input.reminderId)) {
    throw new HttpsError('invalid-argument', 'Reminder identifier is invalid', {
      code: 'INVALID_ARGUMENT',
    });
  }
  if (input.notificationTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.notificationTime)) {
    throw new HttpsError('invalid-argument', 'Notification time is invalid', {
      code: 'INVALID_ARGUMENT',
    });
  }
  return {
    ...input,
    spaceId: input.spaceId.trim(),
    storeId: input.storeId.trim(),
  };
}

async function listAndReconcile(
  input: ReminderCommandRequest,
  runtime: ReminderRuntime,
  remindersRef: CollectionReference,
  spaceRef: DocumentReference,
  uid: string,
): Promise<ReminderRecord[]> {
  return runtime.firestore.runTransaction(async (tx) => {
    const role = await authorizeReminderScope(tx, spaceRef, uid, input.storeId, 'read');
    const reminderSnapshot = await tx.get(remindersRef.where('storeId', '==', input.storeId));
    const existing = reminderSnapshot.docs
      .map((doc) => normalizeReminder(doc.id, doc.data(), input.spaceId, input.storeId))
      .filter((item): item is ReminderRecord => item !== null);
    const visible = (records: ReminderRecord[]) =>
      records.filter((item) => !item.deletedAt).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    // A list request from a viewer is genuinely read-only, including automatic reminder maintenance.
    if (role === 'viewer') return visible(existing);
    const debtSnapshot = await tx.get(spaceRef.collection('debts').where('storeId', '==', input.storeId));
    const debts: Array<{
      id: string;
      amount?: unknown;
      settledAt?: unknown;
      dueDate?: unknown;
    }> = debtSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as {
        amount?: unknown;
        settledAt?: unknown;
        dueDate?: unknown;
      }),
    }));
    const byDebt = new Map(debts.map((debt) => [debt.id, debt]));
    const byId = new Map(existing.map((reminder) => [reminder.id, reminder]));
    const notificationTime = input.notificationTime ?? '09:00';
    const now = runtime.now();
    const pending: Array<() => void> = [];

    for (const debt of debts) {
      if (
        typeof debt.amount !== 'number' ||
        debt.amount <= 0 ||
        debt.settledAt ||
        typeof debt.dueDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate)
      )
        continue;
      const id = `due-date_${debt.id}`;
      const reference = remindersRef.doc(id);
      const remindAt = `${debt.dueDate}T${notificationTime}:00`;
      const previous = byId.get(id);
      if (!previous) {
        // Never overwrite a concurrently created/deleted reminder with a stale list snapshot.
        const record: ReminderRecord = {
          id,
          storeId: input.storeId,
          workspaceId: input.spaceId,
          debtId: debt.id,
          remindAt,
          status: 'pending',
          note: SYSTEM_DUE_DATE_NOTE,
          createdAt: now,
          updatedAt: now,
        };
        pending.push(() =>
          tx.create(reference, {
            ...record,
            createdByUserId: uid,
            updatedByUserId: uid,
          }),
        );
        byId.set(id, record);
      } else if (
        !previous.deletedAt &&
        previous.note === SYSTEM_DUE_DATE_NOTE &&
        previous.status === 'pending' &&
        previous.remindAt !== remindAt
      ) {
        pending.push(() =>
          tx.update(reference, {
            remindAt,
            updatedAt: now,
            updatedByUserId: uid,
          }),
        );
        byId.set(id, { ...previous, remindAt, updatedAt: now });
      }
    }

    for (const reminder of existing) {
      if (reminder.deletedAt || reminder.note !== SYSTEM_DUE_DATE_NOTE || reminder.status !== 'pending') continue;
      const debt = byDebt.get(reminder.debtId);
      const shouldExist = Boolean(
        debt &&
        typeof debt.amount === 'number' &&
        debt.amount > 0 &&
        !debt.settledAt &&
        typeof debt.dueDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate),
      );
      if (!shouldExist) {
        pending.push(() => tx.delete(remindersRef.doc(reminder.id)));
        byId.delete(reminder.id);
      }
    }
    if (pending.length > 450)
      throw new HttpsError('resource-exhausted', 'Too many reminders to reconcile in one request', {
        code: 'REMINDER_RECONCILIATION_LIMIT',
      });
    pending.forEach((write) => write());
    return visible([...byId.values()]);
  });
}

function normalizeReminder(id: string, value: unknown, spaceId: string, storeId: string): ReminderRecord | null {
  if (
    !isRecord(value) ||
    value.id !== id ||
    value.storeId !== storeId ||
    value.workspaceId !== spaceId ||
    !validId(value.debtId) ||
    !validTimestamp(value.remindAt) ||
    !STATUSES.has(String(value.status)) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt)
  )
    return null;
  return {
    id,
    storeId,
    workspaceId: spaceId,
    debtId: value.debtId,
    remindAt: value.remindAt,
    status: value.status as ReminderRecord['status'],
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(typeof value.deletedAt === 'string' ? { deletedAt: value.deletedAt } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !value.includes('/');
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.length <= 50;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
