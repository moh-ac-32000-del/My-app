/** Stage independent Firestore listeners; publish only at the SDK's snapshots-in-sync barrier.
 * This is not a server acknowledgement: the caller also marks whether each snapshot is cached.
 * Invalidation is permanent until a new subscription/session is created.
 */
export function synchronizedSnapshots<T extends Record<string, unknown>>(
  keys: Array<keyof T>,
  publish: (value: T) => void,
  fail: (error: Error) => void,
) {
  const staged = new Map<keyof T, T[keyof T]>();
  const confirmed = new Map<keyof T, boolean>();
  let active = true;
  let dirty = false;
  return {
    receive<K extends keyof T>(key: K, value: T[K], fromCache: boolean) {
      if (!active || !keys.includes(key)) return;
      staged.set(key, value);
      confirmed.set(key, !fromCache);
      dirty = true;
    },
    sync() {
      if (!active || !dirty || keys.some((key) => !staged.has(key) || !confirmed.get(key))) return;
      dirty = false;
      try {
        publish(Object.fromEntries(staged) as T);
      } catch (error) {
        active = false;
        staged.clear();
        confirmed.clear();
        fail(error instanceof Error ? error : new Error('snapshotPublicationFailed'));
      }
    },
    error(error: Error) {
      if (!active) return;
      active = false;
      staged.clear();
      confirmed.clear();
      fail(error);
    },
    stop() {
      active = false;
      staged.clear();
      confirmed.clear();
    },
  };
}
