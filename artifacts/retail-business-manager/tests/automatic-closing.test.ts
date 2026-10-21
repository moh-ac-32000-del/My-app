import { describe, expect, it } from 'vitest';
import {
  automaticClosingPolicy,
  closingExecutionAt,
  financialPostingTime,
  financialWindow,
  nextClosingAt,
  queueClosingTransition,
  type AutomaticClosingPolicy,
} from '@/data/automaticClosing';

export function samplePolicy(): AutomaticClosingPolicy {
  return {
    version: 1,
    activatedAt: '2026-10-20T12:00:00.000Z',
    activatedByUserId: 'owner',
    legacyTimeZone: 'Europe/Istanbul',
    transitions: [{ from: '2026-10-20T21:00:00.000Z', timeZone: 'Europe/Istanbul', executionTime: '00:00' }],
    cursorAt: '2026-10-19T21:00:00.000Z',
    closedThrough: '2026-10-19T21:00:00.000Z',
    cashBalances: [],
    failures: 0,
  };
}

describe('automatic financial calendar and execution policy', () => {
  it('keeps midnight as the financial boundary regardless of execution time', () => {
    const policy = samplePolicy();
    policy.transitions[0].executionTime = '17:00';
    const at = new Date('2026-10-20T21:00:01Z');
    expect(financialWindow(policy, at)).toMatchObject({
      date: '2026-10-21',
      startAt: '2026-10-20T21:00:00.000Z',
      endAt: '2026-10-21T21:00:00.000Z',
    });
    policy.cursorAt = policy.closedThrough = '2026-10-20T21:00:00.000Z';
    expect(nextClosingAt(policy)).toBe('2026-10-22T14:00:00.000Z');
  });
  it.each([
    ['2026-10-21T21:00:00.000Z', 'Europe/Istanbul', '00:00', '2026-10-21T21:00:00.000Z'],
    ['2026-03-08T05:00:00.000Z', 'America/New_York', '02:30', '2026-03-08T07:00:00.000Z'],
    ['2026-11-01T04:00:00.000Z', 'America/New_York', '01:30', '2026-11-01T05:30:00.000Z'],
    ['2026-10-21T18:15:00.000Z', 'Asia/Kathmandu', '00:15', '2026-10-21T18:30:00.000Z'],
    ['2018-11-04T03:00:00.000Z', 'America/Sao_Paulo', '00:00', '2018-11-04T03:00:00.000Z'],
  ])('resolves scheduled minute %s %s %s safely', (end, zone, time, expected) => {
    expect(closingExecutionAt(end, zone, time)).toBe(expected);
  });
  it('applies a zone change at a future boundary without UTC gaps or overlapping periods', () => {
    const original = samplePolicy();
    const saved = structuredClone(original);
    const policy = queueClosingTransition(original, '2026-10-21T12:00:00.000Z', 'America/New_York', '02:00');
    const before = financialWindow(policy, new Date('2026-10-21T20:59:59.999Z'));
    const after = financialWindow(policy, new Date(before.endAt));
    expect(before.timeZone).toBe('Europe/Istanbul');
    expect(after.timeZone).toBe('America/New_York');
    expect(after.startAt).toBe(before.endAt);
    expect(after.endAt).toBe('2026-10-22T04:00:00.000Z');
    expect(financialWindow(policy, new Date(after.endAt)).startAt).toBe(after.endAt);
    expect(original).toEqual(saved);
  });
  it('rejects malformed policy/closed-period posting and does not affect legacy clocks', () => {
    const policy = samplePolicy();
    expect(financialPostingTime({}, 'legacy')).toBe('legacy');
    expect(() => financialPostingTime({ automaticClosing: policy }, '2026-10-19T20:59:59.000Z')).toThrow(
      'postingClockBehindClosedPeriod',
    );
    expect(() => automaticClosingPolicy({ ...policy, cashBalances: [{ currency: 'BAD', amount: 1 }] })).toThrow();
    expect(() => automaticClosingPolicy({ ...policy, failures: 4 })).toThrow();
  });
});
