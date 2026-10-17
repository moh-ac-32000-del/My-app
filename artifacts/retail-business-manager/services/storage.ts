import { CURRENCY_OPTIONS, isCurrencyCode, normalizeCurrency, type CurrencyCode } from '@/constants/currencies';
import type { Language } from '@/constants/i18n';
import type {
  CashTransactionDraft,
  Customer,
  Debt,
  Payment,
  Reminder,
  ReminderStatus,
  Transaction,
} from '@/types/business';

let transactionSequence = 0;
let debtSequence = 0;
let paymentSequence = 0;
let reminderSequence = 0;













export function createTransactionId(): string {
  transactionSequence += 1;
  return `transaction_${Date.now().toString(36)}_${transactionSequence.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function validateCashTransactionDraft(input: {
  storeId: unknown;
  type: unknown;
  amount: unknown;
  currency: unknown;
}): string | null {
  if (typeof input.storeId !== 'string' || input.storeId.trim().length === 0) {
    return 'storeIdRequired';
  }
  if (input.type !== 'cash_in' && input.type !== 'cash_out') {
    return 'transactionTypeInvalid';
  }
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    return 'amountInvalid';
  }
  if (!isCurrencyCode(input.currency)) {
    return 'currencyInvalid';
  }
  return null;
}

export function createCashTransaction(
  storeId: string,
  draft: CashTransactionDraft,
  now: string = new Date().toISOString(),
): Transaction {
  const validation = validateCashTransactionDraft({ storeId, ...draft });
  if (validation) {
    throw new Error(validation);
  }

  const note = typeof draft.note === 'string' ? draft.note.trim() : '';
  return {
    id: createTransactionId(),
    storeId: storeId.trim(),
    type: draft.type,
    amount: draft.amount,
    currency: draft.currency,
    ...(note ? { note } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateCurrencyNetTotals(transactions: Transaction[]): Record<CurrencyCode, number> {
  const totals = Object.fromEntries(CURRENCY_OPTIONS.map(({ code }) => [code, 0])) as Record<CurrencyCode, number>;

  for (const transaction of transactions) {
    totals[transaction.currency] += transaction.type === 'cash_in' ? transaction.amount : -transaction.amount;
  }
  return totals;
}

export function calculateUsedCurrencyBalances(
  transactions: Transaction[],
): Array<{ currency: CurrencyCode; amount: number }> {
  const totals = calculateCurrencyNetTotals(transactions);
  const usedCurrencies = new Set(transactions.map((transaction) => transaction.currency));

  return CURRENCY_OPTIONS
    .filter(({ code }) => usedCurrencies.has(code))
    .map(({ code }) => ({ currency: code, amount: totals[code] }));
}

export function calculateVisibleCurrencyBalances(
  transactions: Transaction[],
  visibleCurrencies: CurrencyCode[],
): Array<{ currency: CurrencyCode; amount: number }> {
  const totals = calculateCurrencyNetTotals(transactions);
  return visibleCurrencies
    .filter((currency, index, currencies) => isCurrencyCode(currency) && currencies.indexOf(currency) === index)
    .map((currency) => ({ currency, amount: totals[currency] }));
}



export function createDebtId(): string {
  debtSequence += 1;
  return `debt_${Date.now().toString(36)}_${debtSequence.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface SettlementDraft {
  amount: number;
  currency: CurrencyCode;
}

export interface SettlementResult {
  debts: Debt[];
  payments: Payment[];
  transaction: Transaction;
  payment: Payment;
}

export type DailyJournalEventType = 'cash_in' | 'cash_out' | 'debt' | 'settlement';

export interface DailyJournalEvent {
  id: string;
  storeId: string;
  type: DailyJournalEventType;
  amount: number;
  currency: CurrencyCode;
  customerId?: string;
  customerName?: string;
  note?: string;
  occurredAt: string;
  sourceId: string;
}

export function buildDailyJournalEvents(
  storeId: string,
  transactions: Transaction[],
  debts: Debt[],
  payments: Payment[],
  customers: Customer[],
  now: Date = new Date(),
): DailyJournalEvent[] {
  const settlementTransactionIds = new Set(
    payments
      .filter((payment) => payment.storeId === storeId && payment.direction === 'in' && payment.customerId && payment.transactionId)
      .map((payment) => payment.transactionId as string),
  );
  const customerNames = new Map(
    customers
      .filter((customer) => customer.storeId === storeId)
      .map((customer) => [customer.id, customer.name]),
  );
  const events: DailyJournalEvent[] = [];

  for (const transaction of transactions) {
    if (transaction.storeId !== storeId || settlementTransactionIds.has(transaction.id) || !isSameLocalDay(transaction.createdAt, now)) {
      continue;
    }
    events.push({
      id: `transaction:${transaction.id}`,
      storeId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      ...(transaction.note ? { note: transaction.note } : {}),
      occurredAt: transaction.createdAt,
      sourceId: transaction.id,
    });
  }

  for (const debt of debts) {
    if (debt.storeId !== storeId || !isSameLocalDay(debt.createdAt, now)) {
      continue;
    }
    events.push({
      id: `debt:${debt.id}`,
      storeId,
      type: 'debt',
      amount: debt.originalAmount ?? debt.amount,
      currency: debt.currency,
      customerId: debt.customerId,
      customerName: customerNames.get(debt.customerId),
      occurredAt: debt.createdAt,
      sourceId: debt.id,
    });
  }

  for (const payment of payments) {
    if (
      payment.storeId !== storeId
      || payment.direction !== 'in'
      || !payment.customerId
      || !isSameLocalDay(payment.paidAt, now)
    ) {
      continue;
    }
    events.push({
      id: `settlement:${payment.id}`,
      storeId,
      type: 'settlement',
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      customerId: payment.customerId,
      customerName: customerNames.get(payment.customerId),
      ...(payment.note ? { note: payment.note } : {}),
      occurredAt: payment.paidAt,
      sourceId: payment.id,
    });
  }

  return events.sort((first, second) => Date.parse(second.occurredAt) - Date.parse(first.occurredAt));
}



export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}










export function parseLocalizedAmountInput(value: string, language: Language): number | null {
  const input = value.trim().replace(/[\s\u00A0\u202F]/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(input)) {
    return null;
  }

  const commaCount = (input.match(/,/g) ?? []).length;
  const dotCount = (input.match(/\./g) ?? []).length;
  let normalized = input;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = input.lastIndexOf(',') > input.lastIndexOf('.') ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = input.split(groupingSeparator).join('').replace(decimalSeparator, '.');
  } else {
    const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : null;
    if (separator) {
      const parts = input.split(separator);
      if (parts.length > 2) {
        const validGrouping = parts.slice(1).every((part) => part.length === 3);
        if (!validGrouping) {
          return null;
        }
        normalized = parts.join('');
      } else {
        const localeDecimalSeparator = language === 'tr' ? ',' : '.';
        const fractionalPart = parts[1];
        const looksLikeGrouping = separator !== localeDecimalSeparator && fractionalPart.length === 3;
        normalized = looksLikeGrouping ? parts.join('') : parts.join('.');
      }
    }
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function validateDebtInput(input: {
  id: unknown;
  storeId: unknown;
  customerId: unknown;
  currency: unknown;
  amount: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  dueDate?: unknown;
  originalAmount?: unknown;
  settledAt?: unknown;
}): string | null {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return 'debtIdRequired';
  }
  if (typeof input.storeId !== 'string' || input.storeId.trim().length === 0) {
    return 'storeIdRequired';
  }
  if (typeof input.customerId !== 'string' || input.customerId.trim().length === 0) {
    return 'customerIdRequired';
  }
  const hasSettlementMetadata = input.amount === 0
    && typeof input.originalAmount === 'number'
    && Number.isFinite(input.originalAmount)
    && input.originalAmount > 0
    && isValidDateString(input.settledAt);
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0 || (input.amount === 0 && !hasSettlementMetadata)) {
    return 'amountInvalid';
  }
  if (
    input.originalAmount !== undefined
    && (typeof input.originalAmount !== 'number'
      || !Number.isFinite(input.originalAmount)
      || input.originalAmount <= 0
      || input.originalAmount < input.amount)
  ) {
    return 'originalAmountInvalid';
  }
  if (input.settledAt !== undefined && !isValidDateString(input.settledAt)) {
    return 'settledAtInvalid';
  }
  if (
    input.dueDate !== undefined
    && (typeof input.dueDate !== 'string' || !isValidDateOnly(input.dueDate))
  ) {
    return 'dueDateInvalid';
  }
  if (!isCurrencyCode(input.currency)) {
    return 'currencyInvalid';
  }
  if (!isValidDateString(input.createdAt) || !isValidDateString(input.updatedAt)) {
    return 'timestampInvalid';
  }
  return null;
}

export function createDebt(
  storeId: string,
  customerId: string,
  draft: { amount: number; currency: CurrencyCode; dueDate?: string },
  now: string = new Date().toISOString(),
): Debt {
  const dueDate = draft.dueDate?.trim();
  const debt: Debt = {
    id: createDebtId(),
    storeId: storeId.trim(),
    customerId: customerId.trim(),
    currency: draft.currency,
    amount: draft.amount,
    ...(dueDate ? { dueDate } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const validation = validateDebtInput(debt);
  if (validation) {
    throw new Error(validation);
  }
  return debt;
}

export function calculateDebtTotals(debts: Debt[]): Record<CurrencyCode, number> {
  const totals = Object.fromEntries(CURRENCY_OPTIONS.map(({ code }) => [code, 0])) as Record<CurrencyCode, number>;
  for (const debt of debts) {
    totals[debt.currency] += debt.amount;
  }
  return totals;
}

export function filterDebtsByCustomer(debts: Debt[], customerId: string): Debt[] {
  return debts.filter((debt) => debt.customerId === customerId);
}



export function createReminderId(): string {
  reminderSequence += 1;
  return `reminder_${Date.now().toString(36)}_${reminderSequence.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function validateReminderInput(input: {
  id: unknown;
  storeId: unknown;
  debtId: unknown;
  remindAt: unknown;
  status: unknown;
  note?: unknown;
  completedAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}): string | null {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return 'reminderIdRequired';
  }
  if (typeof input.storeId !== 'string' || input.storeId.trim().length === 0) {
    return 'storeIdRequired';
  }
  if (typeof input.debtId !== 'string' || input.debtId.trim().length === 0) {
    return 'debtIdRequired';
  }
  if (!isValidIsoTimestamp(input.remindAt)) {
    return 'remindAtInvalid';
  }
  if (input.status !== 'pending' && input.status !== 'completed' && input.status !== 'dismissed') {
    return 'reminderStatusInvalid';
  }
  if (input.note !== undefined && typeof input.note !== 'string') {
    return 'reminderNoteInvalid';
  }
  if (input.completedAt !== undefined && !isValidDateString(input.completedAt)) {
    return 'completedAtInvalid';
  }
  if (!isValidDateString(input.createdAt) || !isValidDateString(input.updatedAt)) {
    return 'timestampInvalid';
  }
  return null;
}

export function createReminder(
  storeId: string,
  debtId: string,
  draft: {
    remindAt: string;
    status?: ReminderStatus;
    note?: string;
    completedAt?: string;
  },
  now: string = new Date().toISOString(),
): Reminder {
  const note = draft.note?.trim();
  const completedAt = draft.completedAt?.trim();
  const reminder: Reminder = {
    id: createReminderId(),
    storeId: storeId.trim(),
    debtId: debtId.trim(),
    remindAt: draft.remindAt.trim(),
    status: draft.status ?? 'pending',
    ...(note ? { note } : {}),
    ...(completedAt ? { completedAt } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const validation = validateReminderInput(reminder);
  if (validation) {
    throw new Error(validation);
  }
  return reminder;
}

export function filterRemindersByDebt(reminders: Reminder[], debtId: string): Reminder[] {
  return reminders.filter((reminder) => reminder.debtId === debtId);
}






export function createPaymentId(): string {
  paymentSequence += 1;
  return `payment_${Date.now().toString(36)}_${paymentSequence.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function validatePaymentInput(input: {
  id: unknown;
  storeId: unknown;
  amount: unknown;
  direction: unknown;
  method: unknown;
  customerId?: unknown;
  transactionId?: unknown;
  paidAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}): string | null {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return 'paymentIdRequired';
  }
  if (typeof input.storeId !== 'string' || input.storeId.trim().length === 0) {
    return 'storeIdRequired';
  }
  if (!isRecord(input.amount)) {
    return 'amountInvalid';
  }
  if (
    typeof input.amount.amount !== 'number'
    || !Number.isFinite(input.amount.amount)
    || input.amount.amount <= 0
    || !isCurrencyCode(input.amount.currency)
  ) {
    return 'amountInvalid';
  }
  if (input.direction !== 'in' && input.direction !== 'out') {
    return 'paymentDirectionInvalid';
  }
  if (input.method !== 'cash' && input.method !== 'card' && input.method !== 'bank-transfer' && input.method !== 'other') {
    return 'paymentMethodInvalid';
  }
  if (input.customerId !== undefined && (typeof input.customerId !== 'string' || input.customerId.trim().length === 0)) {
    return 'customerIdInvalid';
  }
  if (input.transactionId !== undefined && (typeof input.transactionId !== 'string' || input.transactionId.trim().length === 0)) {
    return 'transactionIdInvalid';
  }
  if (!isValidDateString(input.paidAt) || !isValidDateString(input.createdAt) || !isValidDateString(input.updatedAt)) {
    return 'timestampInvalid';
  }
  return null;
}

export function createPayment(
  storeId: string,
  customerId: string,
  draft: { amount: number; currency: CurrencyCode; transactionId?: string },
  now: string = new Date().toISOString(),
): Payment {
  const payment: Payment = {
    id: createPaymentId(),
    storeId: storeId.trim(),
    customerId: customerId.trim(),
    amount: { amount: draft.amount, currency: draft.currency },
    direction: 'in',
    method: 'cash',
    ...(draft.transactionId ? { transactionId: draft.transactionId } : {}),
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const validation = validatePaymentInput(payment);
  if (validation) {
    throw new Error(validation);
  }
  return payment;
}

export function filterPaymentsByCustomer(payments: Payment[], customerId: string): Payment[] {
  return payments.filter((payment) => payment.customerId === customerId);
}





function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}



function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) {
    return false;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    const parsed = new Date(year, month - 1, day, hours, minutes, seconds, 0);
    return parsed.getFullYear() === year
      && parsed.getMonth() === month - 1
      && parsed.getDate() === day
      && parsed.getHours() === hours
      && parsed.getMinutes() === minutes
      && parsed.getSeconds() === seconds;
  }

  return isValidDateString(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && new Date(value).toISOString() === value;
}

function isSameLocalDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}


































