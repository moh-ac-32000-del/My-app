import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { GlassCard } from '@/components/AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import type { CurrencyCode } from '@/constants/currencies';

export function MerchantButton({
  title,
  onPress,
  disabled = false,
  selected = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 13,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: selected ? colors.primary : colors.input,
        minHeight: 46,
      }}
    >
      <Text
        style={{
          color: selected ? colors.primaryForeground : colors.foreground,
          textAlign: 'center',
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function MerchantField({
  title,
  value,
  onChange,
  disabled = false,
  decimal = false,
  multiline = false,
  testID,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  decimal?: boolean;
  multiline?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={title}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={decimal ? 'decimal-pad' : 'default'}
        multiline={multiline}
        maxLength={multiline ? 2000 : 200}
        textAlign={isRTL ? 'right' : 'left'}
        style={{
          color: colors.foreground,
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 14,
          minHeight: multiline ? 84 : 48,
        }}
      />
    </View>
  );
}
export function MerchantBalanceCards({
  balances,
}: {
  balances: Array<{ currency: CurrencyCode; balanceExact: string }>;
}) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  return (
    <View style={{ gap: 10 }}>
      {balances.map((balance) => (
        <GlassCard key={balance.currency} style={{ gap: 8 }}>
          <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>
            {balance.balanceExact.startsWith('-') ? t('merchantCredit') : t('merchantPayable')} · {balance.currency}
          </Text>
          <Text
            style={{
              color: balance.balanceExact.startsWith('-') ? colors.success : colors.foreground,
              fontSize: 23,
              fontWeight: '700',
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {formatExactMoney(balance.balanceExact.replace(/^-/, ''), balance.currency, language)}
          </Text>
        </GlassCard>
      ))}
    </View>
  );
}
