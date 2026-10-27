import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { MerchantButton, MerchantField } from '@/components/MerchantAccountUI';
import { useMerchantSettings } from '@/hooks/useMerchantSettings';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { createOperationId } from '@/services/operationId';
import type { MerchantSettings } from '@/types/merchantSettings';

export default function MerchantSettingsScreen() {
  const { sessionKey } = useStore();
  return <MerchantSettingsEditor key={sessionKey} />;
}
function MerchantSettingsEditor() {
  const { canWriteBusiness } = useStore();
  const { data, error, retry, save } = useMerchantSettings();
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const [draft, setDraft] = useState<MerchantSettings | null>(data),
    [dirty, setDirty] = useState(false);
  const [method, setMethod] = useState('');
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
  const submit = async () => {
    if (busy || !canWriteBusiness || !data || !draft) return;
    if (!pending.current) pending.current = { id: createOperationId(), settings: JSON.parse(JSON.stringify(draft)) };
    setBusy(true);
    setMessage(null);
    try {
      const result = await save(pending.current.settings, pending.current.id);
      if (alive.current) {
        pending.current = null;
        setDirty(false);
        setDraft(result.settings);
        setMessage('confirmed');
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
