import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader } from '@/components/AppShell';
import { ArchiveDayPicker } from '@/components/ArchiveDayPicker';
import { ActorBadge } from '@/components/ActorBadge';
import { JournalEventDetails } from '@/components/JournalEventDetails';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useFinancialWindow } from '@/hooks/useFinancialWindow';
import { useDailyJournalProjection } from '@/hooks/useDailyJournalProjection';
import { isArchiveDate, archiveDateForDisplay } from '@/data/archiveCalendar';
import { formatLocalizedDate, formatLocalizedDateTime } from '@/constants/i18n';
import { journalEventTitle, journalEventMoney, journalEventDetails } from '@/services/journalPresentation';
import type { DailyJournalEvent } from '@/types/journal';
import { closingSettings, workspaceDateKey } from '@/data/workspaceClosing';

export default function JournalHistoryScreen() {
  const store = useStore(), params = useLocalSearchParams<{ date?: string }>();
  const initialDate = params.date === undefined ? undefined : typeof params.date === 'string' ? params.date : 'invalid';
  return <JournalHistory key={JSON.stringify([store.sessionKey, store.activeSpaceId, store.profile.id, store.workspaceRole, initialDate])} initialDate={initialDate} />;
}

function JournalHistory({ initialDate }: { initialDate?: string }) {
  const store = useStore(), router = useRouter(), colors = useColors(), { t, language, isRTL } = useI18n();
  const clock = useFinancialWindow();
  let timeZone = clock.window?.timeZone;
  try { if (!store.cloudSpace?.automaticClosing) timeZone = closingSettings(store.cloudSpace?.closingSettings).timeZone; } catch { timeZone = undefined; }
  const [chosenDate, setChosenDate] = useState(initialDate);
  const today = timeZone ? workspaceDateKey(new Date(), timeZone) : undefined;
  const date = chosenDate ?? today;
  const validDate = isArchiveDate(date);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<DailyJournalEvent | null>(null);
  const { events, isLoading, error } = useDailyJournalProjection(refresh, date);
  const unavailable = error ?? clock.error ?? (!timeZone || (date && !validDate) ? 'journalCalendarUnavailable' : null);
  const text = { color: colors.foreground, textAlign: isRTL ? 'right' as const : 'left' as const };
  useEffect(() => { if (store.isReady && !store.isAuthenticated) router.replace('/login'); }, [store.isReady, store.isAuthenticated, router]);
  return <AppShell list={{ testID: 'journal-history-list', data: store.isReady && store.isAuthenticated && validDate && !isLoading && !unavailable ? events : [],
    keyExtractor: event => event.id,
    renderItem: ({ item: event }) => <Pressable testID={`history-event-${event.id}`} accessibilityRole="button"
      accessibilityLabel={journalEventTitle(event, t)} onPress={() => setSelected(event)} style={{ marginBottom: 12 }}>
      <GlassCard style={{ gap: 8 }}>
        <Text style={{ ...text, fontWeight: '600' }}>{journalEventTitle(event, t)}</Text>
        <Text style={{ ...text, fontSize: 18 }}>{journalEventMoney(event, language)}</Text>
        {journalEventDetails(event, language, t).map((line, index) => <Text key={index} style={{ ...text, color: colors.mutedForeground }}>{line}</Text>)}
        <ActorBadge userId={event.createdByUserId} />
        <Text style={{ ...text, fontSize: 12, color: colors.mutedForeground }}>{formatLocalizedDateTime(new Date(event.occurredAt), language, timeZone)}</Text>
      </GlassCard>
    </Pressable>,
  }} overlay={selected && !isLoading && !unavailable ? <JournalEventDetails event={selected} onClose={() => setSelected(null)} /> : null}>
    <PageHeader title={t('journalHistory')} showBack
      subtitle={validDate ? formatLocalizedDate(archiveDateForDisplay(date), language) : undefined}
      action={validDate ? <ArchiveDayPicker value={date} today={today} label={t('journalChooseDate')}
        onChange={value => { setSelected(null); setChosenDate(value); }} /> : undefined} />
    <Text style={{ ...text, color: colors.mutedForeground, marginBottom: 16, lineHeight: 22 }}>{t('journalHistoryHint')}</Text>
    {timeZone ? <Text style={{ ...text, color: colors.mutedForeground, marginBottom: 12 }}>{timeZone}</Text> : null}
    {unavailable ? (
      <GlassCard style={{ gap: 12 }}>
        <Text style={text}>{t('reloadToContinue')}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRefresh(n => n + 1)} style={{ minHeight: 44, padding: 12 }}>
          <Text style={{ ...text, color: colors.primary }}>{t('tryAgain')}</Text>
        </Pressable>
      </GlassCard>
    ) : !store.isReady || !store.isAuthenticated || !date || isLoading ? <ActivityIndicator color={colors.primary} /> : events.length === 0 ? <EmptyState icon="receipt-outline" title={t('journalHistoryEmpty')} hint={date} /> : null}
  </AppShell>;
}
