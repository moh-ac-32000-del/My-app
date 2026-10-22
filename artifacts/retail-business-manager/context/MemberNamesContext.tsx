import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { workspaceCommand } from '@/services/workspaceManagement';

export interface MemberNames {
  spaceId: string;
  members: Array<{ userId: string; displayName: string | null }>;
}
const Context = createContext<{ directory: MemberNames | null; reload: () => void; ensureName: (uid: string) => void }>(
  { directory: null, reload: () => {}, ensureName: () => {} },
);
export const useMemberNames = () => useContext(Context);

export function MemberNamesProvider({ children }: React.PropsWithChildren) {
  const { activeSpaceId, sessionKey, isReady, isAuthenticated, workspaceRole } = useStore();
  const [result, setResult] = useState<{ key: string; data: MemberNames } | null>(null);
  const [revision, setRevision] = useState(0);
  const requested = useRef(new Set<string>());
  useEffect(() => {
    requested.current.clear();
  }, [sessionKey]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const ensureName = useCallback(
    (uid: string) => {
      if (requested.current.has(uid)) return;
      requested.current.add(uid);
      reload();
    },
    [reload],
  );
  useEffect(() => {
    let current = true;
    setResult(null);
    if (activeSpaceId && isReady && isAuthenticated && workspaceRole)
      void workspaceCommand<MemberNames>({ action: 'memberNames', spaceId: activeSpaceId })
        .then((data) => {
          if (current && data.spaceId === activeSpaceId) setResult({ key: sessionKey, data });
        })
        .catch(() => {
          /* Never substitute an Auth email or another space's directory. */
        });
    return () => {
      current = false;
    };
  }, [activeSpaceId, sessionKey, isReady, isAuthenticated, workspaceRole, revision]);
  const directory = result?.key === sessionKey && result.data.spaceId === activeSpaceId ? result.data : null;
  return <Context.Provider value={{ directory, reload, ensureName }}>{children}</Context.Provider>;
}
