import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp, isFirebaseConfigured } from '@/services/firebase';
import type { Reminder, ReminderStatus } from '@/types/business';

interface ReminderCommandResponse {
  reminders: Array<Reminder & { workspaceId: string }>;
  processedAt: string;
}

let functions: Functions | null = null;

export async function loadCloudReminders(
  spaceId: string,
  storeId: string,
  notificationTime = '09:00',
): Promise<Reminder[]> {
  const data = await send({ action: 'list', spaceId, storeId, notificationTime });
  return data.reminders;
}

export async function createCloudReminder(
  spaceId: string,
  reminder: Reminder,
  notificationTime = '09:00',
): Promise<Reminder[]> {
  const data = await send({
    action: 'create',
    spaceId,
    storeId: reminder.storeId,
    reminder: {
      id: reminder.id,
      debtId: reminder.debtId,
      remindAt: reminder.remindAt,
      ...(reminder.note ? { note: reminder.note } : {}),
    },
    notificationTime,
  });
  return data.reminders;
}

export async function updateCloudReminderStatus(
  spaceId: string,
  storeId: string,
  reminderId: string,
  status: ReminderStatus,
  notificationTime = '09:00',
): Promise<Reminder[]> {
  const data = await send({ action: 'updateStatus', spaceId, storeId, reminderId, status, notificationTime });
  return data.reminders;
}

export async function deleteCloudReminder(spaceId: string, storeId: string, reminderId: string, notificationTime = '09:00'): Promise<Reminder[]> {
  return (await send({ action: 'delete', spaceId, storeId, reminderId, notificationTime })).reminders;
}

async function send(
  input: {
    action: 'list' | 'create' | 'updateStatus' | 'delete';
    spaceId: string;
    storeId: string;
    reminder?: { id: string; debtId: string; remindAt: string; note?: string };
    reminderId?: string;
    status?: ReminderStatus;
    notificationTime: string;
  },
): Promise<ReminderCommandResponse> {
  if (!isFirebaseConfigured) throw new Error('firebaseNotConfigured');
  const spaceId = input.spaceId.trim();
  const storeId = input.storeId.trim();
  if (!spaceId || spaceId.includes('/') || !storeId || storeId.includes('/')) {
    throw new Error('reminderScopeInvalid');
  }
  const callable = httpsCallable<typeof input, ReminderCommandResponse>(
    getFunctionsInstance(),
    'reminderCommand',
  );
  const result = await callable({ ...input, spaceId, storeId });
  const data = result.data;
  if (!data || !Array.isArray(data.reminders)
    || typeof data.processedAt !== 'string'
    || !Number.isFinite(Date.parse(data.processedAt))
    || !data.reminders.every((reminder) => isValidReminder(reminder, spaceId, storeId))) {
    throw new Error('invalidCloudReminderResponse');
  }
  return data;
}

function isValidReminder(value: unknown, spaceId: string, storeId: string): value is Reminder & { workspaceId: string } {
  if (typeof value !== 'object' || value === null) return false;
  const reminder = value as Record<string, unknown>;
  return typeof reminder.id === 'string'
    && reminder.storeId === storeId
    && reminder.workspaceId === spaceId
    && typeof reminder.debtId === 'string'
    && typeof reminder.remindAt === 'string'
    && Number.isFinite(Date.parse(reminder.remindAt))
    && (reminder.status === 'pending' || reminder.status === 'completed' || reminder.status === 'dismissed')
    && typeof reminder.createdAt === 'string'
    && typeof reminder.updatedAt === 'string';
}

function getFunctionsInstance(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}
