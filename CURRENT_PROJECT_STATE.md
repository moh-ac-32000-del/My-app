# Current Project State

> **Architecture supersession (2026-10-17):** This snapshot is historical and conflicts with the current Firebase-only business-data decision. Follow `FIREBASE_SOURCE_OF_TRUTH.md`; local AsyncStorage business persistence, local Backup/Restore, and local operation fallback are legacy code to remove, not approved behavior.

> **Current snapshot correction — 2026-08-31, Europe/Istanbul**
>
> The entries below are the authoritative current state for this handoff. Older baseline notes in this file describe the 2026-08-29 product checkpoint and are retained only as history. Current source commit: `4ed9d018b027a84dbe880b266f1561ad734c6f27`, branch `main`. Git was clean before this documentation-only export.

## Current release boundary

The current release has only these three focus areas:

1. Sharing a selected Daily Archive through the device share sheet, including WhatsApp when installed.
2. Firebase-backed backup/export only if later explicitly designed; no local business Backup/Restore.
3. Login plus Spaces plus data isolation.

Sales, Purchases, Inventory, Capital, and Reports are explicitly postponed and are not part of the current release unless requested later.

## Current implementation snapshot

- Expo SDK 54 / React Native app with Expo Router routes for login, dashboard, customers, customer detail, cash, archive, settings, and deliberate under-development routes for Sales, Purchases, Inventory, and Reports.
- Local business persistence and local Space identity have been removed from the app runtime; only a nonfinancial notification-time preference and Firebase Auth session persistence remain local.
- Customers, debts, partial/full cash settlements, Cash In/Cash Out, per-currency balances, derived Daily Journal, multiple same-day closings, immutable archive snapshots, and selected archive system sharing.
- Arabic, English, and Turkish; Arabic RTL; English/Turkish LTR; accent settings.
- Firebase Auth, Firestore, trusted Functions, Space bootstrap, and membership checks are being developed as the authoritative path. Remaining local business paths must be removed; no local fallback is permitted.
- Local business Backup/Restore must not be exposed or expanded. Any future export must be designed against Firebase as the source of truth.
- Separate API server currently provides health functionality only and is not the business data source.

## Last recorded verification

- Last recorded Test Result: **19 test files, 153 tests passed** in the latest non-Emulator run.
- Last recorded TypeScript Result: **passed**.
- Last recorded `git diff --check`: **passed**.
- Rules Emulator: not run; Firebase Emulator/Java tooling was unavailable.
- This documentation/export task did not run tests, Expo, browser, Playwright, Firebase Production, migration, or Cloud Sync.

## Latest completed work

The latest technical sequence completed the Multi-Space contracts, Firebase configuration, trusted server-only primary-Space bootstrap, client bootstrap integration, and membership-based Firestore Security Rules. The latest Git commit is `4ed9d01` (`Update agent assets metadata`); it is metadata-only. The latest product foundation remains archive sharing after customer, cash/journal, settlement, and archive work.

## Remaining release features

- Archive sharing is implemented through the device share sheet and must remain stable.
- User-facing local Backup/Restore.
- Login/Authentication completion, Space bootstrap/switching experience, and end-to-end local Space data isolation.

## Budget / project balance

No remaining project budget, credits, or cost allowance is present in the inspected project state. Do not infer one from code or Git metadata.

## Important warnings

- Do not treat a local `activeSpaceId` as proof of cloud authorization.
- Do not enable production Firebase or unrestricted financial writes.
- Legacy local business data is test data; do not preserve it as an alternate source of truth or build a migration for it.
- Do not merge currencies, add implicit conversion, or change settlement/archive behavior.
- Do not expand the release into Sales, Purchases, Inventory, Capital, or Reports.
- Firebase Functions target Node 20; the development environment previously reported Node 24 and emitted an engine warning.
- The Rules Emulator has not been validated in this environment.

## Baseline

- Date: 2026-08-29.
- Branch: `main`.
- Baseline commit: `31ab08d803733263f20e717e5b5666ec110782bc`.
- Git status before this handoff: clean.
- Stable baseline: yes.
- The four handoff documents are new, intentionally uncommitted documentation files.

## Working now

The historical local Expo baseline supported the following; treat these as legacy behaviors to migrate to Firebase, not as current architecture:

- Local login/session flag and protected dashboard routing.
- Local store profile and store identity settings.
- Store-scoped customers.
- Customer credit/debt creation.
- Partial and full customer settlement.
- Cash In and Cash Out.
- TRY, USD, EUR, GBP, SAR, AED, and SYP.
- Currency-specific balances and formatting without conversion or cross-currency merging.
- Derived Daily Journal.
- Multiple closings on the same day.
- Immutable Daily Archives with sequential closing numbers.
- Archive filtering based on archived event IDs.
- Archive closing without changing cash balances or source records.
- Sharing the selected Archive through the device share sheet; WhatsApp can be selected from that sheet.
- Arabic, English, and Turkish.
- RTL for Arabic and LTR for English/Turkish.
- Local AsyncStorage persistence.
- Error reporting through the in-app close action result state rather than silent critical failures.

Sales, purchases, inventory, and reports routes exist but are deliberately marked under development.

## Last completed work

The latest completed baseline work, in order, is:

1. Customer module foundation.
2. Cash transaction and Daily Journal foundation.
3. Customer settlement and home-credit flow.
4. Daily Archive behavior with multiple same-day closings and no cash impact.
5. Selected Archive sharing via the existing system share API.

The latest committed change is the Archive sharing service and Archive UI update.

## Last recorded verification

These are the latest recorded results before this documentation-only task:

- TypeScript: passed.
- Unit tests: 10 test files and 89 tests passed.
- `git diff --check`: passed.
- WhatsApp Archive sharing: manually verified as working as required.

No new tests, Expo run, browser run, Playwright run, or screenshot was performed for this handoff.

## Current storage

Historical note only (obsolete): the former local business-data keys were:

- `@retail-business-manager/store-profile`
- `@retail-business-manager/authenticated`
- `@retail-business-manager/language` (legacy migration key)
- `@retail-business-manager/customers`
- `@retail-business-manager/transactions`
- `@retail-business-manager/debts`
- `@retail-business-manager/payments`
- `@retail-business-manager/daily-archive/{encodedStoreId}:{date}:{paddedClosingNumber}`

Local business Backup/Restore implementation and UI have been removed. Any future export/import must be designed against Firebase and must not create a local business database.

## Current release focus

The current release is intentionally limited to:

1. **Backup / Restore.**
2. **Login + Spaces + Data Isolation.**

These are the release focus areas for continuation. The existing customer, debt, payment, cash, currency, journal, and Archive foundation must remain stable while that scope is implemented.

Do not add Sales, Purchases, Inventory, Capital, or Reports to the current release plan. Those areas are postponed until after this release.

## Known gaps / remaining work

- Local Backup/Restore was removed; cloud-backed export/import remains unimplemented.
- Real authentication is not connected; the current login is a local authenticated flag.
- Spaces/multi-space user membership and role management are not yet implemented; `storeId` isolation is the current foundation.
- Cloud sync and Firebase initialization are not implemented.
- Sales, Purchases, Inventory, Capital, and Reports remain deferred.
- The API server and database workspace exist separately and are not the current local business-data source.

These are scope items, not reasons to alter the stable baseline during handoff.
