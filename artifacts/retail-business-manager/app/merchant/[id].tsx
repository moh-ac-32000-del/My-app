import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { MerchantBalanceCards, MerchantButton, MerchantGear } from '@/components/MerchantAccountUI';
import { MerchantCommandForm } from '@/components/MerchantCommandForm';
import { MerchantOperationCard } from '@/components/MerchantOperationCard';
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { MerchantDraftCommand, MerchantOperation } from '@/types/merchant';

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <MerchantDetail key={id} id={id} />;
}
function MerchantDetail({ id }: { id: string }) {
  const { canWriteBusiness, profile } = useStore();
  const router = useRouter();
  const {
    merchants,
    balances,
    operations,
    operationsLimited,
    historyLoading,
    loadMore,
    isLoading,
    error,
    retry,
    command,
  } = useMerchantAccounts(id);
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const [tab, setTab] = useState<'purchase' | 'payment'>('purchase');
  const [allHistory, setAllHistory] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState<{ action: MerchantDraftCommand['action']; target?: MerchantOperation } | null>(null);
  const merchant = merchants.find((row) => row.id === id);
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const open = (action: MerchantDraftCommand['action'], target?: MerchantOperation) => {
    setConfirmed(false);
    setSettingsOpen(false);
    setForm({ action, target });
  };
  const accountBalances = balances.filter((row) => row.merchantId === id);
  const shown = operations.filter(
    (row) =>
      row.merchantId === id &&
      (allHistory ||
        (tab === 'purchase' ? row.action === 'purchase' : row.action === 'payment' || row.action === 'directPayment')),
  );
  return (
    <AppShell>
      <PageHeader
        title={merchant?.name ?? t('merchants')}
        showBack
        action={
          <MerchantGear
            label={t('merchantAccountSettings')}
            disabled={!!form || isLoading || !!error || !merchant}
            onPress={() => setSettingsOpen((value) => !value)}
          />
        }
      />
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error || !merchant ? (
        <GlassCard style={{ gap: 14 }}>
          <Text style={text}>{t('merchantUnavailable')}</Text>
          <MerchantButton title={t('tryAgain')} onPress={retry} />
        </GlassCard>
      ) : (
        <View style={{ gap: 18 }}>
          {confirmed ? <Text style={{ ...text, color: colors.success }}>{t('merchantConfirmed')}</Text> : null}
          <MerchantBalanceCards
            balances={accountBalances.length ? accountBalances : [{ currency: profile.currency, balanceExact: '0.00' }]}
          />
          {!merchant.isActive ? <Text style={{ ...text, color: colors.warning }}>{t('merchantInactive')}</Text> : null}
          {settingsOpen ? (
            <GlassCard style={{ gap: 10 }}>
              <SectionTitle title={t('merchantAccountSettings')} />
              <MerchantButton
                title={t('merchantSettings')}
                onPress={() => router.push('/merchant-settings' as never)}
              />
              {canWriteBusiness && merchant.isActive ? (
                <>
                  <MerchantButton title={t('saveChanges')} onPress={() => open('save')} />
                  <MerchantButton title={t('merchantOpening')} onPress={() => open('opening')} />
                </>
              ) : null}
            </GlassCard>
          ) : null}
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <MerchantButton
                testID="merchant-tab-purchases"
                title={t('merchantPurchasesTab')}
                selected={tab === 'purchase'}
                disabled={!!form}
                onPress={() => {
                  setTab('purchase');
                  setAllHistory(false);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MerchantButton
                testID="merchant-tab-payments"
                title={t('merchantPaymentsTab')}
                selected={tab === 'payment'}
                tone="payment"
                disabled={!!form}
                onPress={() => {
                  setTab('payment');
                  setAllHistory(false);
                }}
              />
            </View>
          </View>
          {!form ? (
            <GlassCard style={{ gap: 12, borderColor: tab === 'payment' ? colors.warning : colors.border }}>
              <Text style={{ ...text, color: tab === 'payment' ? colors.warning : colors.primary }}>
                {t(tab === 'purchase' ? 'merchantPurchaseHint' : 'merchantPaymentHint')}
              </Text>
              {canWriteBusiness && merchant.isActive ? (
                <MerchantButton
                  testID={`merchant-action-${tab}`}
                  title={t(tab === 'purchase' ? 'merchantPurchase' : 'merchantPayment')}
                  tone={tab === 'payment' ? 'payment' : 'primary'}
                  selected
                  onPress={() => open(tab)}
                />
              ) : null}
              {tab === 'payment' && canWriteBusiness && merchant.isActive ? (
                <MerchantButton
                  testID="merchant-action-directPayment"
                  title={t('merchantDirect')}
                  onPress={() => open('directPayment')}
                />
              ) : null}
            </GlassCard>
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
          <MerchantButton
            title={t('merchantHistory')}
            selected={allHistory}
            disabled={!!form}
            onPress={() => setAllHistory((value) => !value)}
          />
          <SectionTitle
            title={t(
              allHistory ? 'merchantHistory' : tab === 'purchase' ? 'merchantPurchasesTab' : 'merchantPaymentsTab',
            )}
          />
          {operationsLimited ? (
            <Text style={{ ...text, color: colors.warning }}>{t('merchantHistoryLimited')}</Text>
          ) : null}
          {shown.map((operation) => (
            <MerchantOperationCard
              key={operation.id}
              operation={operation}
              onReverse={canWriteBusiness && merchant.isActive && !form ? () => open('reverse', operation) : undefined}
            />
          ))}
          {operationsLimited ? (
            <MerchantButton
              title={t('merchantHistoryMore')}
              testID="merchant-history-more"
              disabled={historyLoading}
              onPress={() => void loadMore()}
            />
          ) : null}
        </View>
      )}
    </AppShell>
  );
}
