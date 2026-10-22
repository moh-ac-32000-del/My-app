import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirebaseAuth } from '@/services/firebase';
import type { AndroidPushScope } from './androidPush';
import { loadFollowUpPreferences, type FollowUpPreferences, type FollowUpScope } from './followUpPreferences';
import { loadNotificationTime } from './preferences';

const KEY = '@my-app/android-push/v1';
type Saved = AndroidPushScope & { token: string };
let pendingRegistration: Saved | null = null;
export type { AndroidPushScope } from './androidPush';

export async function savedAndroidPush(): Promise<Saved | null> {
  if (pendingRegistration) return pendingRegistration;
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && ['uid', 'spaceId', 'storeId', 'token'].every((key) => typeof value[key] === 'string' && value[key]) ? value : null;
  } catch { return null; }
}

async function send(action: 'register' | 'status' | 'disable' | 'test' | 'preferences', scope: AndroidPushScope, token: string, preferences?: FollowUpPreferences, reminderTime?: string) {
  if (getFirebaseAuth().currentUser?.uid !== scope.uid) throw new Error('pushAccountChanged');
  const call = httpsCallable<unknown, { enabled: boolean; accepted?: boolean; scheduledEnabled?: boolean; dispatchProblem?: boolean }>(getFunctions(getFirebaseApp()), 'pushDeviceCommand');
  const followUp = preferences ? { ...preferences, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined;
  if (preferences && !followUp?.timeZone) throw new Error('pushTimeZoneUnavailable');
  const result = (await call({ action, actorUid: scope.uid, ...scope, token, scheduledVersion: 1, ...(followUp ? { followUp } : {}), ...(reminderTime ? { reminderTime } : {}) })).data;
  if (typeof result?.enabled !== 'boolean' || (action === 'test' && result.accepted !== true)) throw new Error('pushResponseInvalid');
  return result;
}

export async function connectAndroidPush(scope: AndroidPushScope) {
  if (Constants.executionEnvironment === 'storeClient') throw new Error('pushStandaloneRequired');
  await Notifications.setNotificationChannelAsync('my-app-reminders', {
    name: 'My app', importance: Notifications.AndroidImportance.DEFAULT, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('pushPermissionDenied');
  const token = (await Notifications.getDevicePushTokenAsync()).data;
  if (typeof token !== 'string') throw new Error('pushTokenInvalid');
  await replaceAndroidPushToken(scope, token);
}

/** Rotation never requests permission or silently binds a different account/space. */
export async function refreshAndroidPushToken(scope: AndroidPushScope, token: string) {
  const old = await savedAndroidPush();
  if (!old || old.uid !== scope.uid || old.spaceId !== scope.spaceId || old.storeId !== scope.storeId || old.token === token) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await replaceAndroidPushToken(scope, token);
}

async function replaceAndroidPushToken(scope: AndroidPushScope, token: string) {
  const old = await savedAndroidPush();
  if (old?.uid === scope.uid && old.token !== token) await send('disable', old, old.token);
  // Failure to read settings must not silently register a different/default schedule.
  const preferences = await loadFollowUpPreferences(scope);
  const reminderTime = await loadNotificationTime();
  await send('register', scope, token, preferences, reminderTime);
  pendingRegistration = { ...scope, token };
  try {
    if (getFirebaseAuth().currentUser?.uid !== scope.uid) throw new Error('pushAccountChanged');
    await AsyncStorage.setItem(KEY, JSON.stringify(pendingRegistration));
  }
  catch (error) {
    // A cloud registration without saved local metadata must not survive a failed connect silently.
    try { await disconnectAndroidPush(); } catch { /* Retain in-memory metadata for a safe sign-out retry. */ }
    throw error;
  }
}

export async function androidPushConnected(scope: AndroidPushScope) {
  return (await androidPushDeliveryState(scope)).connected;
}

export async function androidPushDeliveryState(scope: AndroidPushScope) {
  const saved = await savedAndroidPush();
  const disconnected = { connected: false, scheduled: false, problem: false };
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) return disconnected;
  if (!(await Notifications.getPermissionsAsync()).granted) return disconnected;
  const status = await send('status', scope, saved.token);
  return { connected: status.enabled, scheduled: status.scheduledEnabled === true, problem: status.dispatchProblem === true };
}

export async function testAndroidPush(scope: AndroidPushScope) {
  const saved = await savedAndroidPush();
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) throw new Error('pushNotConnected');
  await send('test', scope, saved.token);
}

export async function syncAndroidFollowUp(scope: FollowUpScope, preferences: FollowUpPreferences): Promise<void> {
  const saved = await savedAndroidPush();
  // Saving local settings never opts a device in or prompts for permission.
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) return;
  await send('preferences', saved, saved.token, preferences, await loadNotificationTime());
}

export async function syncAndroidReminderTime(scope: FollowUpScope, time: string): Promise<void> {
  const saved = await savedAndroidPush();
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) return;
  await send('preferences', saved, saved.token, await loadFollowUpPreferences(scope), time);
}

export async function disconnectAndroidPush(): Promise<void> {
  let saved: Saved | null;
  try { saved = await savedAndroidPush(); }
  catch { await Notifications.unregisterForNotificationsAsync(); return; }
  if (!saved) return;
  let serverDisabled = false;
  if (getFirebaseAuth().currentUser?.uid === saved.uid) {
    try { await send('disable', saved, saved.token); serverDisabled = true; } catch { /* Try invalidating the native token even offline. */ }
  }
  try { await Notifications.unregisterForNotificationsAsync(); }
  catch { if (!serverDisabled) throw new Error('pushDisconnectFailed'); }
  await AsyncStorage.removeItem(KEY);
  pendingRegistration = null;
}
