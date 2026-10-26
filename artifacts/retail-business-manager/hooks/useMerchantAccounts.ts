import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StoreContext';
import { useSessionLiveReads } from '@/context/SessionLiveReadsContext';
import { loadMerchantHistoryPage, sendMerchantCommand, subscribeMerchantAccounts } from '@/services/merchantFirestore';
import { createMerchantHistorySession } from '@/data/merchantHistory';
import type { MerchantDraftCommand, MerchantSnapshot } from '@/types/merchant';

const empty: MerchantSnapshot = { merchants: [], balances: [], operations: [], operationsLimited: false };
export function useMerchantAccounts(merchantId?: string) {
  const reads = useSessionLiveReads();
  const {
    profile,
    activeSpaceId,
    sessionKey,
    isAuthenticated,
    isReady,
    activeSpaceLoading,
    activeSpaceError,
    initializationError,
    workspaceRole,
    canWriteBusiness,
    assertBusinessAccess,
  } = useStore();
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([sessionKey, activeSpaceId, workspaceRole, profile.id, merchantId ?? null]);
  const current = useRef(key);
  current.current = key;
  const historyRef = useRef<{ key: string; session: ReturnType<typeof createMerchantHistorySession> } | null>(null);
  if (historyRef.current?.key !== key) {
    historyRef.current?.session.stop();
    historyRef.current = { key, session: createMerchantHistorySession() };
  }
  const stopRef = useRef<{ key: string; stop: () => void } | null>(null);
  const [state, setState] = useState({
    key,
    data: empty,
    loading: true,
    historyLoading: false,
    error: null as string | null,
  });
  useEffect(() => {
    let active = true;
    historyRef.current = { key, session: createMerchantHistorySession() };
    const history = historyRef.current.session;
    const publish = (data: MerchantSnapshot, loading: boolean, error: string | null) => {
      if (!active || current.current !== key) return;
      if (error) history.stop();
      const page =
        !loading && !error
          ? history.receiveHead(data.operations, data.operationsLimited)
          : { operations: [], operationsLimited: false, historyLoading: false };
      setState({
        key,
        data: { ...data, operations: page.operations, operationsLimited: page.operationsLimited },
        loading,
        error,
        historyLoading: page.historyLoading,
      });
    };
    publish(empty, true, null);
    if (activeSpaceError || initializationError) {
      publish(empty, false, activeSpaceError || initializationError);
      return;
    }
    if (!isAuthenticated || !isReady || activeSpaceLoading || !activeSpaceId || !workspaceRole || !profile.id) return;
    let unsubscribe: (() => void) | undefined;
    try {
      const start = (next: (data: MerchantSnapshot) => void, fail: (error: Error) => void) =>
        subscribeMerchantAccounts(activeSpaceId, profile.id, next, fail, merchantId);
      const next = (data: MerchantSnapshot) => publish(data, false, null);
      const fail = (error: Error) => publish(empty, false, error.message);
      unsubscribe = reads && !merchantId
        ? reads.subscribe('merchantDirectory', JSON.stringify([key, retry]), start, next, fail)
        : start(next, fail);
      stopRef.current = { key, stop: unsubscribe };
    } catch (error) {
      publish(empty, false, error instanceof Error ? error.message : 'merchantLoadFailed');
    }
    return () => {
      active = false;
      history.stop();
      unsubscribe?.();
      if (stopRef.current?.key === key) stopRef.current = null;
    };
  }, [
    key,
    activeSpaceId,
    profile.id,
    isAuthenticated,
    isReady,
    activeSpaceLoading,
    activeSpaceError,
    initializationError,
    workspaceRole,
    retry,
    merchantId,
    reads,
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
    isAuthenticated && isReady && !activeSpaceLoading && activeSpaceId && workspaceRole && !activeSpaceError && !initializationError;
  const visible =
    usable && state.key === key
      ? state
      : { key, data: empty, loading: !(activeSpaceError || initializationError), historyLoading: false, error: activeSpaceError || initializationError };
  const loadMore = async () => {
    if (
      !usable ||
      !merchantId ||
      !activeSpaceId ||
      current.current !== key ||
      state.key !== key ||
      state.error ||
      state.loading
    )
      return;
    const history = historyRef.current?.session;
    const cursor = history?.beginPage();
    if (!history || !cursor) return;
    setState((previous) => (previous.key === key ? { ...previous, historyLoading: true } : previous));
    try {
      const page = await loadMerchantHistoryPage(activeSpaceId, profile.id, merchantId, cursor);
      if (current.current !== key || historyRef.current?.session !== history || !history.isActive()) return;
      const view = history.completePage(page.operations, page.hasMore);
      setState((previous) =>
        previous.key === key && !previous.error
          ? {
              ...previous,
              data: { ...previous.data, operations: view.operations, operationsLimited: view.operationsLimited },
              historyLoading: false,
            }
          : previous,
      );
    } catch (error) {
      if (current.current !== key || historyRef.current?.session !== history) return;
      history.stop();
      if (stopRef.current?.key === key) stopRef.current.stop();
      setState({
        key,
        data: empty,
        loading: false,
        historyLoading: false,
        error: error instanceof Error ? error.message : 'merchantHistoryFailed',
      });
    }
  };
  return {
    ...visible.data,
    isLoading: visible.loading,
    error: visible.error,
    retry: () => setRetry((value) => value + 1),
    command,
    loadMore,
    historyLoading: visible.historyLoading,
  };
}
