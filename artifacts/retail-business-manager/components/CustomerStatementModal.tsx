import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { getFirebaseAuth } from '@/services/firebase';
import { readConfirmedCollection, localExportEpoch } from '@/services/localExportCache';
import { normalizeDebtDocument } from '@/services/debtFirestore';
import { normalizePaymentDocument } from '@/services/paymentFirestore';
import { customerCreditFromDocument } from '@/data/merchantDocuments';
import { customerStatement } from '@/data/customerStatement';
import { merchantStatementHtml } from '@/services/merchantStatementHtml';
import { authorizeCustomerStatement } from '@/services/customerStatementAccess';
import { saveMerchantStatement } from '@/services/saveMerchantStatement';
import { customerStatementText } from '@/constants/customerStatementText';
import { merchantStatementText } from '@/constants/merchantStatementText';
import { MerchantButton } from './MerchantAccountUI';
import type { Customer } from '@/types/business';

export function CustomerStatementModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const store = useStore(), { language, isRTL } = useI18n(), colors = useColors();
  const copy = customerStatementText[language], common = merchantStatementText[language];
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fingerprint = JSON.stringify([store.sessionKey, store.activeSpaceId, store.profile.id, customer.id, localExportEpoch(), store.canWriteBusiness, store.activeSpaceLoading, store.activeSpaceError]);
  const alive = useRef(true), initial = useRef(fingerprint).current;
  const current = useRef(initial);
  current.current = fingerprint;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const isCurrent = () => alive.current && current.current === initial && store.canWriteBusiness && !store.activeSpaceLoading && !store.activeSpaceError;
  const run = async (mode: 'save' | 'share') => {
    if (busy || !isCurrent()) return;
    setBusy(true); setFailed(false); setResult(null);
    try {
      const uid = getFirebaseAuth().currentUser?.uid, spaceId = store.activeSpaceId;
      if (!uid || !spaceId) throw new Error('exportScopeChanged');
      const scope = { uid, spaceId, storeId: store.profile.id };
      const read = () => {
        const collections = ['debts', 'payments', 'customerCredits'] as const;
        const rows = collections.map(name => readConfirmedCollection(scope, name));
        if (rows.some(value => value === null)) throw new Error('customerStatementIncomplete');
        return rows.map(value => value!.filter(row => row.data.customerId === customer.id));
      };
      const source = read(), signature = JSON.stringify(source);
      const debts = source[0].map(row => normalizeDebtDocument(row.id, row.data, spaceId));
      const payments = source[1].map(row => normalizePaymentDocument(row.id, row.data, spaceId));
      if (debts.some(row => !row) || payments.some(row => !row)) throw new Error('customerStatementIncomplete');
      const statement = customerStatement({ ...scope, customer, debts: debts as NonNullable<typeof debts[number]>[],
        payments: payments as NonNullable<typeof payments[number]>[], credits: source[2].map(row => customerCreditFromDocument(row.id, row.data, spaceId, scope.storeId)) });
      const html = merchantStatementHtml({ statement, language, merchantName: customer.name, storeName: store.profile.name,
        issuedAt: new Date().toISOString(), kind: 'customer' });
      const saved = await saveMerchantStatement(html, mode, isCurrent, async () => {
        store.assertBusinessAccess(spaceId, store.sessionKey);
        await authorizeCustomerStatement(spaceId, scope.storeId, customer.id);
        if (!isCurrent() || JSON.stringify(read()) !== signature) throw new Error('exportScopeChanged');
      });
      if (isCurrent()) setResult(saved === 'saved' ? common.saved : saved === 'shared' ? common.shared : saved === 'print-dialog' ? common.web : null);
    } catch { if (isCurrent()) setFailed(true); } finally { if (alive.current) setBusy(false); }
  };
  if (!isCurrent()) return null;
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
      <ScrollView style={{ maxHeight: '85%', backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} contentContainerStyle={{ padding: 22, paddingBottom: 36, gap: 16 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '700', textAlign: isRTL ? 'right' : 'left' }}>{copy.title} - {customer.name}</Text>
        <Text style={{ color: colors.mutedForeground }}>{copy.note}</Text>
        <Text style={{ color: colors.mutedForeground }}>{Platform.OS === 'web' ? common.web : common.native}</Text>
        <MerchantButton title={common.save} disabled={busy} selected onPress={() => void run('save')} />
        <MerchantButton title={common.share} disabled={busy} onPress={() => void run('share')} />
        {failed ? <Text accessibilityLiveRegion="polite" style={{ color: colors.destructive }}>{copy.incomplete}</Text> : null}
        {result ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success }}>{result}</Text> : null}
        <MerchantButton title={language === 'ar' ? 'إغلاق' : language === 'tr' ? 'Kapat' : 'Close'} disabled={busy} onPress={onClose} />
      </ScrollView>
    </View>
  </Modal>;
}
