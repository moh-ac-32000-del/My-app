import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { MerchantBalanceCards, MerchantButton } from '@/components/MerchantAccountUI';
import { MerchantCommandForm, merchantActionLabels } from '@/components/MerchantCommandForm';
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { MerchantDraftCommand, MerchantOperation } from '@/types/merchant';

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { canWriteBusiness } = useStore();
  const { merchants, balances, operations, operationsLimited, isLoading, error, retry, command } =
    useMerchantAccounts(id);
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const [form, setForm] = useState<{ action: MerchantDraftCommand['action']; target?: MerchantOperation } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const merchant = merchants.find((item) => item.id === id);
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const open = (action: MerchantDraftCommand['action'], target?: MerchantOperation) => {
    setConfirmed(false);
    setForm({ action, target });
  };
  const body = isLoading ? (
    <ActivityIndicator color={colors.primary} />
  ) : error || !merchant ? (
    <GlassCard style={{ gap: 14 }}>
      <Text style={text}>{t('merchantUnavailable')}</Text>
      <MerchantButton title={t('tryAgain')} onPress={retry} />
    </GlassCard>
  ) : (
    <View style={{ gap: 16 }}>
      {confirmed ? <Text style={{ ...text, color: colors.success }}>{t('merchantConfirmed')}</Text> : null}
      <MerchantBalanceCards balances={balances.filter((balance) => balance.merchantId === id)} />
      {!merchant.isActive ? <Text style={{ ...text, color: colors.warning }}>{t('merchantInactive')}</Text> : null}
      {canWriteBusiness && merchant.isActive && !form ? (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 9 }}>
          {(['purchase', 'payment', 'directPayment', 'opening', 'save'] as const).map((action) => (
            <MerchantButton
              key={action}
              testID={`merchant-action-${action}`}
              title={t(merchantActionLabels[action])}
              onPress={() => open(action)}
            />
          ))}
        </View>
      ) : null}
      {form && canWriteBusiness ? (
        <MerchantCommandForm
          key={`${form.action}:${form.target?.id ?? ''}`}
          action={form.action}
          merchant={merchant}
          target={form.target}
          command={command}
          onCancel={() => setForm(null)}
          onDone={() => {
            setForm(null);
            setConfirmed(true);
          }}
        />
      ) : null}
      <SectionTitle title={t('merchantHistory')} />
      {operationsLimited ? <Text style={{ ...text, color: colors.warning }}>{t('merchantHistoryLimited')}</Text> : null}
      {operations
        .filter((operation) => operation.merchantId === id)
        .map((operation) => (
          <GlassCard key={operation.id} testID={`merchant-operation-${operation.id}`} style={{ gap: 10 }}>
            <Text style={{ ...text, fontWeight: '700', color: colors.primary }}>
              {t(merchantActionLabels[operation.action])}
            </Text>
            <Text style={{ ...text, color: colors.mutedForeground }}>
              {new Date(operation.createdAt).toLocaleString(language === 'tr' ? 'tr-TR' : language)}
            </Text>
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
              <Text style={text}>
                {t('amount')}: {formatExactMoney(operation.amountExact, operation.currency, language)}
              </Text>
            ) : null}
          {operation.paidExact ? (
            <Text style={text}>{t('merchantPaid')}: {formatExactMoney(operation.paidExact, operation.currency, language)}</Text>
          ) : null}
          {operation.source === 'cash' || operation.source === 'external' ? (
            <Text style={{ ...text, color: colors.mutedForeground }}>{t(operation.source === 'cash' ? 'merchantCash' : 'merchantExternal')}</Text>
          ) : null}
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
            {canWriteBusiness &&
            merchant.isActive &&
            !form &&
            !operation.reversedByOperationId &&
            operation.action !== 'reverse' ? (
              <MerchantButton title={t('merchantReverse')} onPress={() => open('reverse', operation)} />
            ) : null}
          </GlassCard>
        ))}
    </View>
  );
  return (
    <AppShell>
      <PageHeader title={merchant?.name ?? t('merchants')} showBack />
      {body}
    </AppShell>
  );
}
