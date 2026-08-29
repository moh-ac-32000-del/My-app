import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppShell, EmptyState, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { CustomerFormModal, type CustomerDraft } from '@/components/CustomerFormModal';
import { filterCustomers } from '@/components/customer-utils';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { loadCustomers, saveCustomers } from '@/services/storage';
import type { Customer } from '@/types/business';

function createCustomerId(): string {
  return `customer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function CustomerCard({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const colors = useColors();
  const { isRTL, t } = useI18n();
  const initials = customer.name.trim().slice(0, 1).toUpperCase();

  return (
    <Pressable testID={`customer-card-${customer.id}`} onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <GlassCard style={styles.customerCard}>
        <View style={[styles.customerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
          </View>
          <View style={[styles.customerCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text numberOfLines={1} style={[styles.customerName, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{customer.name}</Text>
            <Text numberOfLines={1} style={[styles.customerPhone, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{customer.phone || t('customerNoPhone')}</Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.mutedForeground} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function CustomersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, isReady } = useStore();
  const { t, isRTL } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState<string>('');
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }
      let active = true;
      void loadCustomers(profile.id).then((loadedCustomers) => {
        if (active) {
          setCustomers(loadedCustomers);
        }
      });
      return () => {
        active = false;
      };
    }, [isReady, profile.id]),
  );

  const visibleCustomers = useMemo(() => filterCustomers(customers, search), [customers, search]);

  const persistCustomers = async (nextCustomers: Customer[]): Promise<boolean> => {
    try {
      await saveCustomers(profile.id, nextCustomers);
      setCustomers(nextCustomers);
      return true;
    } catch {
      Alert.alert(t('somethingWentWrong'), t('reloadToContinue'));
      return false;
    }
  };

  const addCustomer = async (draft: CustomerDraft) => {
    if (!draft.name.trim()) {
      Alert.alert(t('customerName'), t('fieldRequired'));
      return;
    }

    const now = new Date().toISOString();
    const customer: Customer = {
      id: createCustomerId(),
      storeId: profile.id,
      name: draft.name.trim(),
      phone: draft.phone,
      address: draft.address,
      notes: draft.notes,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };
    const saved = await persistCustomers([customer, ...customers]);
    if (!saved) {
      return;
    }
    setIsFormVisible(false);
    Alert.alert(t('customerAdded'));
  };

  const openCustomer = (customer: Customer) => {
    router.push({ pathname: '/customer/[id]', params: { id: customer.id } });
  };

  return (
    <AppShell>
      <PageHeader
        title={t('customers')}
        subtitle={t('customersModuleHint')}
        action={(
          <Pressable testID="add-customer-header" accessibilityLabel={t('addCustomer')} onPress={() => setIsFormVisible(true)} style={({ pressed }) => [styles.headerAction, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <Ionicons name="add" size={21} color={colors.primaryForeground} />
          </Pressable>
        )}
      />

      <GlassCard style={styles.searchCard}>
        <View style={[styles.searchWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="search-outline" size={19} color={colors.mutedForeground} />
          <TextInput
            testID="customer-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder={t('customerSearchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign={isRTL ? 'right' : 'left'}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {search ? (
            <Pressable testID="clear-customer-search" accessibilityLabel={t('close')} onPress={() => setSearch('')} style={({ pressed }) => [pressed && styles.pressed]}>
              <Ionicons name="close-circle" size={19} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </GlassCard>

      <SectionTitle title={t('customersCount')} action={String(customers.length)} />

      {customers.length === 0 ? (
        <EmptyState icon="people-outline" title={t('customersEmpty')} hint={t('customersEmptyHint')} />
      ) : visibleCustomers.length === 0 ? (
        <EmptyState icon="search-outline" title={t('customerSearchEmpty')} hint={t('customerSearchEmptyHint')} />
      ) : (
        <FlatList
          testID="customers-list"
          data={visibleCustomers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CustomerCard customer={item} onPress={() => openCustomer(item)} />}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable testID="add-customer-button" onPress={() => setIsFormVisible(true)} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}>
        <Ionicons name="person-add-outline" size={19} color={colors.primaryForeground} />
        <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>{t('addCustomer')}</Text>
      </Pressable>

      <CustomerFormModal visible={isFormVisible} onClose={() => setIsFormVisible(false)} onSave={(draft) => void addCustomer(draft)} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  searchCard: { marginBottom: 20, padding: 10 },
  searchWrap: { minHeight: 49, borderWidth: 1, borderRadius: 16, alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, minHeight: 45, fontSize: 14, fontFamily: 'Inter_400Regular' },
  headerAction: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  customerCard: { marginBottom: 10, padding: 14 },
  customerRow: { alignItems: 'center', gap: 11 },
  avatar: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  customerCopy: { flex: 1, gap: 5 },
  customerName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  customerPhone: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  listContent: { paddingBottom: 4 },
  addButton: { minHeight: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 7, marginBottom: 8 },
  addButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});