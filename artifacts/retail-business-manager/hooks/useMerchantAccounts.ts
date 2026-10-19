import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { sendMerchantCommand, subscribeMerchantAccounts } from '@/services/merchantFirestore';
import type { MerchantDraftCommand, MerchantSnapshot } from '@/types/merchant';

const empty: MerchantSnapshot = { merchants: [], balances: [], operations: [], operationsLimited: false };
export function useMerchantAccounts(merchantId?: string) {
  const {
    profile,
    activeSpaceId,
    sessionKey,
    isAuthenticated,
    isReady,
    activeSpaceLoading,
    activeSpaceError,
    workspaceRole,
    canWriteBusiness,
    assertBusinessAccess,
  } = useStore();
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([sessionKey, activeSpaceId, workspaceRole, profile.id, merchantId ?? null]);
  const current = useRef(key);
  current.current = key;
  const [state, setState] = useState({ key, data: empty, loading: true, error: null as string | null });
  useEffect(() => {
    let active = true;
    const publish = (data: MerchantSnapshot, loading: boolean, error: string | null) => {
      if (active && current.current === key) setState({ key, data, loading, error });
    };
    publish(empty, true, null);
    if (activeSpaceError) {
      publish(empty, false, activeSpaceError);
      return;
    }
    if (!isAuthenticated || !isReady || activeSpaceLoading || !activeSpaceId || !workspaceRole || !profile.id) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeMerchantAccounts(
        activeSpaceId,
        profile.id,
        (data) => publish(data, false, null),
        (error) => publish(empty, false, error.message),
        merchantId,
      );
    } catch (error) {
      publish(empty, false, error instanceof Error ? error.message : 'merchantLoadFailed');
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [
    key,
    activeSpaceId,
    profile.id,
    isAuthenticated,
    isReady,
    activeSpaceLoading,
    activeSpaceError,
    workspaceRole,
    retry,
    merchantId,
  ]);
  const command = useCallback(
    async (input: MerchantDraftCommand) => {
      if (merchantId && input.merchantId !== merchantId) throw new Error('merchantScopeChanged');
      if (!canWriteBusiness || !activeSpaceId) throw new Error('workspaceReadOnly');
      const expected = key;
      assertBusinessAccess(activeSpaceId, sessionKey);
      const result = await sendMerchantCommand(activeSpaceId, profile.id, input);
      // A command initiated in A may complete there; never publish its success as a result in B.
      if (current.current !== expected) throw new Error('workspaceSessionChanged');
      assertBusinessAccess(activeSpaceId, sessionKey);
      return result;
    },
    [activeSpaceId, canWriteBusiness, sessionKey, profile.id, key, assertBusinessAccess, merchantId],
  );
  const usable =
    isAuthenticated && isReady && !activeSpaceLoading && activeSpaceId && workspaceRole && !activeSpaceError;
  const visible =
    usable && state.key === key ? state : { key, data: empty, loading: !activeSpaceError, error: activeSpaceError };
  return {
    ...visible.data,
    isLoading: visible.loading,
    error: visible.error,
    retry: () => setRetry((value) => value + 1),
    command,
  };
}
