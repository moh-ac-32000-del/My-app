# Mandatory Instructions for Any AI Developer or Human Developer

> **Current data architecture authority — 2026-10-17**
>
> Firestore and the trusted Firebase backend are the sole source of truth for all business and financial records. Local persistence is allowed only for nonessential UI preferences such as language and theme. See `DATA_PERSISTENCE_RULES.md`.

This file is binding continuation guidance.

## Mandatory readiness gate and development freeze (2026-10-18)

The owner requires the earliest stable, runnable practical-test release of
`moh-ac-32000-del/My-app`. This supersedes any open-ended improvement roadmap.

1. Audit readiness before further development. Classify findings as test-blocking,
   non-blocking defects, or optional later improvements. Fix only demonstrated
   test-blocking defects before practical testing; do not add optional features or
   unnecessary refactoring.
2. The first test scope is login/account creation, workspace initialization,
   customers, debts, payments, settlements, and synchronization. Preserve existing
   stable cash, journal and archive behavior. Deferred modules stay deferred.
3. Stop core development and declare Development Freeze as soon as required CI
   passes and a configured runnable test release is available. Verify launch and
   test-environment connectivity; distinguish this readiness check from user
   acceptance. Do not turn complete automated integration coverage into an
   unbounded prerequisite for handing over the first test release.
4. During practical testing, change only defects actually discovered, unless the
   owner explicitly requests a new feature. CI success, build success and actual
   user testing must be reported separately. Never claim a device or live Firebase
   test that was not performed.
5. Use this repository only. Firebase remains the only source of financial truth.
   No Replit dependency, production data changes, financial calculation changes or
   Rules changes without demonstrated necessity and review. Required CI and diff
   review must pass before merge.

The freeze is a verified release milestone, not a declaration that every future
improvement or every feature is complete.

## Scope control
1. Work only on explicitly approved tasks and keep each change focused.
2. Do not expand work into Sales, Purchases, Inventory, Capital, or Reports unless explicitly approved.
3. Do not rewrite working modules from scratch or add unnecessary abstractions.
4. The cloud-only persistence migration is explicitly approved. Do not ask again for permission to replace local financial persistence with the authoritative cloud path.
5. Work on a dedicated GitHub branch, inspect the diff, run verification, and submit a PR. Do not merge until CI passes and the change has been reviewed.

## Source of truth and local persistence
1. Firestore and the trusted Firebase backend are the only authoritative persistence path for customers, debts, payments, cash transactions, journal events, closings, archive snapshots, reminders, and workspace/membership data.
2. AsyncStorage/local storage may hold nonessential preferences only, such as language, theme/accent, and display settings. Firebase Auth's supported session persistence may remain where required by the platform.
3. Do not save financial records, financial drafts, or business data locally as a fallback.
4. If Firebase is unavailable, the user is unauthenticated, membership/space authorization fails, or a cloud operation fails, block the operation and show a clear error. Never silently switch to local storage or report a cloud write as successful before confirmation.
5. UI state, cache, or optimistic values are never the authoritative record. Reconcile from Firestore/backend responses and snapshots.
6. Remove local financial backup/restore UI, code, tests, and helpers. Do not replace them with another local backup system.
7. Inventory every local business-data read/write before removing shared storage helpers. Migrate and test each path first; do not leave hidden local fallback branches.
8. Never automatically clear or delete existing device data. Legacy local records remain untouched unless a separately reviewed migration/removal plan is approved.
9. Do not connect to production to seed, migrate, clear, or test financial data without an explicitly reviewed and approved plan.

## Trusted backend and access control
1. Financial commands with business invariants must use the approved trusted backend/Cloud Functions. Do not add unrestricted client writes to debts, payments, settlements, or other protected financial collections.
2. Trusted backend controls Space ownership, owner membership, and primary-Space provisioning. Clients cannot submit UID, Space ID, owner ID, or role to bootstrap.
3. `spaces/{spaceId}/members/{uid}` is the authorization source; `users/{uid}/memberships/{spaceId}` is only a discovery index.
4. A local active Space ID is never proof of cloud authorization.
5. Preserve the distinction between Firebase UID, Cloud Space ID, local `SpaceIdentity.spaceId`, `StoreProfile.id`, `storeId`, and business entity IDs.
6. Preserve store/space isolation on every read, create, update, and delete.

## Financial invariants
1. Keep currencies independent. Never add implicit exchange rates, conversion, cross-currency totals, or silent currency substitution.
2. Preserve the currency code on every monetary value and event; use centralized currency definitions and formatting helpers.
3. Preserve partial and full settlement semantics and the linked settlement Cash In + Payment behavior.
4. Preserve the Daily Journal rule that avoids displaying a linked settlement twice.
5. Archive operations must not change cash balances, transactions, debts, payments, customers, or the current date.
6. Multiple closings on the same day must continue to work, each with its own ID and closing number.
7. Archive snapshots must remain stable and independent of later source-data changes.
8. Daily Journal filtering must use the event IDs stored in Archive snapshots, not date-only deletion.
9. Archive sharing must use the selected Archive snapshot only and must not mutate the Archive or snapshot.
10. Do not change calculation, debt, payment, Cash In/Cash Out, or settlement semantics as part of persistence migration unless necessary and separately verified.

## Verification requirements
1. Run TypeScript checks, app configuration validation, web/static builds, tests, and a security-oriented diff review.
2. Mock tests alone do not prove the cloud path. Use Firebase Emulator runtime tests for Auth → Space/Membership → customer → debt/payment flows and Firestore Rules enforcement.
3. Test rejection of unauthenticated users, cross-space access, missing/inactive customers, forged space/creator IDs, and cloud/network failures.
4. Verify that a failed cloud operation creates no local financial record and is not reported as committed.
5. Do not expose secrets, tokens, credentials, or live user data in source, logs, commits, or handoff documents.
6. Do not use `Alert.alert` for critical confirmations/results on React Native Web; the installed implementation is not reliable.
7. Keep Archive sharing on the existing system share sheet unless a WhatsApp-specific integration is explicitly requested.
