import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { useSessionLiveReads } from '@/context/SessionLiveReadsContext';
import { subscribeMerchantJournal } from '@/services/merchantJournalFirestore';
import { useFinancialWindow } from './useFinancialWindow';
import type { MerchantOperation } from '@/types/merchant';
import { journalHistoryWindow } from '@/data/journalHistoryWindow';
import { closingSettings } from '@/data/workspaceClosing';
const empty: MerchantOperation[] = [];

export function useMerchantJournal(refreshToken: number, selectedDate?: string) {
  const reads = useSessionLiveReads();
  const store = useStore();
  const liveClock = useFinancialWindow();
  const clock = useMemo(() => {
    if (!selectedDate) return liveClock;
    try {
      if (liveClock.error || !liveClock.window) throw new Error(liveClock.error ?? 'journalCalendarUnavailable');
      const timeZone = store.cloudSpace?.automaticClosing ? liveClock.window.timeZone : closingSettings(store.cloudSpace?.closingSettings).timeZone;
      return { window: journalHistoryWindow(selectedDate, timeZone), error: null };
    } catch (error) {
      return { window: null, error: error instanceof Error ? error.message : 'journalCalendarUnavailable' };
    }
  }, [selectedDate, liveClock.window?.date, liveClock.window?.startAt, liveClock.window?.endAt, liveClock.window?.timeZone, liveClock.error, store.cloudSpace?.automaticClosing, store.cloudSpace?.closingSettings]);
  const day = clock.window?.date ?? '';
  const key = JSON.stringify([
    store.sessionKey,
    store.activeSpaceId,
    store.profile.id,
    store.workspaceRole,
    day,
    clock.window?.startAt,
    clock.window?.endAt,
    clock.error,
    refreshToken,
  ]);
  const current = useRef(key);
  current.current = key;
  const [state, setState] = useState({
    key,
    operations: [] as MerchantOperation[],
    loading: true,
    error: null as string | null,
  });
  const ready = Boolean(
    store.isReady &&
    store.isAuthenticated &&
    !store.activeSpaceLoading &&
    store.activeSpaceId &&
    store.workspaceRole &&
    !store.activeSpaceError &&
    !store.initializationError &&
    store.profile.id,
  );
  useEffect(() => {
    let active = true;
    const update = (operations: MerchantOperation[], loading: boolean, error: string | null) => {
      if (active && current.current === key) setState({ key, operations, loading, error });
    };
    update([], true, null);
    if (!ready || !store.activeSpaceId || !clock.window) return;
    let stop: (() => void) | undefined;
    try {
      const spaceId = store.activeSpaceId, { startAt, endAt } = clock.window;
      const start = (next: (operations: MerchantOperation[]) => void, fail: (error: Error) => void) =>
        subscribeMerchantJournal(spaceId, store.profile.id, startAt, endAt, next, fail);
      const next = (operations: MerchantOperation[]) => update(operations, false, null);
      const fail = (error: Error) => update([], false, error.message);
      // An explicitly opened historical day must not replace the mounted dashboard's live channel.
      stop = reads && !selectedDate ? reads.subscribe('merchantJournal', key, start, next, fail) : start(next, fail);
    } catch (error) {
      update([], false, error instanceof Error ? error.message : 'journalLoadFailed');
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [key, ready, store.activeSpaceId, store.profile.id, day, reads, selectedDate]);
  if (clock.error) return { key, operations: empty, loading: false, error: clock.error, window: undefined };
  return {
    ...(ready && state.key === key ? state : { key, operations: empty, loading: true, error: null }),
    window: clock.window ?? undefined,
  };
}
