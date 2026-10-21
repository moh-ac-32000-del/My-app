import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { formatLocalizedDate, formatLocalizedDateTime, formatLocalizedTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { getLocalDateKey, type DailyJournalEvent } from '@/services/storage';
import { buildArchiveShareMessage } from '@/services/archiveSharing';
import { journalEventTitle, journalEventMoney, journalEventDetails } from '@/services/journalPresentation';
import { ArchiveDayPicker } from '@/components/ArchiveDayPicker';
import { useArchiveDay } from '@/hooks/useArchiveDay';
import { archiveDateForDisplay } from '@/data/archiveCalendar';
import { useFinancialWindow } from '@/hooks/useFinancialWindow';

export default function ArchiveScreen() {
  const colors = useColors();
  const { profile } = useStore();
  const clock = useFinancialWindow();
  const { t, language, isRTL } = useI18n();
  const [date, setDate] = useState(() => clock.window?.date ?? getLocalDateKey(new Date()));
  const { archives, isLoading, error: archiveError, retry } = useArchiveDay(date);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const selectedArchive = useMemo(
    () => archives.find((archive) => archive.id === selectedArchiveId) ?? archives[0] ?? null,
    [archives, selectedArchiveId],
  );

  const getEventTitle = (event: DailyJournalEvent): string => {
    if (event.type === 'merchant') return journalEventTitle(event, t);
    if (event.type === 'cash_in') return t('cashIn');
    if (event.type === 'cash_out') return t('cashOut');
    const customerName = event.customerName ?? t('unknownCustomer');
    return event.type === 'debt'
      ? `${t('quickActionCredit')} — ${customerName}`
      : `${t('settlementFrom')} ${customerName}`;
  };

  const getEventIcon = (event: DailyJournalEvent): React.ComponentProps<typeof Ionicons>['name'] => {
    if (event.type === 'merchant') return 'storefront-outline';
    if (event.type === 'cash_in') return 'arrow-down-circle-outline';
    if (event.type === 'cash_out') return 'arrow-up-circle-outline';
    return event.type === 'debt' ? 'time-outline' : 'checkmark-done-circle-outline';
  };

  const shareSelectedArchive = async () => {
    if (!selectedArchive || isSharing) {
      return;
    }
    setIsSharing(true);
    try {
      const message = buildArchiveShareMessage(selectedArchive, profile.name, language, t);
      await Share.share({ message });
    } catch (error) {
      console.error('Archive sharing failed', error);
      Alert.alert(t('somethingWentWrong'), t('shareArchiveError'));
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={t('archive')}
        subtitle={formatLocalizedDate(archiveDateForDisplay(date), language)}
        action={
          <ArchiveDayPicker
            value={date}
            today={clock.window?.date}
            onChange={(next) => {
              setSelectedArchiveId(null);
              setDate(next);
            }}
          />
        }
      />

      {archiveError ? (
        <>
          <EmptyState icon="alert-circle-outline" title={t('somethingWentWrong')} hint={t('reloadToContinue')} />
          <Pressable
            testID="archive-retry"
            accessibilityRole="button"
            onPress={retry}
            style={[styles.shareButton, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: colors.primary }}>{t('tryAgain')}</Text>
          </Pressable>
        </>
      ) : isLoading ? (
        <ActivityIndicator testID="archive-loading" color={colors.primary} />
      ) : archives.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title={t('archiveDayEmpty')}
          hint={formatLocalizedDate(archiveDateForDisplay(date), language)}
        />
      ) : (
        <>
          <View style={styles.archiveList}>
            {archives.map((archive) => {
              const selected = archive.id === selectedArchive?.id;
              return (
                <Pressable
                  key={archive.id}
                  testID={`archive-day-${archive.date}-${archive.closingNumber}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t('close')} #${archive.closingNumber} — ${formatLocalizedDateTime(new Date(archive.closedAt), language)}`}
                  onPress={() => setSelectedArchiveId(archive.id)}
                  style={({ pressed }) => [
                    styles.archiveDay,
                    {
                      backgroundColor: selected ? colors.accent : colors.glass,
                      borderColor: selected ? colors.primary : colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.archiveDate, { color: colors.foreground }]}>
                    {t('close')} #{archive.closingNumber}
                  </Text>
                  <Text style={[styles.archiveClosedAt, { color: colors.mutedForeground }]}>
                    {formatLocalizedTime(new Date(archive.closedAt), language, archive.timeZone)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedArchive ? (
            <>
              <SectionTitle title={t('archiveEvents')} />
              <Text style={{ color: colors.mutedForeground, marginBottom: 10, textAlign: isRTL ? 'right' : 'left' }}>
                {t(selectedArchive.closingMode === 'automatic' ? 'automaticClosingActive' : 'manualClosing')}
                {selectedArchive.timeZone ? ` · ${selectedArchive.timeZone}` : ''}
              </Text>
              <Pressable
                testID="share-archive-button"
                accessibilityRole="button"
                disabled={isSharing}
                onPress={() => void shareSelectedArchive()}
                style={({ pressed }) => [
                  styles.shareButton,
                  { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' },
                  pressed && styles.pressed,
                ]}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Ionicons name="share-social-outline" size={17} color={colors.primaryForeground} />
                )}
                <Text style={[styles.shareButtonText, { color: colors.primaryForeground }]}>{t('shareArchive')}</Text>
              </Pressable>
              {selectedArchive.snapshot.length === 0 ? (
                <EmptyState icon="receipt-outline" title={t('archiveNoEvents')} hint={selectedArchive.date} />
              ) : (
                <View style={styles.eventList}>
                  {selectedArchive.snapshot.map((event) => {
                    const isCashOut = event.type === 'cash_out';
                    return (
                      <GlassCard key={event.id} testID={`archive-event-${event.id}`} style={styles.eventCard}>
                        <View style={[styles.eventRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <View style={[styles.eventIcon, { backgroundColor: colors.accent }]}>
                            <Ionicons
                              name={getEventIcon(event)}
                              size={20}
                              color={isCashOut ? colors.destructive : colors.primary}
                            />
                          </View>
                          <View style={[styles.eventCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                            <Text
                              style={[
                                styles.eventTitle,
                                { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' },
                              ]}
                            >
                              {getEventTitle(event)} — {journalEventMoney(event, language)}
                            </Text>
                            {journalEventDetails(event, language, t).map((detail, index) => (
                              <Text
                                key={`${event.id}:${index}`}
                                style={[
                                  styles.eventNote,
                                  { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' },
                                ]}
                              >
                                {detail}
                              </Text>
                            ))}
                            <Text
                              style={[
                                styles.eventTime,
                                { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' },
                              ]}
                            >
                              {formatLocalizedDateTime(new Date(event.occurredAt), language, selectedArchive.timeZone)}
                            </Text>
                          </View>
                        </View>
                      </GlassCard>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  archiveList: { gap: 8, marginBottom: 18, flexDirection: 'row', flexWrap: 'wrap' },
  archiveDay: { minHeight: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  archiveDate: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  archiveClosedAt: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  eventList: { gap: 9, marginBottom: 18 },
  eventCard: { padding: 13 },
  eventRow: { alignItems: 'center', gap: 10 },
  eventIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  eventNote: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  eventTime: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  pressed: { opacity: 0.72 },
  shareButton: {
    minHeight: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 11,
  },
  shareButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
