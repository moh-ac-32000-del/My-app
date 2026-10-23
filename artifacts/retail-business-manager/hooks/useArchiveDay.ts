import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useStore } from '@/context/StoreContext';
import { loadCloudDailyArchivesForDate } from '@/services/cloudDailyArchives';
import { subscribeArchiveDay } from '@/services/archiveDayFirestore';
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
  const [result, setResult] = useState<{ key: string; archives: DailyArchive[]; error: boolean;
    statuses: 'pending' | 'ready' | 'error' } | null>(null);
  const scopeError = activeSpaceError || initializationError;
  const allowed =
    isReady && isAuthenticated && !!activeSpaceId && !!workspaceRole && !activeSpaceLoading && !scopeError;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let generation = 0;
      let stop: (() => void) | undefined;
      setResult(null);
      if (allowed && activeSpaceId) {
        const fail = (error?: Error) => {
          generation++;
          if (active) setResult(error?.message === 'archiveAwaitingServer' ? null :
            { key, archives: [], error: true, statuses: 'error' });
        };
        try {
          stop = subscribeArchiveDay(activeSpaceId, profile.id, date, archives => {
            const request = ++generation;
            if (!active) return;
            setResult({ key, archives, error: false, statuses: archives.length ? 'pending' : 'ready' });
            if (!archives.length) return;
            // Current cancellation/edit annotations must not delay saved values.
            // Overlay labels only: never replace immutable snapshots or balances.
            void loadCloudDailyArchivesForDate(activeSpaceId, profile.id, date).then(annotated => {
              if (!active || generation !== request) return;
              const byId = new Map(annotated.map(row => [row.id, row]));
              const complete = archives.every(row => {
                const current = byId.get(row.id);
                return current && current.closedAt === row.closedAt &&
                  current.snapshot.length === row.snapshot.length && row.snapshot.every((event, index) => {
                    const source = current.snapshot[index];
                    return source.id === event.id && source.sourceId === event.sourceId && source.type === event.type;
                  });
              });
              if (!complete) throw new Error('archiveStatusSnapshotMismatch');
              setResult({ key, error: false, statuses: 'ready', archives: archives.map(row => ({ ...row,
                operationStatuses: byId.get(row.id)?.operationStatuses,
                operationStatusesUnavailable: byId.get(row.id)?.operationStatusesUnavailable,
              })) });
            }).catch((error: unknown) => {
              if (!active || generation !== request) return;
              const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
              if (['functions/permission-denied', 'functions/unauthenticated', 'functions/failed-precondition'].includes(code)) {
                fail();
              } else setResult({ key, archives, error: false, statuses: 'error' });
            });
          }, fail);
        } catch { fail(); }
      }
      return () => {
        active = false;
        stop?.();
      };
    }, [allowed, activeSpaceId, profile.id, date, key, retry]),
  );
  const current = allowed && result?.key === key ? result : null;
  return {
    archives: current?.archives ?? [],
    statusesPending: current?.statuses === 'pending',
    statusesError: current?.statuses === 'error' && !current.error,
    isLoading: !scopeError && (!isReady || activeSpaceLoading || (allowed && !current)),
    error: !!scopeError || (isReady && !activeSpaceLoading && !allowed) || !!current?.error,
    retry: () => setRetry((value) => value + 1),
  };
}
