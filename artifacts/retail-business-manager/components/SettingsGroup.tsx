import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

/** Presentation only: keep child state/subscriptions while collapsing a settings group. */
export function SettingsGroup({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const colors = useColors(), { isRTL } = useI18n();
  return <View style={{ marginBottom: 16 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12,
        minHeight: 56, paddingHorizontal: 16, backgroundColor: colors.card, borderRadius: 14 }}>
      <Ionicons name={icon} size={21} color={colors.primary} />
      <Text style={{ color: colors.foreground, flex: 1, fontWeight: '600', textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
    </Pressable>
    <View accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={{ display: expanded ? 'flex' : 'none', paddingTop: 12 }}>{children}</View>
  </View>;
}
