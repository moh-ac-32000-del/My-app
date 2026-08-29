import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAccent } from '@/constants/colors';
import { normalizeLanguage, type Language } from '@/constants/i18n';
import { CURRENCY_OPTIONS, isCurrencyCode, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import type { CashTransactionDraft, Customer, Debt, Payment, StoreProfile, Transaction } from '@/types/business';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';
const CUSTOMERS_KEY = '@retail-business-manager/customers';
const TRANSACTIONS_KEY = '@retail-business-manager/transactions';
const DEBTS_KEY = '@retail-business-manager/debts';
const PAYMENTS_KEY = '@retail-business-manager/payments';

let transactionSequence = 0;
let debtSequence = 0;
let paymentSequence = 0;
let settlementQueue: Promise<void> = Promise.resolve();

export async function loadStoreProfile(): Promise<unknown | null> {
  const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);
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
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify([...otherStoreCustomers, ...customers]));
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
  await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...otherStoreTransactions, ...transactions]));
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
      occurredAt: payment.paidAt,
      sourceId: payment.id,
    });
  }

  return events.sort((first, second) => Date.parse(second.occurredAt) - Date.parse(first.occurredAt));
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
  draft: { amount: number; currency: CurrencyCode },
  now: string = new Date().toISOString(),
): Debt {
  const debt: Debt = {
    id: createDebtId(),
    storeId: storeId.trim(),
    customerId: customerId.trim(),
    currency: draft.currency,
    amount: draft.amount,
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
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify([...otherStoreDebts, ...debts]));
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
  await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify([...otherStorePayments, ...payments]));
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
    AsyncStorage.getItem(DEBTS_KEY),
    AsyncStorage.getItem(TRANSACTIONS_KEY),
    AsyncStorage.getItem(PAYMENTS_KEY),
  ]);

  try {
    await saveDebts(storeId, nextDebts.filter((debt) => debt.storeId === storeId));
    await saveTransactions(storeId, nextTransactions);
    await savePayments(storeId, nextPayments);
  } catch (error) {
    await restoreStorageValue(DEBTS_KEY, snapshots[0]);
    await restoreStorageValue(TRANSACTIONS_KEY, snapshots[1]);
    await restoreStorageValue(PAYMENTS_KEY, snapshots[2]);
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
  const storedCustomers = await AsyncStorage.getItem(CUSTOMERS_KEY);
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
  const storedTransactions = await AsyncStorage.getItem(TRANSACTIONS_KEY);
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
  const storedDebts = await AsyncStorage.getItem(DEBTS_KEY);
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
    ...(typeof debt.originalAmount === 'number' ? { originalAmount: debt.originalAmount } : {}),
    ...(typeof debt.settledAt === 'string' ? { settledAt: debt.settledAt } : {}),
    createdAt: debt.createdAt as string,
    updatedAt: debt.updatedAt as string,
  };
}

async function readStoredPayments(): Promise<{ payments: Payment[]; isCorrupted: boolean }> {
  const storedPayments = await AsyncStorage.getItem(PAYMENTS_KEY);
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
