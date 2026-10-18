import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatMoney } from '@/constants/currencies';
import type { buildFollowUpSummary } from '@/services/followUpSummary';

export function FollowUpOverview({ summary }: { summary: ReturnType<typeof buildFollowUpSummary> }) {
  const colors = useColors();
  const { t, isRTL, language } = useI18n();
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  return <GlassCard testID="follow-up-overview" style={styles.card}>
    <Text accessibilityRole="header" style={[styles.title, align, { color: colors.foreground }]}>{t('followUpOverview')}</Text>
    <View style={[styles.panels, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {(['overdue', 'pending'] as const).map((kind) => <View key={kind} style={[styles.panel, { backgroundColor: colors.accent }]}>
        <Ionicons name={kind === 'overdue' ? 'calendar-outline' : 'checkmark-done-outline'} size={23} color={kind === 'overdue' ? colors.warning : colors.primary} />
        <Text style={[styles.count, align, { color: colors.foreground }]}>{kind === 'overdue' ? summary.overdueDebtIds.length : summary.pendingReminderIds.length}</Text>
        <Text style={[styles.label, align, { color: colors.foreground }]}>{t(kind === 'overdue' ? 'followUpOverdue' : 'followUpPending')}</Text>
        {kind === 'overdue' ? summary.balances.map(({ amount, currency }) => <Text key={currency} style={[styles.label, align, { color: colors.mutedForeground }]}>{formatMoney(amount, currency, language)} ({currency})</Text>) : null}
      </View>)}
    </View>
    <Text style={[styles.label, align, { color: colors.mutedForeground }]}>{t('followUpNoPaymentHint')}</Text>
  </GlassCard>;
}
const styles = StyleSheet.create({
  card: { gap: 14, marginBottom: 16 }, title: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  panels: { flexWrap: 'wrap', gap: 10 }, panel: { flexBasis: '45%', flexGrow: 1, minWidth: 130, padding: 14, borderRadius: 16, gap: 8 },
  count: { fontFamily: 'Inter_700Bold', fontSize: 30 }, label: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 20 },
});
