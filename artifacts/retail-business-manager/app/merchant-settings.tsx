import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { MerchantButton, MerchantField } from '@/components/MerchantAccountUI';
import { MerchantSelect } from '@/components/MerchantSelect';
import { useMerchantSettings } from '@/hooks/useMerchantSettings';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { CURRENCY_OPTIONS, type CurrencyCode } from '@/constants/currencies';
import { exactMoneyEntry, formatExactMoney } from '@/data/exactMoneyPresentation';
import { createOperationId } from '@/services/operationId';
import type { MerchantSettings } from '@/types/merchantSettings';

export default function MerchantSettingsScreen() {
  const { sessionKey } = useStore();
  return <MerchantSettingsEditor key={sessionKey} />;
}
function MerchantSettingsEditor() {
  const { canWriteBusiness, profile } = useStore();
  const { data, error, retry, save } = useMerchantSettings();
  const { t, isRTL, language } = useI18n();
  const colors = useColors();
  const [draft, setDraft] = useState<MerchantSettings | null>(data),
    [dirty, setDirty] = useState(false);
  const [name, setName] = useState(''),
    [price, setPrice] = useState(''),
    [currency, setCurrency] = useState<CurrencyCode>(profile.currency);
  const [editId, setEditId] = useState(''),
    [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<'invalid' | 'uncertain' | 'confirmed' | null>(null);
  const pending = useRef<{ id: string; settings: MerchantSettings } | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (data && !dirty && !pending.current) setDraft(data);
  }, [data, dirty]);
  const locked = busy || message === 'uncertain' || !canWriteBusiness || !data;
  const style = { color: colors.foreground, textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const change = (fn: (current: MerchantSettings) => MerchantSettings) => {
    if (locked) return;
    setDraft((current) => (current ? fn(current) : current));
    setDirty(true);
    setMessage(null);
  };
  const addMaterial = () => {
    try {
      if (!name.trim() || !draft || (!editId && draft.materials.length >= 100)) throw new Error('invalid');
      const exact = exactMoneyEntry(price, 4);
      const id = editId || createOperationId();
      change((current) => ({
        ...current,
        materials: editId
          ? current.materials.map((row) =>
              row.id === id ? { ...row, name: name.trim(), prices: { ...row.prices, [currency]: exact } } : row,
            )
          : [...current.materials, { id, name: name.trim(), prices: { [currency]: exact }, isActive: true }],
      }));
      setName('');
      setPrice('');
      setEditId('');
    } catch {
      setMessage('invalid');
    }
  };
  const submit = async () => {
    if (busy || !canWriteBusiness || !data || !draft) return;
    if (!pending.current) pending.current = { id: createOperationId(), settings: JSON.parse(JSON.stringify(draft)) };
    setBusy(true);
    setMessage(null);
    try {
      await save(pending.current.settings, pending.current.id);
      if (alive.current) {
        pending.current = null;
        setDirty(false);
        setDraft(null);
        setMessage('confirmed');
        retry();
      }
    } catch (caught) {
      if (!alive.current) return;
      const code = String((caught as { code?: string })?.code ?? '');
      // A previously unknown result stays sealed even if a later retry returns a definite error.
      if (
        [
          'functions/invalid-argument',
          'functions/permission-denied',
          'functions/failed-precondition',
          'functions/aborted',
        ].includes(code) &&
        message !== 'uncertain'
      ) {
        pending.current = null;
        setMessage('invalid');
      } else setMessage('uncertain');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <AppShell>
      <PageHeader title={t('merchantSettings')} showBack />
      {!data || !draft ? (
        error ? (
          <GlassCard>
            <Text style={style}>{t('merchantUnavailable')}</Text>
            <MerchantButton title={t('tryAgain')} onPress={retry} />
          </GlassCard>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : (
        <View style={{ gap: 18 }}>
          <Text style={{ ...style, color: colors.mutedForeground }}>{t('merchantSettingsHint')}</Text>
          <SectionTitle title={t('merchantMaterials')} />
          <GlassCard style={{ gap: 12 }}>
            {draft.materials.map((row) => (
              <View
                key={row.id}
                style={{ gap: 7, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ ...style, fontWeight: '700' }}>
                  {row.name}
                  {row.isActive ? '' : ` · ${t('merchantInactive')}`}
                </Text>
                {Object.entries(row.prices).map(([code, value]) => (
                  <Text key={code} style={style}>
                    {formatExactMoney(value!, code as CurrencyCode, language)}
                  </Text>
                ))}
                {canWriteBusiness ? (
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
                    <MerchantButton
                      title={t('saveChanges')}
                      disabled={locked}
                      onPress={() => {
                        setEditId(row.id);
                        setName(row.name);
                        setPrice(row.prices[currency] ?? '');
                      }}
                    />
                    <MerchantButton
                      title={t(row.isActive ? 'merchantDisable' : 'merchantEnable')}
                      disabled={locked}
                      onPress={() =>
                        change((current) => ({
                          ...current,
                          materials: current.materials.map((item) =>
                            item.id === row.id ? { ...item, isActive: !item.isActive } : item,
                          ),
                        }))
                      }
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {canWriteBusiness ? (
              <>
                <MerchantField title={t('merchantItem')} value={name} onChange={setName} disabled={locked} />
                <MerchantSelect
                  title={t('currency')}
                  value={currency}
                  options={CURRENCY_OPTIONS.map((row) => ({ id: row.code, name: row.code }))}
                  disabled={locked}
                  onChange={(id) => {
                    setCurrency(id as CurrencyCode);
                    setPrice(draft.materials.find((row) => row.id === editId)?.prices[id as CurrencyCode] ?? '');
                  }}
                />
                <MerchantField title={t('merchantPrice')} value={price} onChange={setPrice} decimal disabled={locked} />
                <MerchantButton title={t(editId ? 'saveChanges' : 'add')} onPress={addMaterial} disabled={locked} />
                {editId ? (
                  <MerchantButton
                    title={t('cancel')}
                    disabled={locked}
                    onPress={() => {
                      setEditId('');
                      setName('');
                      setPrice('');
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </GlassCard>
          <SectionTitle title={t('merchantPaymentMethods')} />
          <GlassCard style={{ gap: 12 }}>
            <Text style={{ ...style, color: colors.mutedForeground }}>{t('merchantMethodHint')}</Text>
            {draft.paymentMethods.map((row) => (
              <View key={row.id} style={{ gap: 8 }}>
                {canWriteBusiness ? (
                  <MerchantField
                    title={t('merchantPaymentMethod')}
                    value={row.name}
                    disabled={locked}
                    onChange={(value) =>
                      change((current) => ({
                        ...current,
                        paymentMethods: current.paymentMethods.map((item) =>
                          item.id === row.id ? { ...item, name: value } : item,
                        ),
                      }))
                    }
                  />
                ) : (
                  <Text style={style}>{row.name}</Text>
                )}
                {!row.isActive ? <Text style={style}>{t('merchantInactive')}</Text> : null}
                {canWriteBusiness ? (
                  <MerchantButton
                    title={t(row.isActive ? 'merchantDisable' : 'merchantEnable')}
                    disabled={locked}
                    onPress={() =>
                      change((current) => ({
                        ...current,
                        paymentMethods: current.paymentMethods.map((item) =>
                          item.id === row.id ? { ...item, isActive: !item.isActive } : item,
                        ),
                      }))
                    }
                  />
                ) : null}
              </View>
            ))}
            {canWriteBusiness ? (
              <>
                <MerchantField
                  title={t('merchantPaymentMethod')}
                  value={method}
                  onChange={setMethod}
                  disabled={locked}
                />
                <MerchantButton
                  title={t('add')}
                  disabled={locked || draft.paymentMethods.length >= 30}
                  onPress={() => {
                    if (!method.trim()) {
                      setMessage('invalid');
                      return;
                    }
                    change((current) => ({
                      ...current,
                      paymentMethods: [
                        ...current.paymentMethods,
                        { id: createOperationId(), name: method.trim(), isActive: true },
                      ],
                    }));
                    setMethod('');
                  }}
                />
              </>
            ) : null}
          </GlassCard>
          {message ? (
            <Text
              accessibilityRole="alert"
              style={{ ...style, color: message === 'confirmed' ? colors.success : colors.warning }}
            >
              {t(
                message === 'confirmed'
                  ? 'merchantConfirmed'
                  : message === 'uncertain'
                    ? 'merchantFailed'
                    : 'merchantSettingsConflict',
              )}
            </Text>
          ) : null}
          {canWriteBusiness ? (
            <>
              <MerchantButton
                testID="merchant-settings-save"
                title={t(message === 'uncertain' ? 'merchantRetrySame' : 'saveChanges')}
                selected
                disabled={busy || (!dirty && !pending.current)}
                onPress={submit}
              />
              <MerchantButton
                title={t('merchantReloadSettings')}
                disabled={busy || message === 'uncertain'}
                onPress={() => {
                  setDirty(false);
                  setDraft(null);
                  setEditId('');
                  setName('');
                  setPrice('');
                  setMethod('');
                  setMessage(null);
                  retry();
                }}
              />
            </>
          ) : null}
        </View>
      )}
    </AppShell>
  );
}
