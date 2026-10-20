import { isCurrencyCode } from '../constants/currencies';
import type { MerchantSettings } from '../types/merchantSettings';

function invalid(): never {
  throw new Error('invalidMerchantSettings');
}
export function merchantOperationDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') invalid();
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid();
  return value;
}
export function localMerchantDate(now = new Date()): string {
  return `${now.getFullYear().toString().padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
/** Bounded per-workspace reference lists, not stock quantities or a financial ledger. */
export function validateMerchantSettings(value: unknown): MerchantSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.revision) ||
    Number(record.revision) < 0 ||
    Number(record.revision) >= Number.MAX_SAFE_INTEGER ||
    !Array.isArray(record.materials) ||
    record.materials.length > 100 ||
    !Array.isArray(record.paymentMethods) ||
    record.paymentMethods.length > 30
  )
    invalid();
  function rows(input: unknown[]) {
    const ids = new Set<string>();
    return input.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) invalid();
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) ||
        ids.has(row.id) ||
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        row.name.trim().length > 200 ||
        typeof row.isActive !== 'boolean'
      )
        invalid();
      ids.add(row.id);
      return { row, base: { id: row.id, name: row.name.trim(), isActive: row.isActive } };
    });
  }
  return {
    revision: Number(record.revision),
    materials: rows(record.materials).map(({ row, base }) => {
      if (!row.prices || typeof row.prices !== 'object' || Array.isArray(row.prices)) invalid();
      const prices: Record<string, string> = {};
      for (const [currency, value] of Object.entries(row.prices)) {
        if (
          !isCurrencyCode(currency) ||
          typeof value !== 'string' ||
          value.length > 40 ||
          !/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(value)
        )
          invalid();
        prices[currency] = value;
      }
      return { ...base, prices };
    }),
    paymentMethods: rows(record.paymentMethods).map(({ base }) => base),
  };
}
