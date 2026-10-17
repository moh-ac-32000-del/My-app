# Cloud-Only Financial Data Policy

Status: mandatory project rule, approved 2026-10-17.

## Source of truth
- Firestore and the trusted Firebase backend are the only authoritative persistence path for all business and financial records.
- This includes customers, debts, payments, cash transactions, daily journal events, daily closings, archive snapshots, reminders, and workspace/membership data.
- A record is not successfully saved until the authoritative cloud operation succeeds. UI state, memory, caches, device storage, or an offline queue must never be represented as a committed financial write.

## Local storage allowed
- Local storage may contain nonessential preferences only: language, theme/accent, display preferences, and other clearly nonfinancial UI settings.
- Firebase Auth's supported session persistence and non-authoritative UI/cache state may be used where required by the platform, but must not become a source of truth for business records.
- Do not persist financial drafts or business records locally as a fallback. If draft retention is ever proposed, it requires separate explicit approval and must remain clearly uncommitted.

## Failure behavior
- If Firebase is not configured, the user is unauthenticated, membership/space authorization fails, or a cloud request fails, block the financial operation and show a clear actionable error.
- Never silently switch to AsyncStorage or another local database when cloud operations fail.
- Do not display an optimistic success or locally calculated balance as authoritative before the backend confirms the operation.
- Reconcile displayed financial data from Firestore/backend results and snapshots.

## Trusted writes and security
- Financial commands with business invariants must go through the approved trusted backend/Cloud Functions. Do not add unrestricted client writes to debts, payments, settlements, or other protected financial collections.
- Preserve Firebase UID, Space ID, membership, Store ID, and entity ID boundaries. A local Space ID is never authorization.
- Preserve per-currency arithmetic, settlement links, immutable archive snapshots, event-ID-based journal filtering, and independent same-day closings.
- Do not change calculation or settlement semantics as part of persistence migration unless specifically requested and separately tested.

## Remove legacy local financial persistence
- Remove local financial backup/restore UI, code, tests, and helpers; do not replace them with another local backup system.
- Inventory all AsyncStorage/local-storage reads and writes before deleting shared helpers.
- Migrate each business-data read/write path to the authoritative cloud implementation, with focused tests, before removing its local implementation.
- Do not automatically delete or clear existing device data. Leave legacy data untouched unless a separately reviewed migration/removal plan is approved.
- Keep preference storage intact.

## Required verification
- TypeScript checks, app configuration validation, web/static builds, unit/contract tests, and security review must pass.
- Mock tests alone do not prove the cloud path. Use Firebase Emulator runtime tests for Auth → Space/Membership → customer → debt/payment flows and Firestore Rules enforcement.
- Test rejected unauthenticated users, cross-space access, missing/inactive customers, forged space/creator IDs, cloud/network failures, and the guarantee that failure creates no local financial record.
- Never connect to production to seed, migrate, clear, or test financial data without an explicitly reviewed and approved plan.

## Change workflow
- Make changes on a dedicated branch and submit a pull request.
- State changed files, unchanged behavior, and verification performed.
- Do not merge until CI passes and the diff has been reviewed.
