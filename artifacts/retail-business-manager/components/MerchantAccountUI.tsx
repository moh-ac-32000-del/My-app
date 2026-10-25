import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { CurrencyCode } from '@/constants/currencies';
import { merchantOperationTone } from '@/data/merchantOperationPresentation';
import { AccountBalanceList } from './AccountBalanceList';

export function MerchantButton({
  title,
  onPress,
  disabled = false,
  selected = false,
  testID,
  tone = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
  tone?: 'primary' | 'payment' | 'purchase' | 'direct';
}) {
  const colors = useColors();
  const accent = tone === 'primary' ? colors.primary : merchantOperationTone(tone === 'direct' ? 'directPayment' : tone);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
      {tone !== 'primary' ? <View testID="merchant-action-tone" accessible={false} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} /> : null}
      <Text
        style={{
          color: selected ? colors.primaryForeground : colors.foreground,
          textAlign: 'center',
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      </View>
    </Pressable>
  );
}
export function MerchantGear({
  onPress,
  disabled = false,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID="merchant-settings-gear"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 46,
        height: 46,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.input,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 26, color: colors.primary }}>⚙</Text>
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
  return <AccountBalanceList balances={balances} kind="merchant" />;
}
