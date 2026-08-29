# Retail Business Manager — Project Handoff

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
