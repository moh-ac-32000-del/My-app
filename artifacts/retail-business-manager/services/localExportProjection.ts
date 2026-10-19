import {
  EXPORT_VERSION,
  type ExportTables,
  type SpreadsheetExportSnapshot,
} from "@/types/spreadsheetExport";
import type {
  LocalExportCollection,
  LocalExportScope,
  StoredExportDocument,
} from "./localExportCache";
type RecordData = Record<string, unknown>;
import { LOCAL_EXPORT_COLLECTIONS } from './localExportCache';
import { projectExportAccounts } from './exportAccountProjection';

/** Project previously received data only. No Firebase SDK, callable, listener or network access. */
export function projectLocalExportSnapshot(
  input: LocalExportScope,
  storeName: string,
  records: Record<LocalExportCollection, StoredExportDocument[]>,
  capturedAt: Record<LocalExportCollection, string>,
  exportedAt: string,
): SpreadsheetExportSnapshot {
  if (![input.uid, input.spaceId, input.storeId].every(validId))
    throw new Error("exportScopeInvalid");
  if (LOCAL_EXPORT_COLLECTIONS.some((name) => !Array.isArray(records[name]) || !capturedAt[name])) throw new Error('exportLocalIncomplete');
  if (LOCAL_EXPORT_COLLECTIONS.some((name) => records[name].length > 1000)) throw new Error('exportTooLarge');
  const collections = [
    "customers",
    "debts",
    "payments",
    "transactions",
    "dailyArchives",
  ] as const;
  if (collections.some((name) => records[name].length > 1000))
    throw new Error("exportTooLarge");
  const tables: ExportTables = {
    customers: [],
    debts: [],
    payments: [],
    transactions: [],
    dailyArchives: [],
    archiveEvents: [],
    closingBalances: [],
  };
  let expanded = 0;
  for (let index = 0; index < collections.length; index += 1) {
    const name = collections[index];
    for (const doc of records[collections[index]]) {
      const data = doc.data;
      if (
        (data.id !== undefined && data.id !== doc.id) ||
        data.storeId !== input.storeId ||
        (data.workspaceId !== undefined && data.workspaceId !== input.spaceId)
      )
        throw invalidData();
      const id = text(doc.id);
      if (name === "customers") {
        if (typeof data.isActive !== "boolean") throw invalidData();
        tables.customers.push([
          id,
          text(data.name),
          optionalText(data.phone),
          optionalText(data.address),
          optionalText(data.notes),
          data.isActive,
          date(data.createdAt),
          date(data.updatedAt),
        ]);
      } else if (name === "debts") {
        tables.debts.push([
          id,
          text(data.customerId),
          currency(data.currency),
          optionalAmount(data.originalAmount),
          amount(data.amount),
          optionalDate(data.dueDate),
          optionalDate(data.settledAt),
          date(data.createdAt),
          date(data.updatedAt),
        ]);
      } else if (name === "payments") {
        const money = object(data.amount);
        tables.payments.push([
          id,
          optionalText(data.customerId),
          optionalText(data.transactionId),
          currency(money.currency),
          amount(money.amount),
          oneOf(data.direction, ["in", "out"]),
          oneOf(data.method, ["cash", "card", "bank-transfer", "other"]),
          date(data.paidAt),
          optionalText(data.note),
          date(data.createdAt),
          date(data.updatedAt),
        ]);
      } else if (name === "transactions") {
        tables.transactions.push([
          id,
          oneOf(data.type, ["cash_in", "cash_out"]),
          currency(data.currency),
          amount(data.amount),
          optionalText(data.note),
          date(data.createdAt),
          date(data.updatedAt),
        ]);
      } else {
        if (
          !Array.isArray(data.snapshot) ||
          !Number.isSafeInteger(data.closingNumber) ||
          Number(data.closingNumber) < 1 ||
          (data.closingCashBalances !== undefined &&
            !Array.isArray(data.closingCashBalances))
        )
          throw invalidData();
        expanded +=
          data.snapshot.length +
          (Array.isArray(data.closingCashBalances)
            ? data.closingCashBalances.length
            : 0);
        if (expanded > 10_000) throw new Error("exportTooLarge");
        tables.dailyArchives.push([
          id,
          date(data.date),
          date(data.closedAt),
          Number(data.closingNumber),
          data.closingCashBalances !== undefined,
          data.snapshot.length,
        ]);
        for (const raw of data.snapshot) {
          const event = object(raw);
          if (event.storeId !== input.storeId) throw invalidData();
          tables.archiveEvents.push([
            id,
            text(event.id),
            text(event.sourceId),
            oneOf(event.type, ["cash_in", "cash_out", "debt", "settlement", "merchant"]),
            optionalText(event.customerId),
            optionalText(event.customerName),
            currency(event.currency),
            event.type === 'merchant' ? text(event.amountExact) : amount(event.amount),
            date(event.occurredAt),
            optionalText(event.note),
          ]);
        }
        for (const raw of (data.closingCashBalances ?? []) as unknown[]) {
          const balance = object(raw);
          tables.closingBalances.push([
            id,
            currency(balance.currency),
            amount(balance.amount, true),
          ]);
        }
      }
    }
  }
  // Include deactivated customers and settled debts. Never filter away financial history.
  for (const rows of Object.values(tables))
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const snapshot: SpreadsheetExportSnapshot = {
    version: EXPORT_VERSION,
    spaceId: input.spaceId,
    storeId: input.storeId,
    storeName: text(storeName),
    exportedAt: date(exportedAt),
    capturedAt,
    tables,
    accountData: projectExportAccounts(input, records),
  };
  if (JSON.stringify(snapshot).length > 1_000_000) {
    throw new Error("exportTooLarge");
  }
  return snapshot;
}

function validId(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !value.includes("/")
  );
}
function invalidData() {
  return new Error("exportInvalidData");
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 32767) throw invalidData();
  return value;
}
function optionalText(value: unknown): string | null {
  return value === undefined || value === null ? null : text(value);
}
function amount(value: unknown, signed = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER ||
    (!signed && value < 0)
  )
    throw invalidData();
  return value;
}
function optionalAmount(value: unknown): number | null {
  return value === undefined || value === null ? null : amount(value);
}
function currency(value: unknown): string {
  return oneOf(value, ["TRY", "USD", "EUR", "GBP", "SAR", "AED", "SYP"]);
}
function oneOf(value: unknown, choices: string[]): string {
  if (typeof value !== "string" || !choices.includes(value))
    throw invalidData();
  return value;
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    value.slice(0, 4) < "1900" ||
    value.slice(0, 4) > "9999"
  )
    throw invalidData();
  if (
    value.length === 10 &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw invalidData();
  return value;
}
function optionalDate(value: unknown): string | null {
  return value === undefined || value === null ? null : date(value);
}
function object(value: unknown): RecordData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidData();
  return value as RecordData;
}
