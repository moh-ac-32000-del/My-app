import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '@/context/StoreContext';
import { loadCloudDailyArchivesForDate } from '@/services/cloudDailyArchives';
import type { DailyArchive } from '@/types/business';

/** Hide old scope/day data during render, before the next focus effect or request resolves. */
export function useArchiveDay(date: string) {
  const {
    profile,
    isReady,
    isAuthenticated,
    activeSpaceId,
    sessionKey,
    workspaceRole,
    activeSpaceLoading,
    activeSpaceError,
    initializationError,
  } = useStore();
  const key = JSON.stringify([sessionKey, workspaceRole, activeSpaceId, profile.id, date]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; archives: DailyArchive[]; error: boolean } | null>(null);
  const scopeError = activeSpaceError || initializationError;
  const allowed =
    isReady && isAuthenticated && !!activeSpaceId && !!workspaceRole && !activeSpaceLoading && !scopeError;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setResult(null);
      if (allowed && activeSpaceId) {
        void loadCloudDailyArchivesForDate(activeSpaceId, profile.id, date)
          .then((archives) => {
            if (active) setResult({ key, archives, error: false });
          })
          .catch(() => {
            if (active) setResult({ key, archives: [], error: true });
          });
      }
      return () => {
        active = false;
      };
    }, [allowed, activeSpaceId, profile.id, date, key, retry]),
  );
  const current = allowed && result?.key === key ? result : null;
  return {
    archives: current?.archives ?? [],
    isLoading: !scopeError && (!isReady || activeSpaceLoading || (allowed && !current)),
    error: !!scopeError || (isReady && !activeSpaceLoading && !allowed) || !!current?.error,
    retry: () => setRetry((value) => value + 1),
  };
}
