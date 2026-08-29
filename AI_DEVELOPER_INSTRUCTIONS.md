# Mandatory Instructions for Any AI Developer or Human Developer

This file is part of the project handoff. Treat it as binding continuation guidance.

## Scope control

1. Do not start a new Task without explicit approval.
2. Keep work limited to the requested Task.
3. Do not expand a feature into Sales, Purchases, Inventory, Capital, or Reports during the current release.
4. Do not add a new architecture, repository layer, data layer, database, or cloud provider unless the requirement specifically needs it and the architectural change is approved.
5. Do not rewrite working modules from scratch.
6. If the requested change requires a major architectural decision, stop and ask for approval before editing.

## Preserve working behavior

1. Do not change a feature that works correctly without a clear requirement and a written reason.
2. Do not silently change validation, sorting, date boundaries, error propagation, or persistence semantics.
3. Preserve the current local AsyncStorage approach until a migration is explicitly approved.
4. Preserve the current system share approach for Archive sharing unless a WhatsApp-specific integration is explicitly requested.
5. Do not replace in-app critical confirmations/results with `Alert.alert`; React Native Web's installed implementation is not reliable for critical flows.

## Data isolation

1. Preserve `storeId` on every business entity and derived event.
2. Every load, save, create, update, and delete path must remain store-scoped.
3. A save for one store must not overwrite or delete records belonging to another store.
4. Archive storage and reads must remain store-scoped.
5. Any future Spaces implementation must make the active space/store boundary explicit and must not weaken the existing `storeId` checks.

## Currency rules

1. Keep currencies independent.
2. Never add implicit exchange rates, conversion, cross-currency totals, or silent currency substitution.
3. Preserve the currency code on every monetary value and event.
4. Use the centralized currency definitions and formatting helpers.
5. Validate currencies at storage boundaries and input boundaries.

## Cash, Debt, and Payment rules

1. Do not change Cash In/Cash Out behavior without an explicit request.
2. Do not change Debt or Payment behavior without an explicit request.
3. Preserve partial and full settlement semantics.
4. Preserve the linked settlement Cash In + Payment behavior.
5. Preserve the Daily Journal rule that avoids displaying a linked settlement twice.
6. Do not make an Archive operation change cash balances, transactions, debts, payments, customers, or the current date.

## Multiple Closing and Archive rules

1. Multiple closings on the same day must continue to work.
2. Each closing must remain a separate Archive with its own ID and closing number.
3. Archive snapshots must remain stable and independent of later source-data changes.
4. Daily Journal filtering must use the event IDs actually stored in Archive snapshots, not date-only deletion.
5. Archive sharing must use the selected Archive snapshot only.
6. Do not change the Archive or Snapshot while preparing or sending a share message.

## Release focus

The current release focuses only on:

- Backup / Restore.
- Login + Spaces + Data Isolation.

Sales, Purchases, Inventory, Capital, and Reports are postponed until after the current release. Do not include them in implementation plans for this release.

## Verification and safety

1. Before editing, inspect the relevant current code and the current project instructions.
2. Prefer the smallest change that satisfies the requirement.
3. Keep tests focused on changed behavior.
4. Never expose secrets, tokens, credentials, or live user data in source, logs, commits, or handoff documents.
5. Do not clear AsyncStorage or reset local data as a debugging shortcut.
6. Explain destructive actions before performing them and obtain approval where required.
7. For a major architectural change, stop and ask for approval rather than choosing silently.
