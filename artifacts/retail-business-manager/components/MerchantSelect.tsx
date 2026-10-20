import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { MerchantButton } from './MerchantAccountUI';

export function MerchantSelect({
  title,
  value,
  options,
  onChange,
  disabled = false,
  testID,
}: {
  title: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (id: string) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const { t, isRTL } = useI18n();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 14,
          minHeight: 48,
          backgroundColor: colors.input,
          opacity: disabled ? 0.5 : 1,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text style={{ color: colors.foreground, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
          {options.find((row) => row.id === value)?.name ?? t('merchantChoose')}
        </Text>
        <Text style={{ color: colors.primary }}>⌄</Text>
      </Pressable>
      {open ? (
        <Modal transparent visible onRequestClose={() => setOpen(false)} animationType="fade">
          <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' }}>
            <View
              style={{
                maxHeight: '75%',
                width: '100%',
                maxWidth: 560,
                alignSelf: 'center',
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 18,
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontWeight: '700',
                  fontSize: 18,
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {title}
              </Text>
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                {options.map((option) => (
                  <MerchantButton
                    key={option.id}
                    title={option.name}
                    selected={option.id === value}
                    onPress={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ScrollView>
              <MerchantButton title={t('cancel')} onPress={() => setOpen(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
