import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppShell, EmptyState, GlassCard, PageHeader } from '@/components/AppShell';
import { DailyClosingAction } from '@/components/DailyClosingAction';
import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDateTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useDailyJournalProjection } from '@/hooks/useDailyJournalProjection';
import type { DailyJournalEvent } from '@/services/storage';

export default function CashScreen() {
  const colors = useColors();
  const { profile } = useStore();
  const { t, isRTL, language } = useI18n();
  const [journalRefreshKey, setJournalRefreshKey] = useState(0);
  const {
    events,
    isLoading: journalLoading,
    error: journalError,
  } = useDailyJournalProjection(journalRefreshKey);

  const getEventTitle = (event: DailyJournalEvent): string => {
    if (event.type === 'cash_in') {
      return t('cashIn');
    }
    if (event.type === 'cash_out') {
      return t('cashOut');
    }
    const customerName = event.customerName ?? t('unknownCustomer');
    return event.type === 'debt'
      ? `${t('quickActionCredit')} — ${customerName}`
      : `${t('settlementFrom')} ${customerName}`;
  };

  const getEventIcon = (event: DailyJournalEvent): React.ComponentProps<typeof Ionicons>['name'] => {
    if (event.type === 'cash_in') return 'arrow-down-circle-outline';
    if (event.type === 'cash_out') return 'arrow-up-circle-outline';
    return event.type === 'debt' ? 'time-outline' : 'checkmark-done-circle-outline';
  };

  const getEventColor = (event: DailyJournalEvent) => {
    if (event.type === 'cash_out') return colors.destructive;
    return colors.primary;
  };

  return (
    <AppShell>
      <PageHeader
        title={t('dailyJournal')}
        subtitle={t('dailyJournalHint')}
        showBack
        action={
          <DailyClosingAction
            storeId={profile.id}
            compact
            testID="close-day-button"
            onClosed={() => setJournalRefreshKey((value) => value + 1)}
          />
        }
      />

      {journalLoading ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : journalError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('somethingWentWrong')}
          hint={t('reloadToContinue')}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('noJournalEvents')}
          hint={t('noJournalEventsHint')}
        />
      ) : (
        <View style={styles.list}>
          {events.map((event) => {
            const eventColor = getEventColor(event);
            return (
              <GlassCard key={event.id} testID={`journal-event-${event.id}`} style={styles.transactionCard}>
                <View style={[styles.transactionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.transactionIcon, { backgroundColor: colors.accent }]}>
                    <Ionicons name={getEventIcon(event)} size={21} color={eventColor} />
                  </View>
                  <View style={[styles.transactionContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.transactionTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {getEventTitle(event)} — {formatMoney(event.amount, event.currency, language)}
                    </Text>
                    <Text style={[styles.currencyCode, { color: colors.primary }]}>{event.currency}</Text>
                  </View>
                </View>
                <Text style={[styles.date, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                  {formatLocalizedDateTime(new Date(event.occurredAt), language)}
                </Text>
              </GlassCard>
            );
          })}
        </View>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginBottom: 18 },
  status: { minHeight: 130, alignItems: 'center', justifyContent: 'center' },
  transactionCard: { padding: 14 },
  transactionHeader: { alignItems: 'center', gap: 11 },
  transactionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  transactionContent: { flex: 1, gap: 3 },
  transactionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  currencyCode: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 11 },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 9 },
});