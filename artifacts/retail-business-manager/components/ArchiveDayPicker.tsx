import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { WebDebtDateInput } from './WebDebtDateInput';
import { archiveDateForDisplay, isArchiveDate, shiftArchiveDate } from '@/data/archiveCalendar';
import { getLocalDateKey } from '@/services/storage';
import { formatLocalizedDate } from '@/constants/i18n';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';

export function ArchiveDayPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const previous = shiftArchiveDate(value, -1);
  const next = shiftArchiveDate(value, 1);
  const select = (date: string) => {
    if (isArchiveDate(date)) onChange(date);
  };
  const buttonStyle = { ...styles.button, backgroundColor: colors.accent };
  return (
    <View style={styles.container}>
      <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable
          testID="archive-previous-day"
          accessibilityRole="button"
          accessibilityLabel={t('archivePreviousDay')}
          disabled={!previous}
          onPress={() => previous && select(previous)}
          style={buttonStyle}
        >
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.primary} />
        </Pressable>
        <Pressable
          testID="archive-calendar-button"
          accessibilityRole="button"
          accessibilityLabel={t('archiveChooseDate')}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={[buttonStyle, styles.calendar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={[styles.date, { color: colors.foreground }]}>
            {formatLocalizedDate(archiveDateForDisplay(value), language)}
          </Text>
        </Pressable>
        <Pressable
          testID="archive-next-day"
          accessibilityRole="button"
          accessibilityLabel={t('archiveNextDay')}
          disabled={!next}
          onPress={() => next && select(next)}
          style={buttonStyle}
        >
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.primary} />
        </Pressable>
        <Pressable
          testID="archive-today"
          accessibilityRole="button"
          onPress={() => select(getLocalDateKey(new Date()))}
          style={buttonStyle}
        >
          <Text style={{ color: colors.primary }}>{t('today')}</Text>
        </Pressable>
      </View>
      {open &&
        (Platform.OS === 'web' ? (
          <WebDebtDateInput
            value={value}
            onChange={select}
            disabled={false}
            label={t('archiveChooseDate')}
            testID="archive-date-input"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: 48,
              padding: 12,
              borderRadius: 14,
              color: colors.foreground,
              backgroundColor: colors.input,
              border: `1px solid ${colors.border}`,
              fontSize: 16,
            }}
          />
        ) : (
          <DateTimePicker
            testID="archive-native-calendar"
            mode="date"
            value={archiveDateForDisplay(value)}
            minimumDate={archiveDateForDisplay('0001-01-01')}
            maximumDate={archiveDateForDisplay('9999-12-31')}
            onChange={(event, date) => {
              setOpen(false);
              if (event.type === 'set' && date) select(getLocalDateKey(date));
            }}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, marginBottom: 20 },
  row: { gap: 6, alignItems: 'center' },
  button: {
    minHeight: 44,
    minWidth: 40,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendar: { flex: 1, gap: 6, flexWrap: 'wrap' },
  date: { fontSize: 12, fontFamily: 'Inter_700Bold', flexShrink: 1 },
});
