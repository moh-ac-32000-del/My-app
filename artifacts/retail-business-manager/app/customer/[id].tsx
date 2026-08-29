import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { CustomerFormModal, type CustomerDraft } from '@/components/CustomerFormModal';
import { formatLocalizedDate, type Language, type TranslationKey } from '@/constants/i18n';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { loadCustomers, saveCustomers } from '@/services/storage';
import type { Customer } from '@/types/business';

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
  language: Language,
  t: (key: TranslationKey) => string,
): string {
  const lines = [
    '━━━━━━━━━━━━━━',
    `📋 ${t('customerStatementTitle')}`,
    '',
    `👤 ${t('statementCustomer')}: ${customer.name}`,
    customer.phone ? `📞 ${t('statementPhone')}: ${customer.phone}` : null,
    `💰 ${t('statementDebt')}: ${t('statementNoDebtData')}`,
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

  useFocusEffect(
    useCallback(() => {
      if (!isReady || !customerId) {
        return undefined;
      }
      let active = true;
      setIsLoading(true);
      void loadCustomers(profile.id).then((customers) => {
        if (active) {
          setCustomer(customers.find((item) => item.id === customerId) ?? null);
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

    const message = buildCustomerStatement(customer, language, t);
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