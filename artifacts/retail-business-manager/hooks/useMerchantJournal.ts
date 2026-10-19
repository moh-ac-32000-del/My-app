import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { subscribeMerchantJournal } from '@/services/merchantJournalFirestore';
import { getLocalDateKey } from '@/services/storage';
import type { MerchantOperation } from '@/types/merchant';
const empty: MerchantOperation[] = [];

export function useMerchantJournal(refreshToken: number) {
  const store = useStore();
  const [day, setDay] = useState(() => getLocalDateKey());
  const key = JSON.stringify([
    store.sessionKey,
    store.activeSpaceId,
    store.profile.id,
    store.workspaceRole,
    day,
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
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const nextDay = () => {
      const now = new Date();
      setDay(getLocalDateKey(now));
      timer = setTimeout(
        nextDay,
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 50,
      );
    };
    nextDay();
    return () => clearTimeout(timer);
  }, []);
  const ready = Boolean(
    store.isReady &&
    store.isAuthenticated &&
    !store.activeSpaceLoading &&
    store.activeSpaceId &&
    store.workspaceRole &&
    !store.activeSpaceError &&
    store.profile.id,
  );
  useEffect(() => {
    let active = true;
    const update = (operations: MerchantOperation[], loading: boolean, error: string | null) => {
      if (active && current.current === key) setState({ key, operations, loading, error });
    };
    update([], true, null);
    if (!ready || !store.activeSpaceId) return;
    const [year, month, date] = day.split('-').map(Number);
    let stop: (() => void) | undefined;
    try {
      stop = subscribeMerchantJournal(
        store.activeSpaceId,
        store.profile.id,
        new Date(year, month - 1, date).toISOString(),
        new Date(year, month - 1, date + 1).toISOString(),
        (operations) => update(operations, false, null),
        (error) => update([], false, error.message),
      );
    } catch (error) {
      update([], false, error instanceof Error ? error.message : 'journalLoadFailed');
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [key, ready, store.activeSpaceId, store.profile.id, day]);
  return ready && state.key === key ? state : { key, operations: empty, loading: true, error: null };
}
