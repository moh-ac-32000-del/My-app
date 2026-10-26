import { useEffect, useState } from 'react';
import { useSessionLiveReads } from '@/context/SessionLiveReadsContext';
import { subscribeJournalArchives } from '@/services/journalArchiveFirestore';
import type { DailyArchive } from '@/types/business';

export function useJournalArchives(spaceId: string | null, storeId: string,
  sessionKey: string, enabled: boolean, refreshToken: number) {
  const reads = useSessionLiveReads();
  const key = JSON.stringify([sessionKey, spaceId, storeId, refreshToken]);
  const [state, setState] = useState({ key: '', archives: [] as DailyArchive[], loading: true, error: null as string | null });
  useEffect(() => {
    let active = true;
    const update = (archives: DailyArchive[], loading: boolean, error: string | null) => {
      if (active) setState({ key, archives, loading, error });
    };
    if (!enabled || !spaceId) return;
    update([], true, null);
    let stop: (() => void) | undefined;
    try {
      const start = (next: (rows: DailyArchive[]) => void, fail: (error: Error) => void) =>
        subscribeJournalArchives(spaceId, storeId, next, fail);
      const next = (rows: DailyArchive[]) => update(rows, false, null);
      const fail = (error: Error) => update([], false, error.message);
      stop = reads ? reads.subscribe('journalArchives', key, start, next, fail) : start(next, fail);
    } catch (error) { update([], false, error instanceof Error ? error.message : 'journalArchiveLoadFailed'); }
    return () => { active = false; stop?.(); };
  }, [key, enabled, spaceId, storeId, reads]);
  return enabled && state.key === key ? state : { key, archives: [] as DailyArchive[], loading: true, error: null };
}
