import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { GlassCard } from '@/components/AppShell';
import { MerchantButton, MerchantField } from '@/components/MerchantAccountUI';
import { useCustomers } from '@/context/CustomerContext';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { createOperationId } from '@/services/operationId';
import { calculateMerchantPurchase } from '@/data/merchantAccounting';
import { exactMoneyEntry, formatExactMoney } from '@/data/exactMoneyPresentation';
import { CURRENCY_OPTIONS, type CurrencyCode } from '@/constants/currencies';
import type { TranslationKey } from '@/constants/i18n';
import type { Merchant, MerchantDraftCommand, MerchantOperation } from '@/types/merchant';

type Action = MerchantDraftCommand['action'];
export const merchantActionLabels: Record<Action, TranslationKey> = {
  save: 'saveChanges',
  opening: 'merchantOpening',
  purchase: 'merchantPurchase',
  payment: 'merchantPayment',
  directPayment: 'merchantDirect',
  reverse: 'merchantReverse',
};
/** Creating a document reference generates a random ID locally; it does not read/write Firestore. */
export const merchantDraftId = createOperationId;

export function MerchantCommandForm({
  action,
  merchant,
  target,
  command,
  onDone,
  onCancel,
}: {
  action: Action;
  merchant?: Merchant;
  target?: MerchantOperation;
  command: (input: MerchantDraftCommand) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { profile, activeSpaceId, canWriteBusiness } = useStore();
  const { customers, canonicalSpaceId, isLoading: customersLoading, error: customerError } = useCustomers();
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const [name, setName] = useState(merchant?.name ?? '');
  const [phone, setPhone] = useState(merchant?.phone ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(target?.currency ?? profile.currency);
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState('0');
  const [source, setSource] = useState<'cash' | 'external'>('cash');
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState([{ name: '', quantity: '1', unitPrice: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'invalid' | 'uncertain' | null>(null);
  const pending = useRef<MerchantDraftCommand | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const locked = busy || error === 'uncertain' || !canWriteBusiness;
  const readyCustomers = !customersLoading && !customerError && canonicalSpaceId === activeSpaceId;
  const candidates = readyCustomers
    ? customers
        .filter(
          (customer) =>
            customer.isActive &&
            customer.storeId === profile.id &&
            customer.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        )
        .slice(0, 20)
    : [];
  const normalizedLines = () =>
    lines.map((line) => ({
      name: line.name.trim(),
      quantity: exactMoneyEntry(line.quantity, 3),
      unitPrice: exactMoneyEntry(line.unitPrice, 4),
    }));
  let total: string | null = null;
  try {
    if (action === 'purchase') total = calculateMerchantPurchase(normalizedLines(), currency).total.amount;
  } catch {
    /* incomplete draft */
  }
  const submit = async () => {
    if (busy || !canWriteBusiness) return;
    if (!pending.current) {
      try {
        const base = { operationId: merchantDraftId(), merchantId: merchant?.id ?? merchantDraftId() };
        if (action === 'save') {
          if (!name.trim()) throw new Error('name');
          pending.current = {
            ...base,
            action,
            name: name.trim(),
            phone: phone.trim(),
            isActive: merchant?.isActive ?? true,
          };
        } else if (action === 'purchase') {
          const items = normalizedLines();
          if (items.some((line) => !line.name) || !total || total === '0.00') throw new Error('purchase');
          pending.current = {
            ...base,
            action,
            currency,
            lines: items,
            source,
            paidExact: exactMoneyEntry(paid, 2),
            note: note.trim(),
          };
        } else if (action === 'reverse') {
          if (!target || !note.trim()) throw new Error('reason');
          pending.current = {
            ...base,
            action,
            currency: target.currency,
            targetOperationId: target.id,
            reason: note.trim(),
          };
        } else {
          const amountExact = exactMoneyEntry(amount, 2, action === 'opening');
          if (action !== 'opening' && amountExact === '0.00') throw new Error('amount');
          if (action === 'directPayment') {
            if (
              !readyCustomers ||
              !customers.some(
                (customer) => customer.id === customerId && customer.isActive && customer.storeId === profile.id,
              )
            )
              throw new Error('customer');
            pending.current = { ...base, action, currency, amountExact, customerId, note: note.trim() };
          } else if (action === 'payment')
            pending.current = { ...base, action, currency, amountExact, source, note: note.trim() };
          else pending.current = { ...base, action: 'opening', currency, amountExact, note: note.trim() };
        }
      } catch {
        setError('invalid');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await command(pending.current);
      if (alive.current) {
        pending.current = null;
        onDone();
      }
    } catch (caught) {
      if (!alive.current) return;
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : '';
      const definite = [
        'functions/invalid-argument',
        'functions/permission-denied',
        'functions/failed-precondition',
        'functions/not-found',
        'functions/resource-exhausted',
      ].includes(code);
      if (definite) pending.current = null;
      setError(definite ? 'invalid' : 'uncertain');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const field = (title: string, value: string, onChange: (value: string) => void, decimal = false) => (
    <MerchantField title={title} value={value} onChange={onChange} decimal={decimal} disabled={locked} />
  );
  return (
    <GlassCard testID="merchant-command-form" style={{ gap: 16 }}>
      <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '700', textAlign: isRTL ? 'right' : 'left' }}>
        {t(merchantActionLabels[action])}
      </Text>
      {action === 'save' ? (
        <>
          {field(t('merchantName'), name, setName)}
          {field(t('customerPhone'), phone, setPhone)}
        </>
      ) : (
        <>
          {action === 'reverse' ? (
            <Text style={{ color: colors.warning }}>{t('merchantCorrectionHint')}</Text>
          ) : (
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
              {CURRENCY_OPTIONS.map((item) => (
                <MerchantButton
                  key={item.code}
                  title={item.code}
                  selected={currency === item.code}
                  disabled={locked}
                  onPress={() => setCurrency(item.code)}
                />
              ))}
            </View>
          )}
          {action === 'opening' ? (
            <Text style={{ color: colors.mutedForeground }}>{t('merchantOpeningHint')}</Text>
          ) : null}
          {action === 'directPayment' ? (
            <>
              <Text style={{ color: colors.mutedForeground }}>{t('merchantDirectHint')}</Text>
              {field(t('merchantCustomer'), search, setSearch)}
              {!readyCustomers ? (
                <Text style={{ color: colors.warning }}>{t('reloadToContinue')}</Text>
              ) : (
                candidates.map((customer) => (
                  <MerchantButton
                    key={customer.id}
                    title={customer.name}
                    selected={customerId === customer.id}
                    disabled={locked}
                    onPress={() => setCustomerId(customer.id)}
                  />
                ))
              )}
            </>
          ) : null}
          {action === 'purchase' ? (
            <>
              {lines.map((line, index) => (
                <View
                  key={index}
                  style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}
                >
                  {(['name', 'quantity', 'unitPrice'] as const).map((key) => (
                    <MerchantField
                      key={key}
                      title={t(
                        key === 'name' ? 'merchantItem' : key === 'quantity' ? 'merchantQuantity' : 'merchantPrice',
                      )}
                      value={line[key]}
                      disabled={locked}
                      decimal={key !== 'name'}
                      onChange={(value) =>
                        setLines((current) =>
                          current.map((item, position) => (position === index ? { ...item, [key]: value } : item)),
                        )
                      }
                    />
                  ))}
                  {lines.length > 1 ? (
                    <MerchantButton
                      title={t('merchantRemoveLine')}
                      disabled={locked}
                      onPress={() => setLines((current) => current.filter((_, position) => position !== index))}
                    />
                  ) : null}
                </View>
              ))}
              <MerchantButton
                title={t('merchantAddLine')}
                disabled={locked || lines.length >= 100}
                onPress={() => setLines((current) => [...current, { name: '', quantity: '1', unitPrice: '' }])}
              />
              <Text style={{ color: colors.primary }}>
                {t('merchantTotal')}: {total ? formatExactMoney(total, currency, language) : '—'}
              </Text>
              {field(t('merchantPaid'), paid, setPaid, true)}
            </>
          ) : action !== 'reverse' ? (
            field(t('amount'), amount, setAmount, action !== 'opening')
          ) : null}
          {action === 'payment' || action === 'purchase' ? (
            <View style={{ gap: 8 }}>
              <MerchantButton
                title={t('merchantCash')}
                selected={source === 'cash'}
                disabled={locked}
                onPress={() => setSource('cash')}
              />
              <MerchantButton
                title={t('merchantExternal')}
                selected={source === 'external'}
                disabled={locked}
                onPress={() => setSource('external')}
              />
              {source === 'external' ? (
                <Text style={{ color: colors.mutedForeground }}>{t('merchantNoncash')}</Text>
              ) : null}
            </View>
          ) : null}
          <MerchantField
            title={t(action === 'reverse' ? 'merchantReason' : 'merchantNotes')}
            value={note}
            onChange={setNote}
            disabled={locked}
            multiline
          />
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.warning }}>
          {t(error === 'uncertain' ? 'merchantFailed' : 'merchantInvalid')}
        </Text>
      ) : null}
      <MerchantButton
        testID="merchant-confirm"
        title={t(error === 'uncertain' ? 'merchantRetrySame' : 'confirm')}
        selected
        disabled={busy || !canWriteBusiness}
        onPress={submit}
      />
      <MerchantButton title={t('cancel')} disabled={busy || error === 'uncertain'} onPress={onCancel} />
    </GlassCard>
  );
}
