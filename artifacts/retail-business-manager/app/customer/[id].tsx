import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { CustomerFormModal, type CustomerDraft } from '@/components/CustomerFormModal';
import { formatLocalizedDate } from '@/constants/i18n';
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

export default function CustomerDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isReady } = useStore();
  const { t, language, isRTL } = useI18n();
  const customerId = typeof id === 'string' ? id : '';
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEditVisible, setIsEditVisible] = useState<boolean>(false);

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

  const deleteCustomer = () => {
    if (!customer) {
      return;
    }
    Alert.alert(t('deleteCustomer'), t('deleteCustomerConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteCustomer'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const customers = await loadCustomers(profile.id);
              await saveCustomers(profile.id, customers.filter((item) => item.id !== customer.id));
              Alert.alert(t('customerDeleted'));
              router.back();
            } catch {
              Alert.alert(t('somethingWentWrong'), t('reloadToContinue'));
            }
          })();
        },
      },
    ]);
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

      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable testID="edit-customer-button" onPress={() => setIsEditVisible(true)} style={({ pressed }) => [styles.editButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={18} color={colors.primaryForeground} />
          <Text style={[styles.editText, { color: colors.primaryForeground }]}>{t('editCustomer')}</Text>
        </Pressable>
        <Pressable testID="delete-customer-button" onPress={deleteCustomer} style={({ pressed }) => [styles.deleteButton, { borderColor: colors.destructive }, pressed && styles.pressed]}>
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          <Text style={[styles.deleteText, { color: colors.destructive }]}>{t('deleteCustomer')}</Text>
        </Pressable>
      </View>

      <CustomerFormModal visible={isEditVisible} initialCustomer={customer} onClose={() => setIsEditVisible(false)} onSave={(draft) => void updateCustomer(draft)} />
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
  actions: { gap: 10, marginBottom: 8 },
  editButton: { flex: 1, minHeight: 51, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteButton: { flex: 1, minHeight: 51, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  editText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  deleteText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});