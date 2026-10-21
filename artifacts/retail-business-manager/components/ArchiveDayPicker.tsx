import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { archiveDateForDisplay, archiveMonthDays, shiftArchiveMonth } from '@/data/archiveCalendar';
import { getLocalDateKey } from '@/services/storage';
import { formatLocalizedDate } from '@/constants/i18n';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';

/** Icon-only entry point; month browsing is UI-only and never queries archive history. */
export function ArchiveDayPicker({
  value,
  today,
  onChange,
}: {
  value: string;
  today?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const locale = language === 'ar' ? 'ar' : language === 'tr' ? 'tr-TR' : 'en-US';
  const previous = shiftArchiveMonth(month, -1);
  const next = shiftArchiveMonth(month, 1);
  const select = (date: string) => {
    setOpen(false);
    onChange(date);
  };
  const iconStyle = [styles.icon, { backgroundColor: colors.accent, borderColor: colors.border }];
  return (
    <>
      <Pressable
        testID="archive-calendar-button"
        accessibilityRole="button"
        accessibilityLabel={t('archiveChooseDate')}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setMonth(value.slice(0, 7));
          setOpen(true);
        }}
        style={iconStyle}
      >
        <Ionicons name="calendar-outline" size={22} color={colors.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View
            testID="archive-calendar-dialog"
            accessibilityViewIsModal
            style={[
              styles.panel,
              { backgroundColor: colors.background, borderColor: colors.border, direction: isRTL ? 'rtl' : 'ltr' },
            ]}
          >
            <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t('archiveChooseDate')}</Text>
              <Pressable
                testID="archive-calendar-cancel"
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                onPress={() => setOpen(false)}
                style={iconStyle}
              >
                <Ionicons name="close" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable
                testID="archive-previous-month"
                accessibilityRole="button"
                accessibilityLabel={t('archivePreviousMonth')}
                disabled={!previous}
                onPress={() => previous && setMonth(previous)}
                style={iconStyle}
              >
                <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.primary} />
              </Pressable>
              <Text style={[styles.month, { color: colors.foreground }]}>
                {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                  archiveDateForDisplay(`${month}-01`),
                )}
              </Text>
              <Pressable
                testID="archive-next-month"
                accessibilityRole="button"
                accessibilityLabel={t('archiveNextMonth')}
                disabled={!next}
                onPress={() => next && setMonth(next)}
                style={iconStyle}
              >
                <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.primary} />
              </Pressable>
            </View>
            <View style={[styles.grid, { direction: isRTL ? 'rtl' : 'ltr' }]}>
              {Array.from({ length: 7 }, (_, index) => (
                <View key={`weekday-${index}`} style={styles.cell}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                    {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
                      new Date(Date.UTC(2024, 0, 7 + index)),
                    )}
                  </Text>
                </View>
              ))}
              {archiveMonthDays(month).map((date, index) =>
                date ? (
                  <Pressable
                    key={date}
                    testID={`archive-calendar-date-${date}`}
                    accessibilityRole="button"
                    accessibilityLabel={formatLocalizedDate(archiveDateForDisplay(date), language)}
                    accessibilityState={{ selected: date === value }}
                    onPress={() => select(date)}
                    style={[
                      styles.cell,
                      { backgroundColor: date === value ? colors.primary : 'transparent', borderRadius: 12 },
                    ]}
                  >
                    <Text style={{ color: date === value ? colors.primaryForeground : colors.foreground }}>
                      {Number(date.slice(8)).toLocaleString(locale)}
                    </Text>
                  </Pressable>
                ) : (
                  <View key={`blank-${index}`} style={styles.cell} />
                ),
              )}
            </View>
            <Pressable
              testID="archive-today"
              accessibilityRole="button"
              onPress={() => select(today ?? getLocalDateKey(new Date()))}
              style={[styles.today, { backgroundColor: colors.accent }]}
            >
              <Text style={{ color: colors.primary }}>{t('today')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: { width: '100%', maxWidth: 360, padding: 14, borderRadius: 22, borderWidth: 1, gap: 12 },
  row: { alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold' },
  month: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Inter_700Bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  today: { minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
