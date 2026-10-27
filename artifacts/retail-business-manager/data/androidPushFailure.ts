export type PushStep = 'channel' | 'permissionCheck' | 'token' | 'preferences' | 'command' | 'storage' | 'status';
export type PushFailureReason = 'permission' | 'permissionCheck' | 'standalone' | 'session' | 'access' | 'rateLimit' |
  'channel' | 'token' | 'preferences' | 'registration' | 'storage' | 'status' | 'unknown';

/** Keep the original failure for callers; never display its provider payload. */
class PushStepError extends Error {
  constructor(readonly step: PushStep, readonly original: unknown) {
    super(original instanceof Error ? original.message : 'pushConnectError');
    this.name = 'PushStepError';
  }
}

export async function pushStep<T>(step: PushStep, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw error instanceof PushStepError ? error : new PushStepError(step, error); }
}

export function androidPushFailure(error: unknown, fallback: PushFailureReason = 'unknown'): PushFailureReason {
  const original = error instanceof PushStepError ? error.original : error;
  const code = original && typeof original === 'object' && 'code' in original ? original.code : '';
  const message = original instanceof Error ? original.message : '';
  if (message === 'pushPermissionDenied') return 'permission';
  if (message === 'pushStandaloneRequired') return 'standalone';
  if (message === 'pushAccountChanged' || ['functions/unauthenticated', 'auth/user-token-expired', 'auth/user-disabled'].includes(String(code))) return 'session';
  if (code === 'functions/permission-denied') return 'access';
  if (code === 'functions/resource-exhausted') return 'rateLimit';
  if (message === 'pushTimeZoneUnavailable') return 'preferences';
  if (error instanceof PushStepError) return error.step === 'command' ? 'registration' : error.step;
  return fallback;
}
