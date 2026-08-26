# Retail Business Manager

تطبيق موبايل لإدارة المحلات التجارية، يبدأ بمحلات الاتصالات والهواتف ومصمم للتوسع إلى أنواع نشاط مختلفة.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/retail-business-manager run dev` — run the Expo mobile app
- `pnpm --filter @workspace/retail-business-manager run typecheck` — typecheck the mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/retail-business-manager/app/` — Expo Router screens for login, dashboard, business modules, and settings
- `artifacts/retail-business-manager/components/` — reusable glass UI, metrics, quick actions, and shared shell
- `artifacts/retail-business-manager/context/StoreContext.tsx` — locally persisted store identity and starter session state
- `artifacts/retail-business-manager/constants/` — centralized colors and localization dictionaries
- `artifacts/retail-business-manager/data/collections.ts` — future Firestore collection names and store-scoped document types
- `artifacts/retail-business-manager/services/firebase.ts` — future Firebase configuration boundary using Expo environment variables

## Architecture decisions

- Arabic RTL is the current interface language; English and Turkish dictionary keys are prepared for a later language switch.
- Store identity is independent from the app name and persists locally until Firebase Authentication, Firestore, and Storage are connected.
- Every future cloud document is expected to include `storeId`, enabling multiple stores and role-based access.
- The first release focuses on navigation and a credible operational foundation; sales, purchasing, cash, inventory, and reporting modules have deliberate development states.

## Product

The starter app includes an Arabic RTL login flow, a black glass dashboard with zero-state business metrics, quick-action navigation, business identity settings, accent selection, and real routes for sales, purchases, customers, cash, inventory, and reports.

## User preferences

- Keep the product generic and rebrandable; never hardcode a specific shop or company name.
- Preserve the premium black Glass/Liquid visual direction and avoid emoji-based UI.
- Do not build the next-stage accounting features until the foundation is reviewed.

## Gotchas

- The mobile workflow is managed by the artifact and should be restarted through the workflow controls when dependencies or Metro configuration change.
- Firebase environment variables are optional in the starter; the app intentionally uses AsyncStorage until the cloud stage is approved.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
