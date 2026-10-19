import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isCurrencyCode, type CurrencyCode } from '../../constants/currencies.js';
import {
  projectMerchantPurchase,
  projectPartyPayment,
  summarizeMerchantBalances,
  type PartyBalance,
} from '../../data/merchantAccounting.js';
import { legacyAmountExact, planCustomerPayment } from '../../data/customerCreditAccounting.js';
import { readCustomerCredit, writeCustomerCredit } from './customerCreditState.js';
import { assertWorkspaceAccess } from './workspaceAccess.js';
import { reverseMerchantOperation } from './merchantReversal.js';

/** Not exported as a deployed callable until client, rules and journal integration are reviewed. */
export interface MerchantRuntime {
  firestore: Firestore;
  now: () => string;
}
type Input = {
  action: 'save' | 'opening' | 'purchase' | 'payment' | 'directPayment' | 'reverse';
  spaceId: string;
  storeId: string;
  merchantId: string;
  operationId: string;
  name?: string;
  phone?: string;
  isActive?: boolean;
  currency?: CurrencyCode;
  amountExact?: string;
  paidExact?: string;
  source?: 'cash' | 'external';
  customerId?: string;
  note?: string;
  targetOperationId?: string;
  reason?: string;
  lines?: Array<{ name: string; quantity: string; unitPrice: string }>;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 200 ||
    value.includes('/') ||
    value === '.' ||
    value === '..'
  )
    invalid('Invalid identifier');
  return value;
}
function label(value: unknown, maximum: number, required = false): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) invalid('Invalid text');
  return value.trim();
}
function money(value: unknown, signed = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 80 ||
    !(signed ? /^-?(0|[1-9]\d*)(\.\d{1,2})?$/ : /^(0|[1-9]\d*)(\.\d{1,2})?$/).test(value)
  ) {
    invalid('Money must be an exact decimal with at most two fractional digits');
  }
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(whole + fraction.padEnd(2, '0'));
  const canonical = `${negative && units !== BigInt(0) ? '-' : ''}${whole}.${fraction.padEnd(2, '0')}`;
  if (canonical.length > 80) invalid('Canonical money exceeds the supported length');
  return canonical;
}
/** Numeric fields remain compatibility mirrors only; reject rather than silently lose cents. */
function mirror(value: string): number {
  const canonical = money(value);
  const units = BigInt(canonical.replace('.', ''));
  const number = Number(canonical);
  if (units > BigInt(Number.MAX_SAFE_INTEGER) || legacyAmountExact(number) !== canonical) {
    invalid('Amount exceeds the exact compatibility range');
  }
  return number;
}
function validate(value: unknown): Input {
  if (!record(value)) invalid('Invalid merchant request');
  const action = value.action;
  if (!['save', 'opening', 'purchase', 'payment', 'directPayment', 'reverse'].includes(action as string))
    invalid('Invalid action');
  const base = ['action', 'spaceId', 'storeId', 'merchantId', 'operationId'];
  const allowed =
    action === 'reverse'
      ? ['currency', 'targetOperationId', 'reason']
      : action === 'save'
        ? ['name', 'phone', 'isActive']
        : action === 'opening'
          ? ['currency', 'amountExact', 'note']
          : action === 'purchase'
            ? ['currency', 'paidExact', 'source', 'lines', 'note']
            : action === 'payment'
              ? ['currency', 'amountExact', 'source', 'note']
              : ['currency', 'amountExact', 'customerId', 'note'];
  if (Object.keys(value).some((key) => ![...base, ...allowed].includes(key))) invalid('Unexpected request field');
  const input: Input = {
    action: action as Input['action'],
    spaceId: id(value.spaceId),
    storeId: id(value.storeId),
    merchantId: id(value.merchantId),
    operationId: id(value.operationId),
  };
  if (action === 'save') {
    input.name = label(value.name, 200, true);
    input.phone = label(value.phone ?? '', 100);
    if (typeof value.isActive !== 'boolean') invalid('isActive is required');
    input.isActive = value.isActive;
    return input;
  }
  if (!isCurrencyCode(value.currency)) invalid('Unsupported currency');
  input.currency = value.currency;
  if (action === 'reverse') {
    input.targetOperationId = id(value.targetOperationId);
    if (input.targetOperationId === input.operationId) invalid('Reversal requires a new operation identifier');
    input.reason = label(value.reason, 2000, true);
    return input;
  }
  input.note = label(value.note ?? '', 2000);
  if (action === 'purchase' || action === 'payment') {
    if (value.source !== 'cash' && value.source !== 'external') invalid('Payment source is required');
    input.source = value.source;
  }
  if (action === 'purchase') {
    if (!Array.isArray(value.lines) || !value.lines.length || value.lines.length > 100)
      invalid('Invalid purchase lines');
    input.lines = Array.from(value.lines, (line) => {
      if (!record(line) || Object.keys(line).some((key) => !['name', 'quantity', 'unitPrice'].includes(key)))
        invalid('Invalid line');
      return {
        name: label(line.name, 200, true),
        quantity: label(line.quantity, 80, true),
        unitPrice: label(line.unitPrice, 80, true),
      };
    });
    input.paidExact = money(value.paidExact);
    mirror(input.paidExact);
    try {
      const result = projectMerchantPurchase(
        {
          workspaceId: input.spaceId,
          partyId: input.merchantId,
          kind: 'merchant',
          currency: input.currency,
          balance: '0.00',
        },
        input.lines,
        { amount: input.paidExact, currency: input.currency },
        input.source!,
      );
      if (result.total.amount === '0.00') invalid('Purchase must have positive value');
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      invalid('Invalid purchase precision');
    }
  } else {
    input.amountExact = money(value.amountExact, action === 'opening');
    if (action !== 'opening') {
      if (input.amountExact === '0.00') invalid('Payment must be positive');
      mirror(input.amountExact);
    }
    if (action === 'directPayment') input.customerId = id(value.customerId);
  }
  return input;
}

export async function merchantCommandHandler(request: CallableRequest<unknown>, runtime: MerchantRuntime) {
  const uid = request.auth?.uid?.trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase Auth is required');
  const input = validate(request.data);
  const space = runtime.firestore.collection('spaces').doc(input.spaceId);
  const merchantRef = space.collection('merchants').doc(input.merchantId);
  const receiptRef = space.collection('operationReceipts').doc(input.operationId);
  const operationRef = space.collection('merchantOperations').doc(input.operationId);
  const requestDigest = digest(input);
  return runtime.firestore.runTransaction(async (tx) => {
    const spaceSnap = await tx.get(space);
    const memberSnap = await tx.get(space.collection('members').doc(uid));
    const profileSnap = await tx.get(space.collection('storeProfile').doc('profile'));
    const merchantSnap = await tx.get(merchantRef);
    const receiptSnap = await tx.get(receiptRef);
    if (!spaceSnap.exists || spaceSnap.data()?.status !== 'active')
      throw new HttpsError('failed-precondition', 'Workspace unavailable');
    assertWorkspaceAccess(memberSnap.data(), 'write');
    if (profileSnap.data()?.storeId !== input.storeId)
      throw new HttpsError('permission-denied', 'Store scope mismatch');
    const merchant = merchantSnap.data();
    if (
      merchantSnap.exists &&
      (merchant?.id !== input.merchantId ||
        merchant?.workspaceId !== input.spaceId ||
        merchant?.storeId !== input.storeId)
    )
      throw new HttpsError('data-loss', 'Merchant scope is invalid');
    if (receiptSnap.exists) {
      const receipt = receiptSnap.data();
      if (
        receipt?.command !== 'merchantCommand' ||
        receipt.actorUserId !== uid ||
        receipt.spaceId !== input.spaceId ||
        receipt.operationId !== input.operationId ||
        receipt.status !== 'completed' ||
        receipt.payloadDigest !== requestDigest ||
        !record(receipt.result)
      ) {
        throw new HttpsError('already-exists', 'Operation ID already used', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      return { ...receipt.result, outcome: 'replayed' };
    }
    const now = runtime.now();
    const scope = { workspaceId: input.spaceId, storeId: input.storeId };
    const finish = (result: Record<string, unknown>) => {
      tx.create(receiptRef, {
        operationId: input.operationId,
        spaceId: input.spaceId,
        actorUserId: uid,
        command: 'merchantCommand',
        status: 'completed',
        payload: input,
        payloadDigest: requestDigest,
        processedAt: now,
        result,
      });
      return result;
    };
    if (input.action === 'save') {
      const result = {
        merchantId: input.merchantId,
        outcome: merchantSnap.exists ? 'updated' : 'created',
        processedAt: now,
      };
      const data = {
        id: input.merchantId,
        ...scope,
        name: input.name!,
        phone: input.phone!,
        isActive: input.isActive!,
        updatedAt: now,
        updatedByUserId: uid,
      };
      if (merchantSnap.exists) tx.update(merchantRef, data);
      else tx.create(merchantRef, { ...data, createdAt: now, createdByUserId: uid });
      return finish(result);
    }
    if (!merchantSnap.exists || merchant?.isActive !== true)
      throw new HttpsError('not-found', 'Active merchant not found');
    const currency = input.currency!;
    const balanceId = digest([input.merchantId, currency]);
    const balanceRef = space.collection('merchantBalances').doc(balanceId);
    const balanceSnap = await tx.get(balanceRef);
    const operationSnap = await tx.get(operationRef);
    if (operationSnap.exists) throw new HttpsError('already-exists', 'Financial operation already exists');
    const state = balanceSnap.data();
    if (
      balanceSnap.exists &&
      (state?.id !== balanceId ||
        state?.workspaceId !== input.spaceId ||
        state?.storeId !== input.storeId ||
        state?.merchantId !== input.merchantId ||
        state?.currency !== currency ||
        state?.version !== 1 ||
        typeof state?.balanceExact !== 'string' ||
        !Number.isSafeInteger(state?.revision) ||
        state?.revision < 1 ||
        state?.revision >= Number.MAX_SAFE_INTEGER)
    ) {
      throw new HttpsError('data-loss', 'Merchant balance state is invalid');
    }
    const balance: PartyBalance = {
      workspaceId: input.spaceId,
      partyId: input.merchantId,
      kind: 'merchant',
      currency,
      balance: state?.balanceExact ?? '0.00',
    };
    try {
      summarizeMerchantBalances(input.spaceId, [balance]);
    } catch {
      throw new HttpsError('data-loss', 'Merchant balance precision is invalid');
    }
    if (input.action === 'opening' && balanceSnap.exists)
      throw new HttpsError('failed-precondition', 'Opening must precede all account operations');
    if (input.action === 'reverse') {
      if (!balanceSnap.exists) throw new HttpsError('data-loss', 'Original merchant account balance is missing');
      const result = await reverseMerchantOperation({
        tx,
        space,
        balanceRef,
        balance,
        revision: state?.revision ?? 0,
        operationRef,
        uid,
        now,
        input: {
          spaceId: input.spaceId,
          storeId: input.storeId,
          merchantId: input.merchantId,
          operationId: input.operationId,
          currency,
          targetOperationId: input.targetOperationId!,
          reason: input.reason!,
        },
      });
      return finish(result);
    }
    let next = balance.balance;
    let cashDeltaExact = '0.00';
    let details: Record<string, unknown> = {};
    if (input.action === 'opening') next = input.amountExact!;
    else if (input.action === 'purchase') {
      const projection = projectMerchantPurchase(
        balance,
        input.lines!,
        { amount: input.paidExact!, currency },
        input.source!,
      );
      next = projection.balance.balance;
      cashDeltaExact = projection.cashDelta.amount;
      details = {
        totalExact: projection.total.amount,
        paidExact: input.paidExact!,
        source: input.source!,
        lines: input.lines!.map((line, index) => ({ ...line, totalExact: projection.lineTotals[index].amount })),
      };
    } else {
      const projection = projectPartyPayment(
        balance,
        { amount: input.amountExact!, currency },
        input.action === 'directPayment' ? 'external' : input.source!,
      );
      next = projection.balance.balance;
      cashDeltaExact = projection.cashDelta.amount;
      details = {
        amountExact: input.amountExact!,
        source: input.action === 'directPayment' ? 'customer-to-merchant' : input.source!,
      };
    }
    // Read every linked record before staging writes, including the shared customer credit revision.
    const cashId = `merchant-${digest(input.operationId)}`;
    const cashRef = space.collection('transactions').doc(cashId);
    const cashAmount = cashDeltaExact === '0.00' ? 0 : mirror(cashDeltaExact.replace(/^-/, ''));
    if (cashAmount && (await tx.get(cashRef)).exists)
      throw new HttpsError('already-exists', 'Linked cash ID already exists');
    const customerRef = input.action === 'directPayment' ? space.collection('customers').doc(input.customerId!) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    const customer = customerSnap?.data();
    if (
      customerRef &&
      (!customerSnap?.exists ||
        customer?.id !== input.customerId ||
        customer?.workspaceId !== input.spaceId ||
        customer?.storeId !== input.storeId ||
        customer?.isActive !== true)
    )
      throw new HttpsError('not-found', 'Active customer not found');
    const credit = customerRef ? await readCustomerCredit(tx, space, input.storeId, input.customerId!, currency) : null;
    const debts = customerRef
      ? (await tx.get(space.collection('debts').where('customerId', '==', input.customerId!))).docs
          .map((snapshot) => ({ ref: snapshot.ref, data: snapshot.data() }))
          .filter(
            ({ data }) =>
              data.workspaceId === input.spaceId && data.storeId === input.storeId && data.currency === currency,
          )
      : [];
    const plan = credit
      ? planCustomerPayment(
          debts.map(({ ref, data }) => ({
            id: ref.id,
            amount: data.amount,
            amountExact: data.amountExact,
            createdAt: data.createdAt,
          })),
          credit.amount,
          input.amountExact!,
        )
      : null;
    if (plan && plan.updates.length > 450)
      throw new HttpsError('resource-exhausted', 'Too many debts in a single payment');
    const paymentRef = space.collection('payments').doc(cashId);
    if (plan && (await tx.get(paymentRef)).exists)
      throw new HttpsError('already-exists', 'Linked payment already exists');
    if (plan && credit) {
      const byId = new Map(debts.map((debt) => [debt.ref.id, debt]));
      for (const update of plan.updates) {
        const debt = byId.get(update.id)!;
        tx.update(debt.ref, {
          amount: Number(update.amountExact),
          amountExact: update.amountExact,
          originalAmount: debt.data.originalAmount ?? debt.data.amount,
          ...(update.amountExact === '0.00' ? { settledAt: now } : {}),
          updatedAt: now,
          updatedByUserId: uid,
        });
      }
      writeCustomerCredit(tx, credit, plan.creditExact, uid, now);
      tx.create(paymentRef, {
        id: cashId,
        ...scope,
        customerId: input.customerId!,
        merchantId: input.merchantId,
        merchantName: merchant.name,
        merchantOperationId: input.operationId,
        direction: 'in',
        method: 'other',
        source: 'customer-to-merchant',
        amount: { amount: mirror(input.amountExact!), currency },
        amountExact: input.amountExact!,
        note: input.note!,
        paidAt: now,
        createdAt: now,
        updatedAt: now,
        createdByUserId: uid,
      });
      details = {
        ...details,
        customerId: input.customerId!,
        customerName: customer?.name ?? '',
        customerCreditBeforeExact: credit.amount,
        customerCreditAfterExact: plan.creditExact,
        customerBalanceAfterExact: plan.balanceExact,
        debtApplications: plan.updates,
        paymentId: cashId,
      };
    }
    tx.set(balanceRef, {
      id: balanceId,
      ...scope,
      merchantId: input.merchantId,
      currency,
      version: 1,
      balanceExact: next,
      revision: (state?.revision ?? 0) + 1,
      updatedAt: now,
      updatedByUserId: uid,
    });
    tx.create(operationRef, {
      id: input.operationId,
      ...scope,
      merchantId: input.merchantId,
      merchantName: merchant.name,
      action: input.action,
      currency,
      note: input.note!,
      balanceBeforeExact: balance.balance,
      balanceAfterExact: next,
      cashDeltaExact,
      ...(cashAmount ? { transactionId: cashId } : {}),
      ...details,
      createdAt: now,
      createdByUserId: uid,
    });
    if (cashAmount)
      tx.create(cashRef, {
        id: cashId,
        ...scope,
        type: 'cash_out',
        amount: cashAmount,
        amountExact: cashDeltaExact.replace(/^-/, ''),
        currency,
        merchantId: input.merchantId,
        merchantOperationId: input.operationId,
        note: input.note!,
        createdAt: now,
        updatedAt: now,
        createdByUserId: uid,
      });
    return finish({
      outcome: 'completed',
      merchantId: input.merchantId,
      operationId: input.operationId,
      balanceExact: next,
      cashDeltaExact,
      processedAt: now,
    });
  });
}
