import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirebaseAuth } from '@/services/firebase';
import type { AndroidPushScope } from './androidPush';

const KEY = '@my-app/android-push/v1';
type Saved = AndroidPushScope & { token: string };
export type { AndroidPushScope } from './androidPush';

export async function savedAndroidPush(): Promise<Saved | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && ['uid', 'spaceId', 'storeId', 'token'].every((key) => typeof value[key] === 'string' && value[key]) ? value : null;
  } catch { return null; }
}

async function send(action: 'register' | 'status' | 'disable' | 'test', scope: AndroidPushScope, token: string) {
  if (getFirebaseAuth().currentUser?.uid !== scope.uid) throw new Error('pushAccountChanged');
  const call = httpsCallable<unknown, { enabled: boolean; accepted?: boolean }>(getFunctions(getFirebaseApp()), 'pushDeviceCommand');
  const result = (await call({ action, actorUid: scope.uid, ...scope, token })).data;
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
  const old = await savedAndroidPush();
  if (old?.uid === scope.uid && old.token !== token) await send('disable', old, old.token);
  await send('register', scope, token);
  if (getFirebaseAuth().currentUser?.uid !== scope.uid) throw new Error('pushAccountChanged');
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...scope, token }));
}

export async function androidPushConnected(scope: AndroidPushScope) {
  const saved = await savedAndroidPush();
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) return false;
  if (!(await Notifications.getPermissionsAsync()).granted) return false;
  return (await send('status', scope, saved.token)).enabled;
}

export async function testAndroidPush(scope: AndroidPushScope) {
  const saved = await savedAndroidPush();
  if (!saved || saved.uid !== scope.uid || saved.spaceId !== scope.spaceId || saved.storeId !== scope.storeId) throw new Error('pushNotConnected');
  await send('test', scope, saved.token);
}

export async function disconnectAndroidPush(): Promise<void> {
  const saved = await savedAndroidPush();
  if (!saved) return;
  let serverDisabled = false;
  if (getFirebaseAuth().currentUser?.uid === saved.uid) {
    try { await send('disable', saved, saved.token); serverDisabled = true; } catch { /* Try invalidating the native token even offline. */ }
  }
  try { await Notifications.unregisterForNotificationsAsync(); }
  catch { if (!serverDisabled) throw new Error('pushDisconnectFailed'); }
  await AsyncStorage.removeItem(KEY);
}
