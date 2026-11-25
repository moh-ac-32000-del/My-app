# Lifecycle and financial-data safety review

Repository: `moh-ac-32000-del/My-app`  
Branch: `feature/destructive-data-lifecycle`  
Reviewed head before this document: `9a4631174fdd9f6996c30391e7876f6e05715689`  
Review date: 2026-11-23

## Executive status

This is a source-code review of the proposed lifecycle work, not a production-data audit or a certification that deletion is safe to enable. The lifecycle implementation is **not ready to merge or deploy**.

The latest reviewed head passed both GitHub Actions jobs in run [45081386226](https://github.com/moh-ac-32000-del/My-app/actions/runs/45081386226): `check` and `firestore-rules`. This verifies the repository's configured automated checks at that commit. It does not prove correctness against the user's live financial dataset, nor does it replace backup/restore and emulator acceptance tests.

## Financial-data protections verified in source

- Trusted debt creation/update, customer debt settlement, customer operations, customer payment creation, merchant operations/reversals, and reminder mutations contain lifecycle-target checks in the transaction paths reviewed.
- The reminder update/delete path reads its linked debt in the same transaction before writing. A missing legacy `workspaceId` is not used as a rejection criterion because the debt is already loaded from the canonical workspace subcollection; the store scope is still checked.
- Merchant reversal validates linked payment/cash records and creates correction records instead of rewriting the original merchant operation. When a reversal needs the customer credit state, it requires the customer to remain active and not lifecycle-locked.
- Manual archive and automatic closing read the workspace document in their transaction and call `assertNoActiveLifecycleJobs`. A malformed barrier value fails closed.
- Customer Firestore Rules source changes prevent clients from creating or changing the lifecycle status and prevent updates to a customer whose lifecycle state is not active. These Rules are not deployed.
- The customer create form now guards repeated submissions and reuses a pending document ID after an uncertain failure, reducing duplicate customer creation risk.

## Important limitations and unresolved risks

1. **No operational lifecycle job engine exists yet.** `lifecycleJobProtocol.ts` is a pure state machine. It does not persist jobs, claim Firestore leases, schedule or invoke a worker, process pages, or perform final dependency verification.
2. **The workspace barrier is currently a gate without a producer.** The reviewed source does not yet contain the job-start transaction that atomically persists a job, locks its target, and increments `activeLifecycleJobCount`, nor a terminal transaction that decrements it exactly once. Therefore it must not be treated as an active deletion lock today.
3. **The collection/relationship inventory is explicitly incomplete.** Customer-linked cash transactions, merchant-originated payments/debts, operation receipts, daily archive snapshots, push-device/delivery records, workspace subcollections, and account-level references require per-record ownership and retention decisions before deletion.
4. **Historical accounting evidence must not be cascaded away.** Cash transactions represent actual cash movement; daily archives are historical snapshots. Deleting or rewriting them as a side effect of customer/merchant deletion could change historical totals or break reconciliation.
5. **Exports and read projections still need a repository-wide audit.** This review does not certify every statement/export, journal, notification, list, search, or background task against lifecycle transitions. The customer service also retains a direct client-side soft-delete operation (`isActive: false`); this is not permanent deletion and must remain distinct from the future trusted cascade.
6. **Legacy data compatibility needs fixture-based verification.** The reminder regression exposed records without `workspaceId`. Every lifecycle query must rely on canonical path plus verified ownership fields and stop on ambiguous or cross-scope records; do not assume all historical documents have the newest schema.
7. **Live data integrity is unverified.** No access to, scan of, or mutation of production financial documents was performed as part of this review. CI uses repository tests/emulators and cannot establish that the current live dataset is internally consistent.

## Required gates before any production rollout

- Complete a repository-wide inventory of all Firestore writers, triggers, scheduled functions, exports, projections, and relationship edges.
- Define explicit retention/tombstone behavior for cash transactions, customer payments, merchant operations, operation receipts, daily archives, and audit records.
- Implement transactional job creation, target locking, workspace barrier increment, idempotent bounded worker pages, lease fencing, resumable checkpoints, and exactly-once terminal barrier release.
- Start with customer deletion only after the linked merchant-operation blocking/reversal policy and cashbox preservation behavior are proven in emulator tests.
- Add multi-page emulator fixtures, interruption/retry/concurrency tests, cross-workspace isolation tests, legacy-schema fixtures, and assertions that unrelated balances, cashbox totals, and archives remain byte-for-byte unchanged.
- Test backup and restore on a separate non-production Firebase project before any production migration or deployment.
- Review the final Rules/Functions/index diff independently. Deploy nothing as part of this source-only branch until the user explicitly approves a rollout plan.

## Production-data impact of this review

No Firebase production reads, writes, migrations, deletes, or deployments were performed. This document and the associated source-only branch changes do not directly alter live financial records. If this branch were later merged/deployed, only code paths actually deployed and subsequently invoked could affect behavior; destructive operations must remain unavailable until the gates above pass.


## Follow-up verification — 2026-11-23

### Latest branch CI
- The current reviewed branch head `7c97f22b56e10986f00b10ed3e5620131b84e742` has PR-triggered CI run [45198651316](https://github.com/moh-ac-32000-del/My-app/actions/runs/45198651316).
- Both jobs completed successfully: `check` and `firestore-rules`.
- The `check` job completed TypeScript checks, Expo configuration validation, web export, Functions typecheck, tests, and independent static build.
- The `firestore-rules` job completed Firestore Rules emulator tests and workspace transaction emulator tests.
- This supersedes the earlier note that the documentation-only head had no visible CI run. It is still repository/emulator evidence only, not a live Firebase data-integrity or backup/restore test.

### Additional writer and trigger inspection
Inspected the current branch implementations and registration points for:
- `createCashTransaction`, `createPayment`, `trustedDebtCommand`, `settleCustomerDebt`, and `customerOperationCommand`;
- `merchantCommand` and `merchantReversal`;
- `reminderCommand`, `dailyArchiveCommand`, and `automaticClosing`;
- `merchantSettingsCommand`, `storeProfileCommand`, `bootstrapPrimarySpace`, and `workspaceCommand`;
- `pushDeviceCommand`, notification dispatch, scheduled notification dispatch, and debt/reminder document-written triggers.

Confirmed from source:
- Customer-targeted financial paths reviewed read the customer and call `assertLifecycleTargetWritable` in the transaction before writing customer-linked debt/payment/merchant effects. Merchant command also checks the merchant lifecycle state before merchant operations.
- Reminder update/delete paths read the linked debt and check its lifecycle state in the transaction.
- Manual archive creation and scheduled automatic closing call `assertNoActiveLifecycleJobs`; archive listing with current-status annotation is read-only.
- Workspace membership and ownership commands write workspace/member/membership metadata; the reviewed code documents these as distinct from financial-record mutation.
- Notification triggers and dispatch update push-device/delivery metadata; they do not themselves perform financial posting.

### Remaining limitations / review gates
- The inspected source still contains no lifecycle job starter, durable lifecycle-job collection protocol, lease-fenced worker, bounded deletion processor, or terminal dependency verifier. The pure lifecycle protocol remains a foundation, not an executable deletion engine.
- The workspace lifecycle barrier has no production job lifecycle that safely increments and releases it. It therefore cannot currently coordinate an actual destructive job.
- `createCashTransaction` is a workspace-level cash movement and does not carry a customer target lock; this is expected for standalone cash entries, but deletion design must explicitly establish whether any legacy or future customer-linked cash records exist and preserve cash history independently of customer deletion.
- `createPayment` can carry both `customerId` and `transactionId`; the deletion design must retain the payment, cash transaction, operation receipt, and archive evidence or replace customer identity with a safe historical snapshot under a separately tested policy. Do not cascade-delete these financial records.
- Archive projection reads customer names to produce historical journal snapshots. If a customer document is removed, the source projection may no longer resolve that name; existing archive snapshots must remain immutable, and the deletion plan must not rewrite them.
- Merchant direct-payment/reversal paths create linked customer debt/payment and cash/merchant-operation records. Their complete cross-reference retention and correction behavior still needs a formal relationship matrix and dedicated emulator fixtures before a customer or merchant deletion worker is implemented.
- Merchant settings and workspace/store profile changes were inspected as separate metadata paths; their concurrency interaction with future lifecycle operations still needs an explicit policy.
- No production Firebase data was read or changed. No Rules or Functions were deployed. No backup/restore drill against a separate Firebase project has yet been evidenced.

**Decision:** keep PR #77 Draft and do not merge/deploy. Continue with a relationship matrix and a customer-only lifecycle design; do not implement broad cascade deletion until financial references, legacy schemas, archive invariants, retries, and concurrent writes are covered by emulator tests.


## Follow-up source audit — 2026-11-25

### Additional verified payment and notification edges
- Inspected `customerOperationCommand.ts` and `customerPaymentAmendment.ts`. A customer payment amendment depends on exactly one matching completed creation receipt to prove its original accounting effect. When a cash transaction is linked, it requires exactly one payment reference to that transaction and validates the cash record's scope, currency, direction and exact amount. Ambiguous/shared cash links are rejected.
- Payment amendments can create compensating cash transactions, correction debts, customer-credit revisions, and a new operation receipt containing the previous operation and correction details. Original payment, cash and receipt evidence must remain available for audit/replay; no cascade deletion is safe here.
- The amendment handler reads at most 451 customer debt documents and rejects more than 450 for a single correction. This is a command-specific safety cap, not a complete customer dependency inventory and not an acceptable substitute for paginated lifecycle processing.
- Inspected reminder reconciliation: generated due-date reminder documents may be physically removed when no longer valid, while explicit reminder deletion is represented through reminder status/tombstone data. A future customer cleanup must distinguish system-generated reminders from user-authored reminder history.
- Inspected push-device and notification dispatch paths. Root `pushDevices` and `pushDeliveryReceipts` are scoped by UID, workspace, store and device/event identity. Notification dispatch is bounded and does not mutate financial ledgers. These records belong to a separate workspace/account privacy cleanup domain, not customer/merchant cascades.

### Scope correction
- The merchant accounting document's current opening section states that its later complete-export phase supersedes earlier staged notes. The current Functions index also registers `merchantCommand`; earlier historical statements that the callable was not exported must not be treated as current source status. This does not mean it has been deployed to Firebase.

### Current implementation gate
- No lifecycle job starter, durable job persistence, registered lifecycle worker, lease-fenced page processor or terminal dependency verifier was found in the inspected source.
- No live Firestore data was enumerated. Current-source relationship discovery cannot prove that older production documents lack additional references.
- Do not begin destructive worker implementation until remaining workspace/account subcollections and every export/projection consumer are inventoried, and the customer-specific retention decision for historical names/receipts is approved in code review.
