import React from 'react';
import { ActorBadge } from './ActorBadge';
import { Pressable, Text, View } from 'react-native';
import { GlassCard } from './AppShell';
import { merchantActionLabels } from './MerchantCommandForm';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import { subtractCustomerExact } from '@/data/customerCreditAccounting';
import type { MerchantOperation } from '@/types/merchant';

/** One compact ledger row: balances belong to the account header, never to the row. */
export function MerchantOperationCard({ operation, onPress }: { operation: MerchantOperation; onPress?: () => void }) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const accent =
    operation.action === 'directPayment'
      ? '#eab308'
      : operation.action === 'payment'
        ? '#ef4444'
        : operation.action === 'purchase'
          ? '#3b82f6'
          : colors.mutedForeground;
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const rawAmount = operation.totalExact ?? operation.amountExact ?? '0.00';
  const amount = operation.action === 'reverse' ? subtractCustomerExact('0.00', rawAmount) : rawAmount;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('merchantDetails')} onPress={onPress}>
      <GlassCard testID={`merchant-operation-${operation.id}`} style={{ gap: 8, padding: 14, borderColor: accent }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ ...text, color: accent, fontFamily: 'Inter_700Bold', flexShrink: 1 }}>
            {t(merchantActionLabels[operation.action])}
          </Text>
          <Text style={{ ...text, fontFamily: 'Inter_700Bold' }}>
            {formatExactMoney(amount, operation.currency, language)}
          </Text>
        </View>
        <Text style={{ ...text, color: colors.mutedForeground }}>
          {operation.operationDate ?? new Date(operation.createdAt).toLocaleDateString(language)}
        </Text>
        {operation.lines?.map((line, index) => (
          <Text key={index} style={text}>
            {line.name}
          </Text>
        ))}
        <ActorBadge userId={operation.createdByUserId} />
        {operation.paymentMethodName ? (
          <Text style={text}>
            {t('merchantPaymentMethod')}: {operation.paymentMethodName}
          </Text>
        ) : null}
        {operation.customerName ? (
          <Text style={text}>
            {t('merchantCustomer')}: {operation.customerName}
          </Text>
        ) : null}
        {operation.note ? (
          <Text numberOfLines={2} style={{ ...text, color: colors.mutedForeground }}>
            {operation.note}
          </Text>
        ) : null}
        {operation.cashDeltaExact === '0.00' ? (
          <Text style={{ ...text, color: colors.mutedForeground }}>{t('merchantNoncash')}</Text>
        ) : null}
        {operation.reversedByOperationId ? (
          <Text style={{ ...text, color: colors.warning }}>{t('merchantReversed')}</Text>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}
