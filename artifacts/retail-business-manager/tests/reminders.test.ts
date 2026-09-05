import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debt, Reminder } from '@/types/business';

const storedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storedValues.set(key, value);
    },
  },
}));

import {
  createDebt,
  createReminder,
  filterRemindersByDebt,
  loadReminders,
  saveDebts,
  saveReminders,
  setActiveSpaceId,
  validateReminderInput,
  SPACE_STORAGE_PREFIX,
} from '@/services/storage';

const timestamp = '2026-08-29T10:00:00.000Z';
const firstRemindAt = '2026-09-01T09:00:00.000Z';

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    storeId: 'store-a',
    debtId: 'debt-a',
    remindAt: firstRemindAt,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('debt reminders', () => {
  beforeEach(() => {
    storedValues.clear();
    setActiveSpaceId(null);
  });

  it('creates a Reminder with a required debt relationship', () => {
    const created = createReminder(
      'store-a',
      'debt-a',
      { remindAt: firstRemindAt },
      timestamp,
    );

    expect(created).toMatchObject({
      id: expect.stringMatching(/^reminder_/),
      storeId: 'store-a',
      debtId: 'debt-a',
      remindAt: firstRemindAt,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(created).not.toHaveProperty('customerId');
    expect(created).not.toHaveProperty('title');
  });

  it.each([
    ['empty debtId', { debtId: '' }, 'debtIdRequired'],
    ['non-string debtId', { debtId: 123 }, 'debtIdRequired'],
  ])('rejects %s', (_label, override, expectedError) => {
    expect(validateReminderInput({ ...reminder(), ...override })).toBe(expectedError);
  });

  it.each([
    ['empty remindAt', ''],
    ['date-only remindAt', '2026-09-01'],
    ['invalid remindAt', 'not-a-date'],
    ['invalid calendar date', '2026-02-30T09:00:00.000Z'],
  ])('rejects %s', (_label, remindAt) => {
    expect(validateReminderInput({ ...reminder(), remindAt })).toBe('remindAtInvalid');
  });

  it('accepts a full ISO remindAt timestamp', () => {
    expect(validateReminderInput({
      ...reminder(),
      remindAt: '2026-09-01T09:00:00.123Z',
    })).toBeNull();
  });

  it('supports multiple reminders for the same debt without reusing the debt id', async () => {
    const first = createReminder('store-a', 'debt-a', { remindAt: firstRemindAt }, timestamp);
    const second = createReminder(
      'store-a',
      'debt-a',
      { remindAt: '2026-09-02T09:00:00.000Z' },
      timestamp,
    );

    expect(first.id).not.toBe(second.id);
    expect(first.debtId).toBe('debt-a');
    expect(second.debtId).toBe('debt-a');

    await saveReminders('store-a', [first, second]);
    await expect(loadReminders('store-a')).resolves.toHaveLength(2);
    expect(filterRemindersByDebt([first, second], 'debt-a')).toHaveLength(2);
  });

  it('saves and loads reminders from the local reminder collection', async () => {
    const savedReminder = reminder({ note: 'Call customer' });

    await saveReminders('store-a', [savedReminder]);

    await expect(loadReminders('store-a')).resolves.toEqual([savedReminder]);
  });

  it('isolates reminders by storeId', async () => {
    const storeAReminder = reminder({ id: 'reminder-a', storeId: 'store-a' });
    const storeBReminder = reminder({ id: 'reminder-b', storeId: 'store-b' });

    await saveReminders('store-a', [storeAReminder]);
    await saveReminders('store-b', [storeBReminder]);

    await expect(loadReminders('store-a')).resolves.toEqual([storeAReminder]);
    await expect(loadReminders('store-b')).resolves.toEqual([storeBReminder]);
  });

  it('isolates reminders by active local space', async () => {
    const spaceAReminder = reminder({ id: 'reminder-space-a' });
    const spaceBReminder = reminder({ id: 'reminder-space-b' });

    setActiveSpaceId('space A');
    await saveReminders('store-a', [spaceAReminder]);

    setActiveSpaceId('space B');
    await expect(loadReminders('store-a')).resolves.toEqual([]);
    await saveReminders('store-a', [spaceBReminder]);

    setActiveSpaceId('space A');
    await expect(loadReminders('store-a')).resolves.toEqual([spaceAReminder]);
    expect(storedValues.has(`${SPACE_STORAGE_PREFIX}space%20A/reminders`)).toBe(true);
    expect(storedValues.has(`${SPACE_STORAGE_PREFIX}space%20B/reminders`)).toBe(true);

    setActiveSpaceId(null);
    await expect(loadReminders('store-a')).resolves.toEqual([]);
  });

  it('treats missing, empty, and malformed reminder storage safely when loading', async () => {
    await expect(loadReminders('store-a')).resolves.toEqual([]);

    storedValues.set('@retail-business-manager/reminders', '[]');
    await expect(loadReminders('store-a')).resolves.toEqual([]);

    storedValues.set('@retail-business-manager/reminders', '{not-json');
    await expect(loadReminders('store-a')).resolves.toEqual([]);
  });

  it('filters invalid stored Reminder records during normalization', async () => {
    const valid = reminder();
    const invalid = { ...valid, id: 'invalid-reminder', debtId: '' };
    storedValues.set('@retail-business-manager/reminders', JSON.stringify([valid, invalid]));

    await expect(loadReminders('store-a')).resolves.toEqual([valid]);
  });

  it('does not create a Reminder when creating and saving a Debt', async () => {
    const debt: Debt = createDebt(
      'store-a',
      'customer-a',
      { amount: 500, currency: 'TRY' },
      timestamp,
    );

    await saveDebts('store-a', [debt]);

    expect(storedValues.has('@retail-business-manager/reminders')).toBe(false);
    await expect(loadReminders('store-a')).resolves.toEqual([]);
  });
});