type Channel = 'merchantDirectory' | 'merchantJournal' | 'journalArchives';
type Observer<T> = { publish: (value: T) => void; fail: (error: Error) => void };
type Entry<T> = {
  key: string; active: boolean; value?: T; received: boolean; error?: Error;
  observers: Set<Observer<T>>; stop?: () => void;
};

/** Retain three lazily opened, live reads for one authorized workspace session.
 * No disk cache, stale/offline fallback, prefetch or financial write. A channel
 * replaces its previous query (including the financial day and refresh key).
 */
export function createSessionLiveReads() {
  const entries = new Map<Channel, Entry<unknown>>();
  const stopEntry = (entry: Entry<unknown>) => {
    entry.active = false;
    entry.stop?.();
    entry.stop = undefined;
    entry.observers.clear();
    entry.value = undefined;
  };
  return {
    subscribe<T>(channel: Channel, key: string,
      start: (publish: (value: T) => void, fail: (error: Error) => void) => () => void,
      publish: (value: T) => void, fail: (error: Error) => void) {
      let entry = entries.get(channel) as Entry<T> | undefined;
      if (!entry || entry.key !== key) {
        if (entry) stopEntry(entry as Entry<unknown>);
        entry = { key, active: true, received: false, observers: new Set() };
        entries.set(channel, entry as Entry<unknown>);
        const current = entry;
        const reject = (error: Error) => {
          if (!current.active) return;
          current.value = undefined;
          current.received = false;
          current.error = error;
          // Existing journal services use this signal for cached/pending SDK
          // snapshots. Hide previous values but keep waiting for server proof.
          if (channel === 'merchantDirectory' || error.message !== 'journalAwaitingServer') {
            current.active = false;
            current.stop?.();
            current.stop = undefined;
          }
          current.observers.forEach(observer => observer.fail(error));
        };
        try {
          current.stop = start(value => {
            if (!current.active) return;
            current.value = value;
            current.received = true;
            current.error = undefined;
            current.observers.forEach(observer => observer.publish(value));
          }, reject);
          // A source may fail synchronously before returning its unsubscribe.
          if (!current.active) { current.stop(); current.stop = undefined; }
        } catch (error) {
          reject(error instanceof Error ? error : new Error('liveReadFailed'));
        }
      }
      const observer = { publish, fail };
      entry.observers.add(observer);
      if (entry.error) fail(entry.error);
      else if (entry.received) publish(entry.value as T);
      return () => { entry.observers.delete(observer); };
    },
    clear() {
      entries.forEach(stopEntry);
      entries.clear();
    },
  };
}
