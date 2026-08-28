import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import type { TranslationKey } from '@/constants/i18n';
import { useI18n } from '@/hooks/useI18n';
import { GlassCard } from '@/components/AppShell';

export default function LoginScreen() {
  const colors = useColors();
  const { setAuthenticated } = useStore();
  const { t, isRTL, direction } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [identity, setIdentity] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const submit = async () => {
    if (!identity.trim() || !password.trim()) {
      setErrorKey('fieldRequired');
      return;
    }
    setErrorKey(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setAuthenticated(true);
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, direction, paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LinearGradient colors={[colors.glow, 'transparent', 'transparent']} style={StyleSheet.absoluteFill} />
      <View style={[styles.orb, { backgroundColor: colors.accent }]} />
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="storefront-outline" size={34} color={colors.primary} />
        </View>
        <Text style={[styles.brandName, { color: colors.foreground }]}>{t('appName')}</Text>
        <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>{t('appSubtitle')}</Text>
      </View>
      <View style={styles.formWrap}>
        <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('welcomeBack')}</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('loginHint')}</Text>
        <GlassCard style={styles.formCard}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('phoneOrEmail')}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                testID="login-identity"
                value={identity}
                onChangeText={setIdentity}
                placeholder={t('identityPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
              />
            </View>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('password')}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                testID="login-password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
              />
            </View>
          </View>
          {errorKey ? <Text style={[styles.error, { color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }]}>{t(errorKey)}</Text> : null}
          <Pressable testID="login-submit" onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{t('login')}</Text>
            <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={19} color={colors.primaryForeground} />
          </Pressable>
        </GlassCard>
        <View style={[styles.secureRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={[styles.secureText, { color: colors.mutedForeground }]}>{t('secureNote')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -160, left: -100, opacity: 0.22 },
  brand: { alignItems: 'center', marginTop: 22 },
  brandMark: { width: 76, height: 76, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 16 },
  brandSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 5 },
  formWrap: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  hint: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'right', lineHeight: 22, marginTop: 6, marginBottom: 18 },
  formCard: { padding: 18 },
  field: { marginBottom: 15 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'right', marginBottom: 7 },
  inputWrap: { minHeight: 50, borderWidth: 1, borderRadius: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, paddingHorizontal: 14 },
  input: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 48 },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'right', marginBottom: 12 },
  button: { minHeight: 52, borderRadius: 17, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  secureRow: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 16 },
  secureText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});