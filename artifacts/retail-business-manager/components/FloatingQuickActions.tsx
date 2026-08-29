import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { CURRENCY_OPTIONS, getCurrency, type CurrencyCode } from '@/constants/currencies';
import type { TranslationKey } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import type { CashTransactionDraft } from '@/types/business';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type CashAction = 'cash-in' | 'cash-out';
type NoticeAction = 'credit' | 'settlement';

const menuItems: Array<{
  id: 'cash-in' | 'cash-out' | 'credit' | 'settlement';
  labelKey: TranslationKey;
  icon: IconName;
}> = [
  { id: 'cash-in', labelKey: 'quickActionCashIn', icon: 'arrow-down-circle-outline' },
  { id: 'cash-out', labelKey: 'quickActionCashOut', icon: 'arrow-up-circle-outline' },
  { id: 'credit', labelKey: 'quickActionCredit', icon: 'time-outline' },
  { id: 'settlement', labelKey: 'quickActionSettlement', icon: 'checkmark-done-circle-outline' },
];

function MenuItem({
  label,
  icon,
  testID,
  isRTL,
  onPress,
}: {
  label: string;
  icon: IconName;
  testID: string;
  isRTL: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.menuItem,
        { borderBottomColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.menuItemContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.menuIcon, { backgroundColor: colors.accent }]}>
          <Ionicons name={icon} size={19} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
          {label}
        </Text>
        <Ionicons
          name={isRTL ? 'chevron-back' : 'chevron-forward'}
          size={16}
          color={colors.mutedForeground}
        />
      </View>
    </Pressable>
  );
}

function SheetHeader({
  title,
  subtitle,
  icon,
  onClose,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onClose: () => void;
}) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return (
    <View style={[styles.sheetHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.sheetHeaderIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={21} color={colors.primary} />
      </View>
      <View style={[styles.sheetHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.sheetTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>
          {title}
        </Text>
        <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        testID="quick-sheet-close"
        accessibilityRole="button"
        accessibilityLabel={useI18n().t('close')}
        onPress={onClose}
        style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={20} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function QuickCurrencyPicker({
  selectedCurrency,
  onSelect,
}: {
  selectedCurrency: CurrencyCode;
  onSelect?: (code: CurrencyCode) => void;
}) {
  const colors = useColors();
  const { profile } = useStore();
  const { t, isRTL } = useI18n();
  const quickCurrencies = useMemo(
    () => CURRENCY_OPTIONS.filter((option) => profile.quickCurrencies.includes(option.code)),
    [profile.quickCurrencies],
  );

  const chooseCurrency = async (code: CurrencyCode) => {
    onSelect?.(code);
    await Haptics.selectionAsync();
  };

  return (
    <View testID="quick-currency-picker" style={styles.quickCurrencyPicker}>
      <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
        {t('currency')}
      </Text>
      {quickCurrencies.length > 0 ? (
        <View style={[styles.quickCurrencyGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {quickCurrencies.map((option) => {
            const selected = option.code === selectedCurrency;
            return (
              <Pressable
                key={option.code}
                testID={`quick-currency-option-${option.code}`}
                accessibilityRole="button"
                accessibilityLabel={`${option.code} ${t(option.nameKey)}`}
                onPress={() => void chooseCurrency(option.code)}
                style={({ pressed }) => [
                  styles.quickCurrencyOption,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.input, flexDirection: isRTL ? 'row-reverse' : 'row' },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.quickCurrencySymbolText, { color: colors.primary }]}>{option.symbol}</Text>
                <Text style={[styles.quickCurrencyCode, { color: colors.foreground }]}>{option.code}</Text>
                {selected ? <Ionicons name="checkmark-circle" size={15} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.emptyQuickHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('quickCurrenciesEmptyHint')}
        </Text>
      )}
    </View>
  );
}

function CashTransactionSheet({
  action,
  onClose,
  onSave,
}: {
  action: CashAction;
  onClose: () => void;
  onSave: (draft: CashTransactionDraft) => Promise<unknown>;
}) {
  const colors = useColors();
  const { profile } = useStore();
  const { t, isRTL } = useI18n();
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(profile.currency);
  const [validation, setValidation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const titleKey = action === 'cash-in' ? 'cashInTitle' : 'cashOutTitle';
  const icon: IconName = action === 'cash-in' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline';

  const confirmTransaction = async () => {
    const normalized = Number(amount.replace(',', '.').trim());
    if (!amount.trim()) {
      setValidation(t('amountRequired'));
      return;
    }
    if (!Number.isFinite(normalized) || normalized <= 0) {
      setValidation(t('amountInvalid'));
      return;
    }
    setValidation(null);
    setIsSaving(true);
    try {
      await onSave({
        type: action === 'cash-in' ? 'cash_in' : 'cash_out',
        amount: normalized,
        currency: selectedCurrency,
        note: note.trim() || undefined,
      });
      onClose();
    } catch {
      setValidation(t('transactionSaveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.sheet, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>
      <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <SheetHeader
          title={t(titleKey)}
          subtitle={t('cashPreviewHint')}
          icon={icon}
          onClose={onClose}
        />

        <QuickCurrencyPicker selectedCurrency={selectedCurrency} onSelect={setSelectedCurrency} />

        <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('amount')}
        </Text>
        <View style={[styles.amountRow, { backgroundColor: colors.input, borderColor: validation ? colors.destructive : colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TextInput
            testID="cash-preview-amount"
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              if (validation) setValidation(null);
            }}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={[styles.amountInput, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
          />
          <Text style={[styles.amountCurrency, { color: colors.primary }]}>{selectedCurrency}</Text>
        </View>
        {validation ? (
          <Text testID="cash-preview-validation" style={[styles.validation, { color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }]}>
            {validation}
          </Text>
        ) : null}

        <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('currency')}
        </Text>
        <View style={[styles.currencyReadout, { backgroundColor: colors.input, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.currencySymbol, { backgroundColor: colors.accent }]}>
            <Text style={[styles.currencySymbolText, { color: colors.primary }]}>{getCurrency(selectedCurrency).symbol}</Text>
          </View>
          <Text style={[styles.currencyReadoutCode, { color: colors.foreground }]}>{selectedCurrency}</Text>
          <Text style={[styles.currencyReadoutName, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(getCurrency(selectedCurrency).nameKey)}
          </Text>
        </View>

        <Text style={[styles.inputLabel, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('optionalNote')}
        </Text>
        <TextInput
          testID="cash-preview-note"
          value={note}
          onChangeText={setNote}
          placeholder={t('notePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[styles.noteInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
        />

        <View style={[styles.sheetButtons, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            testID="cash-preview-cancel"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            testID="cash-preview-confirm"
            accessibilityRole="button"
            onPress={() => void confirmTransaction()}
            disabled={isSaving}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
          >
            <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('confirm')}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function NoticeSheet({
  action,
  onClose,
}: {
  action: NoticeAction;
  onClose: () => void;
}) {
  const colors = useColors();
  const { profile } = useStore();
  const { t, isRTL } = useI18n();
  const titleKey = action === 'credit' ? 'quickActionCredit' : 'quickActionSettlement';
  return (
    <View style={[styles.sheet, styles.noticeSheet, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>
      <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.sheetContent}>
        <View style={styles.sheetHandleWrap}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        </View>
        <SheetHeader title={t(titleKey)} subtitle={t('cashPreviewHint')} icon="time-outline" onClose={onClose} />
        <QuickCurrencyPicker selectedCurrency={profile.currency} />
        <View style={[styles.noticeCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
          <Text style={[styles.noticeTitle, { color: colors.foreground, textAlign: 'center' }]}>{t('underDevelopment')}</Text>
          <Text style={[styles.noticeHint, { color: colors.mutedForeground, textAlign: 'center' }]}>{t('actionUnavailableHint')}</Text>
        </View>
        <Pressable
          testID="quick-notice-close"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.primaryButton, styles.fullButton, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('close')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function FloatingQuickActions() {
  const colors = useColors();
  const { addTransaction } = useStore();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isMenuMounted, setIsMenuMounted] = useState<boolean>(false);
  const [cashAction, setCashAction] = useState<CashAction | null>(null);
  const [noticeAction, setNoticeAction] = useState<NoticeAction | null>(null);
  const menuProgress = useRef<Animated.Value>(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(menuProgress, {
      toValue: isMenuOpen ? 1 : 0,
      duration: 220,
      easing: isMenuOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !isMenuOpen) {
        setIsMenuMounted(false);
      }
    });
    return () => animation.stop();
  }, [isMenuOpen, menuProgress]);

  const openMenu = () => {
    setCashAction(null);
    setNoticeAction(null);
    if (!isMenuOpen) {
      setIsMenuMounted(true);
    }
    setIsMenuOpen((current) => !current);
    void Haptics.selectionAsync();
  };

  const openCashSheet = (action: CashAction) => {
    setIsMenuOpen(false);
    setCashAction(action);
  };

  const closeSheet = () => {
    setCashAction(null);
    setNoticeAction(null);
  };

  const menuAnimatedStyle = {
    opacity: menuProgress,
  };
  const fabAnimatedStyle = {
    transform: [{ rotate: menuProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }],
  };
  const hasSheet = Boolean(cashAction || noticeAction);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.floatingLayer]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.menuScrim, { bottom: 84 + insets.bottom, backgroundColor: colors.overlay, opacity: menuProgress }]}
      />
      {isMenuOpen ? (
        <Pressable
          testID="quick-actions-backdrop"
          accessibilityLabel={t('close')}
          onPress={() => setIsMenuOpen(false)}
          style={[styles.menuBackdrop, { bottom: 84 + insets.bottom }]}
        />
      ) : null}
      {isMenuMounted ? (
        <Animated.View
          testID="quick-actions-menu"
          pointerEvents={isMenuOpen ? 'auto' : 'none'}
          style={[
            styles.menu,
            isRTL ? styles.menuRTL : styles.menuLTR,
            { bottom: 163 + insets.bottom, backgroundColor: colors.glassStrong, borderColor: colors.border },
            menuAnimatedStyle,
          ]}
        >
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.menuContent}>
            <View style={[styles.menuHeader, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.menuTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('quickActions')}</Text>
              <Text style={[styles.menuHint, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{t('quickActionsMenuHint')}</Text>
            </View>
            <View style={[styles.menuGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  testID={`quick-action-${item.id}`}
                  label={t(item.labelKey)}
                  icon={item.icon}
                  isRTL={isRTL}
                  onPress={() => {
                    if (item.id === 'cash-in' || item.id === 'cash-out') {
                      openCashSheet(item.id);
                    } else {
                      setIsMenuOpen(false);
                      setNoticeAction(item.id);
                    }
                  }}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}

      {!hasSheet ? (
        <Pressable
          testID="floating-action-button"
          accessibilityRole="button"
          accessibilityLabel={t('quickActions')}
          onPress={openMenu}
          style={({ pressed }) => [
            styles.fab,
            isRTL ? styles.fabRTL : styles.fabLTR,
            { bottom: 94 + insets.bottom, backgroundColor: colors.primary, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          <Animated.View style={fabAnimatedStyle}>
            <Ionicons name="add" size={28} color={colors.primaryForeground} />
          </Animated.View>
        </Pressable>
      ) : null}

      <Modal
        transparent
        visible={hasSheet}
        animationType="fade"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable testID="quick-sheet-backdrop" onPress={closeSheet} style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} />
          {cashAction ? <CashTransactionSheet action={cashAction} onClose={closeSheet} onSave={addTransaction} /> : null}
          {noticeAction ? <NoticeSheet action={noticeAction} onClose={closeSheet} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingLayer: { zIndex: 100 },
  menuScrim: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  menuBackdrop: { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 2 },
  menu: {
    position: 'absolute',
    zIndex: 3,
    width: '84%',
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  menuLTR: { right: 18 },
  menuRTL: { left: 18 },
  menuContent: { paddingHorizontal: 10, paddingTop: 13, paddingBottom: 7 },
  menuHeader: { paddingHorizontal: 7, paddingBottom: 9 },
  menuTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  menuHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  menuItem: {
    width: '50%',
    minHeight: 57,
    borderBottomWidth: 1,
  },
  menuItemContent: { flex: 1, alignItems: 'center', gap: 10, paddingHorizontal: 7 },
  menuIcon: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  fab: {
    position: 'absolute',
    zIndex: 4,
    width: 60,
    height: 60,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  fabLTR: { right: 19 },
  fabRTL: { left: 19 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '92%',
    maxWidth: 430,
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  noticeSheet: { maxHeight: '54%' },
  sheetContent: { padding: 16, paddingTop: 10 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 12 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2 },
  sheetHeader: { alignItems: 'center', gap: 11, marginBottom: 16 },
  sheetHeaderIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetHeaderCopy: { flex: 1 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sheetSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  sheetClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  previewBanner: { borderWidth: 1, borderRadius: 15, padding: 11, gap: 8, alignItems: 'center', marginBottom: 17 },
  previewBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 17 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  amountRow: { minHeight: 52, borderWidth: 1, borderRadius: 15, alignItems: 'center', paddingHorizontal: 13, gap: 10 },
  amountInput: { flex: 1, minHeight: 50, fontSize: 20, fontFamily: 'Inter_700Bold' },
  amountCurrency: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  validation: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 5, marginBottom: 8 },
  currencyReadout: { minHeight: 52, borderWidth: 1, borderRadius: 15, alignItems: 'center', paddingHorizontal: 10, gap: 9, marginBottom: 15 },
  currencySymbol: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  currencySymbolText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  currencyReadoutCode: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  currencyReadoutName: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  noteInput: { minHeight: 76, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13, fontFamily: 'Inter_400Regular', textAlignVertical: 'top', marginBottom: 18 },
  sheetButtons: { alignItems: 'center', gap: 9 },
  secondaryButton: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  primaryButton: { flex: 1, minHeight: 49, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 7, flexDirection: 'row' },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  fullButton: { width: '100%', flex: 0, marginTop: 18 },
  quickCurrencyPicker: { marginBottom: 17 },
  quickCurrencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 2 },
  quickCurrencyOption: { flexGrow: 1, minWidth: 82, minHeight: 40, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  quickCurrencySymbolText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  quickCurrencyCode: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  emptyQuickHint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 4 },
  noticeCard: { alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 24 },
  noticeTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 10 },
  noticeHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 6 },
});