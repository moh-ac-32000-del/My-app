import React from 'react';
import { Text, View } from 'react-native';
import { GlassCard } from './AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { CurrencyCode } from '@/constants/currencies';

export function AccountBalanceList({ balances, kind }: { balances: Array<{ currency: CurrencyCode; balanceExact: string }>; kind: 'customer' | 'merchant' }) {
  const colors = useColors(), { t, language, isRTL } = useI18n();
  return <GlassCard style={{ paddingVertical: 3, marginBottom: 14 }}>
    {balances.map(balance => <View key={balance.currency} style={{ paddingVertical: 13, gap: 12, alignItems: 'center',
      flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.mutedForeground, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{balance.currency} · {t(kind === 'merchant'
        ? balance.balanceExact.startsWith('-') ? 'merchantCredit' : 'merchantPayable'
        : balance.balanceExact.startsWith('-') ? 'customerCreditBalance' : 'remainingDebt')}</Text>
      <Text style={{ color: balance.balanceExact.startsWith('-') ? colors.success : colors.foreground, fontSize: 20, fontWeight: '700', writingDirection: 'ltr' }}>
        {formatExactMoney(balance.balanceExact.replace(/^-/, ''), balance.currency, language)}
      </Text>
    </View>)}
  </GlassCard>;
}
