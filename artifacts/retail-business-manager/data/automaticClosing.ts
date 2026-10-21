import { canonicalTimeZone, workspaceDateKey, workspaceDayBounds } from './workspaceClosing.js';
import { isCurrencyCode } from '../constants/currencies.js';

export interface ClosingTransition {
  from: string;
  timeZone: string;
  executionTime: string;
}
export interface AutomaticClosingPolicy {
  version: 1;
  activatedAt: string;
  activatedByUserId: string;
  legacyTimeZone: string;
  transitions: ClosingTransition[];
  cursorAt: string;
  closedThrough: string;
  cashBalances: Array<{ currency: string; amount: number }>;
  failures: number;
  lastErrorAt?: string;
}
export interface FinancialWindow {
  date: string;
  startAt: string;
  endAt: string;
  timeZone: string;
}
const iso = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function automaticClosingPolicy(value: unknown): AutomaticClosingPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalidAutomaticClosingPolicy');
  const row = value as AutomaticClosingPolicy;
  if (
    row.version !== 1 ||
    !iso(row.activatedAt) ||
    typeof row.activatedByUserId !== 'string' ||
    !row.activatedByUserId ||
    canonicalTimeZone(row.legacyTimeZone) !== row.legacyTimeZone ||
    !iso(row.cursorAt) ||
    row.closedThrough !== row.cursorAt ||
    !Array.isArray(row.transitions) ||
    !row.transitions.length ||
    row.transitions.length > 64 ||
    !Number.isInteger(row.failures) ||
    row.failures < 0 ||
    row.failures > 3 ||
    !Array.isArray(row.cashBalances)
  )
    throw new Error('invalidAutomaticClosingPolicy');
  let last = '';
  for (const transition of row.transitions) {
    if (
      !iso(transition.from) ||
      transition.from <= last ||
      canonicalTimeZone(transition.timeZone) !== transition.timeZone ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(transition.executionTime)
    )
      throw new Error('invalidAutomaticClosingPolicy');
    last = transition.from;
  }
  const seen = new Set<string>();
  for (const balance of row.cashBalances) {
    if (
      !balance ||
      !isCurrencyCode(balance.currency) ||
      seen.has(balance.currency) ||
      typeof balance.amount !== 'number' ||
      !Number.isFinite(balance.amount)
    )
      throw new Error('invalidAutomaticClosingPolicy');
    seen.add(balance.currency);
  }
  return row;
}

export function closingTransitionAt(policy: AutomaticClosingPolicy, instant: string): ClosingTransition {
  return (
    [...policy.transitions].reverse().find((entry) => entry.from <= instant) ?? {
      from: '0001-01-01T00:00:00.000Z',
      timeZone: policy.legacyTimeZone,
      executionTime: '00:00',
    }
  );
}

/** Continuous UTC intervals: a zone change can produce a short transition day, never an overlap. */
export function financialWindow(policy: AutomaticClosingPolicy, instant: Date): FinancialWindow {
  const at = instant.toISOString();
  const transition = closingTransitionAt(policy, at);
  const bounds = workspaceDayBounds(instant, transition.timeZone);
  const following = policy.transitions.find((entry) => entry.from > at);
  return {
    date: bounds.date,
    timeZone: transition.timeZone,
    startAt: bounds.startAt < transition.from ? transition.from : bounds.startAt,
    endAt: following && following.from < bounds.endAt ? following.from : bounds.endAt,
  };
}

export function queueClosingTransition(
  policy: AutomaticClosingPolicy,
  now: string,
  timeZone: string,
  executionTime: string,
): AutomaticClosingPolicy {
  const current = closingTransitionAt(policy, now);
  const from = workspaceDayBounds(new Date(now), current.timeZone).endAt;
  const transitions = policy.transitions.filter((entry) => entry.from <= now);
  if (transitions.length >= 64) throw new Error('closingTransitionLimit');
  transitions.push({ from, timeZone: canonicalTimeZone(timeZone), executionTime });
  return { ...policy, transitions };
}

/** First matching local minute; repeated DST minutes choose the earlier occurrence.
 * A missing local time advances to the first existing minute after the gap. A day can be 23/25h.
 * At most 26 sampled offsets + a 4h minute gap search, with no Firebase reads.
 */
export function closingExecutionAt(endAt: string, timeZone: string, executionTime: string): string {
  const date = workspaceDateKey(new Date(endAt), timeZone);
  const naive = Date.parse(`${date}T${executionTime}:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wall = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (key: string) => parts.find((part) => part.type === key)!.value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.000Z`;
  };
  const offsets = new Set<number>();
  for (let hour = -48; hour <= 48; hour += 4) {
    const sample = naive + hour * 3600000;
    offsets.add(Date.parse(wall(sample)) - sample);
  }
  for (let minute = 0; minute <= 240; minute++) {
    const target = naive + minute * 60000;
    const key = new Date(target).toISOString();
    const matches = [...offsets]
      .map((offset) => target - offset)
      .filter((candidate) => candidate >= Date.parse(endAt) && wall(candidate) === key);
    if (matches.length) return new Date(Math.min(...matches)).toISOString();
  }
  throw new Error('closingExecutionTimeUnavailable');
}

export function nextClosingAt(policy: AutomaticClosingPolicy): string {
  const period = financialWindow(policy, new Date(policy.cursorAt));
  const transition = closingTransitionAt(policy, policy.cursorAt);
  return closingExecutionAt(period.endAt, period.timeZone, transition.executionTime);
}

/** A paused worker does not change the financial calendar or authorize legacy backdated writes. */
export function financialPostingTime(space: Record<string, unknown>, now: string): string {
  if (!space.automaticClosing) return now;
  const policy = automaticClosingPolicy(space.automaticClosing);
  if (!iso(now) || now < policy.closedThrough) throw new Error('postingClockBehindClosedPeriod');
  return now;
}
