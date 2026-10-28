import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MerchantButton, MerchantField } from './MerchantAccountUI';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/context/StoreContext';
import { merchantStatementText } from '@/constants/merchantStatementText';
import { localMerchantDate } from '@/data/merchantSettings';
import { merchantStatement, type MerchantStatement, type StatementProof } from '@/data/merchantStatement';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import { authorizeMerchantStatement } from '@/services/merchantStatementAccess';
import { merchantStatementHtml } from '@/services/merchantStatementHtml';
import { saveMerchantStatement } from '@/services/saveMerchantStatement';
import type { Merchant, MerchantOperation } from '@/types/merchant';

export function MerchantStatementModal({
  merchant,
  operations,
  operationsLimited,
  historyLoading,
  loadMore,
  onClose,
}: {
  merchant: Merchant;
  operations: MerchantOperation[];
  operationsLimited: boolean;
  historyLoading: boolean;
  loadMore: () => Promise<unknown>;
  onClose: () => void;
}) {
  const store = useStore(),
    { language, isRTL, t } = useI18n(),
    colors = useColors(),
    insets = useSafeAreaInsets();
  const copy = merchantStatementText[language];
  const [period, setPeriod] = useState(false),
    [from, setFrom] = useState(localMerchantDate()),
    [to, setTo] = useState(localMerchantDate());
  const [preview, setPreview] = useState<{
    statement: MerchantStatement;
    proof: StatementProof[];
    issuedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const alive = useRef(true);
  const scope = JSON.stringify([
    store.sessionKey,
    store.activeSpaceId,
    store.profile.id,
    store.workspaceRole,
    store.canWriteBusiness,
    store.activeSpaceLoading,
    store.activeSpaceError,
    merchant.id,
  ]);
  const current = useRef(scope),
    received = useRef(operations);
  current.current = scope;
  received.current = operations;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrent = () => alive.current && current.current === scope && store.canWriteBusiness;
  const assertCurrent = () => {
    if (!isCurrent() || store.activeSpaceId !== merchant.workspaceId || store.profile.id !== merchant.storeId)
      throw new Error('exportScopeChanged');
    store.assertBusinessAccess(merchant.workspaceId, store.sessionKey);
  };
  const proof = async () => {
    assertCurrent();
    const result = await authorizeMerchantStatement(merchant.workspaceId, merchant.storeId, merchant.id);
    assertCurrent();
    return result;
  };
  const project = (verified: StatementProof[]) =>
    merchantStatement({
      spaceId: merchant.workspaceId,
      storeId: merchant.storeId,
      merchantId: merchant.id,
      operations: received.current,
      proof: verified,
      ...(period ? { from, to } : {}),
    });
  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setPreview(null);
    try {
      const verified = await proof(),
        statement = project(verified);
      if (isCurrent()) setPreview({ statement, proof: verified, issuedAt: new Date().toISOString() });
    } catch {
      if (isCurrent()) setMessage(copy.error);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const output = async (mode: 'save' | 'share') => {
    if (!preview || busy) return;
    setBusy(true);
    setMessage('');
    try {
      assertCurrent();
      const html = merchantStatementHtml({
        statement: preview.statement,
        language,
        merchantName: merchant.name,
        storeName: store.profile.name,
        issuedAt: preview.issuedAt,
        ...(period ? { from, to } : {}),
      });
      const result = await saveMerchantStatement(html, mode, isCurrent, async () => {
        const verified = await proof();
        // A new operation during preview requires a new preview; never export a silently stale/partial account.
        const sort = (rows: StatementProof[]) => [...rows].sort((a, b) => a.currency.localeCompare(b.currency));
        if (JSON.stringify(sort(verified)) !== JSON.stringify(sort(preview.proof)))
          throw new Error('merchantStatementChanged');
        project(verified);
      });
      if (isCurrent())
        setMessage(
          result === 'saved'
            ? copy.saved
            : result === 'shared'
              ? copy.shared
              : result === 'print-dialog'
                ? copy.web
                : '',
        );
    } catch {
      if (isCurrent()) setMessage(`${copy.error}${Platform.OS !== 'web' ? ` ${copy.native}` : ''}`);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  if (!store.canWriteBusiness) return null;
  const style = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
        <ScrollView
          style={{
            maxHeight: '92%',
            flexGrow: 0,
            backgroundColor: colors.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          contentContainerStyle={{ padding: 22, gap: 14, paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ ...style, flex: 1, fontFamily: 'Inter_700Bold', fontSize: 20 }}>{copy.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} disabled={busy} onPress={onClose}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.input, opacity: busy ? 0.45 : 1 }}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={{ gap: 12, padding: 14, backgroundColor: colors.input, borderRadius: 18 }}>
          <Text style={{ ...style, fontWeight: '600' }}>{copy.periodLabel}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={copy.periodLabel} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
            {[false, true].map((value) => (
              <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: period === value, disabled: busy }}
                disabled={busy} onPress={() => { setPeriod(value); setPreview(null); }}
                style={{ flex: 1, minHeight: 48, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: period === value ? colors.primary : colors.border,
                  backgroundColor: colors.card, opacity: busy ? 0.45 : 1, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Ionicons name={period === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={period === value ? colors.primary : colors.mutedForeground} />
                <Text style={{ ...style, flexShrink: 1, fontWeight: '600' }}>{value ? copy.period : copy.all}</Text>
              </Pressable>
            ))}
          </View>
          {period ? (
            <>
              <MerchantField
                title={`${copy.from} (YYYY-MM-DD)`}
                value={from}
                disabled={busy}
                onChange={(value) => {
                  setFrom(value);
                  setPreview(null);
                }}
              />
              <MerchantField
                title={`${copy.to} (YYYY-MM-DD)`}
                value={to}
                disabled={busy}
                onChange={(value) => {
                  setTo(value);
                  setPreview(null);
                }}
              />
            </>
          ) : null}
          </View>
          {operationsLimited ? (
            <>
              <Text style={style}>{copy.consent}</Text>
              <MerchantButton
                testID="merchant-statement-load-consent"
                title={t('merchantHistoryMore')}
                disabled={busy || historyLoading}
                onPress={() => {
                  setPreview(null);
                  void loadMore();
                }}
              />
            </>
          ) : null}
          <MerchantButton
            testID="merchant-statement-preview"
            title={copy.preview}
            selected
            disabled={busy || historyLoading || operationsLimited}
            onPress={prepare}
          />
          {preview ? (
            <View style={{ gap: 12 }}>
              <Text style={{ ...style, color: colors.mutedForeground }}>{copy.note}</Text>
              {preview.statement.totals.map((total) => (
                <View key={total.currency} style={{ gap: 5 }}>
                  <Text style={style}>{total.currency}</Text>
                  {(['opening', 'purchases', 'payments', 'adjustments', 'closing'] as const).map((key) => (
                    <Text key={key} style={style}>
                      {copy[key]}: {formatExactMoney(total[key], total.currency, language)}
                    </Text>
                  ))}
                </View>
              ))}
              {preview.statement.rows.map((row, index) => (
                <Text key={index} style={style}>
                  {row.date} · {row.kind === 'opening' ? copy.openingRow : copy[row.kind]} · {row.description} ·{' '}
                  {row.method} · {formatExactMoney(row.amount, row.currency, language)}
                </Text>
              ))}
              <MerchantButton
                testID="merchant-statement-save"
                title={copy.save}
                disabled={busy}
                onPress={() => void output('save')}
              />
              {Platform.OS !== 'web' ? (
                <MerchantButton title={copy.share} disabled={busy} onPress={() => void output('share')} />
              ) : (
                <Text style={style}>{copy.web}</Text>
              )}
            </View>
          ) : null}
          {message ? (
            <Text accessibilityRole="alert" style={style}>
              {message}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
