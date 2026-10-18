import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { followUpScopeKey, loadFollowUpPreferences, saveFollowUpPreferences, type FollowUpPreferences, type FollowUpScope } from '@/services/followUpPreferences';

export function useFollowUpPreferences(scope: FollowUpScope | null) {
  const key = scope ? followUpScopeKey(scope) : null;
  const currentKey = useRef(key);
  currentKey.current = key;
  const busy = useRef(false);
  const [state, setState] = useState<{ key: string | null; value: FollowUpPreferences | null; error: boolean }>({ key: null, value: null, error: false });
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const uid = scope?.uid, spaceId = scope?.spaceId, storeId = scope?.storeId;
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ key: null, value: null, error: false });
    if (uid && spaceId && storeId && key) {
      void loadFollowUpPreferences({ uid, spaceId, storeId }).then((value) => {
        if (active) setState({ key, value, error: false });
      }).catch(() => { if (active) setState({ key, value: null, error: true }); });
    }
    return () => { active = false; };
  }, [key, uid, spaceId, storeId, refresh]));

  const save = async (value: FollowUpPreferences) => {
    if (!scope || !key || currentKey.current !== key || state.key !== key || !state.value || busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      await saveFollowUpPreferences(scope, value);
      if (currentKey.current === key) setState({ key, value, error: false });
      return currentKey.current === key;
    } finally { busy.current = false; setSaving(false); }
  };
  return { preferences: state.key === key ? state.value : null, error: state.key === key && state.error, saving, save, retry: () => setRefresh((value) => value + 1) };
}
