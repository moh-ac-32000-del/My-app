import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { AmountMetric, MetricCard } from '@/components/MetricCard';
import { QuickAction } from '@/components/QuickActions';
import { SplashView } from '@/components/SplashView';
import { translate } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { formatMoney } from '@/constants/currencies';

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady, isAuthenticated } = useStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isReady, isAuthenticated, router]);

  if (!isReady) return <SplashView />;
  if (!isAuthenticated) return <SplashView />;

  const metrics = [
    { label: translate('cashBalance', profile.language), value: 0, icon: 'wallet-outline' as const, tone: 'primary' as const, path: '/cash' },
    { label: translate('todaySales', profile.language), value: 0, icon: 'trending-up-outline' as const, tone: 'success' as const, path: '/sales' },
    { label: translate('todayPurchases', profile.language), value: 0, icon: 'trending-down-outline' as const, tone: 'warning' as const, path: '/purchases' },
    { label: translate('totalDebts', profile.language), value: 0, icon: 'alert-circle-outline' as const, tone: 'danger' as const, path: '/customers' },
  ];

  return (
    <AppShell>
      <PageHeader
        title={translate('dashboard', profile.language)}
        subtitle={`${translate('today', profile.language)} • 26 أغسطس 2026`}
        action={
          <Pressable
            testID="profile-button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.profileButton, { backgroundColor: colors.accent, borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.profileInitial, { color: colors.primary }]}>{profile.name.slice(0, 1)}</Text>
          </Pressable>
        }
      />

      <GlassCard style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.heroEyebrow, { color: colors.mutedForeground }]}>{translate('overview', profile.language)}</Text>
        </View>
        <Text style={[styles.heroName, { color: colors.foreground }]}>{profile.name}</Text>
        <Text style={[styles.heroHint, { color: colors.mutedForeground }]}>{translate('startByAdding', profile.language)}</Text>
        <View style={[styles.heroLine, { backgroundColor: colors.border }]} />
        <View style={styles.heroFoot}>
          <Text style={[styles.heroFootValue, { color: colors.primary }]}>{formatMoney(0, profile.currency)}</Text>
          <Text style={[styles.heroFootLabel, { color: colors.mutedForeground }]}>{translate('cashBalance', profile.language)}</Text>
        </View>
      </GlassCard>

      <SectionTitle title={translate('overview', profile.language)} action={translate('today', profile.language)} />
      <View style={styles.metricRow}>
        <AmountMetric {...metrics[0]} currency={profile.currency} onPress={() => router.push(metrics[0].path as never)} />
        <AmountMetric {...metrics[1]} currency={profile.currency} onPress={() => router.push(metrics[1].path as never)} />
      </View>
      <View style={styles.metricRow}>
        <AmountMetric {...metrics[2]} currency={profile.currency} onPress={() => router.push(metrics[2].path as never)} />
        <AmountMetric {...metrics[3]} currency={profile.currency} onPress={() => router.push(metrics[3].path as never)} />
      </View>
      <View style={styles.metricRow}>
        <MetricCard label={translate('customersCount', profile.language)} value="0" icon="people-outline" onPress={() => router.push('/customers')} />
        <MetricCard label={translate('productsCount', profile.language)} value="0" icon="cube-outline" onPress={() => router.push('/inventory')} />
      </View>

      <SectionTitle title={translate('quickActions', profile.language)} />
      <View style={styles.actions}>
        <QuickAction label={translate('newSale', profile.language)} icon="add-circle-outline" onPress={() => router.push('/sales')} />
        <QuickAction label={translate('newPurchase', profile.language)} icon="bag-add-outline" onPress={() => router.push('/purchases')} />
        <QuickAction label={translate('newCustomer', profile.language)} icon="person-add-outline" onPress={() => router.push('/customers')} />
        <QuickAction label={translate('expense', profile.language)} icon="remove-circle-outline" onPress={() => router.push('/cash')} />
        <QuickAction wide label={translate('closeCash', profile.language)} icon="lock-closed-outline" onPress={() => router.push('/cash')} />
      </View>

      <SectionTitle title={translate('recentActivity', profile.language)} />
      <GlassCard style={styles.emptyActivity}>
        <Ionicons name="pulse-outline" size={22} color={colors.mutedForeground} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{translate('noActivity', profile.language)}</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{translate('startByAdding', profile.language)}</Text>
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