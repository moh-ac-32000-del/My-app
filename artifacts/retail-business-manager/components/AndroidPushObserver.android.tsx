import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useStore } from '@/context/StoreContext';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { matchesPushScope } from '@/services/pushNotificationScope';

export function AndroidPushObserver() {
  const { isReady, isAuthenticated, activeSpaceId, profile } = useStore();
  const router = useRouter();
  const consumed = useRef('');
  useEffect(() => {
    let active = true;
    const matches = (data: Record<string, unknown>) => active && isReady && isAuthenticated && isFirebaseConfigured
      && matchesPushScope(data, { uid: getFirebaseAuth().currentUser?.uid ?? null, spaceId: activeSpaceId, storeId: profile.id });
    Notifications.setNotificationHandler({ handleNotification: async (notification) => {
      const show = matches(notification.request.content.data);
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    } });
    const respond = (response: Notifications.NotificationResponse) => {
      const { request } = response.notification;
      if (!matches(request.content.data) || request.content.data.route !== '/notifications' || consumed.current === request.identifier) return;
      consumed.current = request.identifier;
      router.push('/notifications');
      void Notifications.clearLastNotificationResponseAsync();
    };
    const listener = Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) respond(response); }).catch(() => {});
    return () => { active = false; listener.remove(); Notifications.setNotificationHandler(null); };
  }, [isReady, isAuthenticated, activeSpaceId, profile.id, router]);
  return null;
}
