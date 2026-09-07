import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCY_OPTIONS, type CurrencyCode } from '@/constants/currencies';
import type { Language } from '@/constants/i18n';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import type { Customer } from '@/types/business';

export interface DebtDraft {
  customerId: string;
  amount: number;
  currency: CurrencyCode;
  dueDate?: string;
}

export interface DebtFormProps {
  customers: Customer[];
  visibleCurrencies: CurrencyCode[];
  initialCustomerId?: string;
  initialCurrency?: CurrencyCode;
  initialDueDate?: string;
  resetKey?: string | number | boolean;
  variant?: 'credit' | 'debt';
  isSaving?: boolean;
  parseAmount: (value: string, language: Language) => number | null;
  onClose: () => void;
  onSave: (draft: DebtDraft) => Promise<void>;
}

export function DebtForm({
  customers,
  visibleCurrencies,
  initialCustomerId,
  initialCurrency,
  initialDueDate = '',
  resetKey,
  variant = 'debt',
  isSaving = false,
  parseAmount,
  onClose,
  onSave,
}: DebtFormProps) {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const visibleCurrencyOptions = useMemo(
    () => CURRENCY_OPTIONS.filter(({ code }) => visibleCurrencies.includes(code)),
    [visibleCurrencies],
  );
  const initialSelectedCustomerId = initialCustomerId ?? customers[0]?.id ?? '';
  const initialSelectedCurrency = visibleCurrencyOptions.some(({ code }) => code === initialCurrency)
    ? initialCurrency
    : visibleCurrencyOptions[0]?.code;
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialSelectedCustomerId);
  const [amount, setAmount] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode | undefined>(initialSelectedCurrency);
  const [dueDate, setDueDate] = useState<string>(initialDueDate);
  const [validation, setValidation] = useState<string | null>(null);
  const saveInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    setSelectedCustomerId(initialSelectedCustomerId);
    setAmount('');
    setSelectedCurrency(initialSelectedCurrency);
    setDueDate(initialDueDate);
    setValidation(null);
  }, [initialDueDate, initialSelectedCurrency, initialSelectedCustomerId, resetKey]);

  useEffect(() => {
    if (selectedCurrency && visibleCurrencyOptions.some(({ code }) => code === selectedCurrency)) {
      return;
    }
    setSelectedCurrency(visibleCurrencyOptions[0]?.code);
  }, [selectedCurrency, visibleCurrencyOptions]);

  const isCreditVariant = variant === 'credit';
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const amountRequiredKey = isCreditVariant ? 'amountRequired' : 'debtAmountRequired';
  const amountInvalidKey = isCreditVariant ? 'amountInvalid' : 'debtAmountInvalid';

  const save = async () => {
    if (isSaving || saveInFlightRef.current) {
      return;
    }
    if (!selectedCustomerId) {
      setValidation(t('selectCustomer'));
      return;
    }
    if (!amount.trim()) {
      setValidation(t(amountRequiredKey));
      return;
    }
    const parsedAmount = parseAmount(amount, language);
    if (parsedAmount === null || !selectedCurrency) {
      setValidation(t(amountInvalidKey));
      return;
    }

    setValidation(null);
    saveInFlightRef.current = true;
    try {
      const normalizedDueDate = dueDate.trim();
      await onSave({
        customerId: selectedCustomerId,
        amount: parsedAmount,
        currency: selectedCurrency,
        ...(normalizedDueDate ? { dueDate: normalizedDueDate } : {}),
      });
    } catch (error) {
      setValidation(
        error instanceof Error && error.message === 'dueDateInvalid'
          ? t('debtDueDateInvalid')
          : t('debtSaveError'),
      );
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <View>
      {customers.length > 1 ? (
        <View style={styles.customerField}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('selectCustomer')}
          </Text>
          <View style={styles.customerOptions}>
            {customers.map((customer) => {
              const selected = customer.id === selectedCustomerId;
              return (
                <Pressable
                  key={customer.id}
                  testID={`${isCreditVariant ? 'credit' : 'debt'}-customer-${customer.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSelectedCustomerId(customer.id);
                    setValidation(null);
                  }}
                  style={({ pressed }) => [
                    styles.customerOption,
                    {
                      backgroundColor: selected ? colors.accent : colors.input,
                      borderColor: selected ? colors.primary : colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.customerOptionMark, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: selected ? colors.primary : colors.border }]}>
                    {selected ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : null}
                  </View>
                  <Text style={[styles.customerOptionText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
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
      ) : (
        <Text style={[styles.emptyHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('noCustomers')}
        </Text>
      )}

      <View style={styles.field}>
        <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('amount')}
        </Text>
        <View
          style={[
            isCreditVariant ? styles.amountRow : styles.debtInputWrap,
            {
              backgroundColor: colors.input,
              borderColor: validation ? colors.destructive : colors.border,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
        >
          {!isCreditVariant ? <Ionicons name="cash-outline" size={18} color={colors.mutedForeground} /> : null}
          <TextInput
            testID={isCreditVariant ? 'credit-amount-input' : 'debt-amount-input'}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              if (validation) setValidation(null);
            }}
            placeholder={isCreditVariant ? '0' : t('amount')}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            inputMode="decimal"
            textAlign={isRTL ? 'right' : 'left'}
            style={[isCreditVariant ? styles.amountInput : styles.debtInput, { color: colors.foreground }]}
          />
          {isCreditVariant && selectedCurrency ? (
            <Text style={[styles.amountCurrency, { color: colors.primary }]}>{selectedCurrency}</Text>
          ) : null}
        </View>
        {validation ? (
          <Text testID={isCreditVariant ? 'credit-validation' : 'debt-validation'} style={[styles.validation, { color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }]}>
            {validation}
          </Text>
        ) : null}
      </View>

      {!isCreditVariant ? (
        <View style={styles.field}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('debtDueDate')}
          </Text>
          <View style={[styles.debtInputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              testID="debt-due-date-input"
              value={dueDate}
              onChangeText={setDueDate}
              placeholder={t('debtDueDatePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              textAlign={isRTL ? 'right' : 'left'}
              style={[styles.debtInput, { color: colors.foreground }]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('debtDueDate')}
          </Text>
          <View style={[styles.debtInputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              testID="credit-due-date-input"
              value={dueDate}
              onChangeText={setDueDate}
              placeholder={t('debtDueDatePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              textAlign={isRTL ? 'right' : 'left'}
              style={[styles.debtInput, { color: colors.foreground }]}
            />
          </View>
        </View>
      )}

      <View style={styles.field}>
        <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('debtCurrency')}
        </Text>
        <View style={isCreditVariant ? styles.creditCurrencyOptions : styles.debtCurrencyOptions}>
          {visibleCurrencyOptions.map((option) => {
            const selected = selectedCurrency === option.code;
            return (
              <Pressable
                key={option.code}
                testID={`${isCreditVariant ? 'credit' : 'debt'}-currency-${option.code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedCurrency(option.code);
                  setValidation(null);
                }}
                style={({ pressed }) => [
                  isCreditVariant ? styles.creditCurrencyOption : styles.debtCurrencyOption,
                  {
                    backgroundColor: selected ? colors.accent : colors.input,
                    borderColor: selected ? colors.primary : colors.border,
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                  },
                  pressed && styles.pressed,
                ]}
              >
                {!isCreditVariant ? (
                  <View style={[styles.debtCurrencyMark, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: selected ? colors.primary : colors.border }]}>
                    {selected ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : null}
                  </View>
                ) : null}
                <Text style={[isCreditVariant ? styles.creditCurrencyText : styles.debtCurrencyOptionText, { color: colors.foreground }]}>
                  {option.code} · {option.symbol}
                </Text>
                {isCreditVariant && selected ? <Ionicons name="checkmark-circle" size={17} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable
          testID={isCreditVariant ? 'credit-cancel' : 'cancel-debt-form'}
          accessibilityRole="button"
          disabled={isSaving}
          onPress={onClose}
          style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>{t('cancel')}</Text>
        </Pressable>
        <Pressable
          testID={isCreditVariant ? 'credit-confirm' : 'save-debt-form'}
          accessibilityRole="button"
          disabled={isSaving || customers.length === 0 || !selectedCurrency}
          onPress={() => void save()}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
        >
          {isSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />}
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('confirm')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  customerField: { marginBottom: 17 },
  customerOptions: { gap: 7 },
  customerOption: { minHeight: 45, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  customerOptionMark: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  customerOptionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selectedCustomer: { minHeight: 47, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 9, paddingHorizontal: 12, marginBottom: 13 },
  selectedCustomerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyHint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 4, marginBottom: 14 },
  field: { marginBottom: 13 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  amountRow: { minHeight: 52, borderWidth: 1, borderRadius: 15, alignItems: 'center', paddingHorizontal: 13, gap: 10 },
  amountInput: { flex: 1, minHeight: 50, fontSize: 20, fontFamily: 'Inter_700Bold' },
  amountCurrency: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  debtInputWrap: { minHeight: 49, borderWidth: 1, borderRadius: 15, alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  debtInput: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: 'Inter_400Regular' },
  validation: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 5, marginBottom: 8 },
  creditCurrencyOptions: { gap: 7, marginBottom: 18 },
  creditCurrencyOption: { minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 11 },
  creditCurrencyText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  debtCurrencyOptions: { gap: 8 },
  debtCurrencyOption: { minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  debtCurrencyMark: { width: 28, height: 28, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  debtCurrencyOptionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  actions: { gap: 10, marginTop: 7 },
  secondaryButton: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { flex: 1, minHeight: 49, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 7, flexDirection: 'row' },
  secondaryButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});