import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { AmountMetric } from '@/components/MetricCard';
import { SplashView } from '@/components/SplashView';
import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { calculateUsedCurrencyBalances } from '@/services/storage';

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady, isAuthenticated, transactions } = useStore();
  const { t, isRTL, language } = useI18n();
  const insets = useSafeAreaInsets();
  const balances = useMemo(() => calculateUsedCurrencyBalances(transactions), [transactions]);
  const recentTransactions = transactions;
  const currencyCardWidth = balances.length === 1 ? '100%' : '48%';

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
        {balances.map(({ currency, amount }) => (
          <View key={currency} style={[styles.metricCell, { width: currencyCardWidth }]}>
            <AmountMetric
              label={`${t('cashBalance')} ${currency}`}
              value={amount}
              icon="wallet-outline"
              currency={currency}
              onPress={() => router.push('/cash')}
            />
          </View>
        ))}
      </View>

      <SectionTitle title={t('recentActivity')} />
      <GlassCard style={styles.emptyActivity}>
        {recentTransactions.length === 0 ? (
          <View style={[styles.emptyActivityRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="pulse-outline" size={22} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('noActivity')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('startByAdding')}</Text>
            </View>
          </View>
        ) : (
          <View>
            {recentTransactions.map((transaction, index) => {
              const isCashIn = transaction.type === 'cash_in';
              return (
                <View
                  key={transaction.id}
                  style={[
                    styles.activityRow,
                    { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.border },
                    index === recentTransactions.length - 1 && styles.lastActivityRow,
                  ]}
                >
                  <Ionicons
                    name={isCashIn ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    size={21}
                    color={isCashIn ? colors.primary : colors.destructive}
                  />
                  <View style={styles.activityContent}>
                    <Text style={[styles.activityTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t(isCashIn ? 'cashIn' : 'cashOut')} — {formatMoney(transaction.amount, transaction.currency, language)}
                    </Text>
                    {transaction.note ? (
                      <Text numberOfLines={1} style={[styles.activityNote, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                        {transaction.note}
                      </Text>
                    ) : null}
                    <Text style={[styles.activityDate, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {formatLocalizedDateTime(new Date(transaction.createdAt), language)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </GlassCard>
      <View style={{ height: Math.max(insets.bottom, 8) }} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  profileButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.7 },
  metricRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9, marginBottom: 9 },
  metricCell: { minWidth: 0 },
  emptyActivity: { marginBottom: 18 },
  emptyActivityRow: { alignItems: 'center', gap: 13 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  emptyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 3 },
  activityRow: { alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: 1 },
  lastActivityRow: { borderBottomWidth: 0, paddingBottom: 0 },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  activityNote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  activityDate: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
});