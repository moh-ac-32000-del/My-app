import React from 'react';
import { AppShell, EmptyState, PageHeader } from '@/components/AppShell';
import { useI18n } from '@/hooks/useI18n';

export default function ArchiveScreen() {
  const { t } = useI18n();

  return (
    <AppShell>
      <PageHeader title={t('archive')} />
      <EmptyState
        icon="archive-outline"
        title={t('archiveEmpty')}
        hint={t('archiveEmptyHint')}
      />
    </AppShell>
  );
}