import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { calculateVisibleCurrencyBalances, closeDailyArchive, loadDailyJournalEvents, type DailyJournalEvent } from '@/services/storage';

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady, isAuthenticated, transactions, journalRevision } = useStore();
  const { t, isRTL, language } = useI18n();
  const insets = useSafeAreaInsets();
  const balances = useMemo(
    () => calculateVisibleCurrencyBalances(transactions, profile.visibleCurrencies),
    [transactions, profile.visibleCurrencies],
  );
  const [journalEvents, setJournalEvents] = useState<DailyJournalEvent[]>([]);
  const [isClosingDay, setIsClosingDay] = useState<boolean>(false);
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
  }, [isReady, journalRevision, profile.id]);

  const getJournalTitle = (event: DailyJournalEvent): string => {
    if (event.type === 'cash_in') return t('cashIn');
    if (event.type === 'cash_out') return t('cashOut');
    const customerName = event.customerName ?? t('unknownCustomer');
    return event.type === 'debt'
      ? `${t('quickActionCredit')} — ${customerName}`
      : `${t('settlementFrom')} ${customerName}`;
  };

  const closeDay = async () => {
    if (isClosingDay) {
      return;
    }
    setIsClosingDay(true);
    try {
      const result = await closeDailyArchive(profile.id);
      Alert.alert(result.created ? t('archiveCreated') : t('archiveAlreadyClosed'));
    } catch {
      Alert.alert(t('somethingWentWrong'), t('archiveSaveError'));
    } finally {
      setIsClosingDay(false);
    }
  };

  const confirmCloseDay = () => {
    Alert.alert(t('closeDay'), t('closeDayConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: () => void closeDay() },
    ]);
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
      <Pressable
        testID="dashboard-close-day-button"
        accessibilityRole="button"
        disabled={isClosingDay}
        onPress={confirmCloseDay}
        style={({ pressed }) => [
          styles.closeDayButton,
          { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' },
          pressed && styles.pressed,
        ]}
      >
        {isClosingDay
          ? <ActivityIndicator size="small" color={colors.primaryForeground} />
          : <Ionicons name="lock-closed-outline" size={17} color={colors.primaryForeground} />}
        <Text style={[styles.closeDayText, { color: colors.primaryForeground }]}>{t('closeDay')}</Text>
      </Pressable>
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
  closeDayButton: { minHeight: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 11 },
  closeDayText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});