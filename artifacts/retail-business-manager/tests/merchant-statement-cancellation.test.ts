import { describe, expect, it } from "vitest";
import { merchantStatement } from "../data/merchantStatement";
import { hiddenMerchantStatementOperations } from "../data/merchantStatementVisibility";
import { merchantOperationTone } from "../data/merchantOperationPresentation";
import type { MerchantOperation } from "../types/merchant";

function rows(): MerchantOperation[] {
  const base = {
    workspaceId: "s",
    storeId: "store",
    merchantId: "m",
    merchantName: "Supplier",
    currency: "TRY" as const,
    note: "",
    createdByUserId: "u",
  };
  return [
    {
      ...base,
      id: "opening",
      action: "opening",
      amountExact: "100.00",
      balanceBeforeExact: "0.00",
      balanceAfterExact: "100.00",
      cashDeltaExact: "0.00",
      createdAt: "2026-10-01T12:00:00Z",
    },
    {
      ...base,
      id: "payment",
      action: "payment",
      amountExact: "40.00",
      balanceBeforeExact: "100.00",
      balanceAfterExact: "60.00",
      cashDeltaExact: "-40.00",
      createdAt: "2026-10-02T12:00:00Z",
      reversedByOperationId: "cancel",
    },
    {
      ...base,
      id: "cancel",
      action: "reverse",
      amountExact: "40.00",
      balanceBeforeExact: "60.00",
      balanceAfterExact: "100.00",
      cashDeltaExact: "40.00",
      createdAt: "2026-10-04T12:00:00Z",
      reversesOperationId: "payment",
    },
  ];
}
const report = (
  operations = rows(),
  period: { from?: string; to?: string } = {},
) =>
  merchantStatement({
    spaceId: "s",
    storeId: "store",
    merchantId: "m",
    operations,
    proof: [
      { currency: "TRY", revision: operations.length, balanceExact: "100.00" },
    ],
    ...period,
  });

describe("cancelled entries in a regenerated merchant-facing statement", () => {
  it("hides both records only in the public projection, preserving its input and complete proof", () => {
    const operations = rows(),
      before = structuredClone(operations);
    const value = report(operations);
    expect(value.rows.map((row) => row.kind)).toEqual(["opening"]);
    expect(value.totals[0]).toMatchObject({
      payments: "0.00",
      closing: "100.00",
    });
    expect(operations).toEqual(before);
    expect(() =>
      report(operations.filter((row) => row.id !== "cancel")),
    ).toThrow();
  });
  it("restates the opening when cancellation and original fall on opposite sides of period start", () => {
    const value = report(rows(), { from: "2026-10-03", to: "2026-10-04" });
    expect(value.rows).toHaveLength(0);
    expect(value.totals[0]).toMatchObject({
      opening: "100.00",
      payments: "0.00",
      closing: "100.00",
    });
  });
  it("does not backdate a future cancellation into an earlier as-of statement", () => {
    const value = report(rows(), { to: "2026-10-03" });
    expect(value.rows.map((row) => row.kind)).toEqual(["opening", "payment"]);
    expect(value.rows.every((row) => !row.corrected)).toBe(true);
    expect(value.totals[0]).toMatchObject({
      payments: "40.00",
      closing: "60.00",
    });
  });
  it.each([
    ["currency", "USD"],
    ["workspaceId", "another"],
    ["merchantId", "another"],
    ["storeId", "another"],
    ["reversesOperationId", "missing"],
    ["createdAt", "2026-09-01T12:00:00Z"],
    ["cashDeltaExact", "0.00"],
    ["balanceAfterExact", "101.00"],
  ])(
    "rejects a malformed cancellation pair before hiding it: %s",
    (field, value) => {
      const operations = rows();
      Object.assign(operations[2], { [field]: value });
      expect(() => hiddenMerchantStatementOperations(operations)).toThrow(
        "merchantStatementIncomplete",
      );
    },
  );
  it("validates hidden purchase components, not just the net balance proof", () => {
    const operations = rows();
    Object.assign(operations[1], {
      action: "purchase",
      totalExact: "45.00",
      paidExact: "85.00",
      lines: [
        { name: "Goods", quantity: "1", unitPrice: "44", totalExact: "44.00" },
      ],
    });
    expect(() => hiddenMerchantStatementOperations(operations)).toThrow(
      "merchantStatementIncomplete",
    );
  });
  it('supports legacy standalone openings without the optional amount mirror', () => {
    const operations = rows().slice(1);
    Object.assign(operations[0], { action: 'opening', amountExact: undefined,
      balanceBeforeExact: '0.00', balanceAfterExact: '100.00', cashDeltaExact: '0.00' });
    Object.assign(operations[1], { balanceBeforeExact: '100.00', balanceAfterExact: '0.00', cashDeltaExact: '0.00' });
    expect([...hiddenMerchantStatementOperations(operations)]).toEqual(['payment', 'cancel']);
  });
  it("keeps the three user-approved operation tones as secondary cues", () => {
    expect(merchantOperationTone("purchase")).toBe("#60a5fa");
    expect(merchantOperationTone("payment")).toBe("#f87171");
    expect(merchantOperationTone("directPayment")).toBe("#facc15");
    expect(merchantOperationTone("reverse")).toBeUndefined();
  });
});
