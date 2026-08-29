# Current Project State

## Baseline

- Date: 2026-08-29.
- Branch: `main`.
- Baseline commit: `31ab08d803733263f20e717e5b5666ec110782bc`.
- Git status before this handoff: clean.
- Stable baseline: yes.
- The four handoff documents are new, intentionally uncommitted documentation files.

## Working now

The current local Expo application supports:

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

Business data is local to the runtime through AsyncStorage. The primary keys are:

- `@retail-business-manager/store-profile`
- `@retail-business-manager/authenticated`
- `@retail-business-manager/language` (legacy migration key)
- `@retail-business-manager/customers`
- `@retail-business-manager/transactions`
- `@retail-business-manager/debts`
- `@retail-business-manager/payments`
- `@retail-business-manager/daily-archive/{encodedStoreId}:{date}:{paddedClosingNumber}`

The repository does not contain the live AsyncStorage values. There is currently no user-facing Backup/Restore export/import flow.

## Current release focus

The current release is intentionally limited to:

1. **Backup / Restore.**
2. **Login + Spaces + Data Isolation.**

These are the release focus areas for continuation. The existing customer, debt, payment, cash, currency, journal, and Archive foundation must remain stable while that scope is implemented.

Do not add Sales, Purchases, Inventory, Capital, or Reports to the current release plan. Those areas are postponed until after this release.

## Known gaps / remaining work

- Backup/Restore has not yet been implemented as a user-facing flow.
- Real authentication is not connected; the current login is a local authenticated flag.
- Spaces/multi-space user membership and role management are not yet implemented; `storeId` isolation is the current foundation.
- Cloud sync and Firebase initialization are not implemented.
- Sales, Purchases, Inventory, Capital, and Reports remain deferred.
- The API server and database workspace exist separately and are not the current local business-data source.

These are scope items, not reasons to alter the stable baseline during handoff.
