import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { formatLocalizedDateTime } from '@/constants/i18n';
import { formatExactMoney } from '@/data/exactMoneyPresentation';
import { legacyAmountExact } from '@/data/customerCreditAccounting';
import type { Debt, Payment } from '@/types/business';
import type { CustomerOperationSelection } from './CustomerOperationEditor';
import { ActorBadge } from './ActorBadge';

export function CustomerLedger({ debts, payments, canEdit, onEdit, onReminder }: {
  debts: Debt[]; payments: Payment[]; canEdit: boolean;
  onEdit: (selection: CustomerOperationSelection) => void; onReminder: (debt: Debt) => void;
}) {
  const colors = useColors(), { t, language, isRTL } = useI18n();
  const rows = useMemo(() => [...debts.map(target => ({ kind: 'debt' as const, target, at: target.createdAt })),
    ...payments.map(target => ({ kind: 'payment' as const, target, at: target.paidAt }))]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.target.id.localeCompare(b.target.id)), [debts, payments]);
  const text = { color: colors.foreground, textAlign: isRTL ? 'right' as const : 'left' as const };
  return <View testID="customer-unified-ledger" style={{ backgroundColor: colors.card, borderRadius: 16, marginBottom: 18 }}>
    {rows.map(row => {
      const debt = row.kind === 'debt' ? row.target : null, payment = row.kind === 'payment' ? row.target : null;
      const linked = payment?.source === 'customer-to-merchant';
      const amount = debt ? legacyAmountExact(debt.originalAmount ?? debt.amount, debt.originalAmount === undefined ? debt.amountExact : undefined)
        : legacyAmountExact(payment!.amount.amount, payment!.amountExact);
      const editable = canEdit && !row.target.cancelled && (!debt || (!debt.merchantOperationId && !debt.correctionOfMerchantOperationId && !debt.correctionOfPaymentId));
      return <View key={`${row.kind}:${row.target.id}`} style={{ padding: 14, gap: 6, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={debt ? 'document-text-outline' : linked ? 'swap-horizontal-outline' : 'checkmark-done-outline'} size={19} color={linked ? colors.warning : colors.primary} />
          <Text style={{ ...text, flex: 1, fontWeight: '600' }}>{t(debt ? 'quickActionCredit' : linked ? 'merchantDirect' : 'settlement')}</Text>
          <Text style={{ ...text, fontWeight: '700', writingDirection: 'ltr' }}>{formatExactMoney(amount, debt?.currency ?? payment!.amount.currency, language)}</Text>
          {editable ? <Pressable testID={`edit-${row.kind}-${row.target.id}`} accessibilityRole="button" accessibilityLabel={t('operationEdit')}
            onPress={() => onEdit({ kind: row.kind, target: row.target } as CustomerOperationSelection)} style={{ padding: 10 }}>
            <Ionicons name="create-outline" size={19} color={colors.primary} />
          </Pressable> : null}
        </View>
        {row.target.note ? <Text style={text}>{row.target.note}</Text> : null}
        {payment?.merchantName ? <Text style={{ ...text, color: colors.mutedForeground }}>{payment.merchantName} · {t('merchantNoncash')}</Text> : null}
        {row.target.cancelled ? <Text style={{ ...text, color: colors.mutedForeground }}>{t('operationCancelled')}</Text> : null}
        {debt && !debt.cancelled ? <Text style={{ ...text, color: colors.mutedForeground }}>
          {t('remainingDebt')}: {formatExactMoney(legacyAmountExact(debt.amount, debt.amountExact), debt.currency, language)}
        </Text> : null}
        {debt?.correctionOfPaymentId ? <Text style={{ ...text, color: colors.mutedForeground }}>{t('paymentAdjustmentDebt')}</Text> : null}
        {debt?.creditAppliedExact && debt.creditAppliedExact !== '0.00' ? <Text style={{ ...text, color: colors.success }}>{t('customerCreditUsed')}: {formatExactMoney(debt.creditAppliedExact, debt.currency, language)}</Text> : null}
        {row.target.operationDate ? <Text style={{ ...text, color: colors.mutedForeground }}>{row.target.operationDate}</Text> : null}
        <Text style={{ ...text, fontSize: 12, color: colors.mutedForeground }}>{formatLocalizedDateTime(new Date(row.at), language)}</Text>
        <ActorBadge userId={row.target.createdByUserId} />
        {debt && debt.amount > 0 && !debt.cancelled ? <Pressable testID={`create-reminder-${debt.id}`} disabled={!canEdit}
          accessibilityRole="button" accessibilityLabel={t('createReminder')} onPress={() => onReminder(debt)} style={{ paddingVertical: 10 }}>
          <Text style={{ ...text, color: colors.primary }}>{t('createReminder')}</Text>
        </Pressable> : null}
      </View>;
    })}
    {!rows.length ? <Text style={{ ...text, padding: 16 }}>{t('noActivity')}</Text> : null}
  </View>;
}
