import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppShell, EmptyState, GlassCard, PageHeader } from '@/components/AppShell';
import { MerchantButton, MerchantField, MerchantGear } from '@/components/MerchantAccountUI';
import { MerchantCommandForm } from '@/components/MerchantCommandForm';
import { useMerchantAccounts } from '@/hooks/useMerchantAccounts';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { summarizeMerchantBalances } from '@/data/merchantAccounting';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { Merchant } from '@/types/merchant';

export default function MerchantsScreen() {
  const router = useRouter();
  const { activeSpaceId, canWriteBusiness } = useStore();
  const { merchants, balances, isLoading, error, retry, command } = useMerchantAccounts();
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
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
  const visibleMerchants = useMemo(() => {
    const query = search.toLocaleLowerCase();
    return merchants.filter(merchant => merchant.isActive === activeOnly && merchant.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, language));
  }, [merchants, search, activeOnly, language]);
  const balancesByMerchant = useMemo(() => {
    const index = new Map<string, typeof balances>();
    for (const balance of balances) {
      const rows = index.get(balance.merchantId);
      if (rows) rows.push(balance); else index.set(balance.merchantId, [balance]);
    }
    return index;
  }, [balances]);
  const renderMerchant = (merchant: Merchant) => (
    <Pressable testID={`merchant-card-${merchant.id}`} accessibilityRole="button"
      onPress={() => router.push({ pathname: '/merchant/[id]' as never, params: { id: merchant.id } })}>
      <GlassCard style={{ gap: 8, padding: 14, marginBottom: 2, borderRadius: 8 }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 11 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 0, borderColor: colors.primary,
            backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{merchant.name.charAt(0)}</Text>
          </View>
          <Text style={{ ...text, flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{merchant.name}</Text>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.mutedForeground} />
        </View>
        {merchant.phone ? <Text style={{ ...text, color: colors.mutedForeground }}>{merchant.phone}</Text> : null}
        {!merchant.isActive ? <Text style={{ ...text, color: colors.warning }}>{t('merchantInactive')}</Text> : null}
        {(balancesByMerchant.get(merchant.id) ?? []).map(balance => (
          <Text key={balance.currency} style={text}>
            {balance.balanceExact.startsWith('-') ? t('merchantCredit') : t('merchantPayable')}:{' '}
            {formatExactMoney(balance.balanceExact.replace(/^-/, ''), balance.currency, language)}
          </Text>
        ))}
      </GlassCard>
    </Pressable>
  );
  return (
    <AppShell list={{ testID: 'merchants-list', data: isLoading || unavailable ? [] : visibleMerchants,
      keyExtractor: item => item.id, renderItem: ({ item }) => renderMerchant(item),
      extraData: balancesByMerchant,
    }}>
      <PageHeader
        title={t('merchants')}
        action={
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
            <MerchantGear label={t('merchantSettings')} onPress={() => router.push('/merchant-settings' as never)} />
            {canWriteBusiness && !isLoading && !unavailable && !adding ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('add')}
                testID="merchant-add"
                onPress={() => {
                  setConfirmed(false);
                  setAdding(true);
                }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={21} color={colors.primaryForeground} />
              </Pressable>
            ) : null}
          </View>
        }
      />
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : unavailable ? (
        <GlassCard style={{ gap: 14 }}>
          <Text style={text}>{t(error === 'merchantServerConfirmationTimeout' ? 'merchantLoadTimeout' : 'merchantUnavailable')}</Text>
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
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
            <MerchantButton title={t('merchantActive')} selected={activeOnly} onPress={() => setActiveOnly(true)} />
            <MerchantButton title={t('merchantInactive')} selected={!activeOnly} onPress={() => setActiveOnly(false)} />
          </View>
          {merchants.length === 0 ? (
            <EmptyState icon="storefront-outline" title={t('merchantEmpty')} hint={t('merchantOpeningHint')} />
          ) : null}
        </View>
      )}
    </AppShell>
  );
}
