import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActorBadge } from './ActorBadge';
import { Pressable, Text, View } from 'react-native';
import { GlassCard } from './AppShell';
import { merchantActionLabels } from './MerchantCommandForm';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import { subtractCustomerExact } from '@/data/customerCreditAccounting';
import type { MerchantOperation } from '@/types/merchant';
import { merchantOperationTone } from '@/data/merchantOperationPresentation';

/** One compact ledger row: balances belong to the account header, never to the row. */
export function MerchantOperationCard({ operation, onPress, onEdit }: { operation: MerchantOperation; onPress?: () => void; onEdit?: () => void }) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const accent = merchantOperationTone(operation.action) ?? colors.mutedForeground;
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const rawAmount = operation.totalExact ?? operation.amountExact ?? '0.00';
  const amount = operation.action === 'reverse' ? subtractCustomerExact('0.00', rawAmount) : rawAmount;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('merchantDetails')} onPress={onPress}>
      <GlassCard testID={`merchant-operation-${operation.id}`} style={{ gap: 8, padding: 14, borderColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>
            <View testID="merchant-operation-tone" accessible={false} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
            <Text style={{ ...text, fontFamily: 'Inter_700Bold', flexShrink: 1 }}>
              {t(merchantActionLabels[operation.action])}
            </Text>
          </View>
          <Text style={{ ...text, fontFamily: 'Inter_700Bold' }}>
            {formatExactMoney(amount, operation.currency, language)}
          </Text>
        </View>
        <Text style={{ ...text, color: colors.mutedForeground }}>
          {operation.operationDate ?? new Date(operation.createdAt).toLocaleDateString(language)}
        </Text>
        {onEdit && !operation.reversedByOperationId ? <Pressable
          testID={`edit-merchant-operation-${operation.id}`} accessibilityRole="button" accessibilityLabel={t('operationEdit')}
          onPress={press => { press.stopPropagation(); onEdit(); }}
          style={{ alignSelf: isRTL ? 'flex-start' : 'flex-end', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="pencil-outline" size={17} color={colors.mutedForeground} />
        </Pressable> : null}
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
          <Text style={{ ...text, color: colors.mutedForeground }}>{t(operation.replacementOperationId ? 'operationSuperseded' : 'operationCancelled')}</Text>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}
