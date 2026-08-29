import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppShell, EmptyState, GlassCard, PageHeader } from '@/components/AppShell';
import { formatMoney } from '@/constants/currencies';
import { formatLocalizedDateTime } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

export default function CashScreen() {
  const colors = useColors();
  const { transactions } = useStore();
  const { t, isRTL, language } = useI18n();

  return (
    <AppShell>
      <PageHeader title={t('dailyJournal')} subtitle={t('dailyJournalHint')} showBack />

      {transactions.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('noTransactions')}
          hint={t('noTransactionsHint')}
        />
      ) : (
        <View style={styles.list}>
          {transactions.map((transaction) => {
            const isCashIn = transaction.type === 'cash_in';
            return (
              <GlassCard key={transaction.id} testID={`journal-transaction-${transaction.id}`} style={styles.transactionCard}>
                <View style={[styles.transactionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.transactionIcon, { backgroundColor: colors.accent }]}>
                    <Ionicons
                      name={isCashIn ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                      size={21}
                      color={isCashIn ? colors.primary : colors.destructive}
                    />
                  </View>
                  <View style={[styles.transactionContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.transactionTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t(isCashIn ? 'cashIn' : 'cashOut')} — {formatMoney(transaction.amount, transaction.currency, language)}
                    </Text>
                    <Text style={[styles.currencyCode, { color: colors.primary }]}>{transaction.currency}</Text>
                  </View>
                </View>
                {transaction.note ? (
                  <Text style={[styles.note, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                    {transaction.note}
                  </Text>
                ) : null}
                <Text style={[styles.date, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                  {formatLocalizedDateTime(new Date(transaction.createdAt), language)}
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
  transactionCard: { padding: 14 },
  transactionHeader: { alignItems: 'center', gap: 11 },
  transactionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  transactionContent: { flex: 1, gap: 3 },
  transactionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  currencyCode: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 11 },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 9 },
});