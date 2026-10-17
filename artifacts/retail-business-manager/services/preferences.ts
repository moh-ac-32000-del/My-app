import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_NOTIFICATION_TIME = '09:00';
const NOTIFICATION_TIME_KEY = '@retail-business-manager/notification-time';

export function isValidNotificationTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export async function loadNotificationTime(): Promise<string> {
  const storedTime = await AsyncStorage.getItem(NOTIFICATION_TIME_KEY);
  return isValidNotificationTime(storedTime) ? storedTime : DEFAULT_NOTIFICATION_TIME;
}

export async function saveNotificationTime(_storeId: string, value: string): Promise<void> {
  if (!isValidNotificationTime(value)) throw new Error('notificationTimeInvalid');
  await AsyncStorage.setItem(NOTIFICATION_TIME_KEY, value);
}
