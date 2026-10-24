import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { merchantCommandHandler } from "../functions/src/merchantCommand";
import { merchantStatement } from "../data/merchantStatement";
import { merchantOperationFromDocument } from "../data/merchantDocuments";
import { workspaceBackend } from "./fixtures/workspaceBackend";
import { merchantJournalEvent } from "../data/merchantJournal";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const balancePath = `spaces/s/merchantBalances/${hash(["m", "TRY"])}`;
const creditPath = `spaces/s/customerCredits/${hash(["c", "TRY"])}`;
function setup(role = "owner") {
  const backend = workspaceBackend(role);
  backend.docs["spaces/s/merchants/m"] = {
    id: "m",
    workspaceId: "s",
    storeId: "store",
    name: "Supplier",
    isActive: true,
  };
  const command = (
    action: string,
    operationId: string,
    fields: Record<string, unknown>,
  ) =>
    merchantCommandHandler(
      {
        auth: { uid: "u" },
        data: {
          action,
          operationId,
          spaceId: "s",
          storeId: "store",
          merchantId: "m",
          ...fields,
        },
      } as never,
      backend.runtime,
    );
  return { ...backend, command };
}
const payment = { currency: "TRY", amountExact: "80.00", source: "cash" };
const purchase = {
  currency: "TRY",
  lines: [{ name: "Item", quantity: "1", unitPrice: "100" }],
  paidExact: "0.00",
  source: "cash",
};

describe("atomic merchant edit/cancel preparations (not live Firebase)", () => {
  it("replaces a payment once, preserving the original, cash links and immutable archive fixture", async () => {
    const b = setup();
    await b.command("purchase", "purchase", purchase);
    await b.command("payment", "old", payment);
    b.docs["spaces/s/dailyArchives/fixed"] = {
      snapshot: [{ id: "old", amount: 80 }],
      marker: "untouched",
    };
    const archive = structuredClone(b.docs["spaces/s/dailyArchives/fixed"]);
    const input = {
      ...payment,
      amountExact: "50.00",
      replacesOperationId: "old",
      operationDate: "2026-09-01",
    };
    await b.command("payment", "new", input);
    expect(b.docs[balancePath]).toMatchObject({
      balanceExact: "50.00",
      revision: 4,
    });
    expect(b.docs["spaces/s/merchantOperations/old"]).toMatchObject({
      amountExact: "80.00",
      replacementOperationId: "new",
    });
    expect(b.docs["spaces/s/merchantOperations/new"]).toMatchObject({
      amountExact: "50.00",
      replacesOperationId: "old",
      operationDate: "2026-09-01",
      createdByUserId: "u",
    });
    const cash = Object.entries(b.docs)
      .filter(([path]) => path.startsWith("spaces/s/transactions/"))
      .map(([, row]) => row);
    expect(
      cash.reduce(
        (sum, row) => sum + (row.type === "cash_in" ? row.amount : -row.amount),
        0,
      ),
    ).toBe(-50);
    expect(b.docs["spaces/s/dailyArchives/fixed"]).toEqual(archive);
    const writes = b.writes.length;
    await expect(b.command("payment", "new", input)).resolves.toMatchObject({
      outcome: "replayed",
    });
    expect(b.writes).toHaveLength(writes);
    await expect(
      b.command("payment", "new", { ...input, amountExact: "51.00" }),
    ).rejects.toMatchObject({ code: "already-exists" });
    await expect(b.command("payment", "another", input)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(b.writes).toHaveLength(writes);
  });
  it("replaces purchase lines and payment together; the public statement contains only the replacement", async () => {
    const b = setup();
    await b.command("purchase", "old", purchase);
    await b.command("purchase", "new", {
      ...purchase,
      replacesOperationId: "old",
      lines: [{ name: "Correct item", quantity: "2.5", unitPrice: "20.12" }],
      paidExact: "10.00",
    });
    expect(b.docs[balancePath]).toMatchObject({
      balanceExact: "40.30",
      revision: 3,
    });
    const operations = Object.entries(b.docs)
      .filter(([path]) => path.startsWith("spaces/s/merchantOperations/"))
      .map(([, value]) =>
        merchantOperationFromDocument(value.id, value, "s", "store"),
      );
    const statement = merchantStatement({
      spaceId: "s",
      storeId: "store",
      merchantId: "m",
      operations,
      proof: [{ currency: "TRY", revision: 3, balanceExact: "40.30" }],
    });
    expect(statement.rows.map((row) => row.kind)).toEqual([
      "purchase",
      "payment",
    ]);
    expect(statement.rows[0]).toMatchObject({
      description: "Correct item",
      amount: "50.30",
    });
    expect(statement.totals[0].closing).toBe("40.30");
  });
  it("prepares both sides of a direct payment using the intermediate customer credit/debt state", async () => {
    const b = setup();
    delete b.docs["spaces/s/debts/d"];
    await b.command("opening", "opening", {
      currency: "TRY",
      amountExact: "500.00",
    });
    await b.command("directPayment", "old", {
      currency: "TRY",
      customerId: "c",
      amountExact: "300.00",
    });
    expect(b.docs[creditPath].creditExact).toBe("300.00");
    await b.command("directPayment", "new", {
      currency: "TRY",
      customerId: "c",
      amountExact: "100.00",
      replacesOperationId: "old",
    });
    expect(b.docs[creditPath]).toMatchObject({
      creditExact: "100.00",
      revision: 3,
    });
    expect(b.docs[balancePath]).toMatchObject({
      balanceExact: "400.00",
      revision: 4,
    });
    expect(
      Object.keys(b.docs).filter((path) =>
        path.startsWith("spaces/s/transactions/"),
      ),
    ).toHaveLength(0);
  });
  it("rolls back the entire edit if its new linked customer is invalid", async () => {
    const b = setup();
    await b.command("directPayment", "old", {
      currency: "TRY",
      customerId: "c",
      amountExact: "300.00",
    });
    const before = structuredClone(b.docs),
      writes = b.writes.length;
    await expect(
      b.command("directPayment", "new", {
        currency: "TRY",
        customerId: "missing",
        amountExact: "100.00",
        replacesOperationId: "old",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
    expect(b.docs).toEqual(before);
    expect(b.writes).toHaveLength(writes);
  });
  it("marks a cancellation without deleting records and prevents another edit or cancellation", async () => {
    const b = setup();
    await b.command("purchase", "old", purchase);
    await b.command("reverse", "cancel", {
      currency: "TRY",
      targetOperationId: "old",
      reason: "Operation cancelled",
      cancelled: true,
    });
    expect(b.docs["spaces/s/merchantOperations/old"]).toMatchObject({
      cancelled: true,
      totalExact: "100.00",
    });
    expect(b.docs[balancePath].balanceExact).toBe("0.00");
    const writes = b.writes.length;
    await expect(
      b.command("purchase", "new", { ...purchase, replacesOperationId: "old" }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(b.writes).toHaveLength(writes);
  });
  it("corrects an opening by its delta, not by overwriting later purchases", async () => {
    const b = setup();
    await b.command("opening", "old", {
      currency: "TRY",
      amountExact: "500.00",
    });
    await b.command("purchase", "later", purchase);
    await b.command("opening", "new", {
      currency: "TRY",
      amountExact: "400.00",
      replacesOperationId: "old",
    });
    expect(b.docs[balancePath].balanceExact).toBe("500.00");
    expect(
      merchantJournalEvent(
        merchantOperationFromDocument(
          "new",
          b.docs["spaces/s/merchantOperations/new"],
          "s",
          "store",
        ),
      ).amountExact,
    ).toBe("400.00");
  });
  it("rejects viewer edits, cross-account targets, currency changes and type changes without writes", async () => {
    const b = setup();
    await b.command("purchase", "old", purchase);
    for (const fields of [
      { currency: "USD" },
      { replacesOperationId: "missing" },
    ]) {
      const before = b.writes.length;
      await expect(
        b.command("purchase", "new", {
          ...purchase,
          replacesOperationId: "old",
          ...fields,
        }),
      ).rejects.toMatchObject({ code: "failed-precondition" });
      expect(b.writes).toHaveLength(before);
    }
    await expect(
      b.command("payment", "wrong-type", {
        ...payment,
        replacesOperationId: "old",
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    b.docs["spaces/s/merchantOperations/old"].merchantId = "another";
    await expect(
      b.command("purchase", "wrong-scope", {
        ...purchase,
        replacesOperationId: "old",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
    b.docs["spaces/s/members/u"].role = "viewer";
    await expect(
      b.command("purchase", "viewer", {
        ...purchase,
        replacesOperationId: "old",
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
