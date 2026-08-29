import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { CustomerFormModal, type CustomerDraft } from '@/components/CustomerFormModal';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { CURRENCY_OPTIONS, formatMoney, isCurrencyCode, type CurrencyCode } from '@/constants/currencies';
import { formatLocalizedDate, formatLocalizedDateTime, type Language, type TranslationKey } from '@/constants/i18n';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { calculateDebtTotals, createDebt, filterDebtsByCustomer, loadCustomers, loadDebts, parseLocalizedAmountInput, saveCustomers, saveDebts } from '@/services/storage';
import type { Customer, Debt } from '@/types/business';

function DetailRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return (
    <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.border }]}>
      <View style={[styles.detailIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={[styles.detailCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.detailLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{value}</Text>
      </View>
    </View>
  );
}

function buildCustomerStatement(
  customer: Customer,
  debts: Debt[],
  language: Language,
  t: (key: TranslationKey) => string,
): string {
  const totals = calculateDebtTotals(debts);
  const debtLines = CURRENCY_OPTIONS
    .filter(({ code }) => totals[code] > 0)
    .map(({ code }) => `${code}: ${formatMoney(totals[code], code, language)}`);
  const lines = [
    '━━━━━━━━━━━━━━',
    `📋 ${t('customerStatementTitle')}`,
    '',
    `👤 ${t('statementCustomer')}: ${customer.name}`,
    customer.phone ? `📞 ${t('statementPhone')}: ${customer.phone}` : null,
    debtLines.length > 0 ? `💰 ${t('statementDebt')}:` : `💰 ${t('statementDebt')}: ${t('statementNoDebtData')}`,
    ...debtLines,
    `📅 ${t('statementDate')}: ${formatLocalizedDate(new Date(), language)}`,
    '',
    '━━━━━━━━━━━━━━',
    t('statementRegards') + ' 🌷',
    '━━━━━━━━━━━━━━',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

export default function CustomerDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isReady } = useStore();
  const { t, language, isRTL } = useI18n();
  const customerId = typeof id === 'string' ? id : '';
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEditVisible, setIsEditVisible] = useState<boolean>(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isDebtVisible, setIsDebtVisible] = useState<boolean>(false);
  const [isSavingDebt, setIsSavingDebt] = useState<boolean>(false);
  const [debtAmount, setDebtAmount] = useState<string>('');
  const [debtCurrency, setDebtCurrency] = useState<CurrencyCode>(profile.currency);

  const debtTotals = useMemo(() => calculateDebtTotals(debts), [debts]);
  const debtCurrencies = useMemo(
    () => CURRENCY_OPTIONS.filter(({ code }) => debtTotals[code] > 0),
    [debtTotals],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isReady || !customerId) {
        return undefined;
      }
      let active = true;
      setIsLoading(true);
      void Promise.all([loadCustomers(profile.id), loadDebts(profile.id)]).then(([customers, storedDebts]) => {
        if (active) {
          setCustomer(customers.find((item) => item.id === customerId) ?? null);
          setDebts(filterDebtsByCustomer(storedDebts, customerId));
          setIsLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [customerId, isReady, profile.id]),
  );

  const updateCustomer = async (draft: CustomerDraft) => {
    if (!customer || !draft.name.trim()) {
      Alert.alert(t('customerName'), t('fieldRequired'));
      return;
    }

    const nextCustomer: Customer = {
      ...customer,
      name: draft.name.trim(),
      phone: draft.phone,
      address: draft.address,
      notes: draft.notes,
      updatedAt: new Date().toISOString(),
    };
    try {
      const customers = await loadCustomers(profile.id);
      await saveCustomers(profile.id, customers.map((item) => item.id === nextCustomer.id ? nextCustomer : item));
      setCustomer(nextCustomer);
      setIsEditVisible(false);
      Alert.alert(t('customerSaved'));
    } catch {
      Alert.alert(t('somethingWentWrong'), t('reloadToContinue'));
    }
  };

  const addDebt = async () => {
    if (isSavingDebt) {
      return;
    }
    if (!debtAmount.trim()) {
      Alert.alert(t('amount'), t('debtAmountRequired'));
      return;
    }

    const parsedAmount = parseLocalizedAmountInput(debtAmount, language);
    if (parsedAmount === null || !isCurrencyCode(debtCurrency)) {
      Alert.alert(t('amount'), t('debtAmountInvalid'));
      return;
    }

    setIsSavingDebt(true);
    try {
      const debt = createDebt(profile.id, customerId, { amount: parsedAmount, currency: debtCurrency });
      const currentStoreDebts = await loadDebts(profile.id);
      await saveDebts(profile.id, [...currentStoreDebts, debt]);
      setDebts((current) => [debt, ...current].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)));
      setDebtAmount('');
      setIsDebtVisible(false);
      Alert.alert(t('debtAdded'));
    } catch {
      Alert.alert(t('somethingWentWrong'), t('debtSaveError'));
    } finally {
      setIsSavingDebt(false);
    }
  };

  const confirmDelete = async () => {
    if (!customer || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      const customers = await loadCustomers(profile.id);
      await saveCustomers(profile.id, customers.filter((item) => item.id !== customer.id));
      setIsDeleteDialogVisible(false);
      Alert.alert(t('customerDeleted'));
      router.back();
    } catch {
      Alert.alert(t('somethingWentWrong'), t('reloadToContinue'));
    } finally {
      setIsDeleting(false);
    }
  };

  const shareCustomerStatement = async () => {
    if (!customer) {
      return;
    }

    const message = buildCustomerStatement(customer, debts, language, t);
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
    } catch {
      try {
        await Share.share({ message });
      } catch {
        Alert.alert(t('somethingWentWrong'), t('shareStatementError'));
      }
    }
  };

  if (!isReady || isLoading) {
    return (
      <AppShell>
        <PageHeader title={t('customerDetails')} showBack />
        <GlassCard style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} size="large" />
        </GlassCard>
      </AppShell>
    );
  }

  if (!customer) {
    return (
      <AppShell>
        <PageHeader title={t('customerDetails')} showBack />
        <EmptyState icon="person-outline" title={t('customerNotFound')} hint={t('reloadToContinue')} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title={t('customerDetails')} subtitle={customer.name} showBack />
      <GlassCard style={styles.identityCard}>
        <View style={[styles.identityAvatar, { backgroundColor: colors.accent }]}>
          <Ionicons name="person-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.identityName, { color: colors.foreground }]}>{customer.name}</Text>
        <Text style={[styles.identityHint, { color: colors.mutedForeground }]}>{customer.phone || t('customerNoPhone')}</Text>
      </GlassCard>

      <SectionTitle title={t('customerDetails')} />
      <GlassCard style={styles.detailsCard}>
        <DetailRow icon="call-outline" label={t('customerPhone')} value={customer.phone || t('customerNoPhone')} />
        <DetailRow icon="location-outline" label={t('customerAddress')} value={customer.address || t('customerNoAddress')} />
        <DetailRow icon="document-text-outline" label={t('customerNotes')} value={customer.notes || t('customerNoNotes')} />
        <DetailRow icon="calendar-outline" label={t('customerCreatedAt')} value={formatLocalizedDate(new Date(customer.createdAt), language)} />
      </GlassCard>

      <Pressable
        testID="share-customer-statement"
        accessibilityRole="button"
        onPress={() => void shareCustomerStatement()}
        style={({ pressed }) => [styles.shareButton, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}
      >
        <Ionicons name="logo-whatsapp" size={19} color={colors.primaryForeground} />
        <Text style={[styles.shareText, { color: colors.primaryForeground }]}>{t('shareCustomerStatement')}</Text>
      </Pressable>

      <Pressable
        testID="add-debt-button"
        accessibilityRole="button"
        onPress={() => {
          setDebtCurrency(profile.currency);
          setDebtAmount('');
          setIsDebtVisible(true);
        }}
        style={({ pressed }) => [styles.addDebtButton, { backgroundColor: colors.accent, borderColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
        <Text style={[styles.addDebtText, { color: colors.foreground }]}>{t('addDebt')}</Text>
      </Pressable>

      <SectionTitle title={t('debtTotals')} />
      {debtCurrencies.length > 0 ? (
        <GlassCard style={styles.debtTotalsCard}>
          <View style={styles.debtTotalsGrid}>
            {debtCurrencies.map(({ code }) => (
              <View key={code} style={[styles.debtTotalItem, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Text style={[styles.debtCurrencyCode, { color: colors.primary }]}>{code}</Text>
                <Text style={[styles.debtTotalAmount, { color: colors.foreground }]}>{formatMoney(debtTotals[code], code, language)}</Text>
              </View>
            ))}
          </View>
        </GlassCard>
      ) : (
        <EmptyState icon="wallet-outline" title={t('noDebts')} hint={t('noDebtsHint')} />
      )}

      <SectionTitle title={t('debtHistory')} />
      {debts.length > 0 ? (
        debts.map((debt) => (
          <GlassCard key={debt.id} style={styles.debtHistoryCard}>
            <View style={[styles.debtHistoryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.debtHistoryIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="document-text-outline" size={19} color={colors.primary} />
              </View>
              <View style={[styles.debtHistoryCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Text style={[styles.debtHistoryAmount, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
                  {formatMoney(debt.amount, debt.currency, language)}
                </Text>
                <Text style={[styles.debtHistoryDate, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
                  {formatLocalizedDateTime(new Date(debt.createdAt), language)}
                </Text>
              </View>
            </View>
          </GlassCard>
        ))
      ) : (
        <EmptyState icon="document-text-outline" title={t('debtHistoryEmpty')} hint={t('debtHistoryEmptyHint')} />
      )}

      <SectionTitle title={t('paymentHistory')} />
      <EmptyState
        icon="card-outline"
        title={t('paymentHistoryEmpty')}
        hint={t('paymentHistoryEmptyHint')}
      />

      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable testID="edit-customer-button" onPress={() => setIsEditVisible(true)} style={({ pressed }) => [styles.editButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={18} color={colors.primaryForeground} />
          <Text style={[styles.editText, { color: colors.primaryForeground }]}>{t('editCustomer')}</Text>
        </Pressable>
        <Pressable testID="delete-customer-button" onPress={() => setIsDeleteDialogVisible(true)} style={({ pressed }) => [styles.deleteButton, { borderColor: colors.destructive }, pressed && styles.pressed]}>
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          <Text style={[styles.deleteText, { color: colors.destructive }]}>{t('deleteCustomer')}</Text>
        </Pressable>
      </View>

      <CustomerFormModal visible={isEditVisible} initialCustomer={customer} onClose={() => setIsEditVisible(false)} onSave={(draft) => void updateCustomer(draft)} />

      <Modal
        visible={isDebtVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSavingDebt) {
            setIsDebtVisible(false);
          }
        }}
      >
        <View style={[styles.debtModalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.debtModal, { backgroundColor: colors.glassStrong, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.debtModalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.debtModalHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <Text style={[styles.debtModalTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('addDebt')}</Text>
                <Text style={[styles.debtModalHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('debtFormHint')}</Text>
              </View>
              <Pressable
                testID="close-debt-form"
                accessibilityLabel={t('close')}
                disabled={isSavingDebt}
                onPress={() => setIsDebtVisible(false)}
                style={({ pressed }) => [styles.debtCloseButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={colors.foreground} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.debtFormContent} keyboardShouldPersistTaps="handled" bottomOffset={24} showsVerticalScrollIndicator={false}>
              <View style={styles.debtField}>
                <Text style={[styles.debtFieldLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('amount')}</Text>
                <View style={[styles.debtInputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="cash-outline" size={18} color={colors.mutedForeground} />
                  <TextInput
                    testID="debt-amount-input"
                    value={debtAmount}
                    onChangeText={setDebtAmount}
                    placeholder={t('amount')}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    textAlign={isRTL ? 'right' : 'left'}
                    style={[styles.debtInput, { color: colors.foreground }]}
                  />
                </View>
              </View>

              <View style={styles.debtField}>
                <Text style={[styles.debtFieldLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('debtCurrency')}</Text>
                <View style={styles.debtCurrencyOptions}>
                  {CURRENCY_OPTIONS.map((option) => {
                    const selected = debtCurrency === option.code;
                    return (
                      <Pressable
                        key={option.code}
                        testID={`debt-currency-${option.code}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setDebtCurrency(option.code)}
                        style={({ pressed }) => [
                          styles.debtCurrencyOption,
                          { backgroundColor: selected ? colors.accent : colors.input, borderColor: selected ? colors.primary : colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.debtCurrencyMark, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: selected ? colors.primary : colors.border }]}>
                          {selected ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : null}
                        </View>
                        <Text style={[styles.debtCurrencyOptionText, { color: colors.foreground }]}>{option.code} · {option.symbol}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.debtModalActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable
                  testID="cancel-debt-form"
                  disabled={isSavingDebt}
                  onPress={() => setIsDebtVisible(false)}
                  style={({ pressed }) => [styles.debtSecondaryButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}
                >
                  <Text style={[styles.debtSecondaryText, { color: colors.foreground }]}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  testID="save-debt-form"
                  disabled={isSavingDebt}
                  onPress={() => void addDebt()}
                  style={({ pressed }) => [styles.debtPrimaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                >
                  {isSavingDebt ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryForeground} />}
                  <Text style={[styles.debtPrimaryText, { color: colors.primaryForeground }]}>{t('saveChanges')}</Text>
                </Pressable>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isDeleteDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) {
            setIsDeleteDialogVisible(false);
          }
        }}
      >
        <View style={[styles.deleteBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.deleteDialog, { backgroundColor: colors.glassStrong, borderColor: colors.border, marginBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.deleteIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="trash-outline" size={23} color={colors.destructive} />
            </View>
            <Text style={[styles.deleteTitle, { color: colors.foreground }]}>{t('deleteCustomer')}</Text>
            <Text style={[styles.deleteHint, { color: colors.mutedForeground }]}>{t('deleteCustomerConfirm')}</Text>
            <View style={[styles.deleteActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable testID="cancel-delete-customer" disabled={isDeleting} onPress={() => setIsDeleteDialogVisible(false)} style={({ pressed }) => [styles.deleteCancelButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
                <Text style={[styles.deleteCancelText, { color: colors.foreground }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable testID="confirm-delete-customer" disabled={isDeleting} onPress={() => void confirmDelete()} style={({ pressed }) => [styles.deleteConfirmButton, { backgroundColor: colors.destructive }, pressed && styles.pressed]}>
                {isDeleting ? <ActivityIndicator size="small" color={colors.destructiveForeground} /> : <Ionicons name="trash-outline" size={17} color={colors.destructiveForeground} />}
                <Text style={[styles.deleteConfirmText, { color: colors.destructiveForeground }]}>{t('deleteCustomer')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  identityCard: { alignItems: 'center', paddingVertical: 24, marginBottom: 20 },
  identityAvatar: { width: 64, height: 64, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  identityName: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  identityHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 5, textAlign: 'center' },
  detailsCard: { paddingVertical: 4, marginBottom: 20 },
  detailRow: { minHeight: 68, alignItems: 'center', gap: 11, borderBottomWidth: 1 },
  detailIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 4 },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  detailValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  shareButton: { minHeight: 51, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  shareText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  addDebtButton: { minHeight: 51, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  addDebtText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  debtTotalsCard: { marginBottom: 18 },
  debtTotalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  debtTotalItem: { minWidth: '46%', flexGrow: 1, borderRadius: 16, borderWidth: 1, padding: 13 },
  debtCurrencyCode: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  debtTotalAmount: { fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: 7 },
  debtHistoryCard: { marginBottom: 10 },
  debtHistoryRow: { alignItems: 'center', gap: 11 },
  debtHistoryIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  debtHistoryCopy: { flex: 1, gap: 4 },
  debtHistoryAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  debtHistoryDate: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  debtModalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  debtModal: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingTop: 18 },
  debtModalHeader: { alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  debtModalHeaderCopy: { flex: 1 },
  debtModalTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  debtModalHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 4 },
  debtCloseButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  debtFormContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18 },
  debtField: { marginBottom: 13 },
  debtFieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  debtInputWrap: { minHeight: 49, borderWidth: 1, borderRadius: 15, alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  debtInput: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: 'Inter_400Regular' },
  debtCurrencyOptions: { gap: 8 },
  debtCurrencyOption: { minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  debtCurrencyMark: { width: 28, height: 28, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  debtCurrencyOptionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  debtModalActions: { gap: 10, marginTop: 7 },
  debtSecondaryButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  debtPrimaryButton: { flex: 1, minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  debtSecondaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  debtPrimaryText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  actions: { gap: 10, marginBottom: 8 },
  editButton: { flex: 1, minHeight: 51, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteButton: { flex: 1, minHeight: 51, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  editText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  deleteText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  deleteBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  deleteDialog: { width: '100%', maxWidth: 390, borderRadius: 24, borderWidth: 1, padding: 22, alignItems: 'center' },
  deleteIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  deleteTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  deleteHint: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 21, textAlign: 'center', marginTop: 7 },
  deleteActions: { width: '100%', gap: 10, marginTop: 20 },
  deleteCancelButton: { flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteConfirmButton: { flex: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  deleteCancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  deleteConfirmText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});