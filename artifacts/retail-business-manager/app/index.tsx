import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { AmountMetric } from '@/components/MetricCard';
import { SplashView } from '@/components/SplashView';
import { formatLocalizedDate } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady, isAuthenticated } = useStore();
  const { t, isRTL, language } = useI18n();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isReady, isAuthenticated, router]);

  if (!isReady) return <SplashView />;
  if (!isAuthenticated) return <SplashView />;

  return (
    <AppShell>
      <PageHeader
        title={t('dashboard')}
        subtitle={`${t('today')} • ${formatLocalizedDate(new Date(), language)}`}
        action={
          <Pressable
            testID="profile-button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.profileButton, { backgroundColor: colors.accent, borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.profileInitial, { color: colors.primary }]}>{(profile.name || t('storeNameDefault')).slice(0, 1)}</Text>
          </Pressable>
        }
      />

      <SectionTitle title={t('cashBalance')} />
      <View style={[styles.metricRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <AmountMetric
          label={`${t('cashBalance')} TRY`}
          value={0}
          icon="wallet-outline"
          currency="TRY"
          onPress={() => router.push('/cash')}
        />
        <AmountMetric
          label={`${t('cashBalance')} USD`}
          value={0}
          icon="wallet-outline"
          currency="USD"
          onPress={() => router.push('/cash')}
        />
      </View>

      <SectionTitle title={t('recentActivity')} />
      <GlassCard style={[styles.emptyActivity, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="pulse-outline" size={22} color={colors.mutedForeground} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.emptyTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('noActivity')}</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('startByAdding')}</Text>
        </View>
      </GlassCard>
      <View style={{ height: Math.max(insets.bottom, 8) }} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  profileButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.7 },
  metricRow: { flexDirection: 'row-reverse', gap: 9, marginBottom: 9 },
  emptyActivity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 13, marginBottom: 18 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  emptyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 3 },
});