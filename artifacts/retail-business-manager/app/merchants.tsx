import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader } from '@/components/AppShell';
import { MerchantButton, MerchantField, MerchantGear } from '@/components/MerchantAccountUI';
import { MerchantCommandForm } from '@/components/MerchantCommandForm';
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { summarizeMerchantBalances } from '@/data/merchantAccounting';
import { formatExactMoney } from '@/data/exactMoneyPresentation';

export default function MerchantsScreen() {
  const router = useRouter();
  const { activeSpaceId, canWriteBusiness } = useStore();
  const { merchants, balances, isLoading, error, retry, command } = useMerchantAccounts();
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const totals = useMemo(() => {
    try {
      return activeSpaceId
        ? summarizeMerchantBalances(
            activeSpaceId,
            balances.map((balance) => ({
              workspaceId: balance.workspaceId,
              partyId: balance.merchantId,
              kind: 'merchant' as const,
              currency: balance.currency,
              balance: balance.balanceExact,
            })),
          )
        : [];
    } catch {
      return null;
    }
  }, [activeSpaceId, balances]);
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const unavailable = error || totals === null;
  return (
    <AppShell>
      <PageHeader
        title={t('merchants')}
        action={
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
            <MerchantGear label={t('merchantSettings')} onPress={() => router.push('/merchant-settings' as never)} />
            {canWriteBusiness && !isLoading && !unavailable && !adding ? (
              <MerchantButton
                title={t('add')}
                testID="merchant-add"
                onPress={() => {
                  setConfirmed(false);
                  setAdding(true);
                }}
              />
            ) : null}
          </View>
        }
      />
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : unavailable ? (
        <GlassCard style={{ gap: 14 }}>
          <Text style={text}>{t('merchantUnavailable')}</Text>
          <MerchantButton title={t('tryAgain')} onPress={retry} />
        </GlassCard>
      ) : (
        <View style={{ gap: 16 }}>
          {confirmed ? <Text style={{ ...text, color: colors.success }}>{t('merchantConfirmed')}</Text> : null}
          {adding ? (
            <MerchantCommandForm
              action="save"
              command={command}
              onCancel={() => setAdding(false)}
              onDone={() => {
                setAdding(false);
                setConfirmed(true);
              }}
            />
          ) : null}
          {(totals ?? []).map((total) => (
            <GlassCard key={total.currency} style={{ gap: 9 }}>
              <Text style={{ ...text, color: colors.primary, fontWeight: '700' }}>{total.currency}</Text>
              <Text style={text}>
                {t('merchantPayable')}: {formatExactMoney(total.payable, total.currency, language)}
              </Text>
              <Text style={{ ...text, color: colors.success }}>
                {t('merchantCredit')}: {formatExactMoney(total.credit, total.currency, language)}
              </Text>
              <Text style={text}>
                {t('merchantNet')}: {formatExactMoney(total.net, total.currency, language)}
              </Text>
            </GlassCard>
          ))}
          <MerchantField title={t('merchantName')} value={search} onChange={setSearch} />
          {merchants.length === 0 ? (
            <EmptyState icon="storefront-outline" title={t('merchantEmpty')} hint={t('merchantOpeningHint')} />
          ) : (
            merchants
              .filter((merchant) => merchant.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
              .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, language))
              .map((merchant) => (
                <Pressable
                  key={merchant.id}
                  testID={`merchant-card-${merchant.id}`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/merchant/[id]' as never, params: { id: merchant.id } })}
                >
                  <GlassCard style={{ gap: 9 }}>
                    <Text style={{ ...text, fontSize: 20, fontWeight: '600' }}>{merchant.name}</Text>
                    {merchant.phone ? (
                      <Text style={{ ...text, color: colors.mutedForeground }}>{merchant.phone}</Text>
                    ) : null}
                    {!merchant.isActive ? (
                      <Text style={{ ...text, color: colors.warning }}>{t('merchantInactive')}</Text>
                    ) : null}
                    {balances
                      .filter((balance) => balance.merchantId === merchant.id)
                      .map((balance) => (
                        <Text key={balance.currency} style={text}>
                          {balance.balanceExact.startsWith('-') ? t('merchantCredit') : t('merchantPayable')}:{' '}
                          {formatExactMoney(balance.balanceExact.replace(/^-/, ''), balance.currency, language)}
                        </Text>
                      ))}
                  </GlassCard>
                </Pressable>
              ))
          )}
        </View>
      )}
    </AppShell>
  );
}
