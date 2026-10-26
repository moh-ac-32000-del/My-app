import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { automaticClosingPolicy, closingTransitionAt } from '@/data/automaticClosing';
import { formatLocalizedDateTime } from '@/constants/i18n';

export function AutomaticClosingNotice({ compact = false }: { compact?: boolean }) {
  const { cloudSpace } = useStore();
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  let detail = t('automaticClosingFailed');
  try {
    const policy = automaticClosingPolicy(cloudSpace?.automaticClosing);
    const zone = closingTransitionAt(policy, policy.cursorAt).timeZone;
    const due = cloudSpace?.autoClosingNextAt;
    if (!due || !Number.isFinite(Date.parse(due))) throw new Error('missingClosingDue');
    if (!policy.failures)
      detail = `${t('automaticClosingNext')}: ${formatLocalizedDateTime(new Date(due), language, zone)} · ${zone}`;
  } catch {
    /* Invalid server metadata must not expose a manual financial fallback. */
  }
  return (
    <View
      testID="automatic-closing-notice"
      style={{
        padding: compact ? 6 : 12,
        gap: 6,
        marginBottom: compact ? 0 : 12,
        borderRadius: 14,
        backgroundColor: colors.card,
        maxWidth: compact ? 170 : undefined,
      }}
    >
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, alignItems: 'center' }}>
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: compact ? 10 : 13 }}>{t('automaticClosingActive')}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: compact ? 9 : 12, textAlign: isRTL ? 'right' : 'left' }}>
        {detail}
      </Text>
    </View>
  );
}
