import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { GlassCard } from '@/components/AppShell';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function QuickAction({
  label,
  icon,
  onPress,
  wide = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  wide?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={`quick-action-${label}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [wide ? styles.wide : styles.action, pressed && styles.pressed]}
    >
      <GlassCard style={styles.actionCard}>
        <View style={[styles.actionIcon, { backgroundColor: colors.accent }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { width: '50%' },
  wide: { width: '100%' },
  actionCard: { minHeight: 86, margin: 4, alignItems: 'center', justifyContent: 'center', padding: 10 },
  actionIcon: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});