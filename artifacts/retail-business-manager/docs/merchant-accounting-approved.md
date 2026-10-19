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
- New server-owned collections under the canonical workspace are `merchants`, `merchantBalances`, `merchantOperations` and `customerCredits`. All role/store/party checks are server-side; no local financial source or alternate space system is added. The backend checkpoint did not change rules; the unpublished frontend read-rules draft is described below.
- Merchant operations retain before/after balance, item descriptions, notes, actor, server time and linked identifiers. Receipts bind the full normalized payload and actor; changed payload reuse is rejected, and role checks precede replay. Cash and payment numeric mirrors reject lossy new cent amounts rather than silently rounding them.
- Draft audited reversal requires a reason and a new operation ID. It offsets original party/cash effects in the current period, retains the original values with a reversal link and permits only one reversal. Reversing a direct payment creates an explicit customer correction charge, consumes currently available credit first and never rewrites historical debts or archive snapshots. This corrects an erroneous record; it is not a goods-return/refund workflow or a claim that cash physically moved.
- Actual cash changes only for a cash-funded payment. A direct payment creates a linked customer payment and merchant operation but no cash transaction. Historical customer payment records are not subtracted again.
- Unit/in-memory transaction tests cover the approved examples, scope, authorization, corruption, replay and simulated retry. The demo-only emulator suite additionally covers real Firestore transaction contention, concurrent identical purchases and cross-space rejection. Passing fixture tests alone is not evidence of real Firestore contention or device acceptance.

Required before readiness/merge/deployment: practical review of the draft merchant/customer-credit screens, history paging and correction flows; consistent daily-journal, immutable archive and local-export projections without duplicate cash; reviewed read-rules/security-test results; isolated end-to-end acceptance; combined Android APK validation later. Existing deployed web/APK and financial data remain unchanged. Do not merge this draft merely because backend tests pass.

App typechecking excludes server-only backend tests consistently with the existing settlement/workspace test split. Vitest still runs them all after Functions dependencies are installed in CI; Functions sources are independently typechecked and compiled. The two scopes must not accidentally rely on a preinstalled local Functions node_modules when app typecheck runs before its CI installation.

## Draft merchant screens and scoped read integration

- `/merchants` shows all accounts, including inactive accounts with retained balances, separate payables/store credit/net per currency, and metadata creation. `/merchant/[id]` shows scoped balances and an initial 100 statement operations with notes, item descriptions, customer names and explicit cash/noncash effects. Older operations load in explicit user-requested pages, with a stable createdAt/document-ID cursor rather than an all-history query.
- Reuse the existing app shell/theme and canonical workspace session. The new tab does not remove another feature. UI labels and forms use the existing Arabic/Turkish/English dictionaries; locale decimal input and display use exact strings rather than converting balances to floating point.
- Purchase, cash/external payment, direct payment, initial signed opening and reversal forms call the trusted command only. Viewer screens hide creation/financial/correction actions. Existing Firebase Auth and Owner/Editor/Viewer are reused; no separate merchant login or workspace is introduced.
- Account listeners are scoped to the active workspace/store. The list does not load historical operations. Detail history is filtered by merchant and date with a bounded query and a draft composite index. Per-collection snapshots are staged until the SDK snapshots-in-sync barrier and initial server confirmation; pending local writes are not published as financial values. Scope/revision/format/duplicate/orphan inconsistencies fail closed. Errors unsubscribe listeners; session/account/space/role changes clear visible data before new results are accepted.
- Unknown submission outcomes retain the same request payload/operation ID for retry and lock fields rather than silently generating another payment. Only a correlated server response is accepted as success. This is not offline financial queueing; an app restart/exit still requires statement review before a user creates a new operation.
- Detail route subtrees are keyed by merchant ID so drafts cannot survive navigation to another account. The command hook separately rejects a mismatched merchant ID before any network call and rechecks canonical session access after acknowledgement.
- Draft Firestore rules allow canonical active Owner/Editor/Viewer reads of the four merchant/credit collections. All direct creates, updates and deletes stay denied, including owner/editor direct SDK writes. Tests cover roles, lists, nonmembers, anonymous access and removal. No rules or indexes have been deployed. The trusted merchant callable remains unexported until the remaining integration gates are complete.
- Client document/locale/barrier/service tests and server-rendered screen tests are automated evidence, not real Android or browser interaction acceptance. Practical visual/input verification and the later combined APK remain required.

## Draft customer credit integration

- The existing DebtProvider now observes debts and customerCredits in one scoped snapshots-in-sync view. Initial cache-only/pending values and malformed/cross-scope/duplicate records cannot become a successful zero balance. Existing debt export observations are reused; credit/merchant export integration is still a gate, not claimed complete.
- Customer detail reads current provider debts/payments directly instead of delaying their replacement until an unrelated reminder request completes. Signed balances and exact legacy fractions are shown, including customer credits with no outstanding debt. The customer list shows positive receivables separately from credits owed to other customers, independently for each currency.
- Normalizers preserve trusted exact debt/payment amounts, applied-credit metadata, correction reasons and readable merchant links on direct payments. These are read projections of Firebase, not a second local ledger. Sharing uses the signed account projection so a credit is not mislabeled as customer debt.
- Cash settlement permits overpayments/advances in supported currencies and explicitly says actual money enters the drawer. Optional stable intent IDs preserve compatibility for older service callers; the updated form reuses all linked IDs after an unknown outcome, locks edits and shows an inline error/retry action on web as well as native. Customer detail drafts remount by customer ID, and session authorization is checked again after a settlement response.
- A date-only debt edit from a numeric-mirror client preserves the existing authoritative amountExact when amount/currency are unchanged. It never silently truncates a fine legacy fraction. The update receipt retains the prior document. No migration, bulk rounding, old-payment subtraction or existing archive rewrite is performed.
- Direct customer-to-merchant payment records carry the canonical merchant name for the customer history; they are labeled noncash rather than being shown as drawer receipts. The linked merchant event and customer payment still require unified journal/archive/export projections before release.

## Draft full merchant statement paging

- Initial live history and subsequent server-only queries are bounded to 101 documents (100 visible plus one lookahead). Only the user-requested next page is fetched. No automatic polling, expanding full-history listener or background archive scan is added.
- Ordering is createdAt descending then document ID descending, with the exact pair used as the next cursor. Merge order follows Firestore Unicode code-point order rather than a localized name comparison. IDs are deduplicated without recalculating any balance.
- After expansion, previously observed head rows are retained so new arrivals do not create gaps at page boundaries. A new canonical reversal also marks an already loaded older original row, without rewriting its monetary fields. Scope or immutable payload inconsistencies fail closed.
- Concurrent page requests are suppressed. Leaving the account/space or losing authorization stops/discards late pages; a page failure clears the financial view and requires retry rather than showing a successful partial/zero account.
- Pure merge/session tests cover head movement, cursor ties, duplicate boundaries, fresh reversal links, scope, stale responses and immutable values. A demo-only authenticated client-SDK emulator case exercises 205 same-time records across three pages with a new head arriving between pages; another denies historical reads outside membership. These are not live-Firebase/device acceptance claims.
