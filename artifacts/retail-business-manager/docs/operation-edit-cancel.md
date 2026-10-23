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

## Customer and archive stage (source only, not deployed)

- A new trusted customer command edits/cancels original debt principal or payment
  details, with expected revision/time, sealed idempotency and current role checks.
  It reuses exact credit/debt arithmetic. Payment accounting is determined from
  its trusted creation receipt; a payment document alone never proves settlement.
  Cash changes use validated unique original links, not descriptive payment methods.
  Linked merchant operations must be edited together at their merchant source.
  Journal/archive projections retain the original drawer posting amount alongside
  explicit current-period cash differences, so an edit cannot count twice.
- Existing source posting timestamps and historical archives are preserved.
  Account/cash differences are applied atomically in the current period; receipts
  preserve prior values and actors. Restored debt is linked to its source payment.
  Old-client debt updates cannot bypass the new correction/revision workflow.
- Customer rows offer small Edit actions with nested cancellation. Viewer has no
  edit controls. Uncertain requests retain the same ID/payload for retry; scope
  changes and late replies cannot show success in another workspace.
- Selected-day archive reads can annotate current Cancelled/Edited status without
  changing saved event amounts. Sources are deduplicated and bounded to 500; larger
  days retain archive access with an explicit status-unavailable notice. These are
  additional reads on explicit day selection only, not startup or local export.
  Rollout must deploy the day-read backend before this client (acknowledgement gate).
- Confirmed customer navigation gate: reminder fetching blocked the whole account
  and refetched on any debt/payment array update. Financial data now renders once
  its existing authoritative contexts are ready; reminders load separately, with
  scoped results and explicit loading/error/retry. No local financial fallback.
  This removes an unnecessary wait, not a measured device speedup. Merchant pages
  use separate scoped live subscriptions; their latency is not yet measured.

## Required before this overall request is complete

1. Profile actual merchant/page-open latency and distinguish server reads from UI
   rendering before proposing another narrowly scoped optimization.
2. Complete current-source emulator/CI checks and authenticated review of all operation types,
   uncertain retry, role revocation and race conditions; inspect native/web layout
   and an actual generated PDF. Unit tests/HTML assertions are not device/PDF QA.
3. Ask for deployment only after these remaining items and review; no main-site
   publish, Firebase login, paid backup activation or additional APK in this stage.
