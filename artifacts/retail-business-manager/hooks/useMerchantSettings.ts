import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer, getFirestore, onSnapshot } from 'firebase/firestore';
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
  const generation = useRef(0);
  const confirmed = useRef<{ key: string; minimum: number; data: MerchantSettings | null }>({ key, minimum: 0, data: null });
  if (confirmed.current.key !== key) confirmed.current = { key, minimum: 0, data: null };
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
  const fromSnapshot = (snapshot: { exists(): boolean; data(): unknown }): MerchantSettings => {
    if (!snapshot.exists()) return emptyMerchantSettings();
    const raw = snapshot.data() as Record<string, unknown> | undefined;
    if (raw?.workspaceId !== activeSpaceId || raw.storeId !== profile.id || raw.version !== 1) throw new Error('settingsScopeMismatch');
    return validateMerchantSettings(raw);
  };
  const receive = (next: MerchantSettings) => {
    const previous = confirmed.current;
    if (previous.key !== key || next.revision < previous.minimum || next.revision < (previous.data?.revision ?? 0)) return;
    previous.data = next;
    setState({ key, data: next, error: false });
  };
  useEffect(() => {
    let alive = true;
    generation.current++;
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
          receive(fromSnapshot(snapshot));
        } catch {
          fail();
        }
      },
      fail,
    );
    return () => {
      alive = false;
      generation.current++;
      unsubscribe();
    };
  }, [key, ready, activeSpaceId, profile.id, retry]);
  const data = ready && state.key === key && !state.error ? state.data : null;
  return {
    data,
    error: ready && state.key === key && state.error,
    retry: () => setRetry((value) => value + 1),
    save: async (settings: MerchantSettings, operationId: string) => {
      if (!ready || !activeSpaceId || !store.canWriteBusiness) throw new Error('workspaceReadOnly');
      const expected = key;
      const expectedGeneration = generation.current;
      store.assertBusinessAccess(activeSpaceId, sessionKey);
      const response = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
        getFunctions(getFirebaseApp()),
        'merchantSettingsCommand',
      )({ spaceId: activeSpaceId, storeId: profile.id, operationId, settings });
      if (current.current !== expected || generation.current !== expectedGeneration) throw new Error('workspaceSessionChanged');
      store.assertBusinessAccess(activeSpaceId, sessionKey);
      if (
        !['updated', 'replayed'].includes(String(response.data?.outcome)) ||
        response.data.operationId !== operationId ||
        response.data.revision !== settings.revision + 1 ||
        typeof response.data.processedAt !== 'string' ||
        !Number.isFinite(Date.parse(response.data.processedAt))
      )
        throw new Error('invalidSettingsResponse');
      const revision = settings.revision + 1;
      confirmed.current.minimum = Math.max(confirmed.current.minimum, revision);
      if (!confirmed.current.data || confirmed.current.data.revision < revision) {
        // One bounded read only when the live listener has not delivered the acknowledged revision.
        setState({ key, data: null, error: false });
        const snapshot = await getDocFromServer(doc(getFirestore(getFirebaseApp()), `${workspaceDocumentPath(activeSpaceId)}/merchantSettings/config`));
        if (current.current !== expected || generation.current !== expectedGeneration) throw new Error('workspaceSessionChanged');
        store.assertBusinessAccess(activeSpaceId, sessionKey);
        const next = fromSnapshot(snapshot);
        if (!snapshot.exists() || next.revision < revision) throw new Error('invalidSettingsResponse');
        receive(next);
      }
      return { ...response.data, settings: confirmed.current.data! };
    },
  };
}
