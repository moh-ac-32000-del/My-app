import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { translate } from '@/constants/i18n';
import { GlassCard } from '@/components/AppShell';

export default function LoginScreen() {
  const colors = useColors();
  const { profile, setAuthenticated } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [identity, setIdentity] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');

  const submit = async () => {
    if (!identity.trim() || !password.trim()) {
      setError(translate('fieldRequired', profile.language));
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setAuthenticated(true);
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LinearGradient colors={[colors.glow, 'transparent', 'transparent']} style={StyleSheet.absoluteFill} />
      <View style={[styles.orb, { backgroundColor: colors.accent }]} />
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="storefront-outline" size={34} color={colors.primary} />
        </View>
        <Text style={[styles.brandName, { color: colors.foreground }]}>{translate('appName', profile.language)}</Text>
        <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>{translate('appSubtitle', profile.language)}</Text>
      </View>
      <View style={styles.formWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>{translate('welcomeBack', profile.language)}</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{translate('loginHint', profile.language)}</Text>
        <GlassCard style={styles.formCard}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{translate('phoneOrEmail', profile.language)}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                testID="login-identity"
                value={identity}
                onChangeText={setIdentity}
                placeholder="example@store.com"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{translate('password', profile.language)}</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                testID="login-password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <Pressable testID="login-submit" onPress={() => void submit()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{translate('login', profile.language)}</Text>
            <Ionicons name="arrow-back" size={19} color={colors.primaryForeground} />
          </Pressable>
        </GlassCard>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={[styles.secureText, { color: colors.mutedForeground }]}>{translate('secureNote', profile.language)}</Text>
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