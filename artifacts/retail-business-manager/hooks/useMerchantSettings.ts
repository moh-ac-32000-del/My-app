import { useEffect, useRef, useState } from 'react';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/services/firebase';
import { useStore } from '@/context/StoreContext';
import { workspaceDocumentPath } from '@/data/firestoreWorkspace';
import { validateMerchantSettings } from '@/data/merchantSettings';
import { emptyMerchantSettings, type MerchantSettings } from '@/types/merchantSettings';

/** One bounded reference document, read only while a merchant form/settings screen is open. */
export function useMerchantSettings(enabled = true) {
  const store = useStore();
  const { activeSpaceId, sessionKey, profile, workspaceRole } = store;
  const key = JSON.stringify([sessionKey, activeSpaceId, profile.id, workspaceRole]);
  const current = useRef(key);
  current.current = key;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ key, data: null as MerchantSettings | null, error: false });
  const ready =
    enabled &&
    store.isReady &&
    store.isAuthenticated &&
    !store.activeSpaceLoading &&
    !store.activeSpaceError &&
    !!activeSpaceId &&
    !!workspaceRole;
  useEffect(() => {
    let alive = true;
    setState({ key, data: null, error: false });
    if (!ready || !activeSpaceId) return;
    const fail = () => {
      if (alive && current.current === key) setState({ key, data: null, error: true });
    };
    const unsubscribe = onSnapshot(
      doc(getFirestore(getFirebaseApp()), `${workspaceDocumentPath(activeSpaceId)}/merchantSettings/config`),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!alive || current.current !== key) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          setState({ key, data: null, error: false });
          return;
        }
        try {
          const raw = snapshot.data();
          if (
            snapshot.exists() &&
            (raw?.workspaceId !== activeSpaceId || raw.storeId !== profile.id || raw.version !== 1)
          )
            throw new Error('scope');
          setState({
            key,
            data: snapshot.exists() ? validateMerchantSettings(raw) : emptyMerchantSettings(),
            error: false,
          });
        } catch {
          fail();
        }
      },
      fail,
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [key, ready, activeSpaceId, profile.id, retry]);
  const data = ready && state.key === key && !state.error ? state.data : null;
  return {
    data,
    error: ready && state.key === key && state.error,
    retry: () => setRetry((value) => value + 1),
    save: async (settings: MerchantSettings, operationId: string) => {
      if (!activeSpaceId || !store.canWriteBusiness) throw new Error('workspaceReadOnly');
      const expected = key;
      store.assertBusinessAccess(activeSpaceId, sessionKey);
      const response = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
        getFunctions(getFirebaseApp()),
        'merchantSettingsCommand',
      )({ spaceId: activeSpaceId, storeId: profile.id, operationId, settings });
      if (current.current !== expected) throw new Error('workspaceSessionChanged');
      store.assertBusinessAccess(activeSpaceId, sessionKey);
      if (
        !['updated', 'replayed'].includes(String(response.data?.outcome)) ||
        response.data.operationId !== operationId ||
        response.data.revision !== settings.revision + 1 ||
        typeof response.data.processedAt !== 'string' ||
        !Number.isFinite(Date.parse(response.data.processedAt))
      )
        throw new Error('invalidSettingsResponse');
      return response.data;
    },
  };
}
