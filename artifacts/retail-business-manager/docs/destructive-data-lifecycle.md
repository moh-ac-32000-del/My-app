# Destructive data lifecycle — implementation contract

Repository: `moh-ac-32000-del/My-app` only.

This document defines the safety contract for permanent workspace/customer/merchant/account deletion and merchant archival. It is not authorization to deploy Functions, Firestore Rules, indexes, or mutate production data.

## Current-source findings

- Customer details currently call `softDeleteCustomer`; `services/customerFirestore.ts` only writes `isActive: false` to the customer document. Customer debts, payments, customer-credit documents and reminders are separate records, so the current behavior does not satisfy permanent deletion.
- Customer account balances are projected from workspace-scoped `debts` and `customerCredits` collections.
- Merchant data is split across `merchants`, `merchantBalances`, and `merchantOperations`. Some merchant operations reference customers and create linked customer debt/payment records.
- Workspace management explicitly has no permanent-deletion operation today. Workspace authorization is based on canonical `spaces/{spaceId}/members/{uid}` membership; user membership indexes are discovery-only.
- Daily archive snapshots are historical records. Existing archive behavior intentionally does not rewrite old snapshots when current operations are later corrected.
- A customer settlement creates both a customer `payments` record and a cash `transactions` record. The latter changes the real cashbox and must not be blindly removed with the customer account.
- A merchant `directPayment` creates a merchant operation, a customer payment marked `source: 'customer-to-merchant'`, and may affect customer debt/credit. The existing merchant reversal path validates an active customer and uses the customer credit state; deleting that customer first would make a later merchant reversal fail.

## Required architecture

### Shared deletion-job protocol

Destructive cascades must be trusted, resumable server-side jobs—not client-side loops and not a single unbounded Firestore batch.

Each job must:
1. Be created only after validating Firebase Auth, canonical active workspace membership, role, target identity, store scope, and a fresh explicit user confirmation.
2. Acquire an idempotent lifecycle lock on the target and immediately prevent new linked writes.
3. Record a stable job ID, target scope, initiating UID, operation digest, status, phase, cursor/checkpoint, counts, timestamps, and sanitized failure code.
4. Process a bounded page per invocation. Every page must be safe to retry and must validate that each document belongs to the same workspace/store/target.
5. Keep the target hidden from active lists and projections while cleanup is pending.
6. Mark completion only after all required live dependencies and discovery references have been handled.
7. Fail closed on malformed, cross-scope, or ambiguous references. Never guess a document's ownership.
8. Avoid high-frequency polling; the client should read job status only while the user is viewing the operation or after an explicit refresh.

No ordinary customer/merchant deletion should scan every financial collection in the workspace. Use target-indexed queries and bounded cursors. Add composite indexes only when justified and tested.

### Customer deletion

The trusted cascade must cover, at minimum:
- `customers/{customerId}`
- `debts` where `customerId` matches
- `payments` where `customerId` matches, including linked payment records
- `customerCredits` where `customerId` matches
- `reminders` associated with the customer's debts
- Other target-indexed live records discovered by the implementation inventory

After completion, the customer and their live debt/credit amounts must not appear in active lists, balances, totals, statements, reminders, or journal projections.

**Linked merchant operations are a hard dependency, not an ordinary payment row.** If the customer has an unreversed merchant `directPayment`, the deletion flow must first complete a verified merchant-side reversal while the customer and credit state still exist, or stop with a clear blocking result and require that operation to be resolved. It must never delete the customer-side payment while leaving the merchant balance/operation inconsistent. Reversal and deletion must each be idempotent and resumable.

**Cashbox entries require separate treatment.** A cash `transactions` record created by a customer settlement represents physical cash movement, not merely customer identity. Removing it would silently rewrite the cashbox. The implementation must preserve that cash movement and remove or neutralize customer-identifying linkage only where the transaction schema and cash/journal projections can prove this is safe. It must not delete a transaction that also participates in another financial workflow. This decision needs emulator coverage before UI rollout.

Customer-linked `operationReceipts` are idempotency/audit evidence. Do not bulk-delete them by a loose `customerId` query. Define a minimal, privacy-safe retention rule that preserves replay protection and does not expose the deleted customer's identity in ordinary views.

Historical daily archive snapshots remain immutable historical evidence. They are not part of the live customer balance projection and must not be silently regenerated or rewritten. If the product later requires privacy erasure of historical snapshots, that must be a separately approved retention/legal policy with explicit effects on accounting history.

### Merchant archive and deletion

Archiving is not the same as setting `isActive=false`.

A merchant archive operation must preserve a read-only snapshot or safely relocate the merchant identity, per-currency balances, and complete operation history into the archive experience. It must remove the merchant from active merchant lists and prevent new postings. Archive statements and historical totals must remain reconcilable, including reversals and customer-to-merchant operations. Existing daily archive snapshots remain unchanged.

Permanent merchant deletion must be a distinct operation. Its dependency inventory must include:
- Merchant master record and per-currency balances
- Merchant operations and operation receipts
- Customer-side debts/payments/credits created by linked merchant operations
- Cash transactions/journal references where the merchant operation had a cash effect
- Existing archive snapshots and export/statement dependencies

Do not delete or rewrite a cash/customer record merely because it references a merchant. Define and test a consistent cascade or retain an immutable tombstone/reference where financial integrity requires it. The UI must explain the consequences before confirmation.

### Workspace deletion

Only the canonical workspace owner may initiate permanent deletion. The process must:
- Mark the workspace as deleting and deny new financial/workspace commands.
- Revoke invitations and memberships and remove user discovery indexes safely.
- Enumerate all root collections and nested subcollections from an explicit maintained collection inventory, including merchant/customer, archive, receipt, audit, notification, reminder, settings, and membership data.
- Delete in bounded idempotent pages, checkpointing progress.
- Delete the workspace root last, after verification that every inventoried collection is empty.
- Ensure no query or cleanup step can cross into another workspace.

The collection inventory must be tested against the actual Firestore schema. Firestore parent-document deletion does not recursively delete subcollections.

### User-account deletion

Account deletion must not start by deleting the Firebase Auth user.

Before Auth deletion:
- Require recent reauthentication and explicit confirmation.
- Enumerate the user's canonical memberships and owned spaces.
- For each owned shared workspace, require a deliberate ownership transfer to an eligible existing member or explicit workspace deletion. Never orphan the workspace or delete another owner's/shared members' data.
- Remove the user's membership and discovery indexes, invitations, profile/personal records, and device registrations.
- Complete or safely cancel in-flight lifecycle jobs and revoke the user's access.
- Delete the Firebase Auth identity only after cleanup succeeds. Keep a resumable server-side deletion status so retries can continue even if the client session is invalidated.

If ownership resolution is ambiguous, stop and ask the user to resolve it; do not choose a successor automatically.

## Required verification

- Unit/contract tests for validation, state transitions, pagination, idempotency, and retry.
- Firestore Emulator tests with large datasets spanning multiple pages.
- Tests for malformed references, concurrent deletion attempts, interrupted jobs, permission changes, and cross-workspace isolation.
- Customer tests: debt + payment + credit + reminder removal; all currencies; linked merchant-originated records; no remaining live customer balance; cashbox totals remain correct; a future merchant reversal is not broken.
- Merchant tests: archive vs inactive distinction; full history and balances in archive; no new postings after archive; reversals and linked customer/cash effects reconcile.
- Workspace tests: every known collection/subcollection removed, other workspaces untouched, membership/invitation cleanup, owner-only access.
- Account tests: shared ownership transfer, workspace deletion choice, non-owner membership removal, reauthentication, and Auth deletion only after successful cleanup.
- Run TypeScript, unit/contract, Rules, and emulator suites in CI. Report CI, deployment, web publication, APK build, and real-device acceptance separately.

## Rollout constraints

- Do not deploy Firestore Rules, indexes, Functions, or change live Firebase data as part of implementation PRs.
- Do not weaken existing trusted financial command boundaries, idempotency, role checks, or immutable archive semantics.
- Firebase remains the sole source of truth for business data. No local-storage/AsyncStorage financial fallback.
- Keep reads/writes bounded and avoid background polling.
- Deliver in reviewable stages: (1) schema/dependency inventory and lifecycle contracts, (2) backend job engine and emulator tests, (3) customer deletion, (4) merchant archive/deletion, (5) workspace deletion, (6) account deletion, (7) UI integration and practical acceptance.

## Source-audit companion

The verified-but-not-yet-exhaustive Firestore path and relationship inventory is maintained in [`destructive-data-schema-inventory.md`](./destructive-data-schema-inventory.md). It records canonical ownership paths, customer/merchant/cashbox financial edges, current trusted-command gaps, and the audit items that must be closed before cascade implementation. Treat it as an implementation gate, not as proof that every repository collection has already been inventoried.

## Backend implementation progress — lifecycle protocol foundation

The first backend foundation is now present in `functions/src/lifecycleJobProtocol.ts`, with focused tests in `tests/lifecycle-job-protocol.test.ts`.

It defines the supported job kinds, strict target/scope validation, a fixed maximum page size (100), bounded leases (90 seconds by default, at most five minutes), monotonic phase checkpoints, retry counters, terminal states, and lease-generation fencing. A worker that resumes after another worker has reclaimed an expired lease cannot write a checkpoint using its stale generation. Corrupt lease state fails closed.

**This is deliberately only the pure protocol/state machine.** It does not yet persist jobs, register a callable or scheduled worker, block existing financial writers, or delete/archive any records. Do not deploy it or present it as an operational deletion feature. The next backend step is transactional Firestore persistence and claim/checkpoint tests, followed by lifecycle guards in existing trusted commands. Only then should an entity-specific worker be introduced.
