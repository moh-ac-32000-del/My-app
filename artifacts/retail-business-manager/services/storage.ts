import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAccent } from '@/constants/colors';
import { normalizeLanguage, type Language } from '@/constants/i18n';
import { CURRENCY_OPTIONS, isCurrencyCode, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import type {
  CashTransactionDraft,
  Customer,
  DailyArchive,
  Debt,
  Payment,
  Reminder,
  ReminderStatus,
  StoreProfile,
  Transaction,
} from '@/types/business';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';
const CUSTOMERS_KEY = '@retail-business-manager/customers';
const TRANSACTIONS_KEY = '@retail-business-manager/transactions';
const DEBTS_KEY = '@retail-business-manager/debts';
const PAYMENTS_KEY = '@retail-business-manager/payments';
const REMINDERS_KEY = '@retail-business-manager/reminders';
const ARCHIVE_KEY_PREFIX = '@retail-business-manager/daily-archive/';
export const SPACE_STORAGE_PREFIX = '@retail-business-manager/spaces/';

let transactionSequence = 0;
let debtSequence = 0;
let paymentSequence = 0;
let reminderSequence = 0;
let settlementQueue: Promise<void> = Promise.resolve();
let archiveClosingQueue: Promise<void> = Promise.resolve();
let activeSpaceId: string | null = null;

export function setActiveSpaceId(spaceId: string | null): void {
  activeSpaceId = spaceId?.trim() || null;
}

export function getActiveSpaceId(): string | null {
  return activeSpaceId;
}

export async function loadStoreProfile(): Promise<unknown | null> {
  const storedProfile = await AsyncStorage.getItem(getStoreProfileKey());
  if (!storedProfile) {
    return null;
  }

  try {
    return JSON.parse(storedProfile) as unknown;
  } catch {
    return null;
  }
}

export async function saveStoreProfile(profile: StoreProfile): Promise<void> {
  await AsyncStorage.setItem(getStoreProfileKey(), JSON.stringify(profile));
}

export async function loadAuthenticatedState(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTH_KEY)) === 'true';
}

export async function saveAuthenticatedState(value: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTH_KEY, String(value));
}

export async function loadLegacyLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(LEGACY_LANGUAGE_KEY);
}

export async function clearLegacyLanguage(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_LANGUAGE_KEY);
}

export async function loadCustomers(storeId: string): Promise<Customer[]> {
  try {
    return (await loadAllCustomers()).filter((customer) => customer.storeId === storeId);
  } catch {
    return [];
  }
}

export async function saveCustomers(storeId: string, customers: Customer[]): Promise<void> {
  if (customers.some((customer) => customer.storeId !== storeId)) {
    throw new Error('All customers must belong to the active store');
  }

  const storedCustomers = await loadAllCustomers();
  const otherStoreCustomers = storedCustomers.filter((customer) => customer.storeId !== storeId);
  await AsyncStorage.setItem(getCustomersKey(), JSON.stringify([...otherStoreCustomers, ...customers]));
}

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

export async function loadTransactions(storeId: string): Promise<Transaction[]> {
  try {
    const transactions = await loadAllTransactions();
    return transactions
      .filter((transaction) => transaction.storeId === storeId)
      .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  } catch {
    return [];
  }
}

export async function saveTransactions(storeId: string, transactions: Transaction[]): Promise<void> {
  if (transactions.some((transaction) => transaction.storeId !== storeId || !isStoredTransaction(transaction))) {
    throw new Error('All transactions must be valid and belong to the active store');
  }

  const stored = await readStoredTransactions();
  if (stored.isCorrupted) {
    throw new Error('Stored transaction data is corrupted');
  }

  const otherStoreTransactions = stored.transactions.filter((transaction) => transaction.storeId !== storeId);
  await AsyncStorage.setItem(getTransactionsKey(), JSON.stringify([...otherStoreTransactions, ...transactions]));
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

export async function loadDailyJournalEvents(
  storeId: string,
  now: Date = new Date(),
): Promise<DailyJournalEvent[]> {
  const [transactions, debts, payments, customers, archives] = await Promise.all([
    loadTransactions(storeId),
    loadDebts(storeId),
    loadPayments(storeId),
    loadCustomers(storeId),
    loadDailyArchives(storeId),
  ]);
  const archivedEventIds = new Set(
    archives
      .filter((archive) => archive.date === getLocalDateKey(now))
      .flatMap((archive) => archive.snapshot.map((event) => event.id)),
  );
  return buildDailyJournalEvents(storeId, transactions, debts, payments, customers, now)
    .filter((event) => !archivedEventIds.has(event.id));
}

export interface DailyArchiveCloseResult {
  archive: DailyArchive;
  created: boolean;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDailyArchive(
  storeId: string,
  date: string,
  snapshot: DailyJournalEvent[],
  closedAt: string,
  closingNumber = 1,
): DailyArchive {
  if (typeof storeId !== 'string' || storeId.trim().length === 0) {
    throw new Error('storeIdRequired');
  }
  if (!isValidArchiveDate(date)) {
    throw new Error('archiveDateInvalid');
  }
  if (!isValidDateString(closedAt)) {
    throw new Error('closedAtInvalid');
  }
  if (!Number.isInteger(closingNumber) || closingNumber < 1) {
    throw new Error('closingNumberInvalid');
  }

  return {
    id: `archive:${encodeURIComponent(storeId.trim())}:${date}:${closingNumber}`,
    storeId: storeId.trim(),
    date,
    closedAt,
    closingNumber,
    snapshot: snapshot.map((event) => ({ ...event })),
  };
}

export async function closeDailyArchive(
  storeId: string,
  now: Date = new Date(),
): Promise<DailyArchiveCloseResult> {
  const operation = archiveClosingQueue
    .catch(() => undefined)
    .then(() => closeDailyArchiveNow(storeId, now));
  archiveClosingQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function closeDailyArchiveNow(
  storeId: string,
  now: Date,
): Promise<DailyArchiveCloseResult> {
  const date = getLocalDateKey(now);
  const snapshot = await loadDailyJournalEvents(storeId, now);
  const existingArchives = await loadDailyArchives(storeId);
  const sameDayArchives = existingArchives.filter((archive) => archive.date === date);
  const closingNumber = sameDayArchives.reduce(
    (highest, archive) => Math.max(highest, archive.closingNumber),
    0,
  ) + 1;
  const archive = createDailyArchive(storeId, date, snapshot, now.toISOString(), closingNumber);
  const key = getDailyArchiveStorageKey(storeId, date, closingNumber);
  await AsyncStorage.setItem(key, JSON.stringify(archive));
  return { archive, created: true };
}

export async function loadDailyArchives(storeId: string): Promise<DailyArchive[]> {
  if (typeof storeId !== 'string' || storeId.trim().length === 0) {
    return [];
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = getDailyArchiveStoragePrefix(storeId);
    const archiveKeys = keys.filter((key) => key.startsWith(prefix));
    const archives = await Promise.all(archiveKeys.map(async (key) => {
      const raw = await AsyncStorage.getItem(key);
      return raw === null ? null : parseStoredDailyArchive(raw);
    }));
    return archives
      .filter((archive): archive is DailyArchive => archive !== null && archive.storeId === storeId.trim())
      .sort((first, second) => {
        const dateOrder = second.date.localeCompare(first.date);
        if (dateOrder !== 0) {
          return dateOrder;
        }
        return first.closingNumber - second.closingNumber;
      });
  } catch {
    return [];
  }
}

export async function loadDailyArchive(storeId: string, date: string): Promise<DailyArchive | null> {
  const archives = await loadDailyArchives(storeId);
  return archives.find((archive) => archive.date === date) ?? null;
}

function getDailyArchiveStorageKey(storeId: string, date: string, closingNumber: number): string {
  return `${getDailyArchiveStoragePrefix(storeId)}${date}:${String(closingNumber).padStart(6, '0')}`;
}

function isValidArchiveDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function parseStoredDailyArchive(raw: string): DailyArchive | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.storeId !== 'string' || typeof parsed.date !== 'string' || typeof parsed.closedAt !== 'string' || !Array.isArray(parsed.snapshot)) {
      return null;
    }
    if (!isValidArchiveDate(parsed.date) || !isValidDateString(parsed.closedAt)) {
      return null;
    }
    const closingNumber = parsed.closingNumber === undefined ? 1 : parsed.closingNumber;
    if (typeof closingNumber !== 'number' || !Number.isInteger(closingNumber) || closingNumber < 1) {
      return null;
    }
    const snapshot = parsed.snapshot.filter(isDailyJournalEvent);
    if (snapshot.length !== parsed.snapshot.length) {
      return null;
    }
    return {
      id: parsed.id,
      storeId: parsed.storeId,
      date: parsed.date,
      closedAt: parsed.closedAt,
      closingNumber,
      snapshot: snapshot.map((event) => ({ ...event })),
    };
  } catch {
    return null;
  }
}

function isDailyJournalEvent(value: unknown): value is DailyJournalEvent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string'
    && typeof value.storeId === 'string'
    && (value.type === 'cash_in' || value.type === 'cash_out' || value.type === 'debt' || value.type === 'settlement')
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && isCurrencyCode(value.currency)
    && (value.customerId === undefined || typeof value.customerId === 'string')
    && (value.customerName === undefined || typeof value.customerName === 'string')
    && (value.note === undefined || typeof value.note === 'string')
    && typeof value.occurredAt === 'string'
    && isValidDateString(value.occurredAt)
    && typeof value.sourceId === 'string';
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
    && (typeof input.dueDate !== 'string' || !isValidArchiveDate(input.dueDate))
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

export async function loadDebts(storeId: string): Promise<Debt[]> {
  try {
    const debts = await loadAllDebts();
    return debts
      .filter((debt) => debt.storeId === storeId)
      .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  } catch {
    return [];
  }
}

export async function saveDebts(storeId: string, debts: Debt[]): Promise<void> {
  if (debts.some((debt) => debt.storeId !== storeId || !isStoredDebt(debt))) {
    throw new Error('All debts must be valid and belong to the active store');
  }

  const stored = await readStoredDebts();
  if (stored.isCorrupted) {
    throw new Error('Stored debt data is corrupted');
  }

  const otherStoreDebts = stored.debts.filter((debt) => debt.storeId !== storeId);
  await AsyncStorage.setItem(getDebtsKey(), JSON.stringify([...otherStoreDebts, ...debts]));
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

export async function loadPayments(storeId: string): Promise<Payment[]> {
  try {
    const payments = await loadAllPayments();
    return payments
      .filter((payment) => payment.storeId === storeId)
      .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt));
  } catch {
    return [];
  }
}

export async function savePayments(storeId: string, payments: Payment[]): Promise<void> {
  if (payments.some((payment) => payment.storeId !== storeId || !isStoredPayment(payment))) {
    throw new Error('All payments must be valid and belong to the active store');
  }

  const stored = await readStoredPayments();
  if (stored.isCorrupted) {
    throw new Error('Stored payment data is corrupted');
  }

  const otherStorePayments = stored.payments.filter((payment) => payment.storeId !== storeId);
  await AsyncStorage.setItem(getPaymentsKey(), JSON.stringify([...otherStorePayments, ...payments]));
}

export function settleCustomerDebt(
  storeId: string,
  customerId: string,
  draft: SettlementDraft,
  now: string = new Date().toISOString(),
): Promise<SettlementResult> {
  const operation = settlementQueue
    .catch(() => undefined)
    .then(() => settleCustomerDebtNow(storeId, customerId, draft, now));
  settlementQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function settleCustomerDebtNow(
  storeId: string,
  customerId: string,
  draft: SettlementDraft,
  now: string,
): Promise<SettlementResult> {
  if (typeof storeId !== 'string' || storeId.trim().length === 0) {
    throw new Error('storeIdRequired');
  }
  if (typeof customerId !== 'string' || customerId.trim().length === 0) {
    throw new Error('customerIdRequired');
  }
  if (typeof draft.amount !== 'number' || !Number.isFinite(draft.amount) || draft.amount <= 0) {
    throw new Error('settlementAmountInvalid');
  }
  if (!isCurrencyCode(draft.currency)) {
    throw new Error('currencyInvalid');
  }

  const [debtsStored, transactionsStored, paymentsStored] = await Promise.all([
    readStoredDebts(),
    readStoredTransactions(),
    readStoredPayments(),
  ]);
  if (debtsStored.isCorrupted || transactionsStored.isCorrupted || paymentsStored.isCorrupted) {
    throw new Error('storedSettlementDataCorrupted');
  }

  const currentDebts = debtsStored.debts.filter((debt) => debt.storeId === storeId);
  const customerDebts = currentDebts.filter((debt) => debt.customerId === customerId);
  const remaining = calculateDebtTotals(customerDebts)[draft.currency];
  if (draft.amount > remaining) {
    throw new Error('settlementExceedsDebt');
  }

  let amountToApply = draft.amount;
  const nextDebts = debtsStored.debts.map((debt) => {
    if (debt.storeId !== storeId || debt.customerId !== customerId || debt.currency !== draft.currency || debt.amount <= 0 || amountToApply <= 0) {
      return debt;
    }

    const originalAmount = debt.originalAmount ?? debt.amount;
    const applied = Math.min(debt.amount, amountToApply);
    amountToApply -= applied;
    const nextAmount = debt.amount - applied;
    return {
      ...debt,
      amount: nextAmount,
      ...(nextAmount === 0 ? { originalAmount, settledAt: now } : { originalAmount }),
      updatedAt: now,
    };
  });

  if (amountToApply !== 0) {
    throw new Error('settlementExceedsDebt');
  }

  const transaction = createCashTransaction(storeId, {
    type: 'cash_in',
    amount: draft.amount,
    currency: draft.currency,
    note: `payment_${customerId}`,
  }, now);
  const payment = createPayment(storeId, customerId, {
    amount: draft.amount,
    currency: draft.currency,
    transactionId: transaction.id,
  }, now);
  const currentTransactions = transactionsStored.transactions.filter((transactionItem) => transactionItem.storeId === storeId);
  const currentPayments = paymentsStored.payments.filter((paymentItem) => paymentItem.storeId === storeId);
  const nextTransactions = [...currentTransactions, transaction];
  const nextPayments = [...currentPayments, payment];
  const snapshots = await Promise.all([
    AsyncStorage.getItem(getDebtsKey()),
    AsyncStorage.getItem(getTransactionsKey()),
    AsyncStorage.getItem(getPaymentsKey()),
  ]);

  try {
    await saveDebts(storeId, nextDebts.filter((debt) => debt.storeId === storeId));
    await saveTransactions(storeId, nextTransactions);
    await savePayments(storeId, nextPayments);
  } catch (error) {
    await restoreStorageValue(getDebtsKey(), snapshots[0]);
    await restoreStorageValue(getTransactionsKey(), snapshots[1]);
    await restoreStorageValue(getPaymentsKey(), snapshots[2]);
    throw error;
  }

  return {
    debts: nextDebts.filter((debt) => debt.storeId === storeId).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)),
    payments: nextPayments.sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt)),
    transaction,
    payment,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  return typeof record[key] === 'string' ? record[key] : fallback;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  if (typeof record[key] !== 'string') {
    return undefined;
  }
  const value = record[key].trim();
  return value || undefined;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isSameLocalDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

async function loadAllCustomers(): Promise<Customer[]> {
  const storedCustomers = await AsyncStorage.getItem(getCustomersKey());
  if (!storedCustomers) {
    return [];
  }

  const parsed = JSON.parse(storedCustomers) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizeStoredCustomer)
    .filter((customer): customer is Customer => customer !== null);
}

async function loadAllTransactions(): Promise<Transaction[]> {
  return (await readStoredTransactions()).transactions;
}

async function loadAllDebts(): Promise<Debt[]> {
  return (await readStoredDebts()).debts;
}

async function loadAllPayments(): Promise<Payment[]> {
  return (await readStoredPayments()).payments;
}

async function readStoredTransactions(): Promise<{ transactions: Transaction[]; isCorrupted: boolean }> {
  const storedTransactions = await AsyncStorage.getItem(getTransactionsKey());
  if (!storedTransactions) {
    return { transactions: [], isCorrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storedTransactions) as unknown;
  } catch {
    return { transactions: [], isCorrupted: true };
  }

  if (!Array.isArray(parsed)) {
    return { transactions: [], isCorrupted: true };
  }

  return {
    transactions: parsed
      .map(normalizeStoredTransaction)
      .filter((transaction): transaction is Transaction => transaction !== null),
    isCorrupted: false,
  };
}

function isStoredTransaction(value: unknown): value is Transaction {
  return normalizeStoredTransaction(value) !== null;
}

function isStoredDebt(value: unknown): value is Debt {
  return normalizeStoredDebt(value) !== null;
}

function normalizeStoredTransaction(value: unknown): Transaction | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readOptionalString(value, 'id');
  const storeId = readOptionalString(value, 'storeId');
  const type = value.type;
  const amount = value.amount;
  const currency = value.currency;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;

  if (
    !id ||
    !storeId ||
    (type !== 'cash_in' && type !== 'cash_out') ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !isCurrencyCode(currency) ||
    !isValidDateString(createdAt) ||
    !isValidDateString(updatedAt)
  ) {
    return null;
  }

  const note = readOptionalString(value, 'note');
  return {
    id,
    storeId,
    type,
    amount,
    currency,
    ...(note ? { note } : {}),
    createdAt,
    updatedAt,
  };
}

async function readStoredDebts(): Promise<{ debts: Debt[]; isCorrupted: boolean }> {
  const storedDebts = await AsyncStorage.getItem(getDebtsKey());
  if (!storedDebts) {
    return { debts: [], isCorrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storedDebts) as unknown;
  } catch {
    return { debts: [], isCorrupted: true };
  }

  if (!Array.isArray(parsed)) {
    return { debts: [], isCorrupted: true };
  }

  return {
    debts: parsed
      .map(normalizeStoredDebt)
      .filter((debt): debt is Debt => debt !== null),
    isCorrupted: false,
  };
}

function normalizeStoredDebt(value: unknown): Debt | null {
  if (!isRecord(value)) {
    return null;
  }

  const debt = {
    id: readOptionalString(value, 'id'),
    storeId: readOptionalString(value, 'storeId'),
    customerId: readOptionalString(value, 'customerId'),
    currency: value.currency,
    amount: value.amount,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    dueDate: value.dueDate,
    originalAmount: value.originalAmount,
    settledAt: value.settledAt,
  };

  if (validateDebtInput(debt)) {
    return null;
  }

  return {
    id: debt.id as string,
    storeId: debt.storeId as string,
    customerId: debt.customerId as string,
    currency: debt.currency as CurrencyCode,
    amount: debt.amount as number,
    ...(typeof debt.dueDate === 'string' ? { dueDate: debt.dueDate } : {}),
    ...(typeof debt.originalAmount === 'number' ? { originalAmount: debt.originalAmount } : {}),
    ...(typeof debt.settledAt === 'string' ? { settledAt: debt.settledAt } : {}),
    createdAt: debt.createdAt as string,
    updatedAt: debt.updatedAt as string,
  };
}

async function readStoredPayments(): Promise<{ payments: Payment[]; isCorrupted: boolean }> {
  const storedPayments = await AsyncStorage.getItem(getPaymentsKey());
  if (!storedPayments) {
    return { payments: [], isCorrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storedPayments) as unknown;
  } catch {
    return { payments: [], isCorrupted: true };
  }

  if (!Array.isArray(parsed)) {
    return { payments: [], isCorrupted: true };
  }

  return {
    payments: parsed
      .map(normalizeStoredPayment)
      .filter((payment): payment is Payment => payment !== null),
    isCorrupted: false,
  };
}

function isStoredPayment(value: unknown): value is Payment {
  return normalizeStoredPayment(value) !== null;
}

function normalizeStoredPayment(value: unknown): Payment | null {
  if (!isRecord(value)) {
    return null;
  }

  const payment = {
    id: readOptionalString(value, 'id'),
    storeId: readOptionalString(value, 'storeId'),
    amount: value.amount,
    direction: value.direction,
    method: value.method,
    customerId: readOptionalString(value, 'customerId'),
    transactionId: readOptionalString(value, 'transactionId'),
    paidAt: value.paidAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    note: readOptionalString(value, 'note'),
  };

  if (validatePaymentInput(payment)) {
    return null;
  }

  const amount = payment.amount as { amount: number; currency: CurrencyCode };
  return {
    id: payment.id as string,
    storeId: payment.storeId as string,
    amount: { amount: amount.amount, currency: amount.currency },
    direction: payment.direction as Payment['direction'],
    method: payment.method as Payment['method'],
    ...(payment.customerId ? { customerId: payment.customerId } : {}),
    ...(payment.transactionId ? { transactionId: payment.transactionId } : {}),
    paidAt: payment.paidAt as string,
    ...(payment.note ? { note: payment.note } : {}),
    createdAt: payment.createdAt as string,
    updatedAt: payment.updatedAt as string,
  };
}

async function restoreStorageValue(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await AsyncStorage.removeItem(key);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

function normalizeStoredCustomer(value: unknown): Customer | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readOptionalString(value, 'id');
  const savedStoreId = readOptionalString(value, 'storeId');
  const name = readOptionalString(value, 'name');
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;

  if (!id || !savedStoreId || !name || !isValidDateString(createdAt) || !isValidDateString(updatedAt)) {
    return null;
  }

  return {
    id,
    storeId: savedStoreId,
    name,
    phone: readOptionalString(value, 'phone'),
    address: readOptionalString(value, 'address'),
    notes: readOptionalString(value, 'notes'),
    createdAt,
    updatedAt,
    isActive: typeof value.isActive === 'boolean' ? value.isActive : true,
  };
}

export function normalizeStoredStoreProfile(
  value: unknown,
  fallback: StoreProfile,
  legacyLanguage?: unknown,
): StoreProfile {
  if (!isRecord(value)) {
    return { ...fallback, language: normalizeLanguage(legacyLanguage ?? fallback.language) };
  }

  const currency = normalizeCurrency(value.currency, fallback.currency);
  const savedName = readString(value, 'name', fallback.name);
  const name = ['متجري', 'My store', 'Mağazam'].includes(savedName) ? '' : savedName;
  const logoUri = typeof value.logoUri === 'string' ? value.logoUri : fallback.logoUri;

  return {
    ...fallback,
    id: readString(value, 'id', fallback.id) || fallback.id,
    name,
    phone: readString(value, 'phone', fallback.phone),
    address: readString(value, 'address', fallback.address),
    currency,
    quickCurrencies: normalizeQuickCurrencies(value.quickCurrencies, [currency]),
    visibleCurrencies: normalizeQuickCurrencies(value.visibleCurrencies, [currency]),
    language: normalizeLanguage(value.language ?? legacyLanguage ?? fallback.language),
    accent: normalizeAccent(value.accent ?? fallback.accent),
    ...(logoUri === undefined ? {} : { logoUri }),
  };
}

export const LOCAL_BACKUP_FORMAT_VERSION = 1 as const;

export interface LocalBackupData {
  customers: Customer[];
  transactions: Transaction[];
  debts: Debt[];
  payments: Payment[];
  dailyArchives: DailyArchive[];
}

export interface LocalBackup {
  formatVersion: typeof LOCAL_BACKUP_FORMAT_VERSION;
  createdAt: string;
  storeId: string;
  storeProfile: StoreProfile;
  authenticated: boolean;
  data: LocalBackupData;
}

interface StoredArrayResult<T> {
  values: T[];
  isCorrupted: boolean;
}

interface LocalStorageSnapshot {
  storeId: string;
  values: Map<string, string | null>;
}

export async function createLocalBackup(
  profile: StoreProfile,
  authenticated: boolean,
  createdAt: string = new Date().toISOString(),
): Promise<LocalBackup> {
  const storeId = normalizeBackupStoreId(profile.id);
  if (!isValidDateString(createdAt)) {
    throw new Error('backupCreatedAtInvalid');
  }

  const current = await readLocalBackupData(storeId);
  if (current.isCorrupted) {
    throw new Error('currentStorageDataCorrupted');
  }

  const storeProfile = cloneStoreProfile(profile);
  const profileError = validateBackupStoreProfile(storeProfile, storeId);
  if (profileError) {
    throw new Error(profileError);
  }

  return {
    formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
    createdAt,
    storeId,
    storeProfile,
    authenticated: Boolean(authenticated),
    data: {
      customers: current.customers.filter((customer) => customer.storeId === storeId),
      transactions: current.transactions.filter((transaction) => transaction.storeId === storeId),
      debts: current.debts.filter((debt) => debt.storeId === storeId),
      payments: current.payments.filter((payment) => payment.storeId === storeId),
      dailyArchives: current.dailyArchives,
    },
  };
}

export function serializeLocalBackup(backup: LocalBackup): string {
  return JSON.stringify(parseLocalBackup(JSON.stringify(backup)), null, 2);
}

export function parseLocalBackup(raw: string): LocalBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('backupJsonInvalid');
  }

  if (!isRecord(parsed)) {
    throw new Error('backupStructureInvalid');
  }
  if (parsed.formatVersion !== LOCAL_BACKUP_FORMAT_VERSION) {
    throw new Error('backupVersionUnsupported');
  }
  if (!isValidDateString(parsed.createdAt)) {
    throw new Error('backupCreatedAtInvalid');
  }

  const storeId = normalizeBackupStoreId(parsed.storeId);
  const profileError = validateBackupStoreProfile(parsed.storeProfile, storeId);
  if (profileError) {
    throw new Error(profileError);
  }
  if (typeof parsed.authenticated !== 'boolean') {
    throw new Error('backupAuthenticatedInvalid');
  }
  if (!isRecord(parsed.data)) {
    throw new Error('backupDataMissing');
  }

  const customers = normalizeBackupArray(parsed.data.customers, normalizeStoredCustomer, 'backupCustomersInvalid');
  const transactions = normalizeBackupArray(parsed.data.transactions, normalizeStoredTransaction, 'backupTransactionsInvalid');
  const debts = normalizeBackupArray(parsed.data.debts, normalizeStoredDebt, 'backupDebtsInvalid');
  const payments = normalizeBackupArray(parsed.data.payments, normalizeStoredPayment, 'backupPaymentsInvalid');
  const dailyArchives = normalizeBackupArray(
    parsed.data.dailyArchives,
    (value) => parseStoredDailyArchive(JSON.stringify(value)),
    'backupArchivesInvalid',
  );

  const backup: LocalBackup = {
    formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
    createdAt: parsed.createdAt,
    storeId,
    storeProfile: cloneStoreProfile(parsed.storeProfile as StoreProfile),
    authenticated: parsed.authenticated,
    data: { customers, transactions, debts, payments, dailyArchives },
  };
  const dataError = validateBackupRelationships(backup);
  if (dataError) {
    throw new Error(dataError);
  }
  return backup;
}

export async function restoreLocalBackup(raw: string, activeStoreId: string): Promise<LocalBackup> {
  const backup = parseLocalBackup(raw);
  const normalizedActiveStoreId = normalizeBackupStoreId(activeStoreId);
  if (backup.storeId !== normalizedActiveStoreId) {
    throw new Error('backupStoreMismatch');
  }

  const current = await readLocalBackupData(normalizedActiveStoreId);
  if (current.isCorrupted) {
    throw new Error('currentStorageDataCorrupted');
  }
  const snapshot = await captureLocalStorageSnapshot(normalizedActiveStoreId);

  const nextCustomers = [
    ...current.customers.filter((customer) => customer.storeId !== normalizedActiveStoreId),
    ...backup.data.customers,
  ];
  const nextTransactions = [
    ...current.transactions.filter((transaction) => transaction.storeId !== normalizedActiveStoreId),
    ...backup.data.transactions,
  ];
  const nextDebts = [
    ...current.debts.filter((debt) => debt.storeId !== normalizedActiveStoreId),
    ...backup.data.debts,
  ];
  const nextPayments = [
    ...current.payments.filter((payment) => payment.storeId !== normalizedActiveStoreId),
    ...backup.data.payments,
  ];
  const archivePrefix = getDailyArchiveStoragePrefix(normalizedActiveStoreId);

  try {
    await AsyncStorage.setItem(getStoreProfileKey(), JSON.stringify(backup.storeProfile));
    await AsyncStorage.setItem(getCustomersKey(), JSON.stringify(nextCustomers));
    await AsyncStorage.setItem(getTransactionsKey(), JSON.stringify(nextTransactions));
    await AsyncStorage.setItem(getDebtsKey(), JSON.stringify(nextDebts));
    await AsyncStorage.setItem(getPaymentsKey(), JSON.stringify(nextPayments));
    await AsyncStorage.setItem(AUTH_KEY, String(backup.authenticated));

    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      if (key.startsWith(archivePrefix)) {
        await AsyncStorage.removeItem(key);
      }
    }
    for (const archive of backup.data.dailyArchives) {
      await AsyncStorage.setItem(
        getDailyArchiveStorageKey(normalizedActiveStoreId, archive.date, archive.closingNumber),
        JSON.stringify(archive),
      );
    }
  } catch (error) {
    await restoreLocalStorageSnapshot(snapshot);
    throw error;
  }

  return backup;
}

async function readLocalBackupData(storeId: string): Promise<LocalBackupData & { isCorrupted: boolean }> {
  const [customers, transactions, debts, payments, dailyArchives] = await Promise.all([
    readStoredArray(getCustomersKey(), normalizeStoredCustomer),
    readStoredArray(getTransactionsKey(), normalizeStoredTransaction),
    readStoredArray(getDebtsKey(), normalizeStoredDebt),
    readStoredArray(getPaymentsKey(), normalizeStoredPayment),
    readStoredArchives(storeId),
  ]);
  return {
    customers: customers.values,
    transactions: transactions.values,
    debts: debts.values,
    payments: payments.values,
    dailyArchives: dailyArchives.values,
    isCorrupted: customers.isCorrupted
      || transactions.isCorrupted
      || debts.isCorrupted
      || payments.isCorrupted
      || dailyArchives.isCorrupted,
  };
}

async function readStoredArray<T>(
  key: string,
  normalize: (value: unknown) => T | null,
): Promise<StoredArrayResult<T>> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) {
    return { values: [], isCorrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { values: [], isCorrupted: true };
  }
  if (!Array.isArray(parsed)) {
    return { values: [], isCorrupted: true };
  }

  const normalized = parsed.map(normalize);
  return {
    values: normalized.filter((value): value is T => value !== null),
    isCorrupted: normalized.some((value) => value === null),
  };
}

async function readStoredArchives(storeId: string): Promise<StoredArrayResult<DailyArchive>> {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = getDailyArchiveStoragePrefix(storeId);
  const archiveKeys = keys.filter((key) => key.startsWith(prefix));
  const values: DailyArchive[] = [];
  let isCorrupted = false;

  for (const key of archiveKeys) {
    const raw = await AsyncStorage.getItem(key);
    const archive = raw === null ? null : parseStoredDailyArchive(raw);
    if (archive === null || archive.storeId !== storeId) {
      isCorrupted = true;
      continue;
    }
    values.push(archive);
  }

  return { values, isCorrupted };
}

async function captureLocalStorageSnapshot(storeId: string): Promise<LocalStorageSnapshot> {
  const keys = await AsyncStorage.getAllKeys();
  const archivePrefix = getDailyArchiveStoragePrefix(storeId);
  const managedKeys = new Set([
    getStoreProfileKey(),
    AUTH_KEY,
    getCustomersKey(),
    getTransactionsKey(),
    getDebtsKey(),
    getPaymentsKey(),
    ...keys.filter((key) => key.startsWith(archivePrefix)),
  ]);
  const entries = await Promise.all(
    Array.from(managedKeys, async (key) => [key, await AsyncStorage.getItem(key)] as const),
  );
  return { storeId, values: new Map(entries) };
}

async function restoreLocalStorageSnapshot(snapshot: LocalStorageSnapshot): Promise<void> {
  const archivePrefix = getDailyArchiveStoragePrefix(snapshot.storeId);
  const currentKeys = await AsyncStorage.getAllKeys();
  for (const key of currentKeys) {
    if (key.startsWith(archivePrefix) && !snapshot.values.has(key)) {
      await AsyncStorage.removeItem(key);
    }
  }

  for (const [key, value] of snapshot.values) {
    if (value === null) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  }
}

function normalizeBackupArray<T>(
  value: unknown,
  normalize: (item: unknown) => T | null,
  errorCode: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(errorCode);
  }
  const normalized = value.map(normalize);
  if (normalized.some((item) => item === null)) {
    throw new Error(errorCode);
  }
  return normalized as T[];
}

function normalizeBackupStoreId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('backupStoreIdInvalid');
  }
  return value.trim();
}

function validateBackupStoreProfile(value: unknown, storeId: string): string | null {
  if (!isRecord(value)) {
    return 'backupStoreProfileInvalid';
  }
  if (
    typeof value.id !== 'string'
    || value.id.trim() !== storeId
    || typeof value.name !== 'string'
    || typeof value.phone !== 'string'
    || typeof value.address !== 'string'
    || !isCurrencyCode(value.currency)
    || !Array.isArray(value.quickCurrencies)
    || !Array.isArray(value.visibleCurrencies)
    || !value.quickCurrencies.every(isCurrencyCode)
    || !value.visibleCurrencies.every(isCurrencyCode)
    || (value.language !== 'ar' && value.language !== 'en' && value.language !== 'tr')
    || !isAccentColor(value.accent)
    || (value.logoUri !== undefined && typeof value.logoUri !== 'string')
  ) {
    return 'backupStoreProfileInvalid';
  }
  return null;
}

function validateBackupRelationships(backup: LocalBackup): string | null {
  const customerIds = new Set(backup.data.customers.map((customer) => customer.id));
  const transactionIds = new Set(backup.data.transactions.map((transaction) => transaction.id));
  if (backup.data.customers.some((customer) => customer.storeId !== backup.storeId)) {
    return 'backupCustomersStoreMismatch';
  }
  if (backup.data.transactions.some((transaction) => transaction.storeId !== backup.storeId)) {
    return 'backupTransactionsStoreMismatch';
  }
  if (backup.data.debts.some((debt) => debt.storeId !== backup.storeId || !customerIds.has(debt.customerId))) {
    return 'backupDebtRelationshipInvalid';
  }
  if (backup.data.payments.some((payment) => (
    payment.storeId !== backup.storeId
    || (payment.customerId !== undefined && !customerIds.has(payment.customerId))
    || (payment.transactionId !== undefined && !transactionIds.has(payment.transactionId))
  ))) {
    return 'backupPaymentRelationshipInvalid';
  }
  if (backup.data.dailyArchives.some((archive) => (
    archive.storeId !== backup.storeId
    || archive.snapshot.some((event) => (
      event.storeId !== backup.storeId
      || (event.customerId !== undefined && !customerIds.has(event.customerId))
    ))
  ))) {
    return 'backupArchiveRelationshipInvalid';
  }

  const archiveKeys = new Set<string>();
  for (const archive of backup.data.dailyArchives) {
    const archiveKey = `${archive.date}:${archive.closingNumber}`;
    if (archiveKeys.has(archiveKey)) {
      return 'backupArchivesDuplicate';
    }
    archiveKeys.add(archiveKey);
  }
  return null;
}

function cloneStoreProfile(profile: StoreProfile): StoreProfile {
  return {
    ...profile,
    quickCurrencies: [...profile.quickCurrencies],
    visibleCurrencies: [...profile.visibleCurrencies],
  };
}

function isAccentColor(value: unknown): value is StoreProfile['accent'] {
  return value === 'silver'
    || value === 'white'
    || value === 'gold'
    || value === 'blue'
    || value === 'violet'
    || value === 'green';
}

function getDailyArchiveStoragePrefix(storeId: string): string {
  const archivePrefix = activeSpaceId
    ? `${getSpaceStoragePrefix(activeSpaceId)}daily-archive/`
    : ARCHIVE_KEY_PREFIX;
  return `${archivePrefix}${encodeURIComponent(storeId.trim())}:`;
}

function getStoreProfileKey(): string {
  return getSpaceStorageKey(PROFILE_KEY, 'store-profile');
}

function getCustomersKey(): string {
  return getSpaceStorageKey(CUSTOMERS_KEY, 'customers');
}

function getTransactionsKey(): string {
  return getSpaceStorageKey(TRANSACTIONS_KEY, 'transactions');
}

function getDebtsKey(): string {
  return getSpaceStorageKey(DEBTS_KEY, 'debts');
}

function getPaymentsKey(): string {
  return getSpaceStorageKey(PAYMENTS_KEY, 'payments');
}

function getSpaceStorageKey(legacyKey: string, dataName: string): string {
  return activeSpaceId
    ? `${getSpaceStoragePrefix(activeSpaceId)}${dataName}`
    : legacyKey;
}

function getSpaceStoragePrefix(spaceId: string): string {
  return `${SPACE_STORAGE_PREFIX}${encodeURIComponent(spaceId)}/`;
}
