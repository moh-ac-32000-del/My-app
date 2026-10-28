import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { AutomaticClosingNotice } from './AutomaticClosingNotice';
import { WorkspaceButton } from './WorkspaceControls';

export function DailyClosingAction({ compact = false }: {
  storeId: string;
  spaceId: string | null;
  compact?: boolean;
  testID: string;
  onClosed?: () => void;
}) {
  const { cloudSpace, workspaceRole } = useStore();
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const router = useRouter();
  if (cloudSpace?.automaticClosing) return <AutomaticClosingNotice compact={compact} />;
  // An unconfigured workspace is not permission to offer the retired manual flow.
  return (
    <View testID="automatic-closing-setup-required" style={{ padding: compact ? 6 : 14, gap: 10, borderRadius: 14, backgroundColor: colors.card }}>
      <Text style={{ color: colors.foreground, textAlign: isRTL ? 'right' : 'left', fontSize: compact ? 11 : 14 }}>
        {t('workspaceClosingPrepared')}
      </Text>
      {workspaceRole === 'owner' ? (
        <WorkspaceButton label={t('workspaceClosingSettings')} onPress={() => router.push('/workspace-settings' as never)} />
      ) : null}
    </View>
  );
}
