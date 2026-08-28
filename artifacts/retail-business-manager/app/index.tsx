import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { AmountMetric, MetricCard } from '@/components/MetricCard';
import { QuickAction } from '@/components/QuickActions';
import { SplashView } from '@/components/SplashView';
import { formatLocalizedDate } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { formatMoney } from '@/constants/currencies';
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

  const metrics = [
    { label: t('cashBalance'), value: 0, icon: 'wallet-outline' as const, tone: 'primary' as const, path: '/cash' },
    { label: t('todaySales'), value: 0, icon: 'trending-up-outline' as const, tone: 'success' as const, path: '/sales' },
    { label: t('todayPurchases'), value: 0, icon: 'trending-down-outline' as const, tone: 'warning' as const, path: '/purchases' },
    { label: t('totalDebts'), value: 0, icon: 'alert-circle-outline' as const, tone: 'danger' as const, path: '/customers' },
  ];

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

      <GlassCard style={styles.heroCard}>
        <View style={[styles.heroTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.heroEyebrow, { color: colors.mutedForeground }]}>{t('overview')}</Text>
        </View>
        <Text style={[styles.heroName, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{profile.name || t('storeNameDefault')}</Text>
        <Text style={[styles.heroHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('startByAdding')}</Text>
        <View style={[styles.heroLine, { backgroundColor: colors.border }]} />
        <View style={[styles.heroFoot, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.heroFootValue, { color: colors.primary }]}>{formatMoney(0, profile.currency, language)}</Text>
          <Text style={[styles.heroFootLabel, { color: colors.mutedForeground }]}>{t('cashBalance')}</Text>
        </View>
      </GlassCard>

      <SectionTitle title={t('overview')} action={t('today')} />
      <View style={[styles.metricRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <AmountMetric {...metrics[0]} currency={profile.currency} onPress={() => router.push(metrics[0].path as never)} />
        <AmountMetric {...metrics[1]} currency={profile.currency} onPress={() => router.push(metrics[1].path as never)} />
      </View>
      <View style={[styles.metricRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <AmountMetric {...metrics[2]} currency={profile.currency} onPress={() => router.push(metrics[2].path as never)} />
        <AmountMetric {...metrics[3]} currency={profile.currency} onPress={() => router.push(metrics[3].path as never)} />
      </View>
      <View style={[styles.metricRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <MetricCard label={t('customersCount')} value="0" icon="people-outline" onPress={() => router.push('/customers')} />
        <MetricCard label={t('productsCount')} value="0" icon="cube-outline" onPress={() => router.push('/inventory')} />
      </View>

      <SectionTitle title={t('quickActions')} />
      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <QuickAction label={t('newSale')} icon="add-circle-outline" onPress={() => router.push('/sales')} />
        <QuickAction label={t('newPurchase')} icon="bag-add-outline" onPress={() => router.push('/purchases')} />
        <QuickAction label={t('newCustomer')} icon="person-add-outline" onPress={() => router.push('/customers')} />
        <QuickAction label={t('expense')} icon="remove-circle-outline" onPress={() => router.push('/cash')} />
        <QuickAction wide label={t('closeCash')} icon="lock-closed-outline" onPress={() => router.push('/cash')} />
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
  heroCard: { padding: 20, marginBottom: 24 },
  heroTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heroEyebrow: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  heroName: { fontSize: 28, fontFamily: 'Inter_700Bold', textAlign: 'right', marginTop: 14 },
  heroHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'right', lineHeight: 21, marginTop: 5 },
  heroLine: { height: 1, marginVertical: 18 },
  heroFoot: { flexDirection: 'row-reverse', alignItems: 'baseline', justifyContent: 'space-between' },
  heroFootValue: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  heroFootLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  metricRow: { flexDirection: 'row-reverse', gap: 9, marginBottom: 9 },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 24 },
  emptyActivity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 13, marginBottom: 18 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  emptyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 3 },
});