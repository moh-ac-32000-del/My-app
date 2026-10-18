import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidNotificationTime } from '@/services/preferences';

export interface FollowUpPreferences { time: string; overdueEnabled: boolean; pendingEnabled: boolean }
export interface FollowUpScope { uid: string; spaceId: string; storeId: string }
export const DEFAULT_FOLLOW_UP: FollowUpPreferences = { time: '17:00', overdueEnabled: true, pendingEnabled: true };

export function followUpScopeKey(scope: FollowUpScope): string {
  const parts = [scope.uid, scope.spaceId, scope.storeId];
  if (parts.some((part) => !part.trim() || part.includes('/') || part.length > 200)) throw new Error('followUpScopeInvalid');
  return `@retail-business-manager/follow-up/v1/${parts.map(encodeURIComponent).join('/')}`;
}

function valid(value: unknown): value is FollowUpPreferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return isValidNotificationTime(item.time) && typeof item.overdueEnabled === 'boolean' && typeof item.pendingEnabled === 'boolean';
}

export async function loadFollowUpPreferences(scope: FollowUpScope): Promise<FollowUpPreferences> {
  const stored = await AsyncStorage.getItem(followUpScopeKey(scope));
  if (stored === null) return { ...DEFAULT_FOLLOW_UP };
  try {
    const value: unknown = JSON.parse(stored);
    return valid(value) ? { time: value.time, overdueEnabled: value.overdueEnabled, pendingEnabled: value.pendingEnabled } : { ...DEFAULT_FOLLOW_UP };
  } catch { return { ...DEFAULT_FOLLOW_UP }; }
}

export async function saveFollowUpPreferences(scope: FollowUpScope, value: FollowUpPreferences): Promise<void> {
  if (!valid(value)) throw new Error('followUpPreferencesInvalid');
  await AsyncStorage.setItem(followUpScopeKey(scope), JSON.stringify({ time: value.time, overdueEnabled: value.overdueEnabled, pendingEnabled: value.pendingEnabled }));
}
