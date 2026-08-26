import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { translate } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { AppShell, EmptyState, PageHeader } from '@/components/AppShell';

export function UnderDevelopmentScreen({ title, icon }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { profile } = useStore();
  return (
    <AppShell>
      <PageHeader title={title} subtitle={translate('overview', profile.language)} />
      <EmptyState icon={icon} title={translate('underDevelopment', profile.language)} hint={translate('underDevelopmentHint', profile.language)} />
    </AppShell>
  );
}