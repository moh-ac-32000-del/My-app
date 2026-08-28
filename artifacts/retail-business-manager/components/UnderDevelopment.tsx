import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { TranslationKey } from '@/constants/i18n';
import { useStore } from '@/context/StoreContext';
import { AppShell, EmptyState, PageHeader } from '@/components/AppShell';
import { useI18n } from '@/hooks/useI18n';

export function UnderDevelopmentScreen({ titleKey, icon }: { titleKey: TranslationKey; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { t } = useI18n();
  return (
    <AppShell>
      <PageHeader title={t(titleKey)} subtitle={t('overview')} />
      <EmptyState icon={icon} title={t('underDevelopment')} hint={t('underDevelopmentHint')} />
    </AppShell>
  );
}