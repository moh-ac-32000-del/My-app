import { describe, expect, it, vi } from 'vitest';
import { createSessionLiveReads } from '../data/sessionLiveReads';

function source() {
  let next!: (value: number[]) => void, fail!: (error: Error) => void;
  const stop = vi.fn();
  const start = vi.fn((publish: typeof next, reject: typeof fail) => {
    next = publish; fail = reject; return stop;
  });
  return { start, stop, next: (value: number[]) => next(value), fail: (error: Error) => fail(error) };
}

describe('session-scoped live reads across navigation', () => {
  it('performs no eager reads and reuses one live query across 100 route remounts', () => {
    const reads = createSessionLiveReads(), cloud = source(), publish = vi.fn();
    expect(cloud.start).not.toHaveBeenCalled();
    let leave = reads.subscribe('merchantDirectory', 'space-owner', cloud.start, publish, vi.fn());
    expect(publish).not.toHaveBeenCalled(); // no invented success before a confirmed snapshot
    cloud.next([1]);
    for (let i = 0; i < 100; i++) {
      leave();
      cloud.next([i + 2]); // remains live while another route is open
      leave = reads.subscribe('merchantDirectory', 'space-owner', cloud.start, publish, vi.fn());
      expect(publish).toHaveBeenLastCalledWith([i + 2]);
    }
    expect(cloud.start).toHaveBeenCalledOnce();
    expect(cloud.stop).not.toHaveBeenCalled();
    reads.clear();
    expect(cloud.stop).toHaveBeenCalledOnce();
  });

  it.each(['merchantDirectory', 'merchantJournal', 'journalArchives'] as const)(
    '%s replaces scope/day/refresh query and ignores its late results', channel => {
      const reads = createSessionLiveReads(), old = source(), fresh = source();
      const previous = vi.fn(), current = vi.fn();
      reads.subscribe(channel, 'old-key', old.start, previous, vi.fn()); old.next([1]);
      reads.subscribe(channel, 'new-key', fresh.start, current, vi.fn());
      expect(old.stop).toHaveBeenCalledOnce();
      expect(current).not.toHaveBeenCalled();
      old.next([999]);
      expect(previous).toHaveBeenCalledTimes(1); expect(current).not.toHaveBeenCalled();
      fresh.next([2]); expect(current).toHaveBeenCalledExactlyOnceWith([2]);
      reads.clear();
    });

  it('shares live updates with simultaneous consumers and removes only the leaving observer', () => {
    const reads = createSessionLiveReads(), cloud = source(), a = vi.fn(), b = vi.fn();
    const leave = reads.subscribe('journalArchives', 's', cloud.start, a, vi.fn());
    reads.subscribe('journalArchives', 's', cloud.start, b, vi.fn());
    cloud.next([1]); leave(); cloud.next([2]);
    expect(a).toHaveBeenCalledExactlyOnceWith([1]);
    expect(b).toHaveBeenLastCalledWith([2]); expect(cloud.start).toHaveBeenCalledOnce();
    reads.clear();
  });

  it('clears confirmed values on permission failure, including while no screen observes', () => {
    const reads = createSessionLiveReads(), cloud = source(), fail = vi.fn(), publish = vi.fn();
    const leave = reads.subscribe('merchantDirectory', 's', cloud.start, publish, fail);
    cloud.next([1]); leave();
    cloud.fail(new Error('permission-denied'));
    const reopened = vi.fn(), reopenedError = vi.fn();
    reads.subscribe('merchantDirectory', 's', cloud.start, reopened, reopenedError);
    expect(reopened).not.toHaveBeenCalled();
    expect(reopenedError.mock.calls[0][0].message).toBe('permission-denied');
    cloud.next([999]); expect(reopened).not.toHaveBeenCalled();
    const retry = source();
    reads.subscribe('merchantDirectory', 's-retry', retry.start, reopened, reopenedError);
    retry.next([2]); expect(reopened).toHaveBeenCalledExactlyOnceWith([2]);
    reads.clear();
  });

  it('clears all channels on logout/space/role transition and cannot replay old data', () => {
    const reads = createSessionLiveReads(), sources = [source(), source(), source()];
    const channels = ['merchantDirectory', 'merchantJournal', 'journalArchives'] as const;
    channels.forEach((channel, index) => {
      reads.subscribe(channel, 'A', sources[index].start, vi.fn(), vi.fn()); sources[index].next([index]);
    });
    reads.clear(); reads.clear();
    sources.forEach(cloud => expect(cloud.stop).toHaveBeenCalledOnce());
    const received = vi.fn(), fresh = source();
    reads.subscribe('merchantDirectory', 'B', fresh.start, received, vi.fn());
    sources[0].next([999]); expect(received).not.toHaveBeenCalled();
    fresh.next([2]); expect(received).toHaveBeenCalledExactlyOnceWith([2]); reads.clear();
  });

  it.each(['merchantJournal', 'journalArchives'] as const)(
    '%s waits for confirmation after cached/pending metadata without accepting stale values', channel => {
      const reads = createSessionLiveReads(), cloud = source(), publish = vi.fn(), fail = vi.fn();
      const leave = reads.subscribe(channel, 's', cloud.start, publish, fail);
      cloud.next([1]); cloud.fail(new Error('journalAwaitingServer')); leave();
      const reopened = vi.fn();
      reads.subscribe(channel, 's', cloud.start, reopened, fail);
      expect(reopened).not.toHaveBeenCalled(); expect(cloud.stop).not.toHaveBeenCalled();
      cloud.next([2]); expect(reopened).toHaveBeenCalledExactlyOnceWith([2]);
      expect(cloud.start).toHaveBeenCalledOnce(); reads.clear();
    });

  it('handles synchronous initial snapshots, source throws and synchronous rejection safely', () => {
    const reads = createSessionLiveReads(), publish = vi.fn(), fail = vi.fn(), stop = vi.fn();
    reads.subscribe('journalArchives', 'sync', next => { next([1]); return stop; }, publish, fail);
    expect(publish).toHaveBeenCalledExactlyOnceWith([1]);
    reads.subscribe('journalArchives', 'throw', () => { throw new Error('offline'); }, publish, fail);
    expect(stop).toHaveBeenCalledOnce(); expect(fail.mock.lastCall?.[0].message).toBe('offline');
    const failedStop = vi.fn();
    reads.subscribe('journalArchives', 'reject', (_next, reject) => {
      reject(new Error('denied')); return failedStop;
    }, publish, fail);
    expect(failedStop).toHaveBeenCalledOnce();
    reads.clear();
  });
});
