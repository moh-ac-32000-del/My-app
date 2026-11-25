# Destructive lifecycle — Firestore schema inventory

Repository: `moh-ac-32000-del/My-app`  
Branch: `feature/destructive-data-lifecycle`  
Status: source audit, not a complete production export.

This inventory records paths and dependencies verified in the current source. It is deliberately conservative: a collection is not safe to delete merely because it is absent from this list. Before implementing a cascade, complete the repository-wide writer/query audit and emulator fixtures described below.

## 1. Canonical ownership and scope

- Workspace root: `spaces/{spaceId}`.
- Canonical membership: `spaces/{spaceId}/members/{uid}`. Workspace commands authorize against this record and the workspace status.
- User discovery mirror: `users/{uid}/memberships/{spaceId}`. It is not authoritative for access.
- Workspace store scope: `spaces/{spaceId}/storeProfile/profile` containing `storeId`.
- Invitations: root collection `spaceInvitations/{invitationId}`, with `spaceId`, inviter, role, status and expiry.
- User account metadata: root `users/{uid}`; nested membership discovery records as above.
- Global push-device registry: root `pushDevices/{deviceId}`, with user/workspace scope and notification preferences. Account deletion must inventory and revoke only records owned by that UID.

A lifecycle worker must re-read canonical workspace status, membership/owner role and store profile before each state-changing phase. User membership mirrors must never grant authority.

## 2. Verified workspace collections and dependencies

| Collection path | Verified use | Lifecycle implication |
|---|---|---|
| `customers` | Customer master; current client delete only sets `isActive=false`. | Customer cascade target. |
| `debts` | Customer debts, correction debts and merchant-reversal correction debts. | Query by customer and verify workspace/store/customer on every page. |
| `payments` | Customer payment/settlement records; some are linked to merchant operations. | Preserve provenance; linked merchant-originated rows block ordinary customer cleanup until reconciled. |
| `customerCredits` | Deterministic document ID from SHA-256 of `[customerId,currency]`; stores exact credit and revision. | Enumerate currencies/records by customerId; never infer credit from debts alone. |
| `reminders` | Reminder rows reference `debtId`; reminder command reads and writes this collection. | Resolve reminder-to-debt-to-customer relationship before removal. |
| `transactions` | Cashbox entries; linked customer settlement entries can represent physical cash movement. Merchant reversal also writes correction cash entries here. | Do not delete merely because customerId is present. Preserve cash totals and journal/archive meaning. |
| `merchants` | Merchant master. | Archive/delete target. |
| `merchantBalances` | Per-merchant/per-currency balance state. | Archive with balances; verify all currencies and revisions. |
| `merchantOperations` | Merchant opening, purchase, payment, directPayment and reversal history. | Immutable financial provenance; archive read-only or retain references as required. |
| `operationReceipts` | Idempotency/provenance receipts for trusted commands; payment amendment queries by `result.paymentId`. | Never bulk-delete loosely; retention must preserve replay and audit guarantees. |
| `merchantSettings` | Singleton `config` for merchant payment methods/settings. | Workspace-level, not merchant-owned; do not remove during one merchant deletion. |
| `storeProfile` | Singleton `profile` used to validate store scope. | Workspace metadata; preserve until workspace cleanup. |
| `members` | Canonical workspace members. | Remove only as part of owner-authorized workspace/account lifecycle; keep owner/role rules intact. |
| `dailyArchives` | Daily immutable snapshots created by `dailyArchiveCommand`; each snapshot embeds journal events including customerId/customerName and merchant journal events. | Historical snapshots must not be rewritten by later entity deletion. Workspace deletion removes this collection only as part of the explicit full-space purge. |
| `dailyClosingCounters` | Per-store/per-date closing sequence counters. | Include in workspace inventory; do not remove during customer/merchant lifecycle. |
| `pushDevices` (root) | Device registrations keyed by a hashed device token, with uid/spaceId/storeId and notification scheduling state. | Account deletion must affect only devices owned by the target UID; workspace deletion must revoke registrations scoped to that space without affecting other spaces. |
| `pushDeliveryReceipts` (root) | Notification delivery receipts carrying uid/spaceId/storeId. | Include in account/workspace privacy cleanup with strict ownership checks; not part of ordinary customer/merchant deletion. |

## 3. Cross-entity financial edges verified

### Customer ↔ merchant

A merchant `directPayment` creates:
- a merchant operation in `merchantOperations`;
- a customer payment in `payments` marked `source: 'customer-to-merchant'`;
- a customer balance/debt/credit effect.

Merchant reversal validates that the original customer exists and is active, reads the customer's per-currency credit state, marks the original payment cancelled, and may create a correction debt. Therefore, deleting the customer first can make a later reversal impossible. Customer deletion must block on unresolved linked direct payments or atomically reconcile them through a separately tested trusted path before removing the customer.

### Customer ↔ cashbox

Customer settlement and customer payment amendments can link `payments` to `transactions`. The cash record represents the cash movement; it is not disposable customer metadata. A safe deletion design must determine whether the customer identifier can be detached without changing cash/journal projections, and must preserve immutable archive evidence. Shared or ambiguous transaction links must fail closed.

### Merchant ↔ cashbox

Merchant cash operations link merchant operations to transactions using merchant-operation references. Reversal creates a new offset transaction rather than rewriting the original. Merchant deletion/archive must retain enough references to reconcile the original and reversal chain.

## 4. Existing trusted backend and current gaps

- `workspaceCommand` currently handles workspace metadata, invitations, roles, quotas and closing settings. Its source comment explicitly states it does not read or write financial collections. It has no permanent workspace deletion action.
- `dailyArchiveCommand` writes `dailyArchives/{date}_{closingNumber}` and `dailyClosingCounters/{storeId_date}`. The snapshot embeds customer identifiers/names and merged merchant journal events; this makes archive retention a deliberate privacy/accounting policy decision.
- Notification state also exists outside the workspace tree in root `pushDevices` and `pushDeliveryReceipts`; workspace/account cleanup must query and validate the explicit scope fields rather than delete by token or UID guesses.
- `merchantCommand` handles merchant save/opening/purchase/payment/directPayment/reverse/statement. It has no archive or permanent-delete action.
- `customerOperationCommand` edits/cancels debt/payment operations; it is not a customer-deletion cascade.
- `reminderCommand` supports reminder list/create/status/delete, but deletion is a reminder tombstone, not a customer cascade.
- `index.ts` registers the existing callable functions. No lifecycle-job worker or lifecycle trigger is currently registered.
- Firestore Rules deny direct writes to core financial collections. Any new destructive path must remain trusted-backend-only; do not add client write permissions.

## 5. Newly added lifecycle write and archive barriers

- Trusted financial command handlers now call `assertLifecycleTargetWritable`
  for customer, merchant, or debt targets where applicable. Legacy records with
  no `lifecycleStatus` remain writable; active records are writable; destructive
  states and malformed values fail closed. Receipt replay checks are intentionally
  performed before the lifecycle guard so a completed matching operation can be
  replayed without new writes after the target is locked.
- Client Firestore Rules prevent client-controlled lifecycle status changes and
  updates to customers carrying a non-active lifecycle status. These Rules remain
  source changes only and have not been deployed.
- Manual archive creation and automatic archive closing now reject a workspace
  with positive `activeLifecycleJobCount` inside the archive transaction. This
  barrier is not active yet because no lifecycle starter increments the counter.
  The starter must atomically create the job, lock its target, and increment the
  workspace counter; terminal completion must decrement it exactly once.
- These protections do not prove that every writer is covered. Continue the
  repository-wide audit before creating the first operational job worker.

## 6. Mandatory audit still outstanding before implementation

The following must be checked against all source writers, readers, indexes and emulator tests before any production-capable deletion code is written:

1. Complete collection inventory, including every path used by all `functions/src` modules, client services, archive/export code and notification code; include nested subcollections and root-level user records.
2. All fields that reference `customerId`, `merchantId`, `debtId`, `paymentId`, `transactionId`, `merchantOperationId`, `spaceId` and `uid`; distinguish authoritative links from display snapshots.
3. All query shapes and existing `firestore.indexes.json` entries required for bounded pagination. Do not add speculative indexes.
4. Merchant archive semantics and how complete operation history is paged without the current detail-screen 100-row limit.
5. Journal/ledger projections and exact cash transaction linkage for customer settlements, merchant operations and correction entries.
6. Workspace nested collections, archive storage, receipt/audit retention, notification queues and device registrations.
7. Account deletion ownership-transfer contract and Auth deletion ordering.
8. Emulator coverage for interrupted multi-page jobs, retries, concurrent writes, stale locks, malformed/cross-scope documents, linked directPayment reversal, shared cash links and preservation of another workspace.

## 7. Implementation guardrails

- No client-side cascade loops, unbounded batches, full-workspace scans for single-entity deletion, or polling loops.
- Use server-side bounded pages with stable cursors, checkpoints, per-page scope validation, lease/lock expiry and idempotent phase transitions.
- Prevent new linked writes as soon as a deletion/archive job is accepted. Existing trusted commands must reject targets in a lifecycle transition.
- Make every page transaction retry-safe. If a relationship is ambiguous or a record belongs to another scope, stop without deleting it.
- Keep original financial records and daily snapshots immutable where they are accounting evidence; use tombstones or detached privacy-safe references only after proving all projections remain correct.
- Do not deploy Functions, Rules, indexes, or mutate Firebase production data from this implementation branch.


## 8. Explicit relationship and retention decision matrix (source-audit checkpoint)

The following matrix separates the *entity being hidden/removed* from financial evidence that must survive. “Candidate” is not approval to delete: every candidate still requires the job engine, scoped query, emulator fixtures, and final dependency verification.

| Record / edge | Verified relationship or behavior | Safe lifecycle disposition | Current decision |
|---|---|---|---|
| Customer master `customers/{customerId}` | Active customer document; client soft-delete writes only `isActive: false`. | Hide immediately when a trusted lifecycle job starts; remove the master only after all blocking dependencies are reconciled and historical projections no longer need a live lookup. | Hard-delete implementation absent. |
| Customer debts `debts` | Customer-linked financial balance and journal source; may include merchant-reversal correction debt. | Remove from active balance only through a trusted, bounded process; preserve financial provenance/audit evidence or an approved privacy-safe tombstone. | Do not cascade-delete until linked merchant operations are resolved. |
| Customer payments `payments` | Includes settlements and merchant direct-payment rows; some carry `transactionId`, `merchantId`, and `merchantOperationId`. | Preserve payment/reversal chain and idempotency evidence. Customer identity detachment requires a separately tested projection and audit policy. | Retain by default; no broad delete. |
| Customer credits `customerCredits` | Per-customer/per-currency state with revision. | Must be reconciled for every currency before the customer master can be removed; retain the final audit/snapshot evidence needed to explain the balance. | Never infer from debt totals or delete without currency-complete verification. |
| Reminders `reminders` | Each reminder resolves through a debt; trusted mutation checks linked debt lifecycle state. | Cancel/tombstone or remove only after resolving the debt and preserving required notification/audit semantics. | Entity-specific policy still required. |
| Cashbox transactions `transactions` | Physical cash movements; some customer settlements link through payment `transactionId`; merchant reversals create offsetting entries. | Preserve the original transaction and cashbox totals. Detach identifying links only if every journal, archive, and reconciliation reader is proven safe. | Immutable financial evidence; never cascade-delete. |
| Merchant master `merchants` and balances `merchantBalances` | Per-merchant, per-currency state. | Archive a read-only, currency-complete snapshot before hiding from active lists; permanent deletion is a separate later decision. | Archive/delete behavior not implemented. |
| Merchant operations `merchantOperations` | Includes opening, purchase, payment, directPayment and reversal links; reversals refer to original operations. | Retain complete operation and reversal chain as immutable provenance; merchant archive must expose complete history, not a UI-limited subset. | Do not cascade-delete. |
| Operation receipts `operationReceipts` | Idempotency and replay evidence; payment amendment can resolve receipt by `result.paymentId`. | Retain or replace with a minimal privacy-safe digest only after proving replay safety and retention policy. | No loose entity-ID deletion. |
| Daily archives `dailyArchives` | Immutable journal snapshots embed customer identifiers/names and merchant journal events. | Keep snapshots byte-for-byte unchanged during ordinary customer/merchant lifecycle operations. | Explicitly out of entity cascade. |
| Daily closing counters `dailyClosingCounters` | Store/date closing sequence metadata. | Keep for the lifetime of the workspace; not entity-owned. | Excluded from customer/merchant cleanup. |
| Merchant settings / store profile | Workspace/store configuration, not merchant-owned. | Preserve during single-merchant lifecycle. | Excluded from customer/merchant cleanup. |
| Root push devices / delivery receipts | Scoped by UID and/or workspace/store; outside workspace subcollections. | Account/workspace cleanup must verify exact owner and scope and must not revoke devices or receipts belonging to another workspace/account. | Separate account/workspace privacy phase only. |
| Memberships / invitations / user mirrors | Canonical membership is under the workspace; user mirror is discovery-only; invitations are root-level. | Update only after canonical authorization and explicit leave/transfer/delete flow; never use a discovery mirror as authority. | Separate workspace/account lifecycle phase. |

### Additional source-audit observations

- `subscribeToCustomers` filters inactive customers from the active list. `softDeleteCustomerDocument` performs a direct client update of `isActive` and `updatedAt`; it does not remove debts, payments, credits, reminders, cash entries, or receipts. This is a soft-hide operation, not a permanent deletion protocol.
- `projectArchiveSnapshot` resolves current customer names by reading `customers/{customerId}` for debt/payment events. If a customer master is removed, a future archive projection may no longer resolve that name for unarchived historical source records. Existing archive snapshots are separate immutable documents and must not be rewritten. The final customer lifecycle design must choose between retaining a privacy-safe name snapshot on source records, preserving a tombstone lookup, or blocking removal until all projection dependencies are safely closed; this decision is not made by the current code.
- The manual archive command reads cash transactions for the canonical store to calculate closing balances and separately projects transaction/debt/payment/merchant-operation journal events. Therefore, customer cleanup must not alter cash transaction amounts, currency, direction, timestamps, or archive source identifiers.
- The checked-in composite indexes include store/date or store/time query patterns for archive and ledger operations, but they do not yet establish that every future target-indexed lifecycle query is supported. Add only indexes derived from concrete bounded worker queries and validate them in emulator/CI before deployment.

**Gate:** this matrix is a conservative source-derived retention map, not a production Firestore inventory. Before implementing a worker, close each unresolved disposition with a code reference, a target-scoped query, a legacy-data fixture, and an invariant assertion. Any ambiguous or cross-scope edge must block the job rather than be guessed.


## 9. Follow-up edge audit — payment amendments and notification records

### Customer payment amendment chain

Source checked: `functions/src/customerOperationCommand.ts`, `functions/src/customerPaymentAmendment.ts`, and `functions/src/customerCreditState.ts`.

- The outer customer-operation transaction authorizes the active workspace/store/customer, checks an existing operation receipt for exact replay, then applies the customer lifecycle lock before changing a target payment.
- Payment amendment requires exactly one completed creation receipt matching payment ID, space, store, customer and actor when a financial correction is required. The creation receipt is therefore not merely a retry token: it is the evidence used to reconstruct the original accounting effect.
- For a payment linked to cash, the amendment checks that exactly one payment references the transaction (query limit 2). Shared or ambiguous cash links fail closed. The original cash record is validated for workspace, store, currency, direction, merchant linkage and exact amount.
- Amendments write compensating cash transactions and/or correction debts, update customer credit/debt state, update the payment revision, and create a new operation receipt containing the previous operation and correction details. These are linked accounting evidence; they must not be cascade-deleted.
- The amendment path reads up to 451 customer debt rows and refuses more than 450 in one correction. This is an existing bounded-command limit, not proof that the customer has at most 450 debts. A future lifecycle worker must paginate independently and must not copy this one-shot limit as its deletion strategy.
- Merchant-originated payments are deliberately rejected by this customer edit/cancel path and must be amended/reversed through the linked merchant operation flow.

### Reminder cleanup and notification records

- Reminder reconciliation may physically delete generated due-date reminder rows when their source debt no longer qualifies; explicit user deletion is represented by reminder status/tombstone fields. A lifecycle worker must distinguish generated disposable reminders from user-created reminder history and preserve any required notification/audit trail.
- Root `pushDevices/{deviceId}` documents contain a hashed token key plus UID/workspace/store scope and dispatch state. The notification dispatcher may disable a device by removing token and scope fields when authorization is no longer valid.
- Root `pushDeliveryReceipts/{receiptId}` records are keyed from device/event identity and store UID, space, store, device, event key, claim ID, and delivery state. They are delivery evidence, not customer/merchant financial data. Workspace/account cleanup must scope by exact space/UID and avoid touching a device or receipt belonging to another workspace or account.
- The notification dispatcher is bounded (device/source/event limits) and updates only notification state; it does not post financial entries. It remains a separate cleanup domain from customer and merchant lifecycle.

### Audit boundary

The repository search and source reads in this pass found no lifecycle worker registration, no durable lifecycle job collection, and no lifecycle scheduled trigger. The source audit is still not a production Firestore inventory: unindexed legacy records and data created by older app versions may contain relationships absent from current code. Do not infer absence of records from absence of a current writer.
