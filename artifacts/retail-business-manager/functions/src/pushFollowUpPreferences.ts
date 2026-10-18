import { HttpsError } from 'firebase-functions/v2/https';

export interface PushFollowUpPreferences {
  time: string;
  overdueEnabled: boolean;
  pendingEnabled: boolean;
  timeZone: string;
}

/** Server-side validation; never trusts the handset's clock/UTC offset. */
export function parsePushFollowUp(value: unknown): PushFollowUpPreferences {
  if (!value || typeof value !== 'object') throw invalid();
  const item = value as Record<string, unknown>;
  if (typeof item.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)
    || typeof item.overdueEnabled !== 'boolean' || typeof item.pendingEnabled !== 'boolean'
    || typeof item.timeZone !== 'string' || !item.timeZone || item.timeZone.length > 100
    || item.timeZone.trim() !== item.timeZone) throw invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: item.timeZone }).format(0); }
  catch { throw invalid(); }
  // Deliberately allowlist fields: no user-provided uid, scope, token or scheduler state.
  return { time: item.time, overdueEnabled: item.overdueEnabled, pendingEnabled: item.pendingEnabled, timeZone: item.timeZone };
}

function invalid() { return new HttpsError('invalid-argument', 'Invalid follow-up preferences'); }
