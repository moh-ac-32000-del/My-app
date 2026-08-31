# File Manifest

> **Current snapshot note — 2026-08-31**
>
> This manifest is an important-file index, not a substitute for the complete source copy in the handoff ZIP. The current implementation includes the Firebase/Space/bootstrap files and newer tests listed in the additions below. The archive preserves the complete transferable source/configuration tree after excluding dependency directories, generated build output, logs, and secrets.

This manifest lists the important project files and the role of each area. The external handoff copy contains the complete portable source tree, not only the files listed here.

## Root and workspace

| Path | Purpose |
|---|---|
| `package.json` | Root pnpm workspace scripts and shared dependencies. |
| `pnpm-workspace.yaml` | Workspace package discovery and package-management policy. |
| `pnpm-lock.yaml` | Locked dependency graph for reproducible installation. |
| `tsconfig.json` | Root TypeScript project configuration. |
| `tsconfig.base.json` | Shared TypeScript settings. |
| `.npmrc` | pnpm/npm workspace configuration. |
| `.replit` | Replit workspace configuration. |
| `.replitignore` | Replit ignored paths. |
| `replit.md` | Collaborator-visible project instructions and architecture notes. |
| `.gitignore` | Git ignore rules. |

## Main app: configuration and entry

| Path | Purpose |
|---|---|
| `artifacts/retail-business-manager/package.json` | Expo app scripts and dependencies. |
| `artifacts/retail-business-manager/app.json` | Expo app metadata/configuration. |
| `artifacts/retail-business-manager/.replit-artifact/artifact.toml` | Registered mobile artifact, preview path, and workflow service. |
| `artifacts/retail-business-manager/tsconfig.json` | App TypeScript configuration and alias setup. |
| `artifacts/retail-business-manager/babel.config.js` | Babel configuration. |
| `artifacts/retail-business-manager/metro.config.js` | Metro bundler configuration. |
| `artifacts/retail-business-manager/vitest.config.mjs` | Vitest configuration. |
| `artifacts/retail-business-manager/scripts/build.js` | App build script. |
| `artifacts/retail-business-manager/server/serve.js` | App production/static serving entry. |
| `artifacts/retail-business-manager/server/templates/landing-page.html` | Serving fallback/landing template. |
| `artifacts/retail-business-manager/assets/images/icon.png` | App image asset. |
| `artifacts/retail-business-manager/assets/images/icon_2.png` | App image asset. |

## Main app: routes

| Path | Purpose |
|---|---|
| `app/_layout.tsx` | Root providers, fonts, splash, navigation, and authenticated quick actions. |
| `app/login.tsx` | Local login/session screen. |
| `app/index.tsx` | Authenticated dashboard and Daily Journal summary. |
| `app/settings.tsx` | Store profile, currencies, language, accent, and logout. |
| `app/customers.tsx` | Customer list and creation. |
| `app/customer/[id].tsx` | Customer details, credit/debt, settlement, statement, and sharing. |
| `app/cash.tsx` | Cash In/Cash Out and journal/closing access. |
| `app/archive.tsx` | Archive list, detail, and selected Archive sharing. |
| `app/sales.tsx` | Deferred sales route, under development. |
| `app/purchases.tsx` | Deferred purchases route, under development. |
| `app/inventory.tsx` | Deferred inventory route, under development. |
| `app/reports.tsx` | Deferred reports route, under development. |
| `app/+not-found.tsx` | Not-found fallback route. |

## Main app: components

| Path | Purpose |
|---|---|
| `components/AppShell.tsx` | Shared glass page shell. |
| `components/DailyClosingAction.tsx` | Shared close/archive confirmation and result flow. |
| `components/FloatingQuickActions.tsx` | Dashboard floating action menu. |
| `components/QuickActions.tsx` | Dashboard action cards/buttons. |
| `components/MetricCard.tsx` | Dashboard metric card. |
| `components/CustomerFormModal.tsx` | Customer form modal. |
| `components/customer-utils.ts` | Customer display helpers. |
| `components/ErrorBoundary.tsx` | Error boundary. |
| `components/ErrorFallback.tsx` | Error fallback UI. |
| `components/SplashView.tsx` | Loading/auth splash view. |
| `components/UnderDevelopment.tsx` | Deferred module placeholder. |
| `components/KeyboardAwareScrollViewCompat.tsx` | Keyboard-aware scrolling compatibility. |

## Main app: state, constants, models, and services

| Path | Purpose |
|---|---|
| `context/StoreContext.tsx` | Central local profile, auth, transaction, journal revision, and business action context. |
| `hooks/useI18n.ts` | Translation/direction hook. |
| `hooks/useColors.ts` | Accent/theme hook. |
| `constants/i18n.ts` | Arabic, English, and Turkish dictionaries and direction/date helpers. |
| `constants/currencies.ts` | Currency codes, symbols, normalization, and formatting. |
| `constants/colors.ts` | Glass theme and accent definitions. |
| `types/business.ts` | Store, customer, transaction, debt, payment, archive, reminder, and money models. |
| `services/storage.ts` | AsyncStorage keys, persistence, validation, normalization, journal, debt settlement, and archive behavior. |
| `services/dailyClosing.ts` | Shared close-day orchestration. |
| `services/archiveSharing.ts` | Pure selected-Archive share-message builder. |
| `services/firebase.ts` | Future Firebase config boundary; no active Firebase client. |
| `data/collections.ts` | Future Firebase collection names and store-scoped document type. |

### Current Space/Firebase additions

| Path | Purpose |
|---|---|
| `types/space.ts` | Space, membership, owner, invitation, operation receipt, and local SpaceIdentity contracts. |
| `types/trustedBootstrap.ts` | Trusted primary-Space request/response, provisioning, outcome, and error contracts. |
| `services/firebaseAuth.ts` | Firebase email/password Auth operations and Auth-state subscription. |
| `services/spaceIdentity.ts` | UID-scoped local SpaceIdentity creation/restoration. |
| `services/trustedBootstrap.ts` | Client callable boundary and response validation for primary-Space bootstrap. |
| `services/firestore.ts` | Existing Firestore/store helper retained for compatibility; not the active Auth bootstrap path. |
| `services/backupFile.ts` | Local backup JSON file creation, validation handoff, picking, caching, and sharing. |
| `functions/src/index.ts` | Firebase Admin initialization and exported callable. |
| `functions/src/bootstrapPrimarySpace.ts` | Trusted transactional primary-Space provisioning and repair handler. |
| `functions/package.json` | Isolated Functions dependencies and Node 20/build/typecheck scripts. |
| `functions/pnpm-lock.yaml` | Locked Functions dependency graph. |
| `functions/tsconfig.json` | Functions TypeScript configuration. |
| `firebase.json` | Functions source/predeploy and Firestore Rules configuration. |
| `firestore.rules` | Active-membership boundary and explicit denial of unrestricted financial client access. |

## Main app: tests

| Path | Coverage |
|---|---|
| `tests/customers.test.ts` | Customer behavior and store scoping. |
| `tests/transactions.test.ts` | Cash transactions, validation, balances, and store scoping. |
| `tests/debts.test.ts` | Debt behavior and totals. |
| `tests/settlements.test.ts` | Partial/full settlement and linked cash behavior. |
| `tests/daily-journal.test.ts` | Derived journal behavior and day boundaries. |
| `tests/archives.test.ts` | Snapshots, multiple closings, archive filtering, store isolation, and cash invariance. |
| `tests/daily-closing-action.test.ts` | Shared close action and storage error propagation. |
| `tests/archive-sharing.test.ts` | Selected Archive message content, currencies, customer names, and immutability. |
| `tests/currencies.test.ts` | Currency definitions, normalization, and formatting. |
| `tests/storage.test.ts` | Local storage normalization and persistence behavior. |

### Current additional tests

| Path | Coverage |
|---|---|
| `tests/backupRestore.test.ts` | Versioned local backup, validation, relationships, isolation, and restore behavior. |
| `tests/firebase-auth.test.ts` | Firebase Auth boundary behavior. |
| `tests/space-identity.test.ts` | UID-scoped local SpaceIdentity behavior. |
| `tests/space-storage-isolation.test.ts` | Space namespace isolation. |
| `tests/firestore-space.test.ts` | Firestore Space contract behavior. |
| `tests/multi-space-domain.test.ts` | Multi-Space domain contracts. |
| `tests/trusted-bootstrap-contract.test.ts` | Trusted bootstrap type/contract validation. |
| `tests/trusted-bootstrap.test.ts` | Client callable boundary validation. |
| `tests/bootstrap-primary-space-function.test.ts` | Server provisioning, repair, and idempotency behavior. |
| `tests/firestore-rules.test.mjs` | Membership and financial-denial Rules cases; requires Emulator and was not run here. |

## Other workspace packages

| Path | Purpose |
|---|---|
| `artifacts/api-server/` | Separate Express API artifact and its configuration/source. |
| `artifacts/mockup-sandbox/` | Component preview artifact. |
| `lib/api-client-react/` | Generated/shared API React client package. |
| `lib/api-spec/` | OpenAPI specification/code generation package. |
| `lib/api-zod/` | Generated/shared Zod API schemas. |
| `lib/db/` | Drizzle/PostgreSQL database package. |
| `scripts/post-merge.sh` | Post-merge workspace setup script. |
| `scripts/package.json` | Scripts package manifest. |

## Instructions, memory, tasks, and attached material

| Path | Purpose |
|---|---|
| `.agents/memory/MEMORY.md` | Durable agent-memory index. |
| `.agents/memory/animated-overlay-hit-testing.md` | React Native Web overlay hit-testing note. |
| `.agents/memory/local-persistence-guardrails.md` | AsyncStorage isolation/schema guidance. |
| `.agents/memory/daily-archive-isolation.md` | Archive event-ID isolation guidance. |
| `.agents/memory/react-native-web-alerts.md` | React Native Web alert limitation. |
| `.agents/memory/tracked-handoff-outputs.md` | Packaging note for the tracked handoff ZIP output. |
| `.local/tasks/` | Existing project task plans and task context. |
| `.local/skills/` | Replit-provided task-specific instructions. |
| `.local/secondary_skills/` | Additional skill instructions available in the workspace. |
| `attached_assets/` | Attached project notes/assets from the workspace. |
| `.conversation/attached_assets/` | Conversation-attached project material preserved in the handoff copy. |

## Handoff documents

| Path | Purpose |
|---|---|
| `PROJECT_HANDOFF.md` | Detailed architecture, behavior, data, storage, and transfer notes. |
| `CURRENT_PROJECT_STATE.md` | Current stable state, verification record, scope, and remaining work. |
| `AI_DEVELOPER_INSTRUCTIONS.md` | Mandatory continuation and safety rules. |
| `FILE_MANIFEST.md` | This file: important file and directory inventory. |

## Portable-copy exclusions

The external portable source snapshot omits only generated or reinstallable material:

- `node_modules` directories.
- `.cache` directories.
- Expo generated `.expo` directories.
- Build `dist` directories.
- TypeScript `*.tsbuildinfo` files.
- `.local/share` package/tool cache.

## Current Git/package metadata

| Item | Value |
|---|---|
| Branch | `main` |
| Commit before documentation export | `4ed9d018b027a84dbe880b266f1561ad734c6f27` |
| Recorded latest verification | 19 test files / 153 tests passed; TypeScript passed; `git diff --check` passed |
| Current release scope | Archive sharing/WhatsApp; Backup/Restore; Login + Spaces; data isolation |
| Deferred product modules | Sales, Purchases, Inventory, Capital, Reports |

All source, assets, tests, lockfiles, project instructions, agent memory, task plans, Git metadata, and relevant configuration are included.
