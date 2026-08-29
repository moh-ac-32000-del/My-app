import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { loadDailyArchives, type DailyJournalEvent } from '@/services/storage';
import type { DailyArchive } from '@/types/business';

function parseArchiveDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function ArchiveScreen() {
  const colors = useColors();
  const { profile, isReady } = useStore();
  const { t, language, isRTL } = useI18n();
  const [archives, setArchives] = useState<DailyArchive[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const selectedArchive = useMemo(
    () => archives.find((archive) => archive.id === selectedArchiveId) ?? null,
    [archives, selectedArchiveId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }
      let active = true;
      void loadDailyArchives(profile.id).then((loadedArchives) => {
        if (active) {
          setArchives(loadedArchives);
          setSelectedArchiveId((current) =>
            loadedArchives.some((archive) => archive.id === current)
              ? current
              : loadedArchives[0]?.id ?? null);
        }
      });
      return () => {
        active = false;
      };
    }, [isReady, profile.id]),
  );

  const getEventTitle = (event: DailyJournalEvent): string => {
    if (event.type === 'cash_in') return t('cashIn');
    if (event.type === 'cash_out') return t('cashOut');
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

  return (
    <AppShell>
      <PageHeader title={t('archive')} subtitle={t('archiveSelectHint')} />

      {archives.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title={t('archiveEmpty')}
          hint={t('archiveEmptyHint')}
        />
      ) : (
        <>
          <View style={styles.archiveList}>
            {archives.map((archive) => {
              const selected = archive.id === selectedArchiveId;
              return (
                <Pressable
                  key={archive.id}
                  testID={`archive-day-${archive.date}-${archive.closingNumber}`}
                  accessibilityRole="button"
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
                  <View style={[styles.archiveIcon, { backgroundColor: colors.accent }]}>
                    <Ionicons name="calendar-outline" size={19} color={colors.primary} />
                  </View>
                  <View style={[styles.archiveDayCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.archiveDate, { color: colors.foreground }]}>
                      {formatLocalizedDate(parseArchiveDate(archive.date), language)} — {t('close')} #{archive.closingNumber}
                    </Text>
                    <Text style={[styles.archiveClosedAt, { color: colors.mutedForeground }]}>
                      {t('archiveClosedAt')}: {formatLocalizedDateTime(new Date(archive.closedAt), language)}
                    </Text>
                  </View>
                  <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>

          {selectedArchive ? (
            <>
              <SectionTitle title={t('archiveEvents')} />
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
                            <Text style={[styles.eventTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                              {getEventTitle(event)} — {formatMoney(event.amount, event.currency, language)}
                            </Text>
                            {event.note ? (
                              <Text style={[styles.eventNote, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                                {event.note}
                              </Text>
                            ) : null}
                            <Text style={[styles.eventTime, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                              {formatLocalizedDateTime(new Date(event.occurredAt), language)}
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
  archiveList: { gap: 9, marginBottom: 22 },
  archiveDay: { minHeight: 66, borderWidth: 1, borderRadius: 20, alignItems: 'center', gap: 11, paddingHorizontal: 13 },
  archiveIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  archiveDayCopy: { flex: 1, gap: 4 },
  archiveDate: { fontSize: 14, fontFamily: 'Inter_700Bold' },
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
});