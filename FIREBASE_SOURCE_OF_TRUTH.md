# Firebase Source of Truth — Mandatory Architecture Rules

**Status:** Binding project rule, adopted 2026-10-17. This document supersedes conflicting local-first/AsyncStorage instructions in legacy handoff notes, copied prompts, and historical implementation plans.

## Non-negotiable rule

**Firebase is the only source of truth for all business data in Retail Business Manager.** Firestore is the authoritative database; trusted Firebase Functions are the write boundary for operations that require validation, authorization, atomicity, or financial invariants. Firebase Auth is authoritative for authentication.

This is an implementation requirement, not a future optional mode.

## Business data covered

All of the following must be read from and written to Firebase, not AsyncStorage/localStorage or any other device-local persistence:

- Store profile and workspace/store membership state.
- Customers.
- Debts and debt balances.
- Payments and settlements.
- Cash transactions.
- Reminders and due-date reminder reconciliation.
- Daily journal source records/projections where persisted.
- Daily closings and immutable archive snapshots.
- Any future business records or financial history.

The client may hold an in-memory view of Firestore data while a screen is open. Such state is transient and non-authoritative; it must never become a fallback database.

## Forbidden behavior

- No local-first architecture for business data.
- No local create/update/delete path for business records.
- No fallback to AsyncStorage/localStorage when Firebase is unavailable, unconfigured, unauthorized, or returns an error.
- No dual-write design where local storage and Firestore both act as authoritative stores.
- No local business Backup/Restore path that can overwrite or diverge from Firebase.
- No fake success by updating only local state after a failed cloud command.
- No use of a locally stored boolean as proof of authentication or workspace membership.
- No production seeding, test writes, or deployment of Firestore Rules during this migration unless separately authorized.

If Firebase is unavailable, show a clear actionable error and do not pretend the business operation succeeded.

## Permitted device-local state

Device-local persistence may be used only for non-business presentation preferences, such as language, theme/accent, and other explicitly approved UI preferences. Firebase Auth SDK may manage its own authentication persistence. An active Space ID can be a navigation hint only; it is never authorization proof. A cache is permitted only if it is clearly non-authoritative, cannot be written as business truth, and cannot be shown as fresh data after a cloud error.

## Implementation and review requirements

1. Migrate each remaining local business read/write to a Firebase query/subscription or trusted callable.
2. Remove the local business persistence path after its cloud replacement is verified; do not leave a local-only mode as an alternate operating mode.
3. Audit every AsyncStorage/localStorage access and every branch such as `isFirebaseConfigured`, `cloud mode`, `local mode`, and `fallback`.
4. Keep trusted backend authorization scoped to authenticated UID, active workspace membership, and matching store/workspace IDs.
5. Use atomic server-side operations for settlements and other multi-record financial changes.
6. Review Firebase reads/listeners for cost, pagination, unsubscribe behavior, and bounded history loading.
7. Run typecheck, tests, app configuration validation, standalone build, Functions typecheck, and CI. Never claim success until observed.
8. Keep work in reviewable branches/PRs. Do not merge with failing/pending CI or an unreviewed diff.
9. Do not deploy Firestore Rules or write to production data during this migration.
10. Legacy local business data is test data and does not need to be migrated or preserved.

## Current migration status

The migration is incomplete until all business domains above use Firebase exclusively. Existing local code is legacy migration work, not permission to keep local storage as a fallback. Track each remaining domain explicitly in PRs and do not describe the app as fully Firebase-only until a repository-wide audit and tests confirm it.
