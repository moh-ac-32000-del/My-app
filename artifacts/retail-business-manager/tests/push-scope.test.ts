import { describe, expect, it } from 'vitest';
import { matchesPushScope } from '@/services/pushNotificationScope';
import { AndroidPushSettings } from '@/components/AndroidPushSettings';
import { AndroidPushObserver } from '@/components/AndroidPushObserver';
import { disconnectAndroidPush } from '@/services/androidPush';

const scope = { uid: 'u', spaceId: 's', storeId: 'store' };
const payload = { ...scope, route: '/notifications' };
describe('notification privacy and platform boundary', () => {
  it('accepts only the current account and exact workspace/store', () => {
    expect(matchesPushScope(payload, scope)).toBe(true);
    for (const change of [{ uid: null }, { uid: 'other' }, { spaceId: 'other' }, { storeId: 'other' }]) {
      expect(matchesPushScope(payload, { ...scope, ...change })).toBe(false);
    }
  });
  it('never navigates to an arbitrary notification URL', () => {
    expect(matchesPushScope({ ...payload, route: 'https://example.com' }, scope)).toBe(false);
    expect(matchesPushScope({}, scope)).toBe(false);
  });
  it('does not expose Android controls or load native notification work on Web', async () => {
    expect(AndroidPushSettings()).toBeNull();
    expect(AndroidPushObserver()).toBeNull();
    await expect(disconnectAndroidPush()).resolves.toBeUndefined();
  });
});
