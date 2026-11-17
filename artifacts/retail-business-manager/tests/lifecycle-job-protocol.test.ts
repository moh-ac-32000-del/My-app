import { describe, expect, it } from 'vitest';
import {
  LIFECYCLE_PAGE_SIZE,
  claimLifecycleJob,
  checkpointLifecycleJob,
  createLifecycleJob,
} from '../functions/src/lifecycleJobProtocol';

const base = () => createLifecycleJob({
  jobId: 'job-1', kind: 'customer.delete', spaceId: 'space-1', storeId: 'store-1',
  targetId: 'customer-1', actorUserId: 'user-1', payloadDigest: 'a'.repeat(64),
  now: '2026-11-17T12:00:00.000Z',
});
const claim = (job = base(), workerId = 'worker-a', now = '2026-11-17T12:00:01.000Z') =>
  claimLifecycleJob(job, workerId, now)!;

describe('destructive lifecycle job protocol', () => {
  it('creates a queued, scoped, idempotency-ready job without a live lease', () => {
    expect(base()).toMatchObject({
      schemaVersion: 1, kind: 'customer.delete', status: 'queued',
      phase: 'preflight', phaseIndex: 0, cursor: null, processedCount: 0,
      attemptCount: 0, leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
    });
  });
  it('rejects malformed IDs, digests, timestamps and invalid scope combinations', () => {
    expect(() => createLifecycleJob({ ...{
      jobId: '../bad', kind: 'customer.delete', spaceId: 's', storeId: 'store',
      targetId: 'c', actorUserId: 'u', payloadDigest: 'a'.repeat(64), now: '2026-11-17T12:00:00Z',
    } })).toThrow('lifecycle-job-invalid-input');
    expect(() => createLifecycleJob({
      jobId: 'j', kind: 'customer.delete', spaceId: 's', targetId: 'c',
      actorUserId: 'u', payloadDigest: 'a'.repeat(64), now: '2026-11-17T12:00:00Z',
    })).toThrow('lifecycle-job-invalid-scope');
    expect(() => createLifecycleJob({
      jobId: 'j', kind: 'merchant.archive', spaceId: 's', targetId: 'm',
      actorUserId: 'u', payloadDigest: 'a'.repeat(64), now: '2026-11-17T12:00:00Z',
    })).toThrow('lifecycle-job-invalid-scope');
    expect(() => createLifecycleJob({
      jobId: 'j', kind: 'account.delete', spaceId: 's', targetId: 'u',
      actorUserId: 'u', payloadDigest: 'a'.repeat(64), now: '2026-11-17T12:00:00Z',
    })).toThrow('lifecycle-job-invalid-scope');
  });
  it('allows only one active worker lease and fences stale workers after expiry', () => {
    const first = claim();
    expect(first.generation).toBe(1);
    expect(claimLifecycleJob(first.job, 'worker-b', '2026-11-17T12:00:02.000Z')).toBeNull();
    const reclaimed = claimLifecycleJob(first.job, 'worker-b', '2026-11-17T12:02:00.000Z')!;
    expect(reclaimed.generation).toBe(2);
    expect(() => checkpointLifecycleJob(reclaimed.job, {
      workerId: 'worker-a', generation: 1, now: '2026-11-17T12:02:01.000Z',
      phase: 'delete', phaseIndex: 1, cursor: null, processedDelta: 1,
    })).toThrow('lifecycle-lease-lost');
  });
  it('renews a worker lease without incrementing attempts or fencing token', () => {
    const first = claim();
    const renewed = claimLifecycleJob(first.job, 'worker-a', '2026-11-17T12:00:20.000Z')!;
    expect(renewed.generation).toBe(first.generation);
    expect(renewed.job.attemptCount).toBe(1);
    expect(Date.parse(renewed.job.leaseExpiresAt!) - Date.parse('2026-11-17T12:00:20.000Z')).toBe(90_000);
  });
  it('checkpoints bounded pages and preserves a stable continuation cursor', () => {
    const active = claim().job;
    const next = checkpointLifecycleJob(active, {
      workerId: 'worker-a', generation: 1, now: '2026-11-17T12:00:10.000Z',
      phase: 'remove-reminders', phaseIndex: 1, cursor: 'reminder-100', processedDelta: LIFECYCLE_PAGE_SIZE,
    });
    expect(next).toMatchObject({
      status: 'running', phase: 'remove-reminders', phaseIndex: 1,
      cursor: 'reminder-100', processedCount: 100, leaseOwner: 'worker-a', leaseGeneration: 1,
    });
  });
  it('rejects stale leases, backwards phases, oversized pages and unsafe counters', () => {
    const active = claim().job;
    const input = { workerId: 'worker-a', generation: 1, now: '2026-11-17T12:00:10.000Z',
      phase: 'preflight', phaseIndex: 0, cursor: null, processedDelta: 0 };
    expect(() => checkpointLifecycleJob(active, { ...input, now: '2026-11-17T12:02:00.000Z' })).toThrow('lifecycle-lease-lost');
    expect(() => checkpointLifecycleJob(active, { ...input, phaseIndex: -1 })).toThrow('lifecycle-checkpoint-invalid');
    expect(() => claimLifecycleJob({ ...active, leaseExpiresAt: 'not-a-date' }, 'worker-b', '2026-11-17T12:02:00.000Z')).toThrow('lifecycle-lease-state-invalid');
    expect(() => checkpointLifecycleJob(active, { ...input, processedDelta: LIFECYCLE_PAGE_SIZE + 1 })).toThrow('lifecycle-checkpoint-out-of-range');
    expect(() => checkpointLifecycleJob({ ...active, processedCount: Number.MAX_SAFE_INTEGER }, { ...input, processedDelta: 1 })).toThrow('lifecycle-checkpoint-out-of-range');
  });
  it('completes exactly once and releases its lease', () => {
    const active = claim().job;
    const done = checkpointLifecycleJob(active, {
      workerId: 'worker-a', generation: 1, now: '2026-11-17T12:00:10.000Z',
      phase: 'verified', phaseIndex: 5, cursor: 'ignored', processedDelta: 2, status: 'completed',
    });
    expect(done).toMatchObject({ status: 'completed', completedAt: '2026-11-17T12:00:10.000Z',
      cursor: null, leaseOwner: null, leaseExpiresAt: null, processedCount: 2 });
    expect(claimLifecycleJob(done, 'worker-b', '2026-11-17T12:01:00.000Z')).toBeNull();
  });
  it('blocks with a sanitized failure code and cannot silently complete', () => {
    const active = claim().job;
    expect(() => checkpointLifecycleJob(active, {
      workerId: 'worker-a', generation: 1, now: '2026-11-17T12:00:10.000Z',
      phase: 'preflight', phaseIndex: 0, cursor: null, processedDelta: 0, status: 'blocked',
    })).toThrow('lifecycle-failure-code-required');
    const blocked = checkpointLifecycleJob(active, {
      workerId: 'worker-a', generation: 1, now: '2026-11-17T12:00:10.000Z',
      phase: 'preflight', phaseIndex: 0, cursor: null, processedDelta: 0,
      status: 'blocked', failureCode: 'linked-merchant-operation',
    });
    expect(blocked).toMatchObject({ status: 'blocked', failureCode: 'linked-merchant-operation',
      leaseOwner: null, leaseExpiresAt: null });
    expect(claimLifecycleJob(blocked, 'worker-b', '2026-11-17T12:01:00.000Z')).toBeNull();
  });
});
