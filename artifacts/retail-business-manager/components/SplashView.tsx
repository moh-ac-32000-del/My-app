import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

export function SplashView() {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.glow, 'transparent']} style={StyleSheet.absoluteFill} />
      <View style={[styles.mark, { backgroundColor: colors.accent, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="storefront-outline" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('appName')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('appSubtitle')}</Text>
      <ActivityIndicator color={colors.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 92, height: 92, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 7 },
  loader: { marginTop: 38 },
});