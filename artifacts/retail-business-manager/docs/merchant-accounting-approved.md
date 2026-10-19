# Approved merchant accounting — My-app

User specification received and confirmed 2026-10-19. This document records requirements; it does not assert they are already implemented. Reuse canonical workspaces, Owner/Editor/Viewer and Firebase Auth/Firestore. No parallel business/auth system. Arabic, Turkish and English use the existing dictionaries and direction policy.

## Signed balances, independently for every party and currency

- Merchant: credit purchases plus explicit opening/adjustment entries, minus payments and direct customer-to-merchant settlements. Positive = store owes merchant; negative = merchant owes value/credit to store; zero = balanced.
- Customer: debt charges plus explicit opening/adjustment entries, minus payments and direct settlements. Positive = customer owes store; negative = store owes value/credit to customer; zero = balanced.
- A new charge consumes an existing credit through signed addition; that consumption never creates a fresh cash movement.
- No automatic netting between different merchants, currencies or workspaces.
- The currently deployed customer settlement endpoint rejects overpayment and mutates remaining debt amounts. The draft implementation below adds an exact credit adapter without subtracting historical payments again. It is not yet deployed. Preserve audit history and obtain appropriate approval before changing existing records.

## Purchases and payments

- Item total = quantity × unit price; purchase total = sum of item totals. Preserve item descriptions/notes without inventing inventory management.
- Credit purchase increases merchant balance; cash unchanged.
- Cash payment from the managed drawer reduces merchant balance and reduces cash by the actual paid amount, even when it exceeds the debt.
- Full cash purchase links the purchase and payment once: merchant net effect zero; cash decreases by the full price.
- Partial payment links the purchase and payment atomically without double counting.
- Bank transfer/external-account payment is separately classified and must not reduce managed drawer cash. Do not infer a cash source from a payment label.
- Opening balances/adjustments must be explicit audited operations, not unaudited edits.

## Direct payment: customer → merchant

Only a new amount actually paid by that customer directly to that merchant:

`new customer balance = old customer balance - amount`

`new merchant balance = old merchant balance - amount`

`drawer cash delta = 0`

Record the operation once with a unique operation ID and immutable matching payload, then project it into both statements and the daily journal; never create `cash_in`/`cash_out` for it. Commit both party effects together or neither. Validate same currency/workspace and fresh write permission on the trusted server. Existing customer credit is retained, not consumed by this new third-party payment. Using old customer credit for a different transfer is not this operation and must not be silently added.

## Numerical acceptance examples

| Case | Expected signed result | Managed cash delta |
| --- | --- | --- |
| Merchant purchase 1,000; payment 1,300 from drawer | Merchant −300 | −1,300 |
| 5 × 400 + 10 × 150 + 20 × 50 purchase; pay 1,000 from drawer | Purchase 4,500; merchant +3,500 | −1,000 |
| Merchant +500; pay 800 from drawer | Merchant −300 | −800 |
| Merchant −300; new credit purchase 200 | Merchant −100 | 0 |
| Merchant −300; new credit purchase 450 | Merchant +150 | 0 |
| Customer −200; new actual direct payment 300 to merchant | Customer −500; merchant decreases 300 | 0 |
| Merchants +1,000, −300, +500 in TRY | Payables 1,500; store credit 300; net 1,200 | No movement from aggregation |

## Financial safeguards and totals

- The user subsequently approved this precision for new merchant invoices: quantity up to three fractional digits, unit price up to four, each positive line total rounded half-up to two fractional digits (0.005 → 0.01), then sum the rounded lines. Account/payment amounts use two fractional digits. Use exact monetary arithmetic, not uncontrolled binary floating-point multiplication. Do not silently round or rewrite legacy records; their compatibility is a separate integration gate.
- Aggregate positive merchant balances as payables; absolute negative balances as store credit; net = payables − credit, per currency. Present separately, not as permission to settle unrelated merchants.
- Every purchase/payment/settlement has an idempotent operation identifier; same identifier with a different payload must fail, not replay success.
- Record actor identity and linked record IDs. Approved operations are corrected by documented reversals or a reviewed archive-compatible procedure, not silent deletion.
- Archiving/closing preserves the correct financial day and does not reapply party balance effects. Integrate cash/noncash journal and archive projections without duplicate counting.
- Firebase is the business source of truth. No offline financial truth, silent queued success, production migration, broad rules deployment or automatic data rewrite from this document alone.

## Verification gates

Pure numerical cases first, then trusted command tests (including retries, races, overpayments, signed credits, wrong currency/space/role, linked purchase/payment atomicity and direct settlement atomicity), direct-SDK security tests, historical-data compatibility checks and finally isolated end-to-end/device acceptance. No claim of complete merchant functionality until all required layers pass.

## Foundation stage

`data/merchantAccounting.ts` provides pure exact-decimal projections and `tests/merchant-accounting.test.ts` exercises the supplied examples, approved line rounding, overpayments, previous credits, currency/workspace isolation and separate merchant totals. Inputs and outputs are canonical decimal strings; internal BigInt arithmetic is not serialized. Inputs/results are bounded to 80 characters to prevent unbounded parsing, not silently rounded or converted to binary floating-point amounts.

These helpers are **not** a canonical stored balance, trusted command, receipt/idempotency mechanism, authorization check, migration or completed merchant feature. Server transaction integration must independently revalidate canonical parties/roles and atomically persist all linked effects. The 80-character exact format is for new validated inputs only; legacy precision requires its own compatibility handling rather than automatic rounding. Actual Android execution remains a combined-APK acceptance gate; successful Node/browser-compatible builds are not a device test.

## Draft backend integration — not deployed or release-ready

- `customerCreditAccounting.ts` preserves the stored decimal representation of legacy remaining debts, including fractions finer than cents. `amountExact` is authoritative for new changes and must agree with the numeric compatibility mirror. Existing debt documents are not scanned or rewritten by a migration.
- Cash settlement permits excess actual money to become `customerCredits` in the same transaction as debt reductions, cash, payment and receipt. New charges consume credit without creating cash. Existing credit is retained when a new direct payment is made. Per-customer/currency revisions serialize settlement, charge and direct-payment transactions, including initially absent credit documents.
- `merchantCommand.ts` implements trusted metadata save, one initial signed opening per currency, itemized purchase with linked payment, cash/external payment, and direct customer-to-merchant payment. It is deliberately **not exported from Functions index.ts** yet. No new network endpoint is published by this draft.
- New server-owned collections under the canonical workspace are `merchants`, `merchantBalances`, `merchantOperations` and `customerCredits`. All role/store/party checks are server-side; no local financial source or alternate space system is added. No security rules were changed at this checkpoint.
- Merchant operations retain before/after balance, item descriptions, notes, actor, server time and linked identifiers. Receipts bind the full normalized payload and actor; changed payload reuse is rejected, and role checks precede replay. Cash and payment numeric mirrors reject lossy new cent amounts rather than silently rounding them.
- Actual cash changes only for a cash-funded payment. A direct payment creates a linked customer payment and merchant operation but no cash transaction. Historical customer payment records are not subtracted again.
- Unit/in-memory transaction tests cover the approved examples, scope, authorization, corruption, replay and simulated retry. The demo-only emulator suite additionally covers real Firestore transaction contention, concurrent identical purchases and cross-space rejection. Passing fixture tests alone is not evidence of real Firestore contention or device acceptance.

Required before readiness/merge/deployment: audited correction/reversal flows; scoped client subscriptions and signed customer-credit display; merchant list/detail/input screens in all three languages; consistent daily-journal, immutable archive and local-export projections without duplicate cash; reviewed member read rules and direct-SDK security tests; isolated end-to-end acceptance; combined Android APK validation later. Existing deployed web/APK and financial data remain unchanged. Do not merge this draft merely because backend tests pass.
