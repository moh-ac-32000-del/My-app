import { describe, expect, it } from 'vitest';
import { workspaceNotificationTimeZone } from '@/functions/src/workspaceNotificationTimeZone';

describe('authoritative workspace notification clock', () => {
  const now = '2026-10-29T12:00:00.000Z';
  it('uses the existing default for a fresh workspace', () => {
    expect(workspaceNotificationTimeZone({}, now)).toBe('Europe/Istanbul');
  });
  it('applies a queued automatic clock transition only when effective', () => {
    const space = { automaticClosing: { version: 1, activatedAt: '2026-10-27T12:00:00.000Z',
      activatedByUserId: 'u', legacyTimeZone: 'Europe/Istanbul', cursorAt: '2026-10-28T21:00:00.000Z',
      closedThrough: '2026-10-28T21:00:00.000Z', failures: 0, cashBalances: [], transitions: [
        { from: '2026-10-27T21:00:00.000Z', timeZone: 'Europe/Istanbul', executionTime: '00:00' },
        { from: '2026-10-29T21:00:00.000Z', timeZone: 'Europe/London', executionTime: '00:00' },
      ] } };
    expect(workspaceNotificationTimeZone(space, now)).toBe('Europe/Istanbul');
    expect(workspaceNotificationTimeZone(space, '2026-10-29T21:00:00.000Z')).toBe('Europe/London');
  });
  it('rejects corrupt clock metadata instead of sending in the handset zone', () => {
    expect(() => workspaceNotificationTimeZone({ closingSettings: {} }, now)).toThrow();
    expect(() => workspaceNotificationTimeZone({ automaticClosing: {} }, now)).toThrow();
  });
});
