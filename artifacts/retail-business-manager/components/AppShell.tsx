import React, { ReactNode } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View, type FlatListProps } from 'react-native';
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
  { path: '/customers', label: 'customers', icon: 'people-outline' },
  { path: '/merchants', label: 'merchants', icon: 'storefront-outline' },
  { path: '/archive', label: 'archive', icon: 'archive-outline' },
  { path: '/settings', label: 'settings', icon: 'settings-outline' },
];

export function AppBackground({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { direction } = useI18n();
  return (
    <View style={[styles.background, { backgroundColor: colors.background, direction }]}>
      {children}
    </View>
  );
}

type ShellList<T> = Pick<FlatListProps<T>, 'data' | 'renderItem' | 'keyExtractor' | 'ListEmptyComponent' | 'extraData'> & { testID: string };

export function AppShell<T>({ children, scroll = true, list, overlay }: {
  children: ReactNode; scroll?: boolean; list?: ShellList<T>; overlay?: ReactNode;
}) {
  const colors = useColors();
  const { isRTL, direction, t } = useI18n();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { profile, workspaceRole, activeSpaceError, isAuthenticated, retryActiveSpace, sessionKey } = useStore();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const blocked = isAuthenticated && (activeSpaceError || !workspaceRole) && pathname !== '/workspaces' && pathname !== '/settings';
  const body = <>
      {blocked ? (
        <View style={{ gap: 18 }}>
          <Text style={{ color: colors.foreground }}>{t('workspaceUnavailable')}</Text>
          <Pressable accessibilityRole="button" onPress={retryActiveSpace} style={{ padding: 16 }}><Text style={{ color: colors.primary }}>{t('tryAgain')}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/workspaces' as never)} style={{ padding: 16 }}><Text style={{ color: colors.primary }}>{t('workspaces')}</Text></Pressable>
        </View>
      ) : <>
        {workspaceRole === 'viewer' ? <Text testID="workspace-read-only" style={{ color: colors.primary, marginBottom: 16, textAlign: isRTL ? 'right' : 'left' }}>{t('workspaceReadOnly')}</Text> : null}
        {children}
      </>}
    </>;
  const contentStyle = [styles.content, { direction, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }];
  const footer = <View style={{ height: 112 + bottomInset }} />;
  const content = (
    <View style={contentStyle}>
      {body}
      {footer}
    </View>
  );

  return (
    <AppBackground>
      {list ? (
        <FlatList
          key={sessionKey}
          {...list}
          data={blocked ? [] : list.data}
          ListEmptyComponent={blocked ? null : list.ListEmptyComponent}
          style={{ flex: 1 }}
          contentContainerStyle={contentStyle}
          ListHeaderComponent={body}
          ListFooterComponent={footer}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      ) : scroll ? (
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
      {!blocked ? overlay : null}
      <View style={[styles.navWrap, { paddingBottom: bottomInset }]}>
        <View style={[styles.nav, { backgroundColor: colors.glassStrong, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {primaryNav.map((item) => {
            const active = item.path === '/' ? pathname === '/' : item.path === '/merchants'
              ? pathname.startsWith('/merchant') : pathname.startsWith(item.path);
            return (
              <Pressable
                key={item.path}
                testID={`nav-${item.label}`}
                  onPress={() => { if (pathname !== item.path) router.replace(item.path as never); }}
                style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
              >
                <View style={[styles.navIcon, active && { backgroundColor: colors.accent }]}>
                  <Ionicons name={item.icon} size={19} color={active ? colors.primary : colors.mutedForeground} />
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.navLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
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
  header: { marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, alignItems: 'flex-end' },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  eyebrow: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  pageTitle: { fontSize: 23, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  pageSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 5, textAlign: 'right' },
  iconButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, overflow: 'hidden' },
  sectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  sectionAction: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyCard: { alignItems: 'center', paddingVertical: 28, marginBottom: 18 },
  emptyIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21, marginTop: 7, maxWidth: 260 },
  navWrap: { position: 'absolute', left: 12, right: 12, bottom: 0, paddingTop: 8 },
  blurNav: { borderRadius: 28 },
  nav: { height: 66, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 4, overflow: 'hidden' },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 48, gap: 3 },
  navIcon: { width: 35, height: 29, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.7 },
});
