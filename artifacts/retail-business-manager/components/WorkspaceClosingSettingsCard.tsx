import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { GlassCard } from './AppShell';
import { WorkspaceButton, WorkspaceInput } from './WorkspaceControls';
import { canonicalTimeZone, type WorkspaceClosingSettings } from '@/data/workspaceClosing';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

export function WorkspaceClosingSettingsCard({
  settings,
  canEdit,
  busy,
  onSave,
}: {
  settings: WorkspaceClosingSettings;
  canEdit: boolean;
  busy: boolean;
  onSave: (settings: { timeZone: string; executionTime: string; expectedRevision: number }) => void;
}) {
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const [zone, setZone] = useState(settings.timeZone);
  const [time, setTime] = useState(settings.executionTime);
  let validZone = '';
  try {
    validZone = canonicalTimeZone(zone);
  } catch {
    /* Leave save disabled, never substitute a zone. */
  }
  const valid = !!validZone && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const changed = settings.revision === 0 || validZone !== settings.timeZone || time !== settings.executionTime;
  const text = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const), lineHeight: 22 };
  return (
    <GlassCard testID="workspace-closing-settings" style={{ gap: 12, marginBottom: 18 }}>
      <Text style={[text, { fontSize: 16, fontFamily: 'Inter_700Bold' }]}>{t('workspaceClosingSettings')}</Text>
      <Text style={[text, { color: colors.mutedForeground }]}>{t('workspaceClosingPrepared')}</Text>
      {canEdit ? (
        <>
          <WorkspaceInput
            label={t('workspaceTimeZone')}
            value={zone}
            onChangeText={setZone}
            maxLength={100}
            disabled={busy}
          />
          <WorkspaceButton
            label={t('workspaceUseDeviceZone')}
            disabled={busy}
            onPress={() => {
              try {
                setZone(canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
              } catch {
                /* No silent fallback. */
              }
            }}
          />
          <WorkspaceInput
            label={t('workspaceClosingTime')}
            value={time}
            onChangeText={setTime}
            maxLength={5}
            disabled={busy}
          />
          {!valid ? <Text style={[text, { color: colors.destructive }]}>{t('workspaceClosingInvalid')}</Text> : null}
          <WorkspaceButton
            testID="save-workspace-closing-settings"
            label={t('saveChanges')}
            disabled={busy || !valid || !changed}
            onPress={() => {
              if (valid) onSave({ timeZone: validZone, executionTime: time, expectedRevision: settings.revision });
            }}
          />
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={text}>
            {t('workspaceTimeZone')}: {settings.timeZone}
          </Text>
          <Text style={text}>
            {t('workspaceClosingTime')}: {settings.executionTime}
          </Text>
        </View>
      )}
      <Text style={[text, { color: colors.mutedForeground }]}>{t('workspaceClosingSettingsHint')}</Text>
    </GlassCard>
  );
}
