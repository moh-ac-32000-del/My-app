import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppShell, GlassCard, PageHeader } from '@/components/AppShell';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { listUserWorkspaces } from '@/services/firestore';
import { getFirebaseAuth } from '@/services/firebase';
import type { MembershipDiscoveryIndexEntry } from '@/types/trustedBootstrap';
import { WorkspaceButton, WorkspaceInput } from '@/components/WorkspaceControls';
import { invitationToken, workspaceCommand, type WorkspaceQuota } from '@/services/workspaceManagement';
import {
  rememberInvitation,
  rememberInitialInvitation,
  pendingInvitation,
  clearInvitation,
} from '@/data/invitationIntent';

export default function WorkspacesScreen() {
  const { activeSpaceId, cloudSpace, workspaceRole, switchWorkspace, isAuthenticated, isReady } = useStore();
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const [items, setItems] = useState<MembershipDiscoveryIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [quota, setQuota] = useState<WorkspaceQuota | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'private' | 'shared'>('private');
  const [invite, setInvite] = useState(() => pendingInvitation() ?? '');
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const createAttempt = useRef<{ payload: string; operationId: string } | null>(null);
  const locked = useRef(false);
  React.useEffect(() => {
    let current = true;
    void Linking.getInitialURL()
      .then((url) => {
        if (url) {
          rememberInitialInvitation(url);
          if (current && pendingInvitation()) setInvite(pendingInvitation()!);
        }
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const token = invitationToken(url);
      if (token) {
        rememberInvitation(token);
        setInvite(token);
      }
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  const execute = async (action: 'create' | 'accept') => {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (locked.current || !uid) return;
    locked.current = true;
    setBusy(true);
    setActionFailed(false);
    try {
      let result: { spaceId: string };
      if (action === 'create') {
        const payload = JSON.stringify({ name: name.trim(), mode });
        if (createAttempt.current?.payload !== payload)
          createAttempt.current = {
            payload,
            operationId: `create_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
          };
        result = await workspaceCommand({
          action,
          name: name.trim(),
          mode,
          operationId: createAttempt.current!.operationId,
        });
      } else {
        const token = invitationToken(invite);
        if (!token) throw new Error('invalidInvitation');
        result = await workspaceCommand({ action, token });
      }
      if (getFirebaseAuth().currentUser?.uid !== uid) return;
      if (action === 'accept') clearInvitation();
      await switchWorkspace(result.spaceId);
      router.replace('/');
    } catch {
      setActionFailed(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setItems([]);
      setLoading(true);
      setFailed(false);
      if (!isReady)
        return () => {
          current = false;
        };
      const uid = getFirebaseAuth().currentUser?.uid;
      if (!uid || !isAuthenticated) {
        router.replace('/login');
        return;
      }
      void listUserWorkspaces(uid)
        .then((result) => {
          if (current) setItems(result);
        })
        .catch(() => {
          if (current) setFailed(true);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
      setQuota(null);
      void workspaceCommand<WorkspaceQuota>({ action: 'quota' })
        .then((result) => {
          if (current) setQuota(result);
        })
        .catch(() => {
          if (current) setFailed(true);
        });
      return () => {
        current = false;
      };
    }, [isReady, isAuthenticated, refresh, router]),
  );
  const align = { textAlign: isRTL ? ('right' as const) : ('left' as const) };
  return (
    <AppShell>
      <PageHeader title={t('workspaces')} subtitle={t('workspaceSettingsHint')} showBack />
      {actionFailed ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.destructive, marginBottom: 14 }}>
          {t('workspaceOperationFailed')}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {failed ? <Text style={{ color: colors.destructive }}>{t('workspaceUnavailable')}</Text> : null}
      {items.map((item) => {
        const current = item.spaceId === activeSpaceId && !!workspaceRole;
        return (
          <GlassCard key={item.spaceId} style={{ marginBottom: 14, gap: 12 }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name={current ? 'checkmark-circle' : 'layers-outline'} size={24} color={colors.primary} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[align, { color: colors.foreground, fontSize: 18 }]}>
                  {current ? cloudSpace?.name : item.spaceNameSnapshot}
                </Text>
                {current ? (
                  <Text style={[align, { color: colors.primary }]}>
                    {t('workspaceCurrent')} ·{' '}
                    {t(
                      workspaceRole === 'owner'
                        ? 'workspaceOwner'
                        : workspaceRole === 'editor'
                          ? 'workspaceEditor'
                          : 'workspaceViewer',
                    )}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              testID={`switch-workspace-${item.spaceId}`}
              onPress={() => {
                void switchWorkspace(item.spaceId);
                router.replace('/');
              }}
              style={{ paddingVertical: 14 }}
            >
              <Text style={[align, { color: colors.primary }]}>{t('workspaceSwitch')}</Text>
            </Pressable>
            {current ? (
              <Pressable
                accessibilityRole="button"
                testID="open-workspace-settings"
                onPress={() => router.push('/workspace-settings' as never)}
                style={{ paddingVertical: 14 }}
              >
                <Text style={[align, { color: colors.foreground }]}>{t('workspaceSettings')}</Text>
              </Pressable>
            ) : null}
          </GlassCard>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => setRefresh((v) => v + 1)} style={{ padding: 16 }}>
        <Text style={[align, { color: colors.primary }]}>{t('workspaceRefresh')}</Text>
      </Pressable>
      <GlassCard style={{ gap: 14, marginBottom: 18 }}>
        <Text style={[align, { color: colors.foreground, fontSize: 20 }]}>{t('workspaceCreate')}</Text>
        {quota ? (
          <View style={{ gap: 8 }}>
            {(['private', 'shared'] as const).map((type) => (
              <Text key={type} style={[align, { color: colors.mutedForeground }]}>
                {t(type === 'private' ? 'workspacePrivate' : 'workspaceShared')}: {quota.used[type]} /{' '}
                {quota.limits[type]} · {t('workspaceRemaining')}: {Math.max(0, quota.limits[type] - quota.used[type])}
              </Text>
            ))}
          </View>
        ) : null}
        <WorkspaceInput label={t('workspaceName')} value={name} onChangeText={setName} disabled={busy} maxLength={80} />
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, flexWrap: 'wrap' }}>
          {(['private', 'shared'] as const).map((value) => (
            <WorkspaceButton
              key={value}
              disabled={busy}
              label={`${mode === value ? '✓ ' : ''}${t(value === 'private' ? 'workspacePrivate' : 'workspaceShared')}`}
              onPress={() => setMode(value)}
            />
          ))}
        </View>
        <WorkspaceButton
          testID="create-workspace"
          label={t('workspaceCreate')}
          disabled={busy || !name.trim() || !quota || quota.used[mode] >= quota.limits[mode]}
          onPress={() => void execute('create')}
        />
      </GlassCard>
      <GlassCard style={{ gap: 14, marginBottom: 18 }}>
        <Text style={[align, { color: colors.foreground, fontSize: 20 }]}>{t('workspaceJoin')}</Text>
        <Text style={[align, { color: colors.mutedForeground, lineHeight: 22 }]}>{t('workspaceInviteHint')}</Text>
        <WorkspaceInput label={t('workspaceInviteCode')} value={invite} onChangeText={setInvite} disabled={busy} />
        <WorkspaceButton
          testID="accept-workspace-invitation"
          label={t('workspaceJoin')}
          disabled={busy || !invitationToken(invite)}
          onPress={() => void execute('accept')}
        />
      </GlassCard>
    </AppShell>
  );
}
