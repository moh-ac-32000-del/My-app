import React, { useEffect, useReducer } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { getFirebaseAuth } from '@/services/firebase';
import { readConfirmedCollection, subscribeLocalExportCache } from '@/services/localExportCache';
import { journalDrawerDetail } from '@/data/journalDrawerDetail';
import { journalEventDetails, journalEventMoney, journalEventTitle } from '@/services/journalPresentation';
import { journalDetailText } from '@/constants/journalDetailText';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { DailyJournalEvent } from '@/types/journal';

export function JournalEventDetails({ event, onClose }: { event: DailyJournalEvent; onClose: () => void }) {
  const store = useStore(), colors = useColors(), { language, t, isRTL } = useI18n();
  const [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => subscribeLocalExportCache(refresh), []);
  const copy = journalDetailText[language], uid = getFirebaseAuth().currentUser?.uid;
  const permitted = store.isAuthenticated && !store.activeSpaceLoading && !store.activeSpaceError && !!store.workspaceRole &&
    event.storeId === store.profile.id && !!uid && !!store.activeSpaceId;
  const scope = permitted ? { uid: uid!, spaceId: store.activeSpaceId!, storeId: event.storeId } : null;
  const transactions = scope ? readConfirmedCollection(scope, 'transactions') : null;
  const balance = scope && transactions ? journalDrawerDetail(scope.spaceId, event, transactions, readConfirmedCollection(scope, 'payments')) : null;
  if (!permitted) return null;
  const text = { color: colors.foreground, textAlign: isRTL ? 'right' as const : 'left' as const };
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 16 }} style={{ maxHeight: '85%', backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        <Text style={{ ...text, fontSize: 19, fontWeight: '700' }}>{copy.title}</Text>
        <Text style={text}>{journalEventTitle(event, t)}</Text>
        <Text style={{ ...text, fontSize: 22 }}>{journalEventMoney(event, language)}</Text>
        {journalEventDetails(event, language, t).map((line, i) => <Text key={i} style={{ ...text, color: colors.mutedForeground }}>{line}</Text>)}
        {balance ? (['before', 'effect', 'after'] as const).map(key => <View key={key} style={{ gap: 5, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
          <Text style={{ ...text, color: colors.mutedForeground }}>{copy[key]}</Text>
          <Text testID={`journal-drawer-${key}`} style={{ ...text, fontSize: 19 }}>{formatExactMoney(balance[key], event.currency, language)}</Text>
        </View>) : <Text style={{ ...text, color: colors.mutedForeground }}>{copy.unavailable}</Text>}
        <Text style={{ ...text, fontSize: 12, color: colors.mutedForeground }}>{copy.source}</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ padding: 14, borderRadius: 12, backgroundColor: colors.primary }}><Text style={{ color: colors.primaryForeground, textAlign: 'center' }}>{t('close')}</Text></Pressable>
      </ScrollView>
    </View>
  </Modal>;
}
