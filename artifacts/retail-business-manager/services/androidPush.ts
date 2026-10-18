export interface AndroidPushScope { uid: string; spaceId: string; storeId: string; language: 'ar' | 'en' | 'tr' }
// Web/iOS never import the Android native notification module or request permissions.
export async function disconnectAndroidPush(): Promise<void> {}
