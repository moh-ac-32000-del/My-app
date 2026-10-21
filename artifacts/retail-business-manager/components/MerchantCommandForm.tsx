import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { GlassCard } from '@/components/AppShell';
import { MerchantButton, MerchantField } from '@/components/MerchantAccountUI';
import { MerchantSelect } from '@/components/MerchantSelect';
import { MerchantDateField } from '@/components/MerchantDateField';
import { useMerchantSettings } from '@/hooks/useMerchantSettings';
import { localMerchantDate, merchantOperationDate } from '@/data/merchantSettings';
import { useCustomers } from '@/context/CustomerContext';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import { createOperationId } from '@/services/operationId';
import { calculateMerchantPurchase } from '@/data/merchantAccounting';
import { exactMoneyEntry, formatExactMoney } from '@/data/exactMoneyPresentation';
import { subtractCustomerExact } from '@/data/customerCreditAccounting';
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
  statusOnly = false,
}: {
  action: Action;
  merchant?: Merchant;
  target?: MerchantOperation;
  command: (input: MerchantDraftCommand) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
  statusOnly?: boolean;
}) {
  const { profile, activeSpaceId, canWriteBusiness } = useStore();
  const { customers, canonicalSpaceId, isLoading: customersLoading, error: customerError } = useCustomers();
  const { t, language, isRTL } = useI18n();
  const colors = useColors();
  const settings = useMerchantSettings(action === 'payment' || action === 'directPayment');
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(merchant?.name ?? '');
  const [phone, setPhone] = useState(merchant?.phone ?? '');
  const [address, setAddress] = useState(merchant?.address ?? '');
  const [notes, setNotes] = useState(merchant?.notes ?? '');
  const [openings, setOpenings] = useState<Array<{ currency: CurrencyCode; amount: string; credit: boolean }>>([]);
  const [currency, setCurrency] = useState<CurrencyCode>(target?.currency ?? profile.currency);
  const [amount, setAmount] = useState('');
  const [operationDate, setOperationDate] = useState(() => localMerchantDate());
  const [paymentMethodId, setPaymentMethodId] = useState('');
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
            address: address.trim(),
            notes: notes.trim(),
            ...(!merchant
              ? {
                  openingBalances: openings.map((row) => ({
                    currency: row.currency,
                    amountExact: `${row.credit ? '-' : ''}${exactMoneyEntry(row.amount, 2)}`,
                  })),
                }
              : {}),
            isActive: statusOnly ? !merchant?.isActive : (merchant?.isActive ?? true),
          };
        } else if (action === 'purchase') {
          const items = normalizedLines();
          if (items.some((line) => !line.name) || !total || total === '0.00') throw new Error('purchase');
          pending.current = {
            ...base,
            action,
            currency,
            lines: items,
            source: 'cash',
            paidExact: '0.00',
            separateLines: true,
            operationDate: merchantOperationDate(operationDate),
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
            const method = settings.data?.paymentMethods.find((row) => row.id === paymentMethodId && row.isActive);
            if (!method) throw new Error('paymentMethod');
            pending.current = {
              ...base,
              action,
              currency,
              amountExact,
              customerId,
              note: note.trim(),
              operationDate: merchantOperationDate(operationDate),
              paymentMethodId: method.id,
              paymentMethodName: method.name,
            };
          } else if (action === 'payment') {
            const method = settings.data?.paymentMethods.find((row) => row.id === paymentMethodId && row.isActive);
            if (!method) throw new Error('paymentMethod');
            pending.current = {
              ...base,
              action,
              currency,
              amountExact,
              source: 'cash',
              operationDate: merchantOperationDate(operationDate),
              paymentMethodId: method.id,
              paymentMethodName: method.name,
              note: note.trim(),
            };
          } else pending.current = { ...base, action: 'opening', currency, amountExact, note: note.trim() };
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
      const definite =
        error !== 'uncertain' &&
        [
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
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!locked) onCancel();
      }}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
        <KeyboardAwareScrollViewCompat
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
          style={{
            maxHeight: '92%',
            backgroundColor: colors.glassStrong,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          contentContainerStyle={{ padding: 18, paddingBottom: Math.max(insets.bottom, 18) }}
        >
          <GlassCard testID="merchant-command-form" style={{ gap: 16 }}>
            <Text
              style={{ color: colors.foreground, fontSize: 20, fontWeight: '700', textAlign: isRTL ? 'right' : 'left' }}
            >
              {t(merchantActionLabels[action])}
            </Text>
            {action === 'purchase' || action === 'payment' ? (
              <>
                <Text
                  style={{
                    color: action === 'payment' ? '#ef4444' : '#3b82f6',
                    fontWeight: '600',
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  {t(action === 'payment' ? 'merchantPaymentHint' : 'merchantPurchaseHint')}
                </Text>
                {action === 'payment' &&
                (!settings.data || settings.error || !settings.data.paymentMethods.some((row) => row.isActive)) ? (
                  <Text style={{ color: colors.warning }}>
                    {t(settings.error ? 'merchantUnavailable' : 'merchantCatalogRequired')}
                  </Text>
                ) : null}
              </>
            ) : null}
            {action === 'save' && statusOnly ? (
              <Text style={{ color: colors.mutedForeground }}>{t('merchantStatusConfirm')}</Text>
            ) : action === 'save' ? (
              <>
                {field(t('merchantName'), name, setName)}
                {field(t('customerPhone'), phone, setPhone)}
                {field(t('customerAddress'), address, setAddress)}
                <MerchantField
                  title={t('customerNotes')}
                  value={notes}
                  onChange={setNotes}
                  multiline
                  disabled={locked}
                />
                {!merchant ? (
                  <>
                    <Text style={{ color: colors.mutedForeground }}>{t('merchantOpeningHint')}</Text>
                    {openings.map((row, index) => (
                      <View key={row.currency} style={{ gap: 10 }}>
                        <Text style={{ color: colors.foreground }}>{row.currency}</Text>
                        <MerchantSelect
                          title={t('merchantBalance')}
                          value={row.credit ? 'credit' : 'payable'}
                          options={[
                            { id: 'payable', name: t('merchantPayable') },
                            { id: 'credit', name: t('merchantCredit') },
                          ]}
                          disabled={locked}
                          onChange={(value) =>
                            setOpenings((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, credit: value === 'credit' } : item,
                              ),
                            )
                          }
                        />
                        <MerchantField
                          title={t('amount')}
                          value={row.amount}
                          decimal
                          disabled={locked}
                          onChange={(value) =>
                            setOpenings((current) =>
                              current.map((item, position) => (position === index ? { ...item, amount: value } : item)),
                            )
                          }
                        />
                        <MerchantButton
                          title={t('merchantRemoveLine')}
                          disabled={locked}
                          onPress={() => setOpenings((current) => current.filter((_, position) => position !== index))}
                        />
                      </View>
                    ))}
                    <MerchantSelect
                      title={t('merchantOpening')}
                      value=""
                      disabled={locked}
                      options={CURRENCY_OPTIONS.filter(
                        (row) => !openings.some((item) => item.currency === row.code),
                      ).map((row) => ({ id: row.code, name: row.code }))}
                      onChange={(value) =>
                        setOpenings((current) => [
                          ...current,
                          { currency: value as CurrencyCode, amount: '0', credit: false },
                        ])
                      }
                    />
                  </>
                ) : null}
              </>
            ) : (
              <>
                {action === 'reverse' ? (
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: colors.warning }}>{t('merchantCorrectionHint')}</Text>
                    {target ? (
                      <>
                        <Text style={{ color: colors.foreground }}>
                          {t('merchantCorrectionPreview')}{' '}
                          {formatExactMoney(
                            subtractCustomerExact(target.balanceBeforeExact, target.balanceAfterExact),
                            target.currency,
                            language,
                          )}
                        </Text>
                        <Text style={{ color: colors.foreground }}>
                          {t('merchantCashEffect')}:{' '}
                          {formatExactMoney(
                            subtractCustomerExact('0.00', target.cashDeltaExact),
                            target.currency,
                            language,
                          )}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <MerchantSelect
                    title={t('currency')}
                    value={currency}
                    options={CURRENCY_OPTIONS.map((item) => ({ id: item.code, name: item.code }))}
                    disabled={locked}
                    onChange={(value) => {
                      setCurrency(value as CurrencyCode);
                    }}
                  />
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
                {action === 'payment' || action === 'directPayment' ? (
                  <MerchantSelect
                    testID="merchant-payment-method"
                    title={t('merchantPaymentMethod')}
                    value={paymentMethodId}
                    options={(settings.data?.paymentMethods ?? []).filter((row) => row.isActive)}
                    onChange={setPaymentMethodId}
                    disabled={locked || !settings.data}
                  />
                ) : null}
                {action === 'purchase' ? (
                  <>
                    {lines.map((line, index) => (
                      <View
                        key={index}
                        style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}
                      >
                        <MerchantField
                          title={t('merchantItem')}
                          value={line.name}
                          disabled={locked}
                          onChange={(value) =>
                            setLines((current) =>
                              current.map((item, position) => (position === index ? { ...item, name: value } : item)),
                            )
                          }
                        />
                        {(['quantity', 'unitPrice'] as const).map((key) => (
                          <MerchantField
                            key={key}
                            title={t(key === 'quantity' ? 'merchantQuantity' : 'merchantPrice')}
                            value={line[key]}
                            disabled={locked}
                            decimal
                            onChange={(value) =>
                              setLines((current) =>
                                current.map((item, position) =>
                                  position === index ? { ...item, [key]: value } : item,
                                ),
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
                  </>
                ) : action !== 'reverse' ? (
                  field(t('amount'), amount, setAmount, action !== 'opening')
                ) : null}
                {action === 'payment' || action === 'purchase' || action === 'directPayment' ? (
                  <MerchantDateField value={operationDate} onChange={setOperationDate} disabled={locked} />
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
              tone={action === 'payment' ? 'payment' : 'primary'}
              disabled={busy || !canWriteBusiness}
              onPress={submit}
            />
            <MerchantButton title={t('cancel')} disabled={busy || error === 'uncertain'} onPress={onCancel} />
          </GlassCard>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}
