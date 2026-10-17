import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

const SYSTEM_DUE_DATE_NOTE = 'system:due-date';
const STATUSES = new Set(['pending', 'completed', 'dismissed']);

type ReminderCommandRequest = {
  action: 'list' | 'create' | 'updateStatus';
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
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required', { code: 'UNAUTHENTICATED' });
  const input = validateRequest(request.data);
  const db = runtime.firestore;
  const spaceRef = db.collection('spaces').doc(input.spaceId);
  const memberRef = spaceRef.collection('members').doc(uid);
  const profileRef = spaceRef.collection('storeProfile').doc('profile');
  const remindersRef = spaceRef.collection('reminders');

  const [spaceSnap, memberSnap, profileSnap] = await Promise.all([
    spaceRef.get(), memberRef.get(), profileRef.get(),
  ]);
  if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Workspace is unavailable', { code: 'SPACE_NOT_FOUND' });
  }
  if (!memberSnap.exists || memberSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active workspace membership is required', { code: 'FORBIDDEN' });
  }
  if (!profileSnap.exists || profileSnap.data()?.storeId !== input.storeId) {
    throw new HttpsError('permission-denied', 'Store profile does not match workspace', { code: 'STORE_MISMATCH' });
  }

  if (input.action === 'create') {
    const reminder = input.reminder!;
    const debtRef = spaceRef.collection('debts').doc(reminder.debtId);
    const [debtSnap, existingSnap] = await Promise.all([
      debtRef.get(), remindersRef.doc(reminder.id).get(),
    ]);
    if (!debtSnap.exists || debtSnap.data()?.storeId !== input.storeId) {
      throw new HttpsError('not-found', 'Debt was not found in this store', { code: 'DEBT_NOT_FOUND' });
    }
    const debt = debtSnap.data()!;
    if (typeof debt.amount !== 'number' || debt.amount <= 0 || debt.settledAt) {
      throw new HttpsError('failed-precondition', 'A reminder requires an outstanding debt', { code: 'DEBT_NOT_OUTSTANDING' });
    }
    if (existingSnap.exists) {
      const existing = normalizeReminder(reminder.id, existingSnap.data(), input.spaceId, input.storeId);
      if (existing && existing.debtId === reminder.debtId && existing.remindAt === reminder.remindAt && existing.note === reminder.note) {
        return { reminders: await listAndReconcile(input, runtime, remindersRef, spaceRef), processedAt: runtime.now() };
      }
      throw new HttpsError('already-exists', 'Reminder ID already exists', { code: 'REMINDER_EXISTS' });
    }
    const now = runtime.now();
    const record: ReminderRecord = {
      id: reminder.id, storeId: input.storeId, workspaceId: input.spaceId,
      debtId: reminder.debtId, remindAt: reminder.remindAt, status: 'pending',
      ...(reminder.note ? { note: reminder.note } : {}),
      createdAt: now, updatedAt: now,
    };
    await remindersRef.doc(record.id).create(record);
  } else if (input.action === 'updateStatus') {
    const reminderRef = remindersRef.doc(input.reminderId!);
    const snapshot = await reminderRef.get();
    const existing = normalizeReminder(input.reminderId!, snapshot.data(), input.spaceId, input.storeId);
    if (!snapshot.exists || !existing) {
      throw new HttpsError('not-found', 'Reminder was not found', { code: 'REMINDER_NOT_FOUND' });
    }
    if (existing.note === SYSTEM_DUE_DATE_NOTE && input.status === 'pending') {
      throw new HttpsError('failed-precondition', 'Generated reminders cannot be reset manually', { code: 'SYSTEM_REMINDER_STATUS' });
    }
    const now = runtime.now();
    await reminderRef.update({
      status: input.status,
      updatedAt: now,
      ...(input.status === 'completed' ? { completedAt: now } : { completedAt: null }),
    });
  }

  return { reminders: await listAndReconcile(input, runtime, remindersRef, spaceRef), processedAt: runtime.now() };
}

export function createReminderRuntime(firestore: Firestore): ReminderRuntime {
  return { firestore, now: () => new Date().toISOString() };
}

function validateRequest(value: unknown): ReminderCommandRequest {
  if (!isRecord(value)
    || !['list', 'create', 'updateStatus'].includes(String(value.action))
    || typeof value.spaceId !== 'string' || !value.spaceId.trim() || value.spaceId.includes('/')
    || typeof value.storeId !== 'string' || !value.storeId.trim() || value.storeId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Reminder command is invalid', { code: 'INVALID_ARGUMENT' });
  }
  const input = value as unknown as ReminderCommandRequest;
  if (input.action === 'create') {
    const reminder = input.reminder;
    if (!reminder || !validId(reminder.id) || !validId(reminder.debtId)
      || !validTimestamp(reminder.remindAt)
      || (reminder.note !== undefined && (typeof reminder.note !== 'string' || reminder.note.length > 500))) {
      throw new HttpsError('invalid-argument', 'Reminder details are invalid', { code: 'INVALID_ARGUMENT' });
    }
  }
  if (input.action === 'updateStatus'
    && (!validId(input.reminderId) || !STATUSES.has(String(input.status)))) {
    throw new HttpsError('invalid-argument', 'Reminder status update is invalid', { code: 'INVALID_ARGUMENT' });
  }
  if (input.notificationTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.notificationTime)) {
    throw new HttpsError('invalid-argument', 'Notification time is invalid', { code: 'INVALID_ARGUMENT' });
  }
  return { ...input, spaceId: input.spaceId.trim(), storeId: input.storeId.trim() };
}

async function listAndReconcile(
  input: ReminderCommandRequest,
  runtime: ReminderRuntime,
  remindersRef: FirebaseFirestore.CollectionReference,
  spaceRef: FirebaseFirestore.DocumentReference,
): Promise<ReminderRecord[]> {
  const [debtSnapshot, reminderSnapshot] = await Promise.all([
    spaceRef.collection('debts').where('storeId', '==', input.storeId).get(),
    remindersRef.where('storeId', '==', input.storeId).get(),
  ]);
  const debts = debtSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const existing = reminderSnapshot.docs
    .map((doc) => normalizeReminder(doc.id, doc.data(), input.spaceId, input.storeId))
    .filter((item): item is ReminderRecord => item !== null);
  const byDebt = new Map(debts.map((debt) => [debt.id, debt]));
  const byId = new Map(existing.map((reminder) => [reminder.id, reminder]));
  const notificationTime = input.notificationTime ?? '09:00';
  const now = runtime.now();
  const batch = runtime.firestore.batch();
  let writes = 0;

  for (const debt of debts) {
    if (typeof debt.amount !== 'number' || debt.amount <= 0 || debt.settledAt
      || typeof debt.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate)) continue;
    const id = `due-date_${debt.id}`;
    const reference = remindersRef.doc(id);
    const remindAt = `${debt.dueDate}T${notificationTime}:00`;
    const previous = byId.get(id);
    if (!previous) {
      batch.set(reference, {
        id, storeId: input.storeId, workspaceId: input.spaceId, debtId: debt.id,
        remindAt, status: 'pending', note: SYSTEM_DUE_DATE_NOTE, createdAt: now, updatedAt: now,
      });
      writes += 1;
    } else if (previous.note === SYSTEM_DUE_DATE_NOTE && previous.status === 'pending' && previous.remindAt !== remindAt) {
      batch.update(reference, { remindAt, updatedAt: now });
      writes += 1;
    }
  }

  for (const reminder of existing) {
    if (reminder.note !== SYSTEM_DUE_DATE_NOTE || reminder.status !== 'pending') continue;
    const debt = byDebt.get(reminder.debtId);
    const shouldExist = Boolean(debt && typeof debt.amount === 'number' && debt.amount > 0 && !debt.settledAt
      && typeof debt.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate));
    if (!shouldExist) {
      batch.delete(remindersRef.doc(reminder.id));
      writes += 1;
    }
  }
  if (writes > 0) {
    if (writes > 450) throw new HttpsError('resource-exhausted', 'Too many reminders to reconcile in one request', { code: 'REMINDER_RECONCILIATION_LIMIT' });
    await batch.commit();
  }

  const finalSnapshot = await remindersRef.where('storeId', '==', input.storeId).get();
  return finalSnapshot.docs
    .map((doc) => normalizeReminder(doc.id, doc.data(), input.spaceId, input.storeId))
    .filter((item): item is ReminderRecord => item !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function normalizeReminder(
  id: string,
  value: unknown,
  spaceId: string,
  storeId: string,
): ReminderRecord | null {
  if (!isRecord(value) || value.id !== id || value.storeId !== storeId || value.workspaceId !== spaceId
    || !validId(value.debtId) || !validTimestamp(value.remindAt)
    || !STATUSES.has(String(value.status)) || !validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt)) return null;
  return {
    id, storeId, workspaceId: spaceId, debtId: value.debtId, remindAt: value.remindAt,
    status: value.status as ReminderRecord['status'],
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    createdAt: value.createdAt, updatedAt: value.updatedAt,
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
