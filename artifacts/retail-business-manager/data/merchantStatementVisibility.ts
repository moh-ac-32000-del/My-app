import {
  addCustomerExact,
  subtractCustomerExact,
} from "./customerCreditAccounting";
import { localMerchantDate } from "./merchantSettings";
import type { MerchantOperation } from "../types/merchant";

function incomplete(): never {
  throw new Error("merchantStatementIncomplete");
}
const delta = (row: MerchantOperation) =>
  subtractCustomerExact(row.balanceAfterExact, row.balanceBeforeExact);

/** Presentation only: retain every record for completeness verification, omit a fully
 * verified cancellation pair from the regenerated public statement. An end date is
 * an as-of boundary: a later cancellation must not alter an earlier dated statement.
 * Never delete records or modify an archived closing to implement this view.
 */
export function hiddenMerchantStatementOperations(
  operations: MerchantOperation[],
  to?: string,
): Set<string> {
  const ids = new Map(operations.map((row) => [row.id, row]));
  const hidden = new Set<string>();
  if (ids.size !== operations.length) incomplete();
  for (const reversal of operations) {
    if (reversal.action !== "reverse") continue;
    const original = ids.get(reversal.reversesOperationId ?? "");
    if (
      !original ||
      original.action === "reverse" ||
      original.reversedByOperationId !== reversal.id ||
      original.currency !== reversal.currency ||
      original.workspaceId !== reversal.workspaceId ||
      original.storeId !== reversal.storeId ||
      original.merchantId !== reversal.merchantId ||
      Date.parse(reversal.createdAt) < Date.parse(original.createdAt) ||
      addCustomerExact(delta(original), delta(reversal)) !== "0.00" ||
      addCustomerExact(original.cashDeltaExact, reversal.cashDeltaExact) !==
        "0.00"
    )
      incomplete();
    // Check original financial components even when this pair will not be rendered.
    if (original.action === "purchase") {
      if (
        !original.totalExact ||
        original.paidExact === undefined ||
        !original.lines?.length ||
        original.lines.reduce(
          (total, line) => addCustomerExact(total, line.totalExact),
          "0.00",
        ) !== original.totalExact ||
        subtractCustomerExact(original.totalExact, original.paidExact) !==
          delta(original)
      )
        incomplete();
    } else if (original.action === "opening") {
      if (
        original.amountExact !== undefined &&
        original.amountExact !== delta(original)
      )
        incomplete();
    } else if (
      !original.amountExact ||
      subtractCustomerExact("0.00", original.amountExact) !== delta(original)
    )
      incomplete();
    if (!to || localMerchantDate(new Date(reversal.createdAt)) <= to) {
      hidden.add(original.id);
      hidden.add(reversal.id);
    }
  }
  return hidden;
}
