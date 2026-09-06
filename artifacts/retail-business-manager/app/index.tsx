import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { AmountMetric } from '@/components/MetricCard';
import { DailyClosingAction } from '@/components/DailyClosingAction';
import { SplashView } from '@/components/SplashView';
import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { calculateVisibleCurrencyBalances, loadDailyJournalEvents, type DailyJournalEvent } from '@/services/storage';

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady, isAuthenticated, initializationError, retryInitialization, transactions, journalRevision } = useStore();
  const { t, isRTL, direction, language } = useI18n();
  const insets = useSafeAreaInsets();
  const balances = useMemo(
    () => calculateVisibleCurrencyBalances(transactions, profile.visibleCurrencies),
    [transactions, profile.visibleCurrencies],
  );
  const [journalEvents, setJournalEvents] = useState<DailyJournalEvent[]>([]);
  const [journalRefreshKey, setJournalRefreshKey] = useState(0);
  const currencyCardWidth = balances.length === 1 ? '100%' : '48%';

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isReady, isAuthenticated, router]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    let active = true;
    void loadDailyJournalEvents(profile.id).then((events) => {
      if (active) {
        setJournalEvents(events);
      }
    });
    return () => {
      active = false;
    };
  }, [isReady, journalRevision, journalRefreshKey, profile.id]);

  const getJournalTitle = (event: DailyJournalEvent): string => {
    if (event.type === 'cash_in') return t('cashIn');
    if (event.type === 'cash_out') return t('cashOut');
    const customerName = event.customerName ?? t('unknownCustomer');
    return event.type === 'debt'
      ? `${t('quickActionCredit')} — ${customerName}`
      : `${t('settlementFrom')} ${customerName}`;
  };

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
      {initializationError ? (
        <View style={[styles.initializationBanner, { backgroundColor: `${colors.destructive}18`, borderColor: `${colors.destructive}55`, direction, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.destructive} />
          <Text style={[styles.initializationBannerText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('authGenericError')}</Text>
          <Pressable
            testID="retry-post-auth-initialization"
            accessibilityRole="button"
            onPress={retryInitialization}
            style={({ pressed }) => [styles.initializationRetryButton, { borderColor: colors.destructive, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.destructive} />
            <Text style={[styles.initializationRetryText, { color: colors.destructive }]}>{t('tryAgain')}</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionTitle title={t('cashBalance')} />
      <View style={[styles.metricRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {balances.map(({ currency, amount }) => (
          <View key={currency} style={[styles.metricCell, { width: currencyCardWidth }]}>
            <AmountMetric
              label={`${t('cashBalance')} ${currency}`}
              value={amount}
              icon="wallet-outline"
              currency={currency}
            />
          </View>
        ))}
      </View>

      <SectionTitle title={t('recentActivity')} />
      <DailyClosingAction
        storeId={profile.id}
        testID="dashboard-close-day-button"
        onClosed={() => setJournalRefreshKey((value) => value + 1)}
      />
      <GlassCard style={styles.emptyActivity}>
        {journalEvents.length === 0 ? (
          <View style={[styles.emptyActivityRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="pulse-outline" size={22} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('noActivity')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('startByAdding')}</Text>
            </View>
          </View>
        ) : (
          <View>
            {journalEvents.map((event, index) => {
              const isCashIn = event.type === 'cash_in';
              const isCashOut = event.type === 'cash_out';
              return (
                <View
                  key={event.id}
                  style={[
                    styles.activityRow,
                    { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.border },
                    index === journalEvents.length - 1 && styles.lastActivityRow,
                  ]}
                >
                  <Ionicons
                    name={isCashIn ? 'arrow-down-circle-outline' : isCashOut ? 'arrow-up-circle-outline' : event.type === 'debt' ? 'time-outline' : 'checkmark-done-circle-outline'}
                    size={21}
                    color={isCashOut ? colors.destructive : colors.primary}
                  />
                  <View style={styles.activityContent}>
                    <Text style={[styles.activityTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {getJournalTitle(event)} — {formatMoney(event.amount, event.currency, language)}
                    </Text>
                    <Text style={[styles.activityDate, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {formatLocalizedDateTime(new Date(event.occurredAt), language)}
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
  initializationBanner: { alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14 },
  initializationBannerText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  initializationRetryButton: { alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  initializationRetryText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
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