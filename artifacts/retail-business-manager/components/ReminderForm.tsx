import React, { useEffect, useMemo, useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { formatLocalizedDate, formatLocalizedTime } from '@/constants/i18n';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { Customer, Debt } from '@/types/business';

type PickerMode = 'date' | 'time' | null;

export interface ReminderFormProps {
  customers: Customer[];
  debts: Debt[];
  initialCustomerId?: string;
  initialDebtId?: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (debtId: string, remindAt: string) => Promise<void>;
}

function getInitialReminderDate(): Date {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date;
}

export function ReminderForm({
  customers,
  debts,
  initialCustomerId,
  initialDebtId,
  isSaving = false,
  onClose,
  onSave,
}: ReminderFormProps) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId ?? customers[0]?.id ?? '',
  );
  const [selectedDebtId, setSelectedDebtId] = useState<string>(initialDebtId ?? '');
  const [reminderDate, setReminderDate] = useState<Date>(getInitialReminderDate);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const initialFormCustomerId = initialCustomerId ?? customers[0]?.id ?? '';

  useEffect(() => {
    setSelectedCustomerId(initialFormCustomerId);
    setSelectedDebtId(initialDebtId ?? '');
    setReminderDate(getInitialReminderDate());
    setPickerMode(null);
    setValidation(null);
  }, [initialFormCustomerId, initialDebtId]);

  const availableDebts = useMemo(
    () => debts.filter((debt) => debt.customerId === selectedCustomerId && debt.amount > 0),
    [debts, selectedCustomerId],
  );

  useEffect(() => {
    if (availableDebts.some((debt) => debt.id === selectedDebtId)) {
      return;
    }
    setSelectedDebtId(availableDebts[0]?.id ?? '');
  }, [availableDebts, selectedDebtId]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const chooseCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedDebtId('');
    setValidation(null);
  };

  const handlePickerChange = (event: DateTimePickerEvent, value?: Date) => {
    if (event.type === 'dismissed') {
      setPickerMode(null);
      return;
    }
    if (value) {
      if (pickerMode === 'date') {
        setReminderDate((current) => {
          const next = new Date(current);
          next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
          return next;
        });
      } else {
        setReminderDate((current) => {
          const next = new Date(current);
          next.setHours(value.getHours(), value.getMinutes(), 0, 0);
          return next;
        });
      }
    }
    setPickerMode(null);
  };

  const save = async () => {
    if (!selectedDebtId) {
      setValidation(t('noOutstandingDebts'));
      return;
    }

    setValidation(null);
    try {
      await onSave(selectedDebtId, reminderDate.toISOString());
      onClose();
    } catch (error) {
      setValidation(
        error instanceof Error && error.message === 'remindAtInvalid'
          ? t('reminderRemindAtInvalid')
          : t('reminderSaveError'),
      );
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
      showsVerticalScrollIndicator={false}
    >
      {customers.length > 1 ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('selectCustomer')}
          </Text>
          <View style={styles.options}>
            {customers.map((customer) => {
              const selected = customer.id === selectedCustomerId;
              return (
                <Pressable
                  key={customer.id}
                  testID={`reminder-customer-${customer.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => chooseCustomer(customer.id)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: selected ? colors.accent : colors.input,
                      borderColor: selected ? colors.primary : colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.optionMark, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: selected ? colors.primary : colors.border }]}>
                    {selected ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : null}
                  </View>
                  <Text style={[styles.optionText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                    {customer.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : selectedCustomer ? (
        <View style={[styles.selectedCustomer, { backgroundColor: colors.accent, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="person-outline" size={17} color={colors.primary} />
          <Text style={[styles.selectedCustomerText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
            {selectedCustomer.name}
          </Text>
        </View>
      ) : null}

      {availableDebts.length > 1 ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('selectDebt')}
          </Text>
          <View style={styles.options}>
            {availableDebts.map((debt) => {
              const selected = debt.id === selectedDebtId;
              return (
                <Pressable
                  key={debt.id}
                  testID={`reminder-debt-${debt.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSelectedDebtId(debt.id);
                    setValidation(null);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: selected ? colors.accent : colors.input,
                      borderColor: selected ? colors.primary : colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.optionMark, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: selected ? colors.primary : colors.border }]}>
                    {selected ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : null}
                  </View>
                  <Text style={[styles.optionText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                    {debt.currency} · {debt.amount}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {availableDebts.length === 0 ? (
        <Text style={[styles.emptyHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('noOutstandingDebts')}
        </Text>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('reminderRemindAt')}
        </Text>
        <View style={[styles.dateTimeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            testID="reminder-date-button"
            accessibilityRole="button"
            accessibilityLabel={t('reminderChooseDate')}
            onPress={() => setPickerMode('date')}
            style={({ pressed }) => [
              styles.dateTimeButton,
              { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color={colors.primary} />
            <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatLocalizedDate(reminderDate, language)}</Text>
          </Pressable>
          <Pressable
            testID="reminder-time-button"
            accessibilityRole="button"
            accessibilityLabel={t('reminderChooseTime')}
            onPress={() => setPickerMode('time')}
            style={({ pressed }) => [
              styles.dateTimeButton,
              { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="time-outline" size={17} color={colors.primary} />
            <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatLocalizedTime(reminderDate, language)}</Text>
          </Pressable>
        </View>
        {pickerMode ? (
          <DateTimePicker
            testID={`reminder-${pickerMode}-picker`}
            value={reminderDate}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            is24Hour
            onChange={handlePickerChange}
          />
        ) : null}
        {validation ? (
          <Text testID="reminder-validation" style={[styles.validation, { color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }]}>
            {validation}
          </Text>
        ) : null}
      </View>

      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable
          testID="cancel-reminder-form"
          disabled={isSaving}
          onPress={onClose}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}
        >
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>{t('cancel')}</Text>
        </Pressable>
        <Pressable
          testID="save-reminder-form"
          disabled={isSaving || availableDebts.length === 0}
          onPress={() => void save()}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
        >
          {isSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryForeground} />}
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{t('saveChanges')}</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18 },
  field: { marginBottom: 13 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  options: { gap: 7 },
  option: { minHeight: 47, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  optionMark: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selectedCustomer: { minHeight: 47, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 9, paddingHorizontal: 12, marginBottom: 13 },
  selectedCustomerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },
  dateTimeRow: { gap: 8 },
  dateTimeButton: { flex: 1, minHeight: 51, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 9 },
  dateTimeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  validation: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 6 },
  actions: { gap: 10, marginTop: 7 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primaryText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});