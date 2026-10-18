import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { useStore } from '@/context/StoreContext';
import { useDebts } from '@/context/DebtContext';
import { useCustomers } from '@/context/CustomerContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatLocalizedDateTime } from '@/constants/i18n';
import { formatMoney } from '@/constants/currencies';
import { loadCloudReminders } from '@/services/cloudReminders';
import { loadNotificationTime } from '@/services/preferences';
import { notificationCenterItems, NOTIFICATION_GROUPS } from '@/services/notificationCenter';
import type { Reminder } from '@/types/business';

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const { activeSpaceId, profile, isReady, isAuthenticated } = useStore();
  const { debts, canonicalSpaceId: debtSpaceId, isLoading: debtLoading, error: debtError, retryDebts } = useDebts();
  const { customers, canonicalSpaceId: customerSpaceId } = useCustomers();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setReminders([]);
    setError(false);
    setLoading(true);
    if (isReady && !isAuthenticated) {
      router.replace('/login');
      return () => { active = false; };
    }
    if (debtError) {
      setError(true);
      setLoading(false);
      return () => { active = false; };
    }
    if (!isReady || !isAuthenticated || debtLoading || !activeSpaceId || debtSpaceId !== activeSpaceId) {
      return () => { active = false; };
    }
    void loadNotificationTime().then((time) => loadCloudReminders(activeSpaceId, profile.id, time))
      .then((records) => { if (active) setReminders(records); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isReady, isAuthenticated, activeSpaceId, profile.id, debtSpaceId, debtLoading, debtError, debts, refresh, router]));

  const items = useMemo(() => activeSpaceId && debtSpaceId === activeSpaceId
    ? notificationCenterItems(reminders, debts, activeSpaceId, profile.id) : [],
  [reminders, debts, activeSpaceId, debtSpaceId, profile.id]);
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const statusKeys = { pending: 'reminderStatusPending', completed: 'reminderStatusCompleted', dismissed: 'reminderStatusDismissed' } as const;
  if (!isReady || !isAuthenticated) return <ActivityIndicator color={colors.primary} />;
  return (
    <AppShell>
      <PageHeader title={t('notifications')} subtitle={t('notificationCenterHint')} showBack />
      <GlassCard style={styles.card}>
        <Text style={[styles.text, align, { color: colors.mutedForeground }]}>{t('notificationCenterNativePending')}</Text>
      </GlassCard>
      <Pressable testID="refresh-notifications" accessibilityRole="button" onPress={() => { if (debtError) retryDebts(); setRefresh((value) => value + 1); }} style={styles.action}>
        <Text style={[styles.title, align, { color: colors.primary }]}>{t('notificationCenterRefresh')}</Text>
      </Pressable>
      {loading ? <ActivityIndicator testID="notifications-loading" color={colors.primary} />
        : error ? <EmptyState icon="cloud-offline-outline" title={t('somethingWentWrong')} hint={t('notificationCenterLoadError')} />
          : items.length === 0 ? <EmptyState icon="notifications-outline" title={t('remindersEmpty')} hint={t('remindersEmptyHint')} />
            : NOTIFICATION_GROUPS.map((status) => {
              const group = items.filter((item) => item.reminder.status === status);
              if (!group.length) return null;
              return <View key={status}>
                <SectionTitle title={t(statusKeys[status])} action={String(group.length)} />
                {group.map(({ reminder, debt, isDueDate, note }) => {
                  const customer = debt && customerSpaceId === activeSpaceId
                    ? customers.find((item) => item.id === debt.customerId && item.storeId === profile.id) : null;
                  return <GlassCard key={reminder.id} testID={`notification-${reminder.id}`} style={styles.card}>
                    <Text style={[styles.title, align, { color: colors.foreground }]}>{isDueDate ? t('notificationCenterDueDate') : t('reminders')}</Text>
                    <Text style={[styles.text, align, { color: colors.foreground }]}>{debt ? customer?.name ?? t('unknownCustomer') : t('reminderDebtUnavailable')}</Text>
                    <Text style={[styles.text, align, { color: colors.mutedForeground }]}>{formatLocalizedDateTime(new Date(reminder.remindAt), language)}</Text>
                    {debt ? <Text style={[styles.text, align, { color: colors.foreground }]}>{t('remainingDebt')}: {formatMoney(debt.amount, debt.currency, language)} ({debt.currency})</Text> : null}
                    {note ? <Text style={[styles.text, align, { color: colors.mutedForeground }]}>{note}</Text> : null}
                    {debt && customer ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/customer/[id]', params: { id: debt.customerId } })} style={styles.action}>
                      <Text style={[styles.title, align, { color: colors.primary }]}>{t('notificationCenterOpenCustomer')}</Text>
                    </Pressable> : null}
                  </GlassCard>;
                })}
              </View>;
            })}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14, gap: 8 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  text: { fontSize: 13, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  action: { minHeight: 44, paddingVertical: 12, marginBottom: 8 },
});
