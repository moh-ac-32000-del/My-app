import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAccent } from '@/constants/colors';
import { normalizeLanguage } from '@/constants/i18n';
import { CURRENCY_OPTIONS, isCurrencyCode, normalizeCurrency, normalizeQuickCurrencies, type CurrencyCode } from '@/constants/currencies';
import type { CashTransactionDraft, Customer, StoreProfile, Transaction } from '@/types/business';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';
const CUSTOMERS_KEY = '@retail-business-manager/customers';
const TRANSACTIONS_KEY = '@retail-business-manager/transactions';

let transactionSequence = 0;

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
    language: normalizeLanguage(value.language ?? legacyLanguage ?? fallback.language),
    accent: normalizeAccent(value.accent ?? fallback.accent),
    ...(logoUri === undefined ? {} : { logoUri }),
  };
}
