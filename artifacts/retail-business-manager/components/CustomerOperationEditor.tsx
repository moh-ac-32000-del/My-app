import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MerchantField, MerchantButton } from './MerchantAccountUI';
import { MerchantDateField } from './MerchantDateField';
import { MerchantSelect } from './MerchantSelect';
import { localMerchantDate, merchantOperationDate } from '@/data/merchantSettings';
import { legacyAmountExact } from '@/data/customerCreditAccounting';
import { exactMoneyEntry } from '@/data/exactMoneyPresentation';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { createOperationId } from '@/services/operationId';
import { sendCustomerOperationCommand, type CustomerOperationCommand } from '@/services/customerOperationCommand';
import type { Debt, Payment } from '@/types/business';

export type CustomerOperationSelection = { kind: 'debt'; target: Debt } | { kind: 'payment'; target: Payment };
export function CustomerOperationEditor({ selection, onClose }: { selection: CustomerOperationSelection; onClose: () => void }) {
  const initial = useRef(selection).current;
  const { t, isRTL } = useI18n(), colors = useColors(), insets = useSafeAreaInsets();
  const { activeSpaceId, sessionKey, profile, canWriteBusiness, assertBusinessAccess } = useStore();
  const target = initial.target;
  const currentScope = JSON.stringify([sessionKey, activeSpaceId, profile.id]);
  const scope = useRef(currentScope).current, current = useRef(currentScope);
  current.current = currentScope;
  const [amount, setAmount] = useState(() => initial.kind === 'debt'
    ? legacyAmountExact(initial.target.originalAmount ?? initial.target.amount,
      initial.target.originalAmount === undefined ? initial.target.amountExact : undefined)
    : legacyAmountExact(initial.target.amount.amount, initial.target.amountExact));
  const [date, setDate] = useState(() => target.operationDate ?? localMerchantDate(new Date(initial.kind === 'payment' ? initial.target.paidAt : target.createdAt)));
  const [due, setDue] = useState(() => initial.kind === 'debt' && initial.target.dueDate ? localMerchantDate(new Date(initial.target.dueDate)) : '');
  const [note, setNote] = useState(target.note ?? '');
  const [method, setMethod] = useState(initial.kind === 'payment' ? initial.target.method : 'cash');
  const [confirmCancel, setConfirmCancel] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<'invalid' | 'uncertain' | null>(null);
  const pending = useRef<CustomerOperationCommand | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const locked = busy || error === 'uncertain' || !canWriteBusiness;
  const submit = async () => {
    if (busy || !activeSpaceId || !target.customerId || !canWriteBusiness || current.current !== scope) return;
    if (!pending.current) {
      try {
        const base = { operationId: createOperationId(), spaceId: activeSpaceId, storeId: profile.id, customerId: target.customerId,
          targetId: target.id, expectedUpdatedAt: target.updatedAt, expectedRevision: target.amendmentRevision ?? 0, kind: initial.kind };
        pending.current = confirmCancel ? { ...base, action: 'cancel' } : { ...base, action: 'edit',
          amountExact: exactMoneyEntry(amount, 2), operationDate: merchantOperationDate(date), note: note.trim(),
          ...(initial.kind === 'debt' ? (due ? { dueDate: merchantOperationDate(due) } : {}) : { method }) };
      } catch { setError('invalid'); return; }
    }
    setBusy(true); setError(null);
    try {
      assertBusinessAccess(activeSpaceId, sessionKey);
      await sendCustomerOperationCommand(pending.current);
      if (!alive.current || current.current !== scope) return;
      assertBusinessAccess(activeSpaceId, sessionKey);
      onClose();
    } catch (caught) {
      if (!alive.current || current.current !== scope) return;
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : '';
      const definite = error !== 'uncertain' && ['functions/invalid-argument','functions/permission-denied','functions/not-found',
        'functions/failed-precondition','functions/resource-exhausted'].includes(code);
      if (definite) pending.current = null;
      setError(definite ? 'invalid' : 'uncertain');
    } finally { if (alive.current && current.current === scope) setBusy(false); }
  };
  if (currentScope !== scope || !canWriteBusiness) return null;
  const text = { color: colors.foreground, textAlign: isRTL ? 'right' as const : 'left' as const };
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!locked) onClose(); }}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
      <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" bottomOffset={24} style={{ maxHeight: '90%', backgroundColor: colors.glassStrong,
        borderTopLeftRadius: 28, borderTopRightRadius: 28 }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: Math.max(insets.bottom, 20) }}>
        <Text style={{ ...text, fontSize: 20, fontWeight: '700' }}>{t('operationEdit')}</Text>
        <Text style={{ ...text, color: colors.mutedForeground }}>{initial.kind === 'debt' ? initial.target.currency : initial.target.amount.currency}</Text>
        <MerchantField title={t(initial.kind === 'debt' ? 'operationDebtPrincipal' : 'amount')} value={amount} onChange={setAmount} decimal disabled={locked} />
        <MerchantDateField value={date} onChange={setDate} disabled={locked} />
        {initial.kind === 'debt' ? <>
          <MerchantButton title={`${t('debtDueDate')}${due ? `: ${due}` : ''}`} disabled={locked} onPress={() => setDue(value => value ? '' : localMerchantDate())} />
          {due ? <MerchantDateField label={t('debtDueDate')} showPostingHint={false} value={due} onChange={setDue} disabled={locked} /> : null}
        </> : <MerchantSelect title={t('merchantPaymentMethod')} value={method} onChange={value => setMethod(value as Payment['method'])}
          disabled={locked} options={[{ id: 'cash', name: t('paymentMethodCash') }, { id: 'card', name: t('paymentMethodCard') },
            { id: 'bank-transfer', name: t('paymentMethodBankTransfer') }, { id: 'other', name: t('paymentMethodOther') }]} />}
        <MerchantField title={t('merchantNotes')} value={note} onChange={setNote} disabled={locked} multiline />
        {error ? <Text accessibilityRole="alert" style={text}>{t(error === 'uncertain' ? 'merchantFailed' : 'merchantInvalid')}</Text> : null}
        {confirmCancel ? <Text style={text}>{t('operationCancelConfirm')}</Text> : null}
        <MerchantButton testID="customer-operation-save" title={t(error === 'uncertain' ? 'merchantRetrySame' : confirmCancel ? 'operationCancel' : 'saveChanges')}
          selected disabled={busy || !canWriteBusiness} onPress={() => void submit()} />
        <MerchantButton testID="customer-operation-cancel" title={t(confirmCancel ? 'operationKeep' : 'operationCancel')} disabled={locked}
          onPress={() => setConfirmCancel(value => !value)} />
        <MerchantButton title={t('close')} disabled={busy || error === 'uncertain'} onPress={onClose} />
      </KeyboardAwareScrollViewCompat>
    </View>
  </Modal>;
}
