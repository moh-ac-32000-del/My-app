import { describe, expect, it } from 'vitest';
import { androidPushFailure, pushStep } from '../data/androidPushFailure';
import { androidPushFailureText } from '../constants/androidPushFailureText';

describe('notification failures identify their actual stage without exposing payloads', () => {
  it.each(['channel', 'permissionCheck', 'token', 'preferences', 'storage', 'status'] as const)(
    'preserves the %s stage even for a generic native rejection', async step => {
      try { await pushStep(step, async () => { throw new Error('private provider payload'); }); }
      catch (error) { expect(androidPushFailure(error)).toBe(step); }
    });
  it.each([
    ['functions/unauthenticated', 'session'], ['auth/user-token-expired', 'session'],
    ['functions/permission-denied', 'access'], ['functions/resource-exhausted', 'rateLimit'],
    ['functions/unavailable', 'registration'],
  ] as const)('distinguishes server %s', async (code, expected) => {
    const original = Object.assign(new Error('private payload'), { code });
    try { await pushStep('command', async () => { throw original; }); }
    catch (error) { expect(androidPushFailure(error)).toBe(expected); }
  });
  it('does not confuse an unreadable permission state with a denied permission', async () => {
    expect(androidPushFailure(new Error('pushPermissionDenied'))).toBe('permission');
    try { await pushStep('permissionCheck', async () => { throw new Error('native module failed'); }); }
    catch (error) { expect(androidPushFailure(error)).toBe('permissionCheck'); }
  });
  it('retains the original stage through nested status checks', async () => {
    try { await pushStep('status', () => pushStep('storage', async () => { throw new Error('failed'); })); }
    catch (error) { expect(androidPushFailure(error)).toBe('storage'); }
  });
  it('uses a status-specific fallback and never displays raw provider text', () => {
    const error = new Error('DEVICE-TOKEN-PRIVATE');
    expect(androidPushFailure(error, 'status')).toBe('status');
    for (const copy of Object.values(androidPushFailureText)) {
      expect(JSON.stringify(copy)).not.toMatch(/DEVICE-TOKEN-PRIVATE|Firebase|Firestore/);
      expect(Object.keys(copy)).toEqual(Object.keys(androidPushFailureText.ar));
    }
  });
});
