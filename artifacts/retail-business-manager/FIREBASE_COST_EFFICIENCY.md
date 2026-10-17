# Firebase Cost-Efficiency Rules

These rules apply to every feature in the retail business manager. The goal is to keep normal use within Firebase's free quotas where practical without weakening financial correctness, authorization, or auditability.

## Non-negotiable data boundaries

- Firestore remains the source of truth for debts, payments, cash transactions, daily closings, reminders, and financial archive snapshots.
- Never add a local-storage fallback for financial writes or balances to save Firebase usage.
- Financial commands must remain authenticated, scoped to an active workspace membership, validated on the trusted backend, and idempotent where retries are possible.
- Never deploy Firestore Rules from a feature PR. Deploy only after the application changes and production configuration have been reviewed together.

## Read budget

- Fetch only the fields and records required by the active screen; avoid loading the same collection through both a listener and a one-time query.
- Use real-time listeners only while a screen or active workflow needs live updates. Always unsubscribe on unmount, workspace change, or when the view no longer needs live data.
- For growing histories (payments, transactions, archive, journal), use ordered queries with cursor pagination and a sensible page size. Do not use offsets.
- Do not subscribe to an unbounded history collection for a dashboard or summary. Prefer bounded date ranges or purpose-built summary documents when the consistency model is clearly defined.
- After a successful write, update the relevant in-memory state or let the active listener deliver the change; do not trigger a full collection reload as a reflex.
- Avoid repeated reads of the same customer, workspace, or membership within one user flow when a trustworthy already-loaded result can be reused. Server-side authorization checks must not be removed merely to save reads.

## Write and function budget

- Prevent duplicate taps and duplicate submissions while a command is in flight.
- Use deterministic operation IDs for retry-safe commands; the same ID must not accidentally represent two different payloads.
- Keep one logical business action in one trusted command when its writes must be atomic (for example, debt settlement plus its linked payment and cash transaction).
- Do not write unchanged fields, create duplicate audit/receipt records, or call a Cloud Function when local validation can safely reject the request first.
- Do not create polling loops, frequent scheduled jobs, or background refreshes unless the feature requires them and the cost is understood.
- Prefer server timestamps and compact documents. Do not store duplicate copies of large lists or snapshots unless they are required for historical integrity.

## Storage and retention

- Keep documents small and avoid duplicating full customer/debt objects inside payments or transactions.
- Archive snapshots must preserve historical truth; do not regenerate an old snapshot from current mutable records.
- Apply user-configured retention to eligible temporary records. Never auto-delete financial history that the user has configured to retain permanently.
- Avoid adding Storage uploads or large media to Firestore documents; store media separately and retain only the required reference.

## Required checks for each feature PR

1. Describe expected reads, writes, and callable invocations for the common user path.
2. Identify any collection-wide query/listener and explain why it is bounded or necessary.
3. Check that listeners unsubscribe correctly and are not duplicated by multiple components.
4. Add tests for duplicate submission, retries, access isolation, and important query bounds where applicable.
5. Use Firebase Emulator for rules/functions tests; do not use production data for automated tests.
6. Review Firebase usage dashboards and set budget alerts before release. Budget alerts are warnings, not a guaranteed spending cap.

## Current follow-up items

- Audit existing payment, transaction, debt, and archive listeners for full-collection reads and duplicate subscriptions.
- Add cursor pagination to growing histories before they become large.
- Continue routing financial writes through trusted commands, while preserving atomic multi-document operations.
- Measure emulator/test behavior and review actual usage after a controlled rollout. Never claim that usage is free without checking the current project quotas, billing configuration, and observed traffic.
