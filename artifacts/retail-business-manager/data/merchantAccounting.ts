import { CURRENCY_OPTIONS, isCurrencyCode, type CurrencyCode } from '../constants/currencies';

/** Pure proposed projections, NOT persisted balances, authorization or a transaction engine.
 * Canonical decimal strings are the boundary; BigInt never crosses JSON/Firestore boundaries.
 * Existing customer debt/payment calculations are intentionally not connected to these helpers.
 */
export interface ExactMoney {
  amount: string;
  currency: CurrencyCode;
}
export interface PartyBalance {
  workspaceId: string;
  partyId: string;
  kind: 'customer' | 'merchant';
  currency: CurrencyCode;
  balance: string;
}
export interface PurchaseLineInput {
  quantity: string;
  unitPrice: string;
}
export type PaymentSource = 'cash' | 'external';

function invalid(): never {
  throw new Error('invalidExactAccountingInput');
}
function scaled(value: string, places: number, signed = false): bigint {
  // Bound parsing work; never accept JS numbers, exponent notation or silently round input.
  if (typeof value !== 'string' || value.length > 80) invalid();
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match || (!signed && match[1]) || (match[3]?.length ?? 0) > places) invalid();
  const units = BigInt(match[2] + (match[3] ?? '').padEnd(places, '0'));
  return match[1] ? -units : units;
}
function decimal(units: bigint): string {
  const absolute = (units < BigInt(0) ? -units : units).toString().padStart(3, '0');
  const value = `${units < BigInt(0) ? '-' : ''}${absolute.slice(0, -2)}.${absolute.slice(-2)}`;
  if (value.length > 80) invalid();
  return value;
}
function identifier(value: unknown): void {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('/')) invalid();
}
function party(value: PartyBalance, kind?: PartyBalance['kind']): bigint {
  if (
    !value ||
    !['customer', 'merchant'].includes(value.kind) ||
    (kind && value.kind !== kind) ||
    !isCurrencyCode(value.currency)
  )
    invalid();
  identifier(value.workspaceId);
  identifier(value.partyId);
  return scaled(value.balance, 2, true);
}
function amount(value: ExactMoney, currency: CurrencyCode, allowZero = false): bigint {
  if (!value || !isCurrencyCode(value.currency) || value.currency !== currency) invalid();
  const units = scaled(value.amount, 2);
  if (allowZero ? units < BigInt(0) : units <= BigInt(0)) invalid();
  return units;
}
function source(value: PaymentSource): void {
  if (value !== 'cash' && value !== 'external') invalid();
}
function next(balance: PartyBalance, units: bigint): PartyBalance {
  return { ...balance, balance: decimal(units) };
}
function money(units: bigint, currency: CurrencyCode): ExactMoney {
  return { amount: decimal(units), currency };
}

/** Sum rounded lines, not a rounded floating-point invoice total. Inputs are not mutated. */
export function calculateMerchantPurchase(
  lines: PurchaseLineInput[],
  currency: CurrencyCode,
): {
  lineTotals: ExactMoney[];
  total: ExactMoney;
} {
  if (!isCurrencyCode(currency) || !Array.isArray(lines) || lines.length === 0) invalid();
  let total = BigInt(0);
  const lineTotals = Array.from(lines, (line) => {
    if (!line) invalid();
    const quantity = scaled(line.quantity, 3);
    const unitPrice = scaled(line.unitPrice, 4);
    if (quantity <= BigInt(0)) invalid();
    // Product has scale 7; convert to scale 2 exactly, with positive ties rounded up.
    const rounded = (quantity * unitPrice + BigInt(50000)) / BigInt(100000);
    total += rounded;
    return money(rounded, currency);
  });
  return { lineTotals, total: money(total, currency) };
}

/** A new charge consumes an existing credit by signed addition, without fresh cash. */
export function projectPartyCharge(balance: PartyBalance, charge: ExactMoney) {
  const current = party(balance);
  const units = amount(charge, balance.currency);
  return { balance: next(balance, current + units), cashDelta: money(BigInt(0), balance.currency) };
}

/** A newly paid amount: cash enters for a customer, exits for a merchant; external is never drawer cash. */
export function projectPartyPayment(balance: PartyBalance, payment: ExactMoney, paymentSource: PaymentSource) {
  const current = party(balance);
  const paid = amount(payment, balance.currency);
  source(paymentSource);
  const cash = paymentSource === 'external' ? BigInt(0) : balance.kind === 'customer' ? paid : -paid;
  return { balance: next(balance, current - paid), cashDelta: money(cash, balance.currency) };
}

/** Purchase and optional simultaneous payment are one numerical projection; persistence must be atomic later. */
export function projectMerchantPurchase(
  balance: PartyBalance,
  lines: PurchaseLineInput[],
  paid: ExactMoney,
  paymentSource: PaymentSource,
) {
  const current = party(balance, 'merchant');
  const purchase = calculateMerchantPurchase(lines, balance.currency);
  const payment = amount(paid, balance.currency, true);
  source(paymentSource);
  return {
    ...purchase,
    balance: next(balance, current + scaled(purchase.total.amount, 2) - payment),
    cashDelta: money(paymentSource === 'cash' ? -payment : BigInt(0), balance.currency),
  };
}

/** NEW money paid directly by customer to merchant, never consumption of old customer credit. */
export function projectCustomerToMerchantPayment(customer: PartyBalance, merchant: PartyBalance, payment: ExactMoney) {
  const customerUnits = party(customer, 'customer');
  const merchantUnits = party(merchant, 'merchant');
  if (customer.workspaceId !== merchant.workspaceId || customer.currency !== merchant.currency) invalid();
  const paid = amount(payment, customer.currency);
  return {
    customer: next(customer, customerUnits - paid),
    merchant: next(merchant, merchantUnits - paid),
    cashDelta: money(BigInt(0), customer.currency),
  };
}

/** Distinct payable/credit totals per currency. Never net one party's account into another's. */
export function summarizeMerchantBalances(workspaceId: string, balances: PartyBalance[]) {
  identifier(workspaceId);
  if (!Array.isArray(balances)) invalid();
  const seen = new Set<string>();
  const totals = new Map<CurrencyCode, { payable: bigint; credit: bigint }>();
  for (const balance of balances) {
    const units = party(balance, 'merchant');
    if (balance.workspaceId !== workspaceId) invalid();
    const key = JSON.stringify([balance.partyId, balance.currency]);
    if (seen.has(key)) invalid(); // Duplicate projections must not inflate displayed totals.
    seen.add(key);
    const total = totals.get(balance.currency) ?? { payable: BigInt(0), credit: BigInt(0) };
    if (units > BigInt(0)) total.payable += units;
    else total.credit -= units;
    totals.set(balance.currency, total);
  }
  return CURRENCY_OPTIONS.flatMap(({ code: currency }) => {
    const total = totals.get(currency);
    return total
      ? [
          {
            currency,
            payable: decimal(total.payable),
            credit: decimal(total.credit),
            net: decimal(total.payable - total.credit),
          },
        ]
      : [];
  });
}
