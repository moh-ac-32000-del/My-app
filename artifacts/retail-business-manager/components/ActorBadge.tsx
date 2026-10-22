import React from 'react';
import { Text } from 'react-native';
import { useMemberNames } from '@/context/MemberNamesContext';
import { useI18n } from '@/hooks/useI18n';
import { memberColor } from '@/data/memberIdentity';

export function ActorBadge({ userId }: { userId?: string }) {
  const { directory, ensureName } = useMemberNames();
  const { t, isRTL } = useI18n();
  const name = directory?.members.find((member) => member.userId === userId)?.displayName;
  React.useEffect(() => {
    if (directory && userId && !name) ensureName(userId);
  }, [directory, userId, name, ensureName]);
  return (
    <Text
      testID="actor-badge"
      accessibilityLabel={`${t('memberRecordedBy')}: ${name || t('memberUnnamed')}`}
      style={{
        fontSize: 11,
        lineHeight: 17,
        marginTop: 3,
        textAlign: isRTL ? 'right' : 'left',
        color: userId && directory ? memberColor(directory.spaceId, userId) : '#A8AAB8',
      }}
    >
      {name || t('memberUnnamed')}
    </Text>
  );
}
