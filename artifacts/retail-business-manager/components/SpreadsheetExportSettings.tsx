import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './AppShell';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { LOCAL_EXPORT_COLLECTIONS, localExportEpoch, localExportStatus, subscribeLocalExportCache } from '@/services/localExportCache';
import { prepareSpreadsheetExport, type ExportProgress } from '@/data/prepareSpreadsheetExport';
import { spreadsheetPreparationSource } from '@/services/spreadsheetPreparationFirestore';
import { spreadsheetPreparationText } from '@/constants/spreadsheetPreparationText';
import { exportLabels } from '@/constants/exportLabels';
import { exportFileName, spreadsheetBytes } from '@/services/spreadsheetWorkbook';
import { saveSpreadsheet } from '@/services/saveSpreadsheet';
import { merchantExportLabels } from '@/constants/merchantExportLabels';

type Message = 'exportSaved' | 'exportShared' | 'exportDownloadRequested' | 'exportFailed';
export function SpreadsheetExportSettings() {
  const { language } = useI18n();
  const { activeSpaceId, profile, isAuthenticated, isReady, sessionKey, workspaceRole, activeSpaceLoading, activeSpaceError, initializationError } = useStore();
  const epoch = localExportEpoch();
  const uid = isFirebaseConfigured && isAuthenticated ? getFirebaseAuth().currentUser?.uid : null;
  const key = uid && isReady && activeSpaceId && profile.id && workspaceRole && !activeSpaceLoading && !activeSpaceError && !initializationError
    ? `${uid}/${activeSpaceId}/${profile.id}/${sessionKey}/${workspaceRole}/${epoch}` : '';
  const current = useRef(key); current.current = key;
  const lock = useRef(false);
  const alive = useRef(true), cancel = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancel.current = true; }; }, []);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ key: string; value: ExportProgress } | null>(null);
  const [detail, setDetail] = useState<{ key: string; kind: 'changed' | 'tooLarge' | 'cancelled' } | null>(null);
  const [, setRevision] = useState(0);
  useEffect(() => subscribeLocalExportCache(() => setRevision((value) => value + 1)), []);
  const scope = { uid: uid ?? '', spaceId: activeSpaceId ?? '', storeId: profile.id };
  const status = localExportStatus(scope);
  const missing = status.filter((entry) => !entry.capturedAt);
  const ready = !!key && missing.length === 0;
  const [message, setMessage] = useState<{ key: string; kind: Message } | null>(null);
  const run = async () => {
    if (!uid || !activeSpaceId || !key || confirmKey !== key || lock.current) return;
    lock.current = true; cancel.current = false; setBusy(true); setMessage(null); setDetail(null); setProgress(null); setConfirmKey(null);
    const sameScope = () => alive.current && current.current === key && localExportEpoch() === epoch && getFirebaseAuth().currentUser?.uid === uid;
    const isCurrent = () => sameScope() && !cancel.current;
    try {
      const snapshot = await prepareSpreadsheetExport(scope, profile.name, spreadsheetPreparationSource, {
        isCurrent, allowReads: true, progress: value => { if (isCurrent()) setProgress({ key, value }); },
      });
      if (!isCurrent()) return;
      const bytes = spreadsheetBytes(snapshot, language);
      if (!isCurrent()) return;
      const result = await saveSpreadsheet(bytes, exportFileName(snapshot.exportedAt), isCurrent);
      if (isCurrent() && result !== 'cancelled') setMessage({ key, kind: result === 'saved' ? 'exportSaved' : result === 'shared' ? 'exportShared' : 'exportDownloadRequested' });
    } catch (error) {
      if (sameScope()) {
        const code = error instanceof Error ? error.message : '';
        if (cancel.current) setDetail({ key, kind: 'cancelled' });
        else if (code === 'exportTooLarge') setDetail({ key, kind: 'tooLarge' });
        else if (code === 'exportChangedDuringPreparation') setDetail({ key, kind: 'changed' });
        else setMessage({ key, kind: 'exportFailed' });
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <SpreadsheetExportCard available={ready} count={status.length - missing.length}
    missingNames={missing.map((entry) => ({ ...exportLabels[language], ...merchantExportLabels[language] })[entry.collection])}
    canPrepare={!!key} progress={progress?.key === key ? progress.value : null}
    detail={detail?.key === key ? spreadsheetPreparationText[language][detail.kind] : null}
    confirming={!!key && confirmKey === key} busy={busy} message={message?.key === key ? message.kind : null}
    onStart={() => { setMessage(null); setDetail(null); setConfirmKey(key); }} onConfirm={() => void run()}
    onCancel={() => { setConfirmKey(null); if (busy) cancel.current = true; }} />;
}

/** Presentational view shared with the isolated, synthetic UI acceptance fixture. */
export function SpreadsheetExportCard({ available, count, missingNames, confirming, busy, message, onStart, onConfirm, onCancel, canPrepare = false, progress, detail }: {
  available: boolean; count: number; missingNames: string[]; confirming: boolean; busy: boolean; message: Message | null;
  onStart: () => void; onConfirm: () => void; onCancel: () => void;
  canPrepare?: boolean; progress?: ExportProgress | null; detail?: string | null;
}) {
  const colors = useColors();
  const { t, isRTL, language } = useI18n();
  const copy = spreadsheetPreparationText[language], enabled = available || canPrepare;
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
    <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{copy.scope}</Text>
    <Text testID="local-export-coverage" style={[styles.hint, align, { color: available ? colors.success : colors.mutedForeground }]}>{t('exportLocalCoverage')} {count}/{LOCAL_EXPORT_COLLECTIONS.length}{missingNames.length ? ' — ' + missingNames.join('، ') : ''}</Text>
    {!available ? <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{copy.hint}</Text> : null}
    <View style={[styles.warning, { backgroundColor: `${colors.destructive}12` }]}>
      <Text style={[styles.hint, align, { color: colors.destructive }]}>{t('exportPrivacyWarning')}</Text>
    </View>
    {confirming ? <View style={styles.confirm}>
      <Text testID="spreadsheet-read-consent" style={[styles.hint, align, { color: colors.foreground }]}>{copy.confirm}</Text>
      {available ? <Text style={[styles.hint, align, { color: colors.mutedForeground }]}>{copy.localConfirm}</Text> : null}
      <Pressable testID="confirm-spreadsheet-export" accessibilityRole="button" disabled={!enabled || busy} onPress={onConfirm} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.title, { color: colors.primaryForeground }]}>{copy.confirmAction}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}><Text style={{ color: colors.mutedForeground }}>{t('cancel')}</Text></Pressable>
    </View> : <Pressable testID="start-spreadsheet-export" accessibilityRole="button" disabled={!enabled || busy} onPress={onStart} style={[styles.button, row, { backgroundColor: colors.accent, opacity: !enabled || busy ? 0.6 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="download-outline" size={21} color={colors.primary} />}
      <Text style={[styles.title, { color: colors.primary }]}>{busy ? t('exportPreparing') : copy.action}</Text>
    </Pressable>}
    {busy && progress ? <Text testID="spreadsheet-preparation-progress" accessibilityLiveRegion="polite" style={[styles.hint, align, { color: colors.primary }]}>
      {copy.progress} {({ ...exportLabels[language], ...merchantExportLabels[language] })[progress.collection]} · {progress.completed}/{progress.total} · {copy.received}: {progress.documents}
    </Text> : null}
    {busy ? <Pressable testID="cancel-spreadsheet-preparation" accessibilityRole="button" onPress={onCancel} style={styles.cancel}><Text style={{ color: colors.mutedForeground }}>{t('cancel')}</Text></Pressable> : null}
    {detail ? <Text accessibilityLiveRegion="polite" style={[styles.hint, align, { color: colors.destructive }]}>{detail}</Text> : null}
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
