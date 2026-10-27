/** Bounded caches of formatting machinery only: never business values or records. */
const dates = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();
function remember<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing) return existing;
  const value = create();
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}
export function dateTimeFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  options = { ...options, numberingSystem: 'latn' };
  // An implicit device zone can change while the app is running. Do not cache it.
  if (!options.timeZone) return new Intl.DateTimeFormat(locale, options);
  return remember(dates, JSON.stringify([locale, options]), () => new Intl.DateTimeFormat(locale, options));
}
export function numberFormatter(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  options = { ...options, numberingSystem: 'latn' };
  return remember(numbers, JSON.stringify([locale, options]), () => new Intl.NumberFormat(locale, options));
}
