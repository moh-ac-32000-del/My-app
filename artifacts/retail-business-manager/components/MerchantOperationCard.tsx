import React from 'react';
import { Text, View } from 'react-native';
import { GlassCard } from './AppShell';
import { MerchantButton } from './MerchantAccountUI';
import { merchantActionLabels } from './MerchantCommandForm';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { MerchantOperation } from '@/types/merchant';

export function MerchantOperationCard({
  operation,
  onReverse,
}: {
  operation: MerchantOperation;
  onReverse?: () => void;
}) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const payment = operation.action === 'payment' || operation.action === 'directPayment';
  return (
    <GlassCard
      testID={`merchant-operation-${operation.id}`}
      style={{ gap: 10, borderColor: payment ? colors.warning : colors.border, borderWidth: payment ? 2 : 1 }}
    >
      <Text style={{ ...text, fontWeight: '700', color: payment ? colors.warning : colors.primary }}>
        {t(merchantActionLabels[operation.action])}
      </Text>
      {operation.operationDate ? (
        <Text style={text}>
          {t('merchantOperationDate')}: {operation.operationDate}
        </Text>
      ) : null}
      <Text style={{ ...text, color: colors.mutedForeground }}>
        {new Date(operation.createdAt).toLocaleString(language === 'tr' ? 'tr-TR' : language)}
      </Text>
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
      {operation.note ? <Text style={text}>{operation.note}</Text> : null}
      {operation.lines?.map((line, index) => (
        <View key={index} style={{ gap: 4 }}>
          <Text style={text}>{line.name}</Text>
          <Text style={{ ...text, color: colors.mutedForeground }}>
            {line.quantity} × {line.unitPrice} = {formatExactMoney(line.totalExact, operation.currency, language)}
          </Text>
        </View>
      ))}
      {operation.totalExact ? (
        <Text style={text}>
          {t('merchantTotal')}: {formatExactMoney(operation.totalExact, operation.currency, language)}
        </Text>
      ) : null}
      {operation.amountExact ? (
        <Text style={{ ...text, fontSize: 20, fontWeight: '700' }}>
          {t('amount')}: {formatExactMoney(operation.amountExact, operation.currency, language)}
        </Text>
      ) : null}
      {operation.paidExact && operation.paidExact !== '0.00' ? (
        <Text style={text}>
          {t('merchantPaid')}: {formatExactMoney(operation.paidExact, operation.currency, language)}
        </Text>
      ) : null}
      {operation.source === 'external' ? <Text style={text}>{t('merchantExternal')}</Text> : null}
      <Text style={text}>
        {t('merchantBalance')}: {formatExactMoney(operation.balanceAfterExact, operation.currency, language)}
      </Text>
      <Text style={{ ...text, color: colors.mutedForeground }}>
        {operation.cashDeltaExact === '0.00'
          ? t('merchantNoncash')
          : `${t('merchantCashEffect')}: ${formatExactMoney(operation.cashDeltaExact, operation.currency, language)}`}
      </Text>
      {operation.reversedByOperationId ? (
        <Text style={{ ...text, color: colors.warning }}>{t('merchantReversed')}</Text>
      ) : null}
      {onReverse && !operation.reversedByOperationId && operation.action !== 'reverse' ? (
        <MerchantButton title={t('merchantReverse')} onPress={onReverse} />
      ) : null}
    </GlassCard>
  );
}
