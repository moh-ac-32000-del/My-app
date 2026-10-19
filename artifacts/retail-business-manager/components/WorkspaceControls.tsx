import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';

export function WorkspaceButton({
  label,
  onPress,
  disabled = false,
  testID,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  destructive?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        padding: 14,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: destructive ? colors.destructive : colors.border,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        justifyContent: 'center',
      })}
    >
      <Text
        style={{
          color: destructive ? colors.destructive : colors.primary,
          textAlign: 'center',
          fontFamily: 'Inter_600SemiBold',
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function WorkspaceInput({
  label,
  value,
  onChangeText,
  disabled = false,
  maxLength = 500,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: 48,
          padding: 12,
          color: colors.foreground,
          backgroundColor: colors.input,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 14,
          textAlign: isRTL ? 'right' : 'left',
        }}
      />
    </View>
  );
}
export function WorkspaceRolePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: 'editor' | 'viewer';
  onChange: (role: 'editor' | 'viewer') => void;
  disabled?: boolean;
}) {
  const { t, isRTL } = useI18n();
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, flexWrap: 'wrap' }}>
      {(['editor', 'viewer'] as const).map((role) => (
        <WorkspaceButton
          key={role}
          disabled={disabled}
          label={`${value === role ? '✓ ' : ''}${t(role === 'editor' ? 'workspaceEditor' : 'workspaceViewer')}`}
          onPress={() => onChange(role)}
        />
      ))}
    </View>
  );
}
