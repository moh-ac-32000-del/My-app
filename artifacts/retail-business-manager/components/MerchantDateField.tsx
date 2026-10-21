import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { WebDebtDateInput } from './WebDebtDateInput';
import { MerchantButton } from './MerchantAccountUI';
import { localMerchantDate } from '@/data/merchantSettings';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

export function MerchantDateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const { t, isRTL } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>
        {t('merchantOperationDate')}
      </Text>
      {Platform.OS === 'web' ? (
        <WebDebtDateInput
          value={value}
          onChange={onChange}
          label={t('merchantOperationDate')}
          disabled={disabled}
          testID="merchant-operation-date"
          style={{
            color: colors.foreground,
            backgroundColor: colors.input,
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            padding: 14,
            minHeight: 48,
            fontSize: 16,
            boxSizing: 'border-box',
            width: '100%',
            colorScheme: 'dark',
          }}
        />
      ) : (
        <>
          <MerchantButton title={value} disabled={disabled} onPress={() => setOpen(true)} />
          {open ? (
            <DateTimePicker
              mode="date"
              value={new Date(`${value}T12:00:00`)}
              onChange={(event, date) => {
                setOpen(false);
                if (event.type === 'set' && date) onChange(localMerchantDate(date));
              }}
            />
          ) : null}
        </>
      )}
      <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: isRTL ? 'right' : 'left' }}>
        {t('merchantDateHint')}
      </Text>
    </View>
  );
}
