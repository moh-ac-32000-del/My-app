import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { DEFAULT_NOTIFICATION_TIME, isValidNotificationTime, loadNotificationTime, saveNotificationTime } from '@/services/preferences';

describe('non-business notification preference', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the default when the stored preference is missing or invalid', async () => {
    storage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce('27:90');
    await expect(loadNotificationTime()).resolves.toBe(DEFAULT_NOTIFICATION_TIME);
    await expect(loadNotificationTime()).resolves.toBe(DEFAULT_NOTIFICATION_TIME);
  });

  it('validates and saves only a well-formed preference', async () => {
    expect(isValidNotificationTime('09:05')).toBe(true);
    expect(isValidNotificationTime('24:00')).toBe(false);
    await saveNotificationTime('ignored-store-id', '18:30');
    expect(storage.setItem).toHaveBeenCalledWith('@retail-business-manager/notification-time', '18:30');
    await expect(saveNotificationTime('ignored-store-id', '30:00')).rejects.toThrow('notificationTimeInvalid');
  });
});
