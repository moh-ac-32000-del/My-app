/** Exact compatibility arithmetic for existing remaining Debt.amount values.
 * It never subtracts old Payment records again or rounds existing stored precision.
 * These pure plans are not writes, authorization or idempotency receipts.
 */
type Decimal = { units: bigint; scale: number };
const zero = BigInt(0);
function fail(): never {
  throw new Error('invalidCustomerCreditAccounting');
}
function parse(value: string): Decimal {
  if (typeof value !== 'string' || value.length > 500) fail();
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[3]?.length ?? 0) > 324) fail();
  const units = BigInt(match[2] + (match[3] ?? ''));
  return { units: match[1] ? -units : units, scale: match[3]?.length ?? 0 };
}
function power(scale: number) {
  return BigInt(10) ** BigInt(scale);
}
function align(value: Decimal, scale: number) {
  return value.units * power(scale - value.scale);
}
function plus(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { units: align(a, scale) + align(b, scale), scale };
}
function minus(a: Decimal, b: Decimal): Decimal {
  return plus(a, { ...b, units: -b.units });
}
function text(value: Decimal): string {
  const digits = (value.units < zero ? -value.units : value.units).toString().padStart(value.scale + 1, '0');
  const whole = value.scale ? digits.slice(0, -value.scale) : digits;
  const fraction = value.scale ? digits.slice(-value.scale).replace(/0+$/, '') : '';
  const result = `${value.units < zero ? '-' : ''}${whole}.${fraction.padEnd(2, '0')}`;
  if (result.length > 500) fail();
  return result;
}
function positive(value: string, allowZero = false): Decimal {
  const parsed = parse(value);
  if (allowZero ? parsed.units < zero : parsed.units <= zero) fail();
  return parsed;
}

/** Expand the stored number's own decimal representation; no multiplication/rounding by floats. */
export function legacyAmountExact(value: unknown, exact?: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
  if (exact !== undefined) {
    if (typeof exact !== 'string' || Number(exact) !== value) fail();
    return text(positive(exact, true));
  }
  const raw = value.toString();
  if (!/[eE]/.test(raw)) return text(positive(raw, true));
  const [coefficient, exponentText] = raw.toLowerCase().split('e');
  const exponent = Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 324) fail();
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const point = whole.length + exponent;
  const expanded =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return text(positive(expanded, true));
}

export function canonicalCredit(value: string): string {
  return text(positive(value, true));
}
export function addCustomerExact(a: string, b: string): string {
  return text(plus(parse(a), parse(b)));
}
export function subtractCustomerExact(a: string, b: string): string {
  return text(minus(parse(a), parse(b)));
}

export interface RemainingCustomerDebt {
  id: string;
  amount: number;
  amountExact?: string;
  createdAt: string;
}
function orderedDebts(debts: RemainingCustomerDebt[]) {
  if (!Array.isArray(debts)) fail();
  const seen = new Set<string>();
  return debts
    .map((debt) => {
      if (
        !debt ||
        typeof debt.id !== 'string' ||
        !debt.id ||
        seen.has(debt.id) ||
        typeof debt.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(debt.createdAt))
      )
        fail();
      seen.add(debt.id);
      return { debt, value: positive(legacyAmountExact(debt.amount, debt.amountExact), true) };
    })
    .sort((a, b) => b.debt.createdAt.localeCompare(a.debt.createdAt) || a.debt.id.localeCompare(b.debt.id));
}

export function customerBalanceExact(debts: RemainingCustomerDebt[], credit: string): string {
  let remaining = parse('0');
  for (const { value } of orderedDebts(debts)) remaining = plus(remaining, value);
  return text(minus(remaining, positive(credit, true)));
}

/** Apply NEW money to remaining debt, newest first as in the existing settlement path.
 * Preserve any previous credit and increase it only by the new unallocated excess.
 */
export function planCustomerPayment(debts: RemainingCustomerDebt[], credit: string, paid: string) {
  const originalCredit = positive(credit, true);
  let unapplied = positive(paid);
  const updates: Array<{ id: string; amountExact: string; previousAmountExact: string }> = [];
  for (const { debt, value } of orderedDebts(debts)) {
    if (unapplied.units === zero) break;
    if (value.units === zero) continue;
    const comparison = minus(value, unapplied);
    const applied = comparison.units <= zero ? value : unapplied;
    updates.push({ id: debt.id, previousAmountExact: text(value), amountExact: text(minus(value, applied)) });
    unapplied = minus(unapplied, applied);
  }
  const creditExact = text(plus(originalCredit, unapplied));
  const reductions = new Map(updates.map((row) => [row.id, row.amountExact]));
  const after = debts.map((debt) => {
    const amountExact = reductions.get(debt.id) ?? legacyAmountExact(debt.amount, debt.amountExact);
    return { ...debt, amount: Number(amountExact), amountExact };
  });
  return { updates, creditExact, balanceExact: customerBalanceExact(after, creditExact) };
}

/** A newly registered charge consumes available credit without a cash entry. */
export function planCustomerCharge(charge: string, credit: string) {
  const principal = positive(charge);
  const available = positive(credit, true);
  const applied = minus(principal, available).units <= zero ? principal : available;
  return {
    amountExact: text(minus(principal, applied)),
    creditExact: text(minus(available, applied)),
    creditAppliedExact: text(applied),
    principalExact: text(principal),
  };
}
