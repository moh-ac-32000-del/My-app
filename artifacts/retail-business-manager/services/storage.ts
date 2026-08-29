import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAccent } from '@/constants/colors';
import { normalizeLanguage } from '@/constants/i18n';
import { normalizeCurrency, normalizeQuickCurrencies } from '@/constants/currencies';
import type { StoreProfile } from '@/types/business';

const PROFILE_KEY = '@retail-business-manager/store-profile';
const AUTH_KEY = '@retail-business-manager/authenticated';
const LEGACY_LANGUAGE_KEY = '@retail-business-manager/language';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  return typeof record[key] === 'string' ? record[key] : fallback;
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
