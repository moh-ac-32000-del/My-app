import React, { useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useMemberNames } from '@/context/MemberNamesContext';
import { useStore } from '@/context/StoreContext';
import { useI18n } from '@/hooks/useI18n';
import { useColors } from '@/hooks/useColors';
import { getFirebaseAuth } from '@/services/firebase';
import { workspaceCommand } from '@/services/workspaceManagement';
import { memberDisplayName } from '@/data/memberIdentity';
import { WorkspaceButton, WorkspaceInput } from './WorkspaceControls';

export function MemberNamePrompt() {
  const { directory, reload } = useMemberNames();
  const { sessionKey, activeSpaceId, cloudSpace, signOut } = useStore();
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const current = useRef(sessionKey);
  current.current = sessionKey;
  const uid = directory ? getFirebaseAuth().currentUser?.uid : undefined;
  const own = directory?.members.find((member) => member.userId === uid);
  const visible = !!directory && !!own && !own.displayName;
  const save = async () => {
    if (lock.current || !activeSpaceId) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const key = sessionKey;
    try {
      await workspaceCommand({ action: 'setMemberName', spaceId: activeSpaceId, displayName: memberDisplayName(name) });
      if (current.current === key) {
        setName('');
        reload();
      }
    } catch {
      if (current.current === key) setFailed(true);
    } finally {
      lock.current = false;
      if (current.current === key) setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 24 }}>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 22,
            gap: 16,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 19, textAlign: isRTL ? 'right' : 'left' }}>
            {t('memberNameTitle')} · {cloudSpace?.name}
          </Text>
          <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>
            {t('memberNameHint')}
          </Text>
          <WorkspaceInput label={t('memberName')} value={name} onChangeText={setName} maxLength={40} disabled={busy} />
          {failed ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.destructive }}>
              {t('workspaceOperationFailed')}
            </Text>
          ) : null}
          <WorkspaceButton
            testID="confirm-member-name"
            label={t('saveChanges')}
            disabled={busy || !name.trim()}
            onPress={() => void save()}
          />
          <WorkspaceButton
            label={t('logout')}
            disabled={busy}
            onPress={() => {
              void signOut().catch(() => setFailed(true));
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
