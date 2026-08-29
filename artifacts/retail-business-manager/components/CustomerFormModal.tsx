import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import type { Customer } from '@/types/business';

export type CustomerDraft = Pick<Customer, 'name' | 'phone' | 'address' | 'notes'>;

const emptyDraft: CustomerDraft = {
  name: '',
  phone: '',
  address: '',
  notes: '',
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  multiline = false,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  multiline?: boolean;
  testID: string;
}) {
  const colors = useColors();
  const { isRTL } = useI18n();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }, multiline && styles.multilineWrap]}>
        <Ionicons name={icon} size={18} color={colors.mutedForeground} />
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          multiline={multiline}
          textAlign={isRTL ? 'right' : 'left'}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.input, { color: colors.foreground }, multiline && styles.multilineInput]}
        />
      </View>
    </View>
  );
}

export function CustomerFormModal({
  visible,
  initialCustomer,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialCustomer?: Customer | null;
  onClose: () => void;
  onSave: (draft: CustomerDraft) => void;
}) {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft({
      name: initialCustomer?.name ?? '',
      phone: initialCustomer?.phone ?? '',
      address: initialCustomer?.address ?? '',
      notes: initialCustomer?.notes ?? '',
    });
  }, [visible, initialCustomer]);

  const updateField = (field: keyof CustomerDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = () => {
    onSave({
      name: draft.name.trim(),
      phone: draft.phone?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.glassStrong, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.sheetHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.headerCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{initialCustomer ? t('editCustomer') : t('addCustomer')}</Text>
              <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('customerFormHint')}</Text>
            </View>
            <Pressable testID="close-customer-form" accessibilityLabel={t('close')} onPress={onClose} style={({ pressed }) => [styles.closeButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
              <Ionicons name="close" size={20} color={colors.foreground} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={24}
            showsVerticalScrollIndicator={false}
          >
            <FormField label={t('customerName')} value={draft.name} onChangeText={(value) => updateField('name', value)} placeholder={t('customerNamePlaceholder')} icon="person-outline" testID="customer-name-input" />
            <FormField label={t('customerPhone')} value={draft.phone ?? ''} onChangeText={(value) => updateField('phone', value)} placeholder={t('customerPhonePlaceholder')} icon="call-outline" testID="customer-phone-input" />
            <FormField label={t('customerAddress')} value={draft.address ?? ''} onChangeText={(value) => updateField('address', value)} placeholder={t('customerAddressPlaceholder')} icon="location-outline" testID="customer-address-input" />
            <FormField label={t('customerNotes')} value={draft.notes ?? ''} onChangeText={(value) => updateField('notes', value)} placeholder={t('customerNotesPlaceholder')} icon="document-text-outline" multiline testID="customer-notes-input" />

            <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable testID="cancel-customer-form" onPress={onClose} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.input }, pressed && styles.pressed]}>
                <Text style={[styles.secondaryText, { color: colors.foreground }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable testID="save-customer-form" onPress={submit} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{initialCustomer ? t('saveChanges') : t('add')}</Text>
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingTop: 18 },
  sheetHeader: { alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 4 },
  closeButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  formContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18 },
  field: { marginBottom: 13 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  inputWrap: { minHeight: 49, borderWidth: 1, borderRadius: 15, alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  multilineWrap: { minHeight: 84, alignItems: 'flex-start', paddingVertical: 13 },
  input: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: 'Inter_400Regular' },
  multilineInput: { minHeight: 56, textAlignVertical: 'top' },
  actions: { gap: 10, marginTop: 7 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primaryText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});