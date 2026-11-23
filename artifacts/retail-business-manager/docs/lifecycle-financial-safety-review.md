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
