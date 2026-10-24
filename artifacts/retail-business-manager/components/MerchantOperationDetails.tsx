import React from 'react';
import { ActorBadge } from './ActorBadge';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MerchantButton } from './MerchantAccountUI';
import { merchantActionLabels } from './MerchantCommandForm';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { MerchantOperation } from '@/types/merchant';

export function MerchantOperationDetails({
  operation,
  onClose,
  onEdit,
}: {
  operation: MerchantOperation;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const colors = useColors(),
    { t, language, isRTL } = useI18n(),
    insets = useSafeAreaInsets();
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
        <ScrollView
          style={{
            maxHeight: '90%',
            backgroundColor: colors.glassStrong,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          contentContainerStyle={{ padding: 22, gap: 14, paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <Text style={{ ...text, fontFamily: 'Inter_700Bold', fontSize: 20 }}>
            {t('merchantDetails')} · {t(merchantActionLabels[operation.action])}
          </Text>
          {operation.operationDate ? (
            <Text style={text}>
              {t('merchantOperationDate')}: {operation.operationDate}
            </Text>
          ) : null}
          <Text style={text}>
            {t('merchantRecordedAt')}: {new Date(operation.createdAt).toLocaleString(language)}
          </Text>
          {operation.lines?.map((line, index) => (
            <View key={index} style={{ gap: 6 }}>
              <Text style={text}>{line.name}</Text>
              <Text style={text}>
                {t('merchantQuantity')}: {line.quantity} · {t('merchantPrice')}: {line.unitPrice}
              </Text>
              <Text style={text}>
                {t('merchantTotal')}: {formatExactMoney(line.totalExact, operation.currency, language)}
              </Text>
            </View>
          ))}
          {operation.amountExact ? (
            <Text style={text}>
              {t('amount')}: {formatExactMoney(operation.amountExact, operation.currency, language)}
            </Text>
          ) : null}
          {operation.paidExact && operation.paidExact !== '0.00' ? (
            <Text style={text}>
              {t('merchantPaid')}: {formatExactMoney(operation.paidExact, operation.currency, language)}
            </Text>
          ) : null}
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
          <Text style={text}>
            {t('merchantCashEffect')}: {formatExactMoney(operation.cashDeltaExact, operation.currency, language)}
          </Text>
          <ActorBadge userId={operation.createdByUserId} />
          {operation.reason ? (
            <Text style={text}>
              {t('merchantReason')}: {operation.reason}
            </Text>
          ) : null}
          {operation.reversedByOperationId ? (
            <Text style={{ ...text, color: colors.mutedForeground }}>{t(operation.replacementOperationId ? 'operationSuperseded' : 'operationCancelled')}</Text>
          ) : null}
          {onEdit && !operation.reversedByOperationId && operation.action !== 'reverse' ? (
            <Pressable
              testID="merchant-edit-link"
              accessibilityRole="button"
              onPress={onEdit}
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ ...text, color: colors.warning, textDecorationLine: 'underline' }}>
                {t('operationEdit')}
              </Text>
            </Pressable>
          ) : null}
          <MerchantButton title={t('close')} onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
