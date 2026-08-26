import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GlassCard } from '@/components/AppShell';
import { formatMoney } from '@/constants/currencies';
import type { CurrencyCode } from '@/constants/currencies';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function MetricCard({
  label,
  value,
  icon,
  tone = 'primary',
  onPress,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
}) {
  const colors = useColors();
  const toneColor = { primary: colors.primary, success: colors.success, warning: colors.warning, danger: colors.destructive }[tone];
  const content = (
    <>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: `${toneColor}20` }]}>
          <Ionicons name={icon} size={18} color={toneColor} />
        </View>
        <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <GlassCard style={styles.metricCard}>{content}</GlassCard>
    </Pressable>
  ) : (
    <GlassCard style={styles.metricCard}>{content}</GlassCard>
  );
}

export function AmountMetric({
  label,
  value,
  icon,
  currency,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  icon: IconName;
  currency: CurrencyCode;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
}) {
  return <MetricCard label={label} value={formatMoney(value, currency)} icon={icon} tone={tone} onPress={onPress} />;
}

const styles = StyleSheet.create({
  metricCard: { flex: 1, minHeight: 116, padding: 14 },
  metricTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, textAlign: 'right', fontSize: 12, fontFamily: 'Inter_500Medium' },
  metricValue: { fontSize: 19, fontFamily: 'Inter_700Bold', textAlign: 'right', marginTop: 14 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});