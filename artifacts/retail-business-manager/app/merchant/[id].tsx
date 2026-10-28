import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { MerchantBalanceCards, MerchantButton } from '@/components/MerchantAccountUI';
import { MerchantCommandForm } from '@/components/MerchantCommandForm';
import { MerchantOperationCard } from '@/components/MerchantOperationCard';
import { MerchantOperationDetails } from '@/components/MerchantOperationDetails';
import { MerchantStatementModal } from '@/components/MerchantStatementModal';
import { merchantStatementText } from '@/constants/merchantStatementText';
import { MerchantSelect } from '@/components/MerchantSelect';
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { MerchantDraftCommand, MerchantOperation } from '@/types/merchant';

export default function MerchantScreen() {
  const params = useLocalSearchParams<{ id: string; operationId?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <MerchantDetail key={id} id={id} operationId={typeof params.operationId === 'string' ? params.operationId : undefined} />;
}
function MerchantDetail({ id, operationId }: { id: string; operationId?: string }) {
  const { canWriteBusiness, profile, sessionKey, activeSpaceId } = useStore();
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
  const { t, isRTL, language } = useI18n();
  const colors = useColors();
  const [menu, setMenu] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [currency, setCurrency] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(operationId ?? null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [form, setForm] = useState<{
    action: MerchantDraftCommand['action'];
    target?: MerchantOperation;
    statusOnly?: boolean;
  } | null>(null);
  const merchant = merchants.find((row) => row.id === id);
  // Resolve details from the current snapshot so a correction received on another device disables it here too.
  const selected = operations.find((row) => row.id === selectedId);
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const open = (action: MerchantDraftCommand['action'], target?: MerchantOperation, statusOnly = false) => {
    setConfirmed(false);
    setMenu(false);
    setSelectedId(null);
    setForm({ action, target, statusOnly });
  };
  const accountBalances = balances.filter((row) => row.merchantId === id);
  const shown = operations.filter((row) => row.action !== 'reverse' && row.merchantId === id && (!currency || row.currency === currency));
  return (
    <AppShell>
      <PageHeader
        title={merchant?.name ?? t('merchants')}
        showBack
        action={
          <Pressable
            testID="merchant-account-menu"
            accessibilityRole="button"
            accessibilityLabel={t('merchantAccountSettings')}
            disabled={!!form || isLoading || !!error || !merchant}
            onPress={() => setMenu((value) => !value)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.input,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="ellipsis-vertical" size={21} color={colors.foreground} />
          </Pressable>
        }
      />
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : error || !merchant ? (
        <GlassCard style={{ gap: 14 }}>
          <Text style={text}>{t(error === 'merchantServerConfirmationTimeout' ? 'merchantLoadTimeout' : 'merchantUnavailable')}</Text>
          <MerchantButton title={t('tryAgain')} onPress={retry} />
        </GlassCard>
      ) : (
        <View style={{ gap: 16 }}>
          {merchant.phone ? <Text style={{ ...text, color: colors.mutedForeground }}>{merchant.phone}</Text> : null}
          {merchant.address ? <Text style={{ ...text, color: colors.mutedForeground }}>{merchant.address}</Text> : null}
          {merchant.notes ? <Text style={{ ...text, color: colors.mutedForeground }}>{merchant.notes}</Text> : null}
          {confirmed ? (
            <Text accessibilityRole="alert" style={{ ...text, color: colors.success }}>
              {t('merchantConfirmed')}
            </Text>
          ) : null}
          <MerchantBalanceCards
            balances={accountBalances.length ? accountBalances : [{ currency: profile.currency, balanceExact: '0.00' }]}
          />
          {!merchant.isActive ? <Text style={{ ...text, color: colors.warning }}>{t('merchantInactive')}</Text> : null}
          {menu && canWriteBusiness ? (
            <GlassCard style={{ gap: 10 }}>
              <MerchantButton title={t('saveChanges')} onPress={() => open('save')} />
              <MerchantButton
                title={t(merchant.isActive ? 'merchantDisable' : 'merchantEnable')}
                onPress={() => open('save', undefined, true)}
              />
              <MerchantButton
                testID="merchant-statement-open"
                title={merchantStatementText[language].title}
                onPress={() => {
                  setMenu(false);
                  setStatementOpen(true);
                }}
              />
            </GlassCard>
          ) : null}
          {canWriteBusiness && merchant.isActive ? (
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['purchase', 'payment', 'directPayment'] as const).map((action) => (
                <View key={action} style={{ flexGrow: 1 }}>
                  <MerchantButton
                    testID={`merchant-action-${action}`}
                    title={t(
                      action === 'purchase'
                        ? 'merchantPurchase'
                        : action === 'payment'
                          ? 'merchantPayment'
                          : 'merchantDirect',
                    )}
                    tone={action === 'purchase' ? 'purchase' : action === 'payment' ? 'payment' : 'direct'}
                    disabled={!!form}
                    onPress={() => open(action)}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {form && canWriteBusiness ? (
            <MerchantCommandForm
              key={`${form.action}:${form.target?.id ?? ''}:${form.statusOnly ?? false}`}
              action={form.action}
              merchant={merchant}
              target={form.target}
              statusOnly={form.statusOnly}
              command={command}
              onCancel={() => setForm(null)}
              onDone={() => {
                setForm(null);
                setConfirmed(true);
              }}
            />
          ) : null}
          <SectionTitle title={t('merchantHistory')} />
          <MerchantSelect
            title={t('currency')}
            value={currency}
            options={[
              { id: '', name: t('merchantAllCurrencies') },
              ...accountBalances.map((row) => ({ id: row.currency, name: row.currency })),
            ]}
            onChange={setCurrency}
          />
          {operationsLimited ? (
            <Text style={{ ...text, color: colors.warning }}>{t('merchantHistoryLimited')}</Text>
          ) : null}
          {shown.map((operation) => (
            <MerchantOperationCard
              key={operation.id}
              operation={operation}
              onPress={() => setSelectedId(operation.id)}
              onEdit={canWriteBusiness && merchant.isActive && !form && operation.action !== 'reverse'
                ? () => open(operation.action, operation) : undefined}
            />
          ))}
          {selected ? (
            <MerchantOperationDetails
              operation={selected}
              onClose={() => setSelectedId(null)}
              onEdit={canWriteBusiness && merchant.isActive && !form && selected.action !== 'reverse'
                ? () => open(selected.action, selected) : undefined}
            />
          ) : null}
          {statementOpen && canWriteBusiness ? (
            <MerchantStatementModal
              key={`${sessionKey}:${activeSpaceId}:${id}`}
              merchant={merchant}
              operations={operations}
              operationsLimited={operationsLimited}
              historyLoading={historyLoading}
              loadMore={loadMore}
              onClose={() => setStatementOpen(false)}
            />
          ) : null}
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
