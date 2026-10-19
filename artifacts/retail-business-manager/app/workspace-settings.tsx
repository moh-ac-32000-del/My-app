import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppShell, GlassCard, PageHeader, SectionTitle } from '@/components/AppShell';
import { WorkspaceButton, WorkspaceInput, WorkspaceRolePicker } from '@/components/WorkspaceControls';
import { useStore } from '@/context/StoreContext';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/hooks/useI18n';
import {
  workspaceCommand,
  workspaceInvitationLink,
  type WorkspaceOverview,
  type WorkspaceRequest,
} from '@/services/workspaceManagement';

export default function WorkspaceSettingsScreen() {
  const { activeSpaceId, cloudSpace, canManageSpace, sessionKey } = useStore();
  const { t, isRTL, language } = useI18n();
  const colors = useColors();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [link, setLink] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const lock = useRef(false);
  const current = useRef(sessionKey);
  current.current = sessionKey;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setOverview(null);
      setLoading(true);
      setFailed(false);
      setLink('');
      setRemoveId(null);
      if (!activeSpaceId) {
        setLoading(false);
        return;
      }
      void workspaceCommand<WorkspaceOverview>({ action: 'overview', spaceId: activeSpaceId })
        .then((value) => {
          if (active) {
            setOverview(value);
            setName(value.space.name);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [activeSpaceId, refresh]),
  );
  const run = async (input: WorkspaceRequest) => {
    if (lock.current || !activeSpaceId || !canManageSpace) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const key = sessionKey;
    try {
      const result = await workspaceCommand<{ token?: string }>(input);
      if (current.current !== key) return;
      if (result.token) {
        setLink(workspaceInvitationLink(result.token));
      } else {
        setRefresh((v) => v + 1);
        setRemoveId(null);
      }
    } catch {
      if (current.current === key) setFailed(true);
    } finally {
      lock.current = false;
      if (current.current === key) setBusy(false);
    }
  };
  const align = { textAlign: isRTL ? ('right' as const) : ('left' as const) };
  const text = { color: colors.foreground, lineHeight: 23, ...align };
  return (
    <AppShell>
      <PageHeader title={t('workspaceSettings')} subtitle={cloudSpace?.name} showBack />
      <Text style={[text, { marginBottom: 16, color: colors.mutedForeground }]}>{t('workspaceSettingsHint')}</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {failed ? (
        <Text accessibilityLiveRegion="polite" style={[text, { color: colors.destructive, marginBottom: 14 }]}>
          {t('workspaceOperationFailed')}
        </Text>
      ) : null}
      {overview ? (
        <>
          <GlassCard style={{ gap: 14, marginBottom: 18 }}>
            <Text style={[text, { fontSize: 20 }]}>{overview.space.name}</Text>
            <Text style={text}>
              {t(
                overview.role === 'owner'
                  ? 'workspaceOwner'
                  : overview.role === 'editor'
                    ? 'workspaceEditor'
                    : 'workspaceViewer',
              )}
            </Text>
            {canManageSpace ? (
              <>
                <WorkspaceInput
                  label={t('workspaceName')}
                  value={name}
                  onChangeText={setName}
                  maxLength={80}
                  disabled={busy}
                />
                <WorkspaceButton
                  label={t('saveChanges')}
                  disabled={busy || !name.trim() || name.trim() === overview.space.name}
                  onPress={() => void run({ action: 'rename', spaceId: activeSpaceId!, name: name.trim() })}
                />
              </>
            ) : null}
          </GlassCard>
          {canManageSpace && overview.limits && overview.used ? (
            <>
              <SectionTitle title={t('workspaceQuota')} />
              <GlassCard style={{ gap: 12, marginBottom: 18 }}>
                <Text style={text}>
                  {t('workspacePrivate')}: {overview.used.private} / {overview.limits.private} ·{' '}
                  {t('workspaceRemaining')}: {Math.max(0, overview.limits.private - overview.used.private)}
                </Text>
                <Text style={text}>
                  {t('workspaceShared')}: {overview.used.shared} / {overview.limits.shared} · {t('workspaceRemaining')}:{' '}
                  {Math.max(0, overview.limits.shared - overview.used.shared)}
                </Text>
                <Text style={[text, { color: colors.mutedForeground }]}>{t('workspaceQuotaHint')}</Text>
              </GlassCard>
              <SectionTitle title={t('workspaceMembers')} />
              {(overview.members ?? [])
                .filter((member) => member.status === 'active')
                .map((member) => (
                  <GlassCard key={member.userId} style={{ gap: 12, marginBottom: 14 }}>
                    <Text style={text}>{member.displayName}</Text>
                    <Text style={[text, { color: colors.primary }]}>
                      {t(
                        member.role === 'owner'
                          ? 'workspaceOwner'
                          : member.role === 'editor'
                            ? 'workspaceEditor'
                            : 'workspaceViewer',
                      )}
                    </Text>
                    {member.role !== 'owner' ? (
                      <>
                        <WorkspaceRolePicker
                          value={member.role}
                          disabled={busy}
                          onChange={(next) => {
                            if (next !== member.role)
                              void run({ action: 'role', spaceId: activeSpaceId!, userId: member.userId, role: next });
                          }}
                        />
                        {removeId === member.userId ? (
                          <View style={{ gap: 12 }}>
                            <Text style={text}>{t('workspaceRemoveHint')}</Text>
                            <WorkspaceButton
                              label={t('confirm')}
                              destructive
                              disabled={busy}
                              onPress={() =>
                                void run({ action: 'remove', spaceId: activeSpaceId!, userId: member.userId })
                              }
                            />
                            <WorkspaceButton label={t('cancel')} disabled={busy} onPress={() => setRemoveId(null)} />
                          </View>
                        ) : (
                          <WorkspaceButton
                            label={t('workspaceRemove')}
                            destructive
                            disabled={busy}
                            onPress={() => setRemoveId(member.userId)}
                          />
                        )}
                      </>
                    ) : null}
                  </GlassCard>
                ))}
              <GlassCard style={{ gap: 14, marginBottom: 18 }}>
                <Text style={text}>{t('workspaceInviteSecret')}</Text>
                <WorkspaceRolePicker value={role} disabled={busy} onChange={setRole} />
                <WorkspaceButton
                  testID="create-workspace-invitation"
                  label={t('workspaceInvite')}
                  disabled={busy || !!link}
                  onPress={() => void run({ action: 'invite', spaceId: activeSpaceId!, role })}
                />
                {link ? (
                  <>
                    <Text selectable style={[text, { color: colors.primary }]}>
                      {link}
                    </Text>
                    <WorkspaceButton
                      label={t('workspaceInviteShare')}
                      onPress={() =>
                        void Share.share({
                          message: `${t('workspaceInviteShare')} — ${overview.space.name}\n${t('workspaceInviteHint')}\n${link}`,
                        }).catch(() => setFailed(true))
                      }
                    />
                  </>
                ) : null}
              </GlassCard>
              <SectionTitle title={t('workspacePendingInvites')} />
              {(overview.invitations ?? [])
                .filter((invite) => invite.status === 'pending')
                .map((invite) => (
                  <GlassCard key={invite.invitationId} style={{ gap: 12, marginBottom: 14 }}>
                    <Text style={text}>
                      {t(invite.role === 'editor' ? 'workspaceEditor' : 'workspaceViewer')} ·{' '}
                      {new Date(invite.expiresAt).toLocaleString(language)}
                    </Text>
                    <WorkspaceButton
                      label={t('workspaceRevoke')}
                      destructive
                      disabled={busy}
                      onPress={() =>
                        void run({ action: 'revoke', spaceId: activeSpaceId!, invitationId: invite.invitationId })
                      }
                    />
                  </GlassCard>
                ))}
            </>
          ) : null}
        </>
      ) : null}
      <WorkspaceButton label={t('workspaceRefresh')} disabled={busy} onPress={() => setRefresh((v) => v + 1)} />
    </AppShell>
  );
}
