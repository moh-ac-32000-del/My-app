import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createSessionLiveReads } from '@/data/sessionLiveReads';
import { useStore } from './StoreContext';

const Context = createContext<ReturnType<typeof createSessionLiveReads> | null>(null);

export function SessionLiveReadsProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const enabled = Boolean(store.isReady && store.isAuthenticated && !store.activeSpaceLoading &&
    !store.activeSpaceError && !store.initializationError && store.activeSpaceId && store.workspaceRole);
  const scope = JSON.stringify([store.sessionKey, store.activeSpaceId, store.profile.id, store.workspaceRole, enabled]);
  const reads = useMemo(() => createSessionLiveReads(), [scope]);
  useEffect(() => () => reads.clear(), [reads]);
  return <Context.Provider value={reads}>{children}</Context.Provider>;
}

// Screens outside the application root (isolated render tests) retain their
// original subscribe/unsubscribe behavior rather than a module-global cache.
export const useSessionLiveReads = () => useContext(Context);
