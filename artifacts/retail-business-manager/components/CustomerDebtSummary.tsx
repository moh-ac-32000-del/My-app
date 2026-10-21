import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '@/components/AppShell';
import { formatMoney, getCurrency } from '@/constants/currencies';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { CustomerDebtSummaryState } from '@/services/customerDebtSummary';
import { formatExactMoney } from '@/data/exactMoneyPresentation';

export function CustomerDebtSummary({ state, onRetry }: { state: CustomerDebtSummaryState; onRetry: () => void }) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  return (
    <GlassCard testID="customer-debt-summary" style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, align, { color: colors.foreground }]}>{t('customerDebtSummaryTitle')}</Text>
      <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('customerDebtSummaryHint')}</Text>
      {state.status === 'loading' ? (
        <ActivityIndicator testID="customer-debt-summary-loading" accessibilityLabel={t('customerDebtSummaryTitle')} color={colors.primary} />
      ) : state.status === 'error' ? (
        <View>
          <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('customerDebtSummaryError')}</Text>
          <Pressable testID="retry-customer-debt-summary" accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <Text style={[styles.title, align, { color: colors.primary }]}>{t('reloadToContinue')}</Text>
          </Pressable>
        </View>
      ) : state.balances.length === 0 ? (
        <Text testID="customer-debt-summary-empty" style={[styles.hint, align, { color: colors.foreground }]}>{t('customerDebtSummaryEmpty')}</Text>
      ) : (
        <View style={[styles.balances, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {state.balances.map(({ currency, amount }) => (
            <View key={currency} testID={`customer-debt-total-${currency}`} style={[styles.balance, { backgroundColor: colors.accent }]}>
              <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t(getCurrency(currency).nameKey)} ({currency})</Text>
              <Text style={[styles.amount, align, { color: colors.foreground }]}>{typeof amount === 'string' ? formatExactMoney(amount, currency, language) : formatMoney(amount, currency, language)}</Text>
            </View>
          ))}
        </View>
      )}
      {state.status === 'ready' && state.customerCredits?.length ? <View style={{ gap: 10 }}>
        <Text style={[styles.title, align, { color: colors.success }]}>{t('customerCreditSummary')}</Text>
        {state.customerCredits.map(({ currency, amount }) => <View key={currency} testID={`customer-credit-total-${currency}`} style={[styles.balance, { backgroundColor: colors.accent }]}>
          <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{currency} · {t('customerCreditBalance')}</Text>
          <Text style={[styles.amount, align, { color: colors.success }]}>{formatExactMoney(amount, currency, language)}</Text>
        </View>)}
        <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('customerCreditHint')}</Text>
      </View> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 20, gap: 12 },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  balances: { flexWrap: 'wrap', gap: 10 },
  balance: { flexGrow: 1, flexBasis: '45%', minWidth: 120, padding: 12, borderRadius: 14, gap: 6 },
  amount: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  retry: { paddingVertical: 12, minHeight: 44 },
});
