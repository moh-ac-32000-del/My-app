# Operation edit / cancel — approved scope, staged implementation

Repository: `moh-ac-32000-del/My-app` only. Started from main merge
`2c7127c9a51b22b83a1b820a9365e0b3f4020e41`. This branch is NOT a completed
customer-and-merchant release. Do not deploy, merge, or build another APK yet.

## User-approved interaction

- One small Edit action in operation details; Cancel operation is nested inside
  editing with an explicit confirmation. No standalone reversal action.
- Preserve the original, actor and original posting time internally. No silent
  delete, archive rewrite, false offline success or partial linked-party edit.
- Public merchant PDF omits cancelled originals and internal offsets; corrected
  operations appear in their effective form. No employee/customer names or audit
  reasons are disclosed. Monetary totals must reconcile with visible entries.
- Neutral cards/buttons, only a small blue/red/yellow operation-type cue.
- Diagnose perceived slowness with measurements; Firebase is not assumed to be
  the cause, and security/authoritative acknowledgement must not be bypassed.

## Implemented in this stage

- Merchant edits use the existing trusted command with optional
  `replacesOperationId`; current canonical write permission is rechecked. One
  transaction prepares an offset and replacement before staging any write.
  Original action/currency/account must match. Cross-currency/type changes are
  explicitly blocked, not silently converted. Source principal/quantity/price,
  amount, documentary date, descriptive payment method and note are editable as
  applicable. Cash/external source is preserved by the UI.
- Existing reversal backend remains for old-client compatibility, but new UI
  exposes only editing and nested cancellation. `cancelled: true` marks both the
  source and internal offset; superseded originals link to their replacement.
- A direct customer-to-merchant edit prepares intermediate customer credit/debt
  state before its replacement. Original offset, both parties, cash links,
  merchant revision and idempotency receipt commit together. The same request
  replays; a changed payload or a second edit of the same original is rejected.
- Current-period corrections preserve server posting boundaries and immutable
  historical snapshots. Original and offset remain available internally.
- Merchant account hides internal reverse rows, marks original rows Cancelled
  or Edited, and uses subdued operation dots rather than colored outlines.
- PDF completeness is verified against ALL raw operations first. A matched pair
  is hidden only after validating scope, currency, cash and account cancellation.
  For a dated statement, cancellations after its end date do not change that
  historical as-of view. A cancellation by its end date restates the regenerated
  opening balance without the cancelled pair, so shown lines reconcile. This
  regenerated statement is not a replacement for an immutable archived closing.
- No new Firestore listeners, rules, indexes or queries are introduced by the
  presentation/PDF filter. Editing reads its original and linked states only on
  explicit submission. No local financial persistence.

## Required before this overall request is complete

1. Implement standalone customer debt/payment editing and cancellation with
   reliable provenance: a generic Payment document is not proof that it reduced
   debt. `createPayment` and `settleCustomerDebt` have different accounting effects.
   Do not infer allocation or reverse one side of a merchant settlement.
2. Add status annotations when viewing already-closed archive snapshots without
   rewriting those snapshots. A current merchant-account Cancelled badge alone
   does not satisfy the requested historical archive status.
3. Profile actual page-open/save latency and distinguish cold callable starts,
   server reads and UI rendering before proposing a narrowly scoped optimization.
4. Complete emulator/CI checks and authenticated review of all operation types,
   uncertain retry, role revocation and race conditions; inspect native/web layout
   and an actual generated PDF. Unit tests/HTML assertions are not device/PDF QA.
5. Ask for deployment only after these remaining items and review; no main-site
   publish, Firebase login, paid backup activation or additional APK in this stage.
