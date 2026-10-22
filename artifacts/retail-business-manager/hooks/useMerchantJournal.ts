import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { subscribeMerchantJournal } from '@/services/merchantJournalFirestore';
import { useFinancialWindow } from './useFinancialWindow';
import type { MerchantOperation } from '@/types/merchant';
const empty: MerchantOperation[] = [];

export function useMerchantJournal(refreshToken: number) {
  const store = useStore();
  const clock = useFinancialWindow();
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
      stop = subscribeMerchantJournal(
        store.activeSpaceId,
        store.profile.id,
        clock.window.startAt,
        clock.window.endAt,
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
  if (clock.error) return { key, operations: empty, loading: false, error: clock.error, window: undefined };
  return {
    ...(ready && state.key === key ? state : { key, operations: empty, loading: true, error: null }),
    window: clock.window ?? undefined,
  };
}
