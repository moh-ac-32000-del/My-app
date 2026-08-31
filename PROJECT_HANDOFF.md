# Retail Business Manager — Project Handoff

> **Current snapshot authority — 2026-08-31, Europe/Istanbul**
>
> This current-snapshot block supersedes older baseline wording later in this file wherever it conflicts. It was prepared from the current source tree at commit `4ed9d018b027a84dbe880b266f1561ad734c6f27` on branch `main`. The repository was clean before this documentation-only export. No application code, Firebase data, local data, or dependency graph was changed by the export.

## 0. Exact current state and transfer scope

Retail Business Manager is a local-first, mobile-first Expo application for small retail/telecom/electronics/repair shops. The implemented foundation covers store profiles, customers, customer credit/debts, settlements, Cash In/Cash Out, per-currency balances, the derived Daily Journal, multiple same-day closings, immutable archive snapshots, and selected-archive sharing through the device share sheet (WhatsApp can be selected when installed).

The current release plan is intentionally limited to:

1. Sharing a selected Daily Archive through the device share sheet, including WhatsApp when installed.
2. Backup and Restore of important local data.
3. Login plus Spaces plus data isolation.

Archive sharing is already implemented at the current foundation level; it remains an explicit release-scope pillar that must be preserved while the other two pillars are completed.

Sales, Purchases, Inventory, Capital, and Reports are **not** in the current release plan. Their routes are placeholders only and must not be expanded unless the owner explicitly requests it in a future task.

This package is documentation and export only. It does not run Expo, connect to Firebase Production, migrate data, run Cloud Sync, install dependencies, or repair code.

## 1. Project name and function

The project name is **Retail Business Manager**. It provides a generic store-management foundation, currently centered on customers, credit/debt, cash movements, daily journal review, daily archive/closing, local settings, and archive sharing.

## 2. Technology currently used

- pnpm monorepo/workspace with a locked dependency graph.
- Expo SDK 54, React Native 0.81.5, React 19, Expo Router 6, TypeScript 5.9.
- React Native Web support, React Query boundary, Reanimated, gesture/safe-area/keyboard support, Inter fonts, Expo file/document/sharing packages.
- AsyncStorage as the active local business persistence layer.
- Vitest unit/contract tests.
- Firebase client configuration/Auth/Firestore callable boundary and Firebase Functions v2 source are present; cloud business synchronization is not implemented.
- Separate Express 5 API artifact and Drizzle/PostgreSQL workspace packages exist, but they are not the current business-data source.

## 3. Important structure and entry points

- `artifacts/retail-business-manager/` — Expo application.
- `artifacts/retail-business-manager/app/_layout.tsx` — root providers, fonts, splash, navigation, error boundary, and shell integration.
- `artifacts/retail-business-manager/app/index.tsx` — dashboard entry route.
- `artifacts/retail-business-manager/package.json` — `dev`, `test`, `typecheck`, `build`, and `serve` scripts; the mobile entry is `expo-router/entry`.
- `artifacts/retail-business-manager/functions/src/index.ts` — Firebase Functions export entry.
- `artifacts/api-server/src/index.ts` — separate API server entry.
- `lib/` — API client/spec/Zod and database packages.
- `scripts/` — workspace scripts.

## 4. Current screens and routes

Implemented routes:

- `/login` — local session entry; when Firebase is configured, Firebase email/password Auth is used by the Auth boundary.
- `/` — authenticated dashboard, visible currency balances, Daily Journal, and quick actions.
- `/customers` — store-scoped customer list, search, create, edit, and delete.
- `/customer/[id]` — customer detail, debt creation, debt history/totals, payment history, settlement, statement and sharing.
- `/cash` — Cash In/Cash Out entry and history, journal view, and closing action.
- `/archive` — store-scoped archive list, snapshot detail, and selected archive sharing.
- `/settings` — store identity, currency, visible/quick currencies, language, accent, and logout.
- `/sales`, `/purchases`, `/inventory`, `/reports` — real routes but deliberate `UnderDevelopment` placeholders.
- `+not-found` — fallback route.

## 5. Main components

`AppShell`, `AppBackground`, `PageHeader`, `GlassCard`, `SectionTitle`, `EmptyState`, `MetricCard`, `QuickActions`, `FloatingQuickActions`, `DailyClosingAction`, `CustomerFormModal`, `KeyboardAwareScrollViewCompat`, `SplashView`, `ErrorBoundary`, `ErrorFallback`, `UnderDevelopment`, and `customer-utils` are the main reusable UI pieces. `DailyClosingAction` uses an in-app confirmation/result path rather than relying on `Alert.alert`, whose installed React Native Web implementation is not reliable for critical confirmation.

## 6. Contexts, hooks, and services

- `context/StoreContext.tsx` is the only app context. It owns profile, readiness, auth mode, Firebase user/cloud Space state, local SpaceIdentity, transactions, journal revision, cash creation, debt creation, settlement, profile settings, backup restore, sign-out, and local session reset.
- `hooks/useI18n.ts` exposes translation and direction behavior.
- `hooks/useColors.ts` derives light/dark and accent theme values.
- `services/storage.ts` is the local domain/storage boundary: normalization, validation, store/Space namespaces, balances, journal, archive, debt/payment settlement, and local backup data.
- `services/backupFile.ts` handles JSON backup serialization, validation, temporary/cache/document file writing, document picking, and platform sharing.
- `services/dailyClosing.ts` orchestrates the close action.
- `services/archiveSharing.ts` creates a message from one selected archive without mutating it.
- `services/firebase.ts`, `firebaseAuth.ts`, `firestore.ts`, `spaceIdentity.ts`, and `trustedBootstrap.ts` provide the Firebase/Space foundations.
- `functions/src/bootstrapPrimarySpace.ts` is the trusted server-side provisioning handler.

## 7. Actual models and relationships

In `types/business.ts`:

- `StoreProfile` — local store identity and settings; its `id` is the business `storeId`.
- `StoreScopedEntity` / `BusinessEntity` — common IDs, `storeId`, timestamps, and optional `workspaceId`/`createdByUserId`.
- `MoneyValue` — amount plus a required `CurrencyCode`.
- `Customer` — belongs to one store and can own debts and payments.
- `Transaction` — a store-scoped `cash_in` or `cash_out` with amount, currency, note, and timestamps.
- `Debt` — one customer, one store, one currency, current amount, optional `originalAmount`, and optional `settledAt`.
- `Payment` — amount/currency, direction, method, optional customer/transaction links, and timestamps.
- `DailyArchive` — store/date/close time/closing number plus a copied `DailyJournalEvent[]` snapshot.
- `Reminder` — contract exists, but no completed reminder workflow is part of the current product.
- `DashboardMetrics` and `CashTransactionDraft` — UI/input contracts; `DashboardMetrics` is not a full accounting engine.

The current customer settlement creates one inbound cash transaction and one linked cash payment. A payment may reference the transaction it represents. Journal construction suppresses that linked cash transaction so the settlement is shown once. Debts and payments do not create sales, purchasing, inventory, profit, or receivables-aging records.

## 8. Storage and store isolation

Business data is local in AsyncStorage. Legacy/default keys are:

- `@retail-business-manager/store-profile`
- `@retail-business-manager/authenticated`
- `@retail-business-manager/language` (legacy language key)
- `@retail-business-manager/customers`
- `@retail-business-manager/transactions`
- `@retail-business-manager/debts`
- `@retail-business-manager/payments`
- `@retail-business-manager/daily-archive/…`

The current Space-aware namespace is `@retail-business-manager/spaces/` plus an encoded active Space ID. `setActiveSpaceId` selects the local namespace; the local `SpaceIdentity.spaceId` is not the store ID and is not the Firebase UID. Every business record still carries `storeId`. Reads filter by it; writes validate it and preserve records belonging to other stores. Archive keys contain store/date/closing information and reads re-check the stored `archive.storeId`.

No automatic deletion, rename, migration, or movement of legacy local data is allowed.

## 9. Daily Journal, Archive, and multiple closings

`buildDailyJournalEvents` derives today’s local-day events from store-scoped transactions, debts, and inbound customer payments, resolves customer names, suppresses settlement-linked cash transactions, and sorts by occurrence time. `loadDailyJournalEvents` then removes only event IDs already present in today’s archive snapshots.

`closeDailyArchive` snapshots the currently unarchived journal, assigns the next closing number for that store/date, stores a copied `DailyArchive`, and does not delete or mutate source transactions, debts, payments, customers, the date, or cash balances. `archiveClosingQueue` serializes close operations. Multiple closings on one day are supported and each receives a distinct closing number and ID. `loadDailyArchive(storeId, date)` currently returns the first archive for a date; callers needing a particular same-day closing should use the archive list/closing number.

Archive sharing reads only the selected snapshot, preserves each event’s currency, builds a message, and uses the device share sheet. It does not require a WhatsApp SDK or API key.

## 10. Currency and amount behavior

Supported codes are TRY, USD, EUR, GBP, SAR, AED, and SYP; SAR is the default. Centralized definitions in `constants/currencies.ts` normalize and format values. `calculateCurrencyNetTotals` computes Cash In minus Cash Out separately for each currency. Visible/used currency helpers never convert or merge currencies. Localized amount parsing supports Turkish comma conventions and grouping/decimal forms. Debt totals and settlements are also strictly per currency.

## 11. Debt, Payment, and Cash behavior

Debt amounts must be positive at creation. Settlement validates store/customer/currency/amount, rejects overpayment, applies the amount across matching debts, retains `originalAmount` and `settledAt` when a debt reaches zero, and creates a cash-in transaction plus cash payment with method `cash`. Settlement writes are serialized and restore prior AsyncStorage values if a multi-key write fails. The UI currently does not offer card/bank/other settlement even though the Payment contract supports those methods.

Cash In/Cash Out validates a positive amount, valid currency, valid store, and trimmed note. Cash balances are derived from transactions, never converted across currencies, and are unaffected by archiving.

## 12. Authentication, Space Identity, and Multi-Space architecture

`firebaseAuth.ts` contains Firebase email/password Auth and subscriptions. When Firebase configuration is incomplete, the app uses the persisted local authenticated flag for the local/demo mode. When configured, `StoreContext` observes Firebase Auth, creates/restores a UID-scoped local `SpaceIdentity`, sets the local active Space namespace, invokes trusted primary-Space bootstrap, and retains the returned `cloudSpace` separately from the local `StoreProfile`.

`Space`, `Membership`, `OwnerMembership`, `Invitation`, `CloudOperation`, `OperationReceipt`, and `SpaceIdentity` are contracts in `types/space.ts`. The intended authority is `spaces/{spaceId}/members/{uid}`; `users/{uid}/memberships/{spaceId}` is only a discovery index. Firebase UID, Cloud Space ID, local Space ID, and StoreProfile/store ID are separate identifiers.

The membership UI, invitations, member management, role management, additional Space creation/switching workflows, and cloud business synchronization are not implemented. `activeSpaceId` alone is never proof of cloud authorization.

## 13. Trusted Bootstrap and Firestore

The callable `bootstrapPrimarySpace` requires verified Auth context and an empty client request. The server derives the UID, creates or repairs the primary Space, owner membership, membership discovery index, and idempotency receipt transactionally, then verifies the committed records. The client validates the response and stores it as `cloudSpace`; it cannot submit or choose UID, Space ID, owner, or role.

`firestore.rules` allows only authenticated active-membership access to the Space boundary and prevents client writes to ownership/membership structures. User membership indexes are self-scoped. Business/financial collections such as customers, transactions, debts, payments, ledger entries, settlements, daily closings, operation receipts, and audit events are explicitly denied for unrestricted client access. This is a security boundary, not a completed sync implementation.

## 14. Backup and Restore

The storage layer contains a version-1 `LocalBackup` contract and validation/restore functions for the active store: profile, auth flag, customers, transactions, debts, payments, and daily archives. It validates JSON, format version, records, store ID, and relationships before writing, preserves other local stores, and has rollback logic for multi-key writes. `backupFile.ts` supplies the file picker/cache/document/share plumbing.

The user-facing Backup/Restore screen and complete product flow are still the next release work. This is local backup, not Firebase backup, Cloud Sync, or remote storage.

## 15. API server

`artifacts/api-server` is a separate Express 5 artifact with CORS/cookie-parser/pino and workspace Drizzle/PostgreSQL packages. Its current implemented endpoint is the health route (`GET /api/healthz`). It is not the Retail Business Manager business-data source.

## 16. Current status classification

**IMPLEMENTED**

- Expo app shell, routes, local session mode, profile/settings, customers, customer debt, settlement, Cash In/Cash Out.
- Per-currency balances and formatting.
- Daily Journal, multiple same-day closings, archive snapshots, archive isolation, no-cash-impact archive behavior.
- Selected archive sharing through the system share sheet.
- Arabic/English/Turkish dictionaries, Arabic RTL, English/Turkish LTR, accent themes.
- AsyncStorage validation and store/Space namespace foundation.
- Local Backup/Restore data contract and file-service foundation.
- Firebase client/Auth boundary, local UID-scoped SpaceIdentity, trusted primary-Space callable client/server, and membership-oriented Firestore Rules foundation.
- API health artifact, workspace manifests, types, tests, and configuration.

**DESIGNED BUT NOT IMPLEMENTED**

- Complete user-facing Backup/Restore flow.
- Full Login + Spaces product flow beyond configured Auth/bootstrap foundation.
- Additional Spaces, switching UI, memberships, invitations, member management, roles, and permissions UI.
- Cloud Sync, durable outbox, migration, trusted financial commands, append-only ledger, notifications, and remote backup.
- Reminder workflow, logo picker/storage, and non-cash settlement UI.

**NOT STARTED / DEFERRED**

- Sales, Purchases, Inventory, Capital, Reports, profit/accounting engine, stock valuation, and receivables aging.
- Firebase Production rollout, production data use, emulator execution in this environment, and E2E/Playwright verification for this handoff.

## 17. Important constraints for continuation

Preserve UID/Space/store identity separation; keep local storage and Backup/Restore independent from Cloud Sync; keep membership under the Space as authorization authority; never treat a local active Space ID as cloud authorization; keep financial client writes restricted; preserve store isolation, per-currency arithmetic, settlement links, archive event-ID filtering, immutable snapshots, and multiple same-day closing semantics. Do not silently migrate or delete local data.

## 18. Tests and verification

Latest recorded non-Emulator verification: 19 test files and 153 tests passed; TypeScript passed; `git diff --check` passed. The current handoff generation itself did not run tests, Expo, browser, Playwright, Firebase Production, migrations, or Cloud Sync. Rules Emulator tests remain not run because Emulator tooling/Java was unavailable. Functions target Node 20 while the development workspace previously reported Node 24, producing only an engine warning.

## 19. Latest task history and remaining work

Recent completed technical work includes local cash/journal, settlement/home-credit, archive isolation/no cash impact, archive sharing, multi-Space contracts, Firebase/Firestore foundation, trusted bootstrap, client bootstrap integration, and membership-based Rules. The latest Git commit is metadata-only (`4ed9d01`); the latest functional foundation commits include trusted bootstrap and membership Rules.

The remaining release work is Backup/Restore UX and robust Login + Spaces + Data Isolation; Archive sharing is implemented but remains part of the release scope and must not regress. Do not create a new task or expand to deferred modules without explicit owner approval.

## 20. Security and secrets

This handoff must not contain `.env` files, secret values, passwords, tokens, credentials, private keys, service-account material, or live user data. Firebase environment-variable names may remain in source contracts, but values are not included. Any copied configuration containing secret-like assignments must be redacted.

## 21. Snapshot metadata

- Snapshot date: 2026-08-31 (Europe/Istanbul).
- Branch: `main`.
- Commit before documentation export: `4ed9d018b027a84dbe880b266f1561ad734c6f27`.
- Working tree before documentation export: clean.
- Budget/cost remaining: not available in the project state and therefore not inferred.
- Files intentionally unchanged: all application source, Firebase configuration, Firestore Rules, AsyncStorage behavior, API source, lockfiles, dependencies, workflows, Git remotes, and data.
- Packaging output: `.agents/outputs/retail-business-manager-project-handoff-2026-08-31.zip`.

## 1. Purpose

Retail Business Manager is a mobile-first Expo/React Native application for managing phone, telecom, electronics, accessories, and repair shops.

The current baseline provides an operational local-data foundation for:

- Customer records.
- Credit/debt records.
- Partial and full customer settlements.
- Cash In and Cash Out.
- Multiple currencies.
- Daily Journal.
- Multiple daily closings.
- Immutable daily archives.
- Sharing one selected archive through the device share sheet, including WhatsApp when installed.
- Arabic, English, and Turkish localization.
- RTL/LTR layout direction.
- Store-scoped data handling.

The product is intentionally not a full accounting, sales, purchasing, inventory, capital, or reporting system yet.

## 2. Stable baseline

- Baseline date: 2026-08-29.
- Branch: `main`.
- Baseline commit: `31ab08d803733263f20e717e5b5666ec110782bc`.
- Git status before creating this handoff: clean.
- Latest committed change: archive sharing service and Archive UI update.
- Manual confirmation supplied for this baseline: WhatsApp sharing works as required.

The four handoff documents are intentionally created after the baseline commit and are not committed or pushed by this handoff operation.

## 3. Technology

- React Native with Expo SDK 54.
- Expo Router for file-based navigation.
- TypeScript 5.9.
- React 19 and React Native 0.81.
- React Native Web support exists in the dependency set.
- `pnpm` workspaces.
- AsyncStorage for the current local persistence layer.
- Vitest for unit tests.
- `@tanstack/react-query` is provided at the app shell boundary, although the current business data flow is local.
- `react-native-gesture-handler`, `react-native-keyboard-controller`, `react-native-safe-area-context`, Expo Blur/Glass/Linear Gradient, and Expo vector icons support the UI.
- Inter font family is loaded from `@expo-google-fonts/inter`.
- An Express/PostgreSQL/Drizzle API workspace exists separately, but the Retail Business Manager baseline currently uses local AsyncStorage for its business state.
- Firebase is represented only by a future configuration boundary; no Firebase client is initialized in the current starter build.

## 4. Workspace structure

The repository is a pnpm workspace with these relevant areas:

- `artifacts/retail-business-manager/` — the main Expo mobile app.
- `artifacts/api-server/` — separate API server artifact.
- `artifacts/mockup-sandbox/` — component preview artifact.
- `lib/` — shared API client, API specification/Zod output, and database workspace packages.
- `scripts/` — workspace scripts, including post-merge setup.
- `attached_assets/` — project-related attached text/assets.
- `.agents/` — agent memory and durable project notes.
- `.local/` — local skills, task descriptions, and workspace support state. Relevant instructions/tasks are preserved in the external handoff copy.
- `.git/` — Git metadata, included in the external source backup.

## 5. Screens and routes

Expo Router routes live under `artifacts/retail-business-manager/app/`:

| Route | Current role |
|---|---|
| `/login` | Local login/session entry. It records the authenticated flag locally; it is not remote authentication. |
| `/` | Authenticated dashboard with metrics, quick actions, and the visible Daily Journal. |
| `/settings` | Store identity, currency, quick/visible currencies, language, accent/theme choice, and logout. |
| `/customers` | Store-scoped customer list and customer creation. |
| `/customer/[id]` | Customer details, debt creation, settlement, statement, and customer-level sharing. |
| `/cash` | Cash In/Cash Out history and Daily Journal access/closing action. |
| `/archive` | Daily Archive list, selected archive detail, and selected Archive sharing. |
| `/sales` | Deliberately marked under development. |
| `/purchases` | Deliberately marked under development. |
| `/inventory` | Deliberately marked under development. |
| `/reports` | Deliberately marked under development. |
| `+not-found` | Fallback route. |
| `_layout` | Root providers, fonts, splash handling, navigation, and authenticated dashboard quick actions. |

## 6. Important Components

- `AppShell.tsx` — shared page shell and visual framing.
- `DailyClosingAction.tsx` — shared Archive/close-day action used from the dashboard and Cash screen. Uses an in-app confirmation/result modal rather than relying on `Alert.alert` on React Native Web.
- `FloatingQuickActions.tsx` — dashboard floating action menu for cash, credit, settlement, and customer flows.
- `QuickActions.tsx` — dashboard action presentation.
- `MetricCard.tsx` — dashboard metrics.
- `CustomerFormModal.tsx` — customer create/edit form.
- `ErrorBoundary.tsx` and `ErrorFallback.tsx` — top-level error handling.
- `SplashView.tsx` — loading/authentication transition view.
- `UnderDevelopment.tsx` — deliberate placeholder for deferred modules.
- `KeyboardAwareScrollViewCompat.tsx` — keyboard-aware scrolling compatibility.
- `customer-utils.ts` — customer display helpers.

## 7. Contexts and hooks

### StoreContext

`context/StoreContext.tsx` is the central local state boundary. It exposes:

- Current `StoreProfile`.
- Language, direction, and translation function.
- Local authenticated state and readiness state.
- Current store transactions.
- Journal revision for refreshing derived views.
- Cash transaction creation.
- Customer debt creation.
- Customer debt settlement.
- Store profile persistence.
- Quick currency toggling.
- Local session reset.

The provider loads and normalizes local profile/auth state, then loads transactions for the active `profile.id`.

### Hooks

- `useI18n.ts` exposes language, RTL, direction, and translation.
- `useColors.ts` derives the current theme from the store accent.

## 8. Services and models

### Services

- `services/storage.ts` — all current AsyncStorage persistence, validation, normalization, local data derivation, settlement behavior, Daily Journal construction, and Daily Archive creation/loading.
- `services/dailyClosing.ts` — thin shared orchestration path for the close-day action.
- `services/archiveSharing.ts` — builds a shareable message from one `DailyArchive.snapshot`; it does not write data.
- `services/firebase.ts` — future Firebase configuration boundary only; no Firebase client is initialized.

### Core models

Defined in `types/business.ts`:

- `StoreProfile`
- `StoreScopedEntity`
- `BusinessEntity`
- `MoneyValue`
- `Customer`
- `Transaction`
- `Payment`
- `Debt`
- `DailyArchive`
- `Reminder` (model exists, but no completed reminder workflow is part of this baseline)

`DailyJournalEvent` is defined in `services/storage.ts` and combines the current-day view of transactions, debts, payments, and customer names.

## 9. Local storage and data extraction

There is no database file or exported data file in the repository. Runtime business data is stored in the platform implementation of `@react-native-async-storage/async-storage`.

Current keys in `services/storage.ts`:

| Key | Data |
|---|---|
| `@retail-business-manager/store-profile` | One normalized `StoreProfile`, including store identity, language, currency, quick/visible currencies, and accent. |
| `@retail-business-manager/authenticated` | String boolean for the local session flag. |
| `@retail-business-manager/language` | Legacy language key read during migration and removed after normalization. |
| `@retail-business-manager/customers` | JSON array of customers for all locally known stores; reads filter by `storeId`. |
| `@retail-business-manager/transactions` | JSON array of cash transactions for all locally known stores; reads filter by `storeId`. |
| `@retail-business-manager/debts` | JSON array of debts for all locally known stores; reads filter by `storeId`. |
| `@retail-business-manager/payments` | JSON array of payments for all locally known stores; reads filter by `storeId`. |
| `@retail-business-manager/daily-archive/{encodedStoreId}:{date}:{paddedClosingNumber}` | One JSON `DailyArchive` per store/date/closing number. |

### Current data categories

- **Customers:** customer identity/contact/notes/active state plus store and timestamps.
- **Transactions:** Cash In/Cash Out, amount, currency, note, store and timestamps.
- **Debts:** customer, remaining amount, currency, optional original amount and settlement timestamp.
- **Payments:** amount/currency, direction, method, customer, optional linked transaction, and timestamps.
- **Daily Archives:** immutable snapshots of journal event IDs/details, date, close time, store, and sequential closing number.
- **Store Profiles:** store name, phone, address, store ID, selected currency, quick/visible currencies, language, accent, optional logo URI.
- **App settings:** local authenticated flag, language, currency settings, visible/quick currencies, and accent/theme selection. These are local profile/session values; there is no separate settings database.

### Extraction and restoration status

The current application does not yet expose a user-facing Backup/Restore flow and does not provide an AsyncStorage export/import function. The repository therefore cannot contain the current runtime values of the data above.

To preserve live user data later, a Backup/Restore feature must read/write the exact AsyncStorage keys above, validate every record, preserve unknown stores, and maintain the existing store isolation and currency boundaries. Do not manually replace or clear these keys as part of ordinary development.

## 10. Store Isolation

- Every business entity carries `storeId`.
- Load functions filter records to the active store.
- Save functions validate that every incoming record belongs to the requested store and preserve other stores' records in the shared arrays.
- Archive storage uses an encoded store ID in the key and also verifies the stored `archive.storeId`.
- Journal construction filters transactions, debts, payments, and customers by the active store.
- Future Firebase/Firestore documents are expected to carry `storeId`; `data/collections.ts` documents that rule.

The current profile is the locally active store profile. Multi-space/account infrastructure is not complete yet; the `storeId` discipline is the foundation for it.

## 11. Currency system

Supported currencies:

- TRY
- USD
- EUR
- GBP
- SAR
- AED
- SYP

`constants/currencies.ts` is the source of truth for codes, symbols, placement, normalization, and formatting. SAR is the default currency.

Amounts retain their own currency on transactions, debts, payments, and journal events. Totals are calculated per currency. There is no exchange-rate conversion, cross-currency netting, or silent merge of amounts.

## 12. Debt and Payment system

- A debt belongs to one store and one customer and has one currency.
- Debt creation records the original outstanding amount.
- Settlement validates the customer, currency, amount, and available debt balance.
- Partial settlement reduces outstanding debt.
- Full settlement records the original amount and settlement time while the remaining amount becomes zero.
- A customer settlement creates a Cash In transaction and a linked cash Payment.
- The Daily Journal suppresses the underlying settlement Cash In transaction when it sees the linked customer payment, so the journal presents the settlement once instead of twice.
- Settlement writes are serialized and restore the prior storage values when a multi-key write fails.

Do not change this behavior without an explicit requirement.

## 13. Daily Journal

The journal is derived, not a separately persisted ledger:

1. Load store-scoped transactions, debts, payments, customers, and archives.
2. Select transactions, debts, and incoming customer payments occurring on the current local day.
3. Resolve customer names from store-scoped customers.
4. Exclude settlement Cash In transactions linked to customer payments.
5. Exclude event IDs already present in today's Archive snapshots.
6. Sort the resulting events by occurrence time.

Journal event IDs are stable source-based IDs such as `transaction:{id}`, `debt:{id}`, and `settlement:{id}`.

## 14. Multiple Closing and Archive

- Every close operation creates a separate `DailyArchive`.
- The closing number increments independently for each store/date.
- Multiple closings on the same calendar day are supported.
- A close stores the current visible journal events as a copied Snapshot.
- Closing does not change transactions, debts, payments, customers, the date, or cash balances.
- Archive filtering uses the event IDs inside saved snapshots, not date-only deletion.
- The Archive list is store-scoped and sorted by date and closing number.
- Archive snapshots remain stable even if current source data later changes.

The archive close path is serialized to avoid conflicting same-day closing numbers.

## 15. WhatsApp Archive Sharing

`app/archive.tsx` tracks one selected Archive and passes that exact object to `buildArchiveShareMessage`.

`services/archiveSharing.ts`:

- Reads only the selected `DailyArchive`.
- Includes store name when available, archive date, closing number, close time, event list, amount, currency code, event time, customer name, and optional note.
- Preserves each event's currency independently.
- Does not mutate the Archive, Snapshot, or AsyncStorage.

The screen calls the existing React Native `Share.share({ message })` system share API. The user can choose WhatsApp from the device share sheet when WhatsApp is installed. No WhatsApp SDK, API key, or new integration is used.

## 16. Languages and direction

- Arabic (`ar`) is RTL.
- English (`en`) is LTR.
- Turkish (`tr`) is LTR.
- Translation dictionaries are in `constants/i18n.ts`.
- `StoreContext` supplies the active language and direction.
- Date and amount formatting use the active language.
- Components use direction-aware row/text layout where needed.

## 17. Tests

Tests live in `artifacts/retail-business-manager/tests/`:

- `customers.test.ts`
- `transactions.test.ts`
- `debts.test.ts`
- `settlements.test.ts`
- `daily-journal.test.ts`
- `archives.test.ts`
- `daily-closing-action.test.ts`
- `archive-sharing.test.ts`
- `currencies.test.ts`
- `storage.test.ts`

Last recorded baseline result:

- Test files: 10 passed.
- Tests: 89 passed.
- TypeScript: passed with `tsc -p tsconfig.json --noEmit`.
- `git diff --check`: passed.

No new tests are run as part of this handoff.

## 18. External handoff copy

The complete portable source snapshot is created outside the repository at:

`/home/runner/project-backups/retail-business-manager-stable-baseline-2026-08-29-31ab08d/`

An archive of the same snapshot is also created at:

`/home/runner/project-backups/retail-business-manager-stable-baseline-2026-08-29-31ab08d.tar.gz`

The copy includes the repository source, application assets, tests, configuration, lockfiles, `.agents`, relevant `.local` instructions/tasks, attached assets, `.conversation` project attachments, and `.git` metadata. Only generated dependency/cache material is omitted: `node_modules`, `.cache`, Expo generated directories, build `dist` directories, TypeScript build-info files, and the pnpm package store under `.local/share`. These are reproducible from the included lockfiles and package manifests.
