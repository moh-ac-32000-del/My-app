import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { localExportStatus, readLocalExportData, subscribeLocalExportCache } from '@/services/localExportCache';
import { projectLocalExportSnapshot } from '@/services/localExportProjection';
import { exportLabels } from '@/constants/exportLabels';
import { exportFileName, spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { saveSpreadsheet } from '@/services/saveSpreadsheet';

type Message = 'exportSaved' | 'exportShared' | 'exportDownloadRequested' | 'exportFailed';
export function SpreadsheetExportSettings() {
  const { language } = useI18n();
  const { activeSpaceId, profile, isAuthenticated } = useStore();
  const uid = isFirebaseConfigured && isAuthenticated ? getFirebaseAuth().currentUser?.uid : null;
  const key = uid && activeSpaceId && profile.id ? `${uid}/${activeSpaceId}/${profile.id}` : '';
  const current = useRef(key); current.current = key;
  const lock = useRef(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setRevision] = useState(0);
  useEffect(() => subscribeLocalExportCache(() => setRevision((value) => value + 1)), []);
  const scope = { uid: uid ?? '', spaceId: activeSpaceId ?? '', storeId: profile.id };
  const status = localExportStatus(scope);
  const missing = status.filter((entry) => !entry.capturedAt);
  const ready = !!key && missing.length === 0;
  const [message, setMessage] = useState<{ key: string; kind: Message } | null>(null);
  const run = async () => {
    if (!uid || !activeSpaceId || !key || !ready || confirmKey !== key || lock.current) return;
    lock.current = true; setBusy(true); setMessage(null); setConfirmKey(null);
    const isCurrent = () => current.current === key && getFirebaseAuth().currentUser?.uid === uid;
    try {
      const local = readLocalExportData(scope);
      const snapshot = projectLocalExportSnapshot(scope, profile.name, local.records, local.capturedAt, new Date().toISOString());
      if (!isCurrent()) return;
      const bytes = spreadsheetBytes(snapshot, language);
      if (!isCurrent()) return;
      const result = await saveSpreadsheet(bytes, exportFileName(snapshot.exportedAt), isCurrent);
      if (isCurrent() && result !== 'cancelled') setMessage({ key, kind: result === 'saved' ? 'exportSaved' : result === 'shared' ? 'exportShared' : 'exportDownloadRequested' });
    } catch { if (isCurrent()) setMessage({ key, kind: 'exportFailed' }); }
    finally { lock.current = false; setBusy(false); }
  };
  return <SpreadsheetExportCard available={ready} count={status.length - missing.length}
    missingNames={missing.map((entry) => exportLabels[language][entry.collection])}
    confirming={confirmKey === key && ready} busy={busy} message={message?.key === key ? message.kind : null}
    onStart={() => { setMessage(null); setConfirmKey(key); }} onConfirm={() => void run()} onCancel={() => setConfirmKey(null)} />;
}

/** Presentational view shared with the isolated, synthetic UI acceptance fixture. */
export function SpreadsheetExportCard({ available, count, missingNames, confirming, busy, message, onStart, onConfirm, onCancel }: {
  available: boolean; count: number; missingNames: string[]; confirming: boolean; busy: boolean; message: Message | null;
  onStart: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  return <GlassCard testID="spreadsheet-export-section" style={styles.card}>
    <View style={[row, styles.heading]}>
      <View style={[styles.icon, { backgroundColor: colors.accent }]}><Ionicons name="document-text-outline" size={25} color={colors.primary} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, align, { color: colors.foreground }]}>{t('exportSpreadsheetTitle')}</Text>
        <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('exportSpreadsheetHint')}</Text>
      </View>
    </View>
    <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{t('exportScopeHint')}</Text>
    <Text testID="local-export-coverage" style={[styles.hint, align, { color: available ? colors.success : colors.mutedForeground }]}>{t('exportLocalCoverage')} {count}/5{missingNames.length ? ' — ' + missingNames.join('، ') : ''}</Text>
    <View style={[styles.warning, { backgroundColor: `${colors.destructive}12` }]}>
      <Text style={[styles.hint, align, { color: colors.destructive }]}>{t('exportPrivacyWarning')}</Text>
    </View>
    {confirming ? <View style={styles.confirm}>
      <Text style={[styles.hint, align, { color: colors.foreground }]}>{t('exportConfirmHint')}</Text>
      <Pressable testID="confirm-spreadsheet-export" accessibilityRole="button" disabled={!available || busy} onPress={onConfirm} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.title, { color: colors.primaryForeground }]}>{t('exportConfirm')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}><Text style={{ color: colors.mutedForeground }}>{t('cancel')}</Text></Pressable>
    </View> : <Pressable testID="start-spreadsheet-export" accessibilityRole="button" disabled={!available || busy} onPress={onStart} style={[styles.button, row, { backgroundColor: colors.accent, opacity: !available || busy ? 0.6 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="download-outline" size={21} color={colors.primary} />}
      <Text style={[styles.title, { color: colors.primary }]}>{t(busy ? 'exportPreparing' : 'exportSpreadsheetAction')}</Text>
    </Pressable>}
    {message ? <Text accessibilityLiveRegion="polite" style={[styles.hint, align, { color: message === 'exportFailed' ? colors.destructive : colors.success }]}>{t(message)}</Text> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, gap: 14 }, heading: { alignItems: 'center', gap: 12 }, copy: { flex: 1, gap: 5 },
  icon: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' }, hint: { fontSize: 12, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  warning: { padding: 12, borderRadius: 12 }, button: { minHeight: 49, borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 9 },
  confirm: { gap: 8 }, cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
