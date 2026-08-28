import React, { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/constants/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const primaryNav: Array<{ path: string; label: TranslationKey; icon: IconName }> = [
  { path: '/', label: 'dashboard', icon: 'grid-outline' },
  { path: '/sales', label: 'sales', icon: 'receipt-outline' },
  { path: '/purchases', label: 'purchases', icon: 'bag-handle-outline' },
  { path: '/customers', label: 'customers', icon: 'people-outline' },
  { path: '/settings', label: 'settings', icon: 'settings-outline' },
];

export function AppBackground({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { direction } = useI18n();
  return (
    <View style={[styles.background, { backgroundColor: colors.background, direction }]}>
      <LinearGradient
        colors={[colors.glow, 'transparent', 'transparent']}
        start={{ x: 0.9, y: 0 }}
        end={{ x: 0.1, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbTop, { backgroundColor: colors.glow }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: colors.accent }]} />
      {children}
    </View>
  );
}

export function AppShell({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const { isRTL, direction, t } = useI18n();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useStore();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const content = (
    <View style={[styles.content, { direction, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
      {children}
      <View style={{ height: 112 + bottomInset }} />
    </View>
  );

  return (
    <AppBackground>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      <View style={[styles.navWrap, { paddingBottom: bottomInset }]}>
        <BlurView intensity={55} tint="dark" style={[StyleSheet.absoluteFill, styles.blurNav]} />
        <View style={[styles.nav, { backgroundColor: colors.glassStrong, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {primaryNav.map((item) => {
            const active = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
            return (
              <Pressable
                key={item.path}
                testID={`nav-${item.label}`}
                  onPress={() => router.replace(item.path as never)}
                style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
              >
                <View style={[styles.navIcon, active && { backgroundColor: colors.accent }]}>
                  <Ionicons name={item.icon} size={19} color={active ? colors.primary : colors.mutedForeground} />
                </View>
                <Text style={[styles.navLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
                  {t(item.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </AppBackground>
  );
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  action,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
}) {
  const colors = useColors();
  const router = useRouter();
  const { profile } = useStore();
  const { isRTL, t } = useI18n();
  return (
    <View style={styles.header}>
      <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {showBack ? (
          <Pressable
            testID="back-button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.glass, borderColor: colors.border }, pressed && styles.pressed]}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={colors.foreground} />
          </Pressable>
        ) : (
          <View style={[styles.brandMark, { backgroundColor: colors.glow, borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="storefront-outline" size={22} color={colors.primary} />
          </View>
        )}
          <View style={[styles.headerText, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.eyebrow, { color: colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>{showBack ? (profile.name || t('storeNameDefault')) : t('appName')}</Text>
          <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
          {subtitle ? <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text> : null}
        </View>
        {action ?? <View style={{ width: 42 }} />}
      </View>
    </View>
  );
}

export function GlassCard({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
  const colors = useColors();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  const colors = useColors();
  const { isRTL } = useI18n();
  return (
    <View style={[styles.sectionTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
      {action ? <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint: string }) {
  const colors = useColors();
  return (
    <GlassCard style={styles.emptyCard}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{hint}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, overflow: 'hidden' },
  orb: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.28 },
  orbTop: { top: -170, right: -110 },
  orbBottom: { bottom: -180, left: -150 },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: 18 },
  header: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, alignItems: 'flex-end' },
  brandMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  pageTitle: { fontSize: 27, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  pageSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 5, textAlign: 'right' },
  iconButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 24, borderWidth: 1, padding: 16, overflow: 'hidden' },
  sectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  sectionAction: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyCard: { alignItems: 'center', paddingVertical: 28, marginBottom: 18 },
  emptyIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21, marginTop: 7, maxWidth: 260 },
  navWrap: { position: 'absolute', left: 12, right: 12, bottom: 0, paddingTop: 8 },
  blurNav: { borderRadius: 28 },
  nav: { height: 72, borderRadius: 28, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 7, overflow: 'hidden' },
  navItem: { alignItems: 'center', justifyContent: 'center', width: 61, gap: 3 },
  navIcon: { width: 35, height: 29, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.7 },
});