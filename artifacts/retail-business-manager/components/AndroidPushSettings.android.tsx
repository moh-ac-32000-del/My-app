import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GlassCard } from '@/components/AppShell';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { androidPushConnected, connectAndroidPush, disconnectAndroidPush, testAndroidPush } from '@/services/androidPush.android';

export function AndroidPushSettings() {
  const colors = useColors();
  const { activeSpaceId, profile, isAuthenticated } = useStore();
  const { t, language, isRTL } = useI18n();
  const uid = isFirebaseConfigured && isAuthenticated ? getFirebaseAuth().currentUser?.uid : null;
  const key = uid && activeSpaceId ? `${uid}/${activeSpaceId}/${profile.id}` : '';
  const current = useRef(key); current.current = key;
  const busy = useRef(false);
  const [connected, setConnected] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<'pushTestAccepted' | 'pushConnectError' | 'pushPermissionDenied' | null>(null);
  const scope = uid && activeSpaceId ? { uid, spaceId: activeSpaceId, storeId: profile.id, language } : null;
  useEffect(() => {
    let active = true; setConnected(false); setMessage(null);
    if (scope) void androidPushConnected(scope).then((value) => { if (active) setConnected(value); }).catch(() => { if (active) setMessage('pushConnectError'); });
    return () => { active = false; };
  }, [key]);
  const act = async (action: 'connect' | 'disconnect' | 'test') => {
    if (!scope || busy.current || current.current !== key) return;
    busy.current = true; setWorking(true); setMessage(null);
    try {
      if (action === 'connect') await connectAndroidPush(scope);
      else if (action === 'disconnect') await disconnectAndroidPush();
      else await testAndroidPush(scope);
      if (current.current === key) {
        setConnected(action !== 'disconnect');
        if (action === 'test') setMessage('pushTestAccepted');
      }
    } catch (error) {
      if (current.current === key) setMessage(error instanceof Error && error.message === 'pushPermissionDenied' ? 'pushPermissionDenied' : 'pushConnectError');
    } finally { busy.current = false; setWorking(false); }
  };
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  return <GlassCard style={{ gap: 12, marginBottom: 16 }}>
    <Text style={[align, { color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }]}>{t('pushAndroidTitle')}</Text>
    <Text style={[align, { color: colors.mutedForeground, lineHeight: 22 }]}>{t(connected ? 'pushDeviceConnected' : 'pushDeviceNotConnected')}</Text>
    <Text style={[align, { color: colors.mutedForeground, lineHeight: 22 }]}>{t('pushSchedulePending')}</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={[align, { color: message === 'pushTestAccepted' ? colors.primary : colors.destructive }]}>{t(message)}</Text> : null}
    {working ? <ActivityIndicator color={colors.primary} /> : null}
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={!scope || working} onPress={() => void act('connect')} style={{ padding: 14, borderRadius: 12, backgroundColor: colors.accent }}><Text style={{ color: colors.primary }}>{t(connected ? 'pushReconnect' : 'pushConnect')}</Text></Pressable>
      {connected ? <>
        <Pressable accessibilityRole="button" disabled={working} onPress={() => void act('test')} style={{ padding: 14 }}><Text style={{ color: colors.primary }}>{t('pushSendTest')}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={working} onPress={() => void act('disconnect')} style={{ padding: 14 }}><Text style={{ color: colors.destructive }}>{t('pushDisconnect')}</Text></Pressable>
      </> : null}
    </View>
  </GlassCard>;
}
