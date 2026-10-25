import AsyncStorage from '@react-native-async-storage/async-storage';
import { languageOptions, type Language } from '@/constants/i18n';
import { normalizeAppearance, type AppearancePreference } from '@/data/appearance';

const APPEARANCE_KEY = '@retail-business-manager/ui-appearance';
export async function loadUiAppearance(): Promise<AppearancePreference> {
  return normalizeAppearance(await AsyncStorage.getItem(APPEARANCE_KEY));
}
export async function saveUiAppearance(value: AppearancePreference): Promise<void> {
  if (!['system', 'light', 'dark'].includes(value)) throw new Error('appearanceInvalid');
  await AsyncStorage.setItem(APPEARANCE_KEY, value);
}

export const DEFAULT_NOTIFICATION_TIME = '09:00';
const NOTIFICATION_TIME_KEY = '@retail-business-manager/notification-time';
const UI_LANGUAGE_KEY = '@retail-business-manager/ui-language';

// A per-account UI hint only. Never cache memberships, quotas or financial data here.
export async function loadLastWorkspace(uid: string): Promise<string | null> {
  return AsyncStorage.getItem(`@retail-business-manager/last-workspace/${encodeURIComponent(uid)}`);
}
export async function saveLastWorkspace(uid: string, spaceId: string): Promise<void> {
  await AsyncStorage.setItem(`@retail-business-manager/last-workspace/${encodeURIComponent(uid)}`, spaceId);
}

export async function loadUiLanguage(): Promise<Language | null> {
  const value = await AsyncStorage.getItem(UI_LANGUAGE_KEY);
  return languageOptions.some((option) => option.code === value) ? value as Language : null;
}

export async function saveUiLanguage(value: Language): Promise<void> {
  if (!languageOptions.some((option) => option.code === value)) throw new Error('languageInvalid');
  await AsyncStorage.setItem(UI_LANGUAGE_KEY, value);
}

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
