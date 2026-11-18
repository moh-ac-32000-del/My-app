/** Pure state machine for the trusted lifecycle-job runner.
 * This module performs no Firestore I/O and must be paired with transactional persistence.
 * Lease generations fence off stale workers after an expired lease is reclaimed.
 */
export const LIFECYCLE_PAGE_SIZE = 100;
export const LIFECYCLE_LEASE_MS = 90_000;
export const LIFECYCLE_COMPLETION_PHASE = 'complete';
export const LIFECYCLE_JOB_KINDS = [
  'customer.delete',
  'merchant.archive',
  'merchant.delete',
  'workspace.delete',
  'account.delete',
] as const;
export type LifecycleJobKind = typeof LIFECYCLE_JOB_KINDS[number];
export type LifecycleJobStatus = 'queued' | 'running' | 'blocked' | 'completed';
export interface LifecycleJob {
  schemaVersion: 1;
  jobId: string;
  kind: LifecycleJobKind;
  status: LifecycleJobStatus;
  spaceId: string | null;
  storeId: string | null;
  targetId: string;
  actorUserId: string;
  payloadDigest: string;
  phase: string;
  phaseIndex: number;
  cursor: string | null;
  processedCount: number;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  leaseGeneration: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failureCode: string | null;
}
export interface NewLifecycleJob {
  jobId: string;
  kind: LifecycleJobKind;
  spaceId?: string | null;
  storeId?: string | null;
  targetId: string;
  actorUserId: string;
  payloadDigest: string;
  now: string;
}
export interface LifecycleLease {
  job: LifecycleJob;
  generation: number;
}
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200 &&
  value === value.trim() && !value.includes('/') && value !== '.' && value !== '..';
const validTime = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const digestPattern = /^[a-f0-9]{64}$/;
const terminal = (status: LifecycleJobStatus) => status === 'completed' || status === 'blocked';

export function createLifecycleJob(input: NewLifecycleJob): LifecycleJob {
  if (!validId(input.jobId) || !validId(input.targetId) || !validId(input.actorUserId) ||
      !LIFECYCLE_JOB_KINDS.includes(input.kind) || !digestPattern.test(input.payloadDigest) ||
      !validTime(input.now) ||
      (input.spaceId != null && !validId(input.spaceId)) ||
      (input.storeId != null && !validId(input.storeId))) {
    throw new Error('lifecycle-job-invalid-input');
  }
  const needsSpace = input.kind !== 'account.delete';
  const needsStore = input.kind.startsWith('customer.') || input.kind.startsWith('merchant.');
  if (needsSpace !== (input.spaceId != null) || needsStore !== (input.storeId != null)) {
    throw new Error('lifecycle-job-invalid-scope');
  }
  return {
    schemaVersion: 1,
    jobId: input.jobId,
    kind: input.kind,
    status: 'queued',
    spaceId: input.spaceId ?? null,
    storeId: input.storeId ?? null,
    targetId: input.targetId,
    actorUserId: input.actorUserId,
    payloadDigest: input.payloadDigest,
    phase: 'preflight',
    phaseIndex: 0,
    cursor: null,
    processedCount: 0,
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseGeneration: 0,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
    failureCode: null,
  };
}

/** Returns null for terminal jobs or when another worker holds an unexpired lease. */
export function claimLifecycleJob(
  current: LifecycleJob,
  workerId: string,
  now: string,
  leaseMs = LIFECYCLE_LEASE_MS,
): LifecycleLease | null {
  if (!validId(workerId) || !validTime(now) || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000)
    throw new Error('lifecycle-lease-invalid');
  if (terminal(current.status)) return null;
  const nowMs = Date.parse(now);
  const leaseEnd = current.leaseExpiresAt == null ? NaN : Date.parse(current.leaseExpiresAt);
  if ((current.leaseOwner == null) !== (current.leaseExpiresAt == null) ||
      (current.leaseOwner != null && !Number.isFinite(leaseEnd))) throw new Error('lifecycle-lease-state-invalid');
  const heldByOther = current.leaseOwner !== null && current.leaseOwner !== workerId &&
    Number.isFinite(leaseEnd) && leaseEnd > nowMs;
  if (heldByOther) return null;
  if (current.leaseOwner === workerId && Number.isFinite(leaseEnd) && leaseEnd > nowMs) {
    const job = { ...current, leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(), updatedAt: now };
    return { job, generation: current.leaseGeneration };
  }
  if (current.leaseGeneration >= Number.MAX_SAFE_INTEGER || current.attemptCount >= Number.MAX_SAFE_INTEGER)
    throw new Error('lifecycle-counter-exhausted');
  const generation = current.leaseGeneration + 1;
  const job: LifecycleJob = {
    ...current,
    status: 'running',
    attemptCount: current.attemptCount + 1,
    leaseOwner: workerId,
    leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
    leaseGeneration: generation,
    updatedAt: now,
  };
  return { job, generation };
}

export interface LifecycleCheckpoint {
  workerId: string;
  generation: number;
  now: string;
  phase: string;
  phaseIndex: number;
  cursor: string | null;
  processedDelta: number;
  status?: 'running' | 'blocked' | 'completed';
  failureCode?: string | null;
}
export function checkpointLifecycleJob(current: LifecycleJob, input: LifecycleCheckpoint): LifecycleJob {
  if (!validId(input.workerId) || !validTime(input.now) || !validId(input.phase) ||
      !Number.isSafeInteger(input.generation) || !Number.isSafeInteger(input.phaseIndex) || input.phaseIndex < 0 ||
      !Number.isSafeInteger(input.processedDelta) || input.processedDelta < 0 ||
      (input.cursor !== null && !validId(input.cursor))) throw new Error('lifecycle-checkpoint-invalid');
  if (current.status !== 'running' || current.leaseOwner !== input.workerId ||
      current.leaseGeneration !== input.generation || !current.leaseExpiresAt ||
      Date.parse(current.leaseExpiresAt) <= Date.parse(input.now)) throw new Error('lifecycle-lease-lost');
  if (input.phaseIndex < current.phaseIndex || input.phaseIndex > current.phaseIndex + 1 ||
      input.processedDelta > LIFECYCLE_PAGE_SIZE ||
      current.processedCount > Number.MAX_SAFE_INTEGER - input.processedDelta)
    throw new Error('lifecycle-checkpoint-out-of-range');
  if ((input.phaseIndex === current.phaseIndex && input.phase !== current.phase) ||
      (input.phaseIndex === current.phaseIndex + 1 && input.phase === current.phase))
    throw new Error('lifecycle-phase-transition-invalid');
  const status = input.status ?? 'running';
  if (status === 'completed' &&
      (input.phase !== LIFECYCLE_COMPLETION_PHASE || input.phaseIndex !== current.phaseIndex + 1))
    throw new Error('lifecycle-completion-phase-required');
  if (status === 'blocked' && (typeof input.failureCode !== 'string' || !/^[a-z0-9-]{1,80}$/.test(input.failureCode)))
    throw new Error('lifecycle-failure-code-required');
  if (status !== 'blocked' && input.failureCode != null)
    throw new Error('lifecycle-unexpected-failure-code');
  const done = status === 'completed' || status === 'blocked';
  return {
    ...current,
    status,
    phase: input.phase,
    phaseIndex: input.phaseIndex,
    cursor: done ? null : input.cursor,
    processedCount: current.processedCount + input.processedDelta,
    leaseOwner: done ? null : current.leaseOwner,
    leaseExpiresAt: done ? null : current.leaseExpiresAt,
    completedAt: status === 'completed' ? input.now : current.completedAt,
    failureCode: status === 'blocked' ? input.failureCode! : null,
    updatedAt: input.now,
  };
}
