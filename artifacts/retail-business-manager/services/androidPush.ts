export interface AndroidPushScope { uid: string; spaceId: string; storeId: string; language: 'ar' | 'en' | 'tr' }
// Web/iOS never import the Android native notification module or request permissions.
export async function disconnectAndroidPush(): Promise<void> {}
// Local settings still work on web/iOS; they do not register a Push device.
export async function syncAndroidFollowUp(_scope: { uid: string; spaceId: string; storeId: string }, _preferences: { time: string; overdueEnabled: boolean; pendingEnabled: boolean }): Promise<void> {}
