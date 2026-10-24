import type { MerchantOperation } from "../types/merchant";

/** Color is a small secondary cue, never a border around the entire financial record. */
export function merchantOperationTone(
  action: MerchantOperation["action"],
): string | undefined {
  return action === "purchase"
    ? "#60a5fa"
    : action === "payment"
      ? "#f87171"
      : action === "directPayment"
        ? "#facc15"
        : undefined;
}
