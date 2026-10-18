import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useFollowUpPreferences } from '@/hooks/useFollowUpPreferences';
import type { FollowUpPreferences, FollowUpScope } from '@/services/followUpPreferences';

export function FollowUpSettings({ scope }: { scope: FollowUpScope | null }) {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const { preferences, error, saving, save, retry } = useFollowUpPreferences(scope);
  const [draft, setDraft] = useState<FollowUpPreferences | null>(null);
  const [picker, setPicker] = useState(false);
  const [message, setMessage] = useState<'saved' | 'error' | null>(null);
  useEffect(() => { setDraft(preferences); setMessage(null); setPicker(false); }, [preferences]);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const change = (next: FollowUpPreferences) => { setDraft(next); setMessage(null); };
  const ready = !!scope && !!preferences && !!draft;
  const selectedDate = new Date();
  if (draft) { const [hours, minutes] = draft.time.split(':').map(Number); selectedDate.setHours(hours, minutes, 0, 0); }
  return <GlassCard testID="follow-up-settings" style={styles.card}>
    <View style={[styles.heading, row]}>
      <View style={[styles.icon, { backgroundColor: colors.accent }]}><Ionicons name="time-outline" size={23} color={colors.primary} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, align, { color: colors.foreground }]}>{t('followUpTitle')}</Text>
        <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('followUpHint')}</Text>
      </View>
    </View>
    {!scope ? <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('followUpUnavailable')}</Text>
      : error ? <Pressable accessibilityRole="button" onPress={retry} style={styles.action}><Text style={[styles.hint, align, { color: colors.destructive }]}>{t('followUpLoadError')}</Text></Pressable>
        : !ready ? <ActivityIndicator color={colors.primary} /> : <>
          <View style={[styles.timeRow, row, { backgroundColor: colors.accent }]}>
            <Text style={[styles.title, align, { color: colors.foreground }]}>{t('followUpTime')}</Text>
            {Platform.OS === 'web' ? React.createElement('input', {
              type: 'time', value: draft.time, 'aria-label': t('followUpTime'), disabled: saving,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => change({ ...draft, time: event.target.value }),
              style: { color: colors.foreground, background: colors.input, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, fontSize: 20, width: 145, colorScheme: 'dark' },
            }) : <Pressable accessibilityRole="button" accessibilityLabel={t('followUpTime')} disabled={saving} onPress={() => setPicker(true)} style={styles.timeButton}>
              <Text style={[styles.time, { color: colors.primary }]}>{draft.time}</Text>
            </Pressable>}
          </View>
          {picker && Platform.OS !== 'web' ? <DateTimePicker value={selectedDate} mode="time" is24Hour themeVariant="dark" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, value) => {
            setPicker(false);
            if (event.type === 'set' && value) change({ ...draft, time: `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` });
          }} /> : null}
          {(['overdueEnabled', 'pendingEnabled'] as const).map((key) => <View key={key} style={[styles.option, row, { borderBottomColor: colors.border }]}>
            <View style={styles.copy}>
              <Text style={[styles.title, align, { color: colors.foreground }]}>{t(key === 'overdueEnabled' ? 'followUpOverdue' : 'followUpPending')}</Text>
              <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t(key === 'overdueEnabled' ? 'followUpOverdueHint' : 'followUpPendingHint')}</Text>
            </View>
            <Switch accessibilityLabel={t(key === 'overdueEnabled' ? 'followUpOverdue' : 'followUpPending')} disabled={saving} value={draft[key]} onValueChange={(value) => change({ ...draft, [key]: value })} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.foreground} />
          </View>)}
          <Pressable testID="save-follow-up-preferences" accessibilityRole="button" disabled={saving} onPress={() => {
            setMessage(null);
            void save(draft).then((saved) => { if (saved) setMessage('saved'); }).catch(() => setMessage('error'));
          }} style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.title, { color: colors.primaryForeground }]}>{t('followUpSave')}</Text>}
          </Pressable>
        </>}
    {message ? <Text accessibilityLiveRegion="polite" style={[styles.hint, align, { color: message === 'error' ? colors.destructive : colors.success }]}>{t(message === 'saved' ? 'saved' : 'followUpSaveError')}</Text> : null}
    <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('followUpDeliveryPending')}</Text>
  </GlassCard>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 20, gap: 16 },
  heading: { alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 20 },
  timeRow: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 14, borderRadius: 16 },
  timeButton: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  time: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  option: { alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1 },
  save: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 44, justifyContent: 'center' },
});
