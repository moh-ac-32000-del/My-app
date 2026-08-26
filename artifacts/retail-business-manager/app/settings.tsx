import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/constants/i18n';
import { accentOptions, type AccentColor } from '@/constants/colors';
import { CURRENCY_OPTIONS, getCurrency, type CurrencyCode } from '@/constants/currencies';

function SettingInput({ label, value, onChangeText, icon, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; icon: React.ComponentProps<typeof Ionicons>['name']; multiline?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }, multiline && styles.multilineWrap]}>
        <Ionicons name={icon} size={18} color={colors.mutedForeground} />
        <TextInput value={value} onChangeText={onChangeText} multiline={multiline} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground }, multiline && styles.multilineInput]} />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, saveProfile, resetLocalSession } = useStore();
  const [name, setName] = useState<string>(profile.name);
  const [phone, setPhone] = useState<string>(profile.phone);
  const [address, setAddress] = useState<string>(profile.address);
  const [currency, setCurrency] = useState<CurrencyCode>(profile.currency);
  const [accent, setAccent] = useState<AccentColor>(profile.accent);
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState<boolean>(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert(translate('storeName', profile.language), translate('fieldRequired', profile.language));
      return;
    }
    await saveProfile({ name: name.trim(), phone: phone.trim(), address: address.trim(), currency, accent });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(translate('saved', profile.language));
  };

  const selectCurrency = async (nextCurrency: CurrencyCode) => {
    setCurrency(nextCurrency);
    setIsCurrencyPickerOpen(false);
    await saveProfile({ currency: nextCurrency });
    await Haptics.selectionAsync();
  };

  const selectAccent = async (nextAccent: AccentColor) => {
    setAccent(nextAccent);
    await saveProfile({ accent: nextAccent });
    await Haptics.selectionAsync();
  };

  const logout = async () => {
    await resetLocalSession();
    router.replace('/login');
  };

  return (
    <AppShell>
      <PageHeader title={translate('settings', profile.language)} subtitle={translate('storeIdentityHint', profile.language)} />
      <SectionTitle title={translate('storeIdentity', profile.language)} />
      <GlassCard style={styles.card}>
        <View style={styles.logoRow}>
          <View style={[styles.logo, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="storefront-outline" size={27} color={colors.primary} />
          </View>
          <View style={styles.logoCopy}>
            <Text style={[styles.logoTitle, { color: colors.foreground }]}>{translate('logo', profile.language)}</Text>
            <Text style={[styles.logoHint, { color: colors.mutedForeground }]}>{translate('logoHint', profile.language)}</Text>
          </View>
          <Pressable testID="logo-button" style={[styles.smallButton, { borderColor: colors.border }]} onPress={() => Alert.alert(translate('logo', profile.language), translate('logoHint', profile.language))}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <SettingInput label={translate('storeName', profile.language)} value={name} onChangeText={setName} icon="business-outline" />
        <SettingInput label={translate('storePhone', profile.language)} value={phone} onChangeText={setPhone} icon="call-outline" />
        <SettingInput label={translate('storeAddress', profile.language)} value={address} onChangeText={setAddress} icon="location-outline" multiline />
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{translate('currency', profile.language)}</Text>
        <Pressable
          testID="currency-picker"
          onPress={() => setIsCurrencyPickerOpen((current) => !current)}
          style={({ pressed }) => [styles.currencyPicker, { backgroundColor: colors.input, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name={isCurrencyPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          <View style={styles.currencyCopy}>
            <Text style={[styles.currencyCode, { color: colors.foreground }]}>{currency} · {getCurrency(currency).symbol}</Text>
            <Text style={[styles.currencyName, { color: colors.mutedForeground }]}>{getCurrency(currency).name}</Text>
          </View>
          <Ionicons name="cash-outline" size={18} color={colors.mutedForeground} />
        </Pressable>
        {isCurrencyPickerOpen ? (
          <View style={[styles.currencyOptions, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>
            {CURRENCY_OPTIONS.map((option) => {
              const selected = option.code === currency;
              return (
                <Pressable
                  key={option.code}
                  testID={`currency-${option.code}`}
                  onPress={() => void selectCurrency(option.code)}
                  style={({ pressed }) => [styles.currencyOption, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.accent }, pressed && styles.pressed]}
                >
                  <Text style={[styles.currencySymbol, { color: selected ? colors.primary : colors.foreground }]}>{option.symbol}</Text>
                  <View style={styles.currencyCopy}>
                    <Text style={[styles.currencyCode, { color: colors.foreground }]}>{option.code}</Text>
                    <Text style={[styles.currencyName, { color: colors.mutedForeground }]}>{option.name}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={19} color={colors.primary} /> : <View style={{ width: 19 }} />}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </GlassCard>

      <SectionTitle title={translate('accentColor', profile.language)} />
      <GlassCard style={styles.card}>
        <View style={styles.colorRow}>
          {accentOptions.map((item) => (
            <Pressable key={item.key} testID={`accent-${item.key}`} onPress={() => void selectAccent(item.key)} style={[styles.colorOption, { backgroundColor: item.color }, accent === item.key && { borderColor: colors.foreground, borderWidth: 3 }]}>
              {accent === item.key ? <Ionicons name="checkmark" size={18} color={colors.primaryForeground} /> : null}
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <SectionTitle title={translate('preferences', profile.language)} />
      <GlassCard style={styles.card}>
        <View style={styles.preferenceRow}>
          <View style={[styles.preferenceIcon, { backgroundColor: colors.accent }]}><Ionicons name="language-outline" size={18} color={colors.primary} /></View>
          <View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.foreground }]}>{translate('language', profile.language)}</Text><Text style={[styles.preferenceHint, { color: colors.mutedForeground }]}>العربية (RTL)</Text></View>
          <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.preferenceRow}>
          <View style={[styles.preferenceIcon, { backgroundColor: colors.accent }]}><Ionicons name="notifications-outline" size={18} color={colors.primary} /></View>
          <View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.foreground }]}>{translate('notifications', profile.language)}</Text><Text style={[styles.preferenceHint, { color: colors.mutedForeground }]}>{translate('underDevelopment', profile.language)}</Text></View>
          <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
        </View>
      </GlassCard>

      <GlassCard style={[styles.cloudCard, { borderColor: colors.primary }]}>
        <View style={[styles.cloudIcon, { backgroundColor: colors.accent }]}><Ionicons name="cloud-done-outline" size={22} color={colors.primary} /></View>
        <View style={styles.cloudCopy}><Text style={[styles.cloudTitle, { color: colors.foreground }]}>{translate('cloudReady', profile.language)}</Text><Text style={[styles.cloudHint, { color: colors.mutedForeground }]}>{translate('cloudReadyHint', profile.language)}</Text></View>
      </GlassCard>

      <Pressable testID="save-settings" onPress={() => void save()} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
        <Ionicons name="checkmark-circle-outline" size={19} color={colors.primaryForeground} />
        <Text style={[styles.saveText, { color: colors.primaryForeground }]}>{translate('saveChanges', profile.language)}</Text>
      </Pressable>
      <Pressable testID="logout-button" onPress={() => void logout()} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
        <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>{translate('logout', profile.language)}</Text>
      </Pressable>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 20 },
  logoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, marginBottom: 20 },
  logo: { width: 52, height: 52, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoCopy: { flex: 1, alignItems: 'flex-end' },
  logoTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  logoHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'right' },
  smallButton: { width: 35, height: 35, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'right', marginBottom: 7 },
  inputWrap: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  multilineWrap: { minHeight: 74, alignItems: 'flex-start', paddingVertical: 13 },
  input: { flex: 1, minHeight: 46, textAlign: 'right', fontSize: 14, fontFamily: 'Inter_400Regular' },
  multilineInput: { minHeight: 48, textAlignVertical: 'top' },
  colorRow: { flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'center' },
  colorOption: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  currencyPicker: { minHeight: 58, borderWidth: 1, borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 13, marginBottom: 14 },
  currencyCopy: { flex: 1, alignItems: 'flex-end' },
  currencyCode: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  currencyName: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 3 },
  currencySymbol: { minWidth: 26, fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  currencyOptions: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginTop: -4, marginBottom: 14 },
  currencyOption: { minHeight: 58, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderBottomWidth: 1 },
  preferenceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  preferenceIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  preferenceCopy: { flex: 1, alignItems: 'flex-end' },
  preferenceTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  preferenceHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  divider: { height: 1, marginVertical: 14 },
  cloudCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, marginBottom: 18 },
  cloudIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cloudCopy: { flex: 1, alignItems: 'flex-end' },
  cloudTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  cloudHint: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', lineHeight: 17, marginTop: 3 },
  saveButton: { minHeight: 52, borderRadius: 17, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  saveText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  logoutButton: { minHeight: 48, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});