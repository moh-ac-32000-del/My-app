import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAccent } from '@/constants/colors';
import { normalizeLanguage } from '@/constants/i18n';
import { normalizeCurrency, normalizeQuickCurrencies } from '@/constants/currencies';
import type { Customer, StoreProfile } from '@/types/business';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';
const CUSTOMERS_KEY = '@retail-business-manager/customers';

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
