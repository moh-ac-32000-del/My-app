# Export authorization repair

## Reproduction

On main `f9f1cb99ac38a5bae7fa20805e64b07893011c67`, Excel preparation from
6/9 confirmed session collections calls `spreadsheetPreparationSource.authorize`.
Both that helper and customer PDF authorization issue a fresh server get of
`spaces/{spaceId}/storeProfile/profile` to verify the canonical store ID.
The deployed-source Rules do not allow that get. Opening the merchant directory
can populate the missing session receipts, allowing Excel's already-complete
fast path to avoid the failing preparation authorization. Manual navigation is
therefore a workaround, not a prerequisite users should have to know about.

The emulator regression reproduces `permission-denied` on the existing Rules,
including for the active owner, when reading the exact space, membership,
profile and customer documents used by export authorization.

## Scope of repair

Allow only a document get of the canonical `storeProfile/profile` for an active
owner, editor or viewer of an active space. These users already receive this
profile through `storeProfileCommand`. Do not allow profile listing, other
profile IDs, or direct create/update/delete. Other Rules remain unchanged.

Retain the fresh server checks, store-ID comparison, export coverage limits,
revision checks, statement reconciliation, and all financial calculations.
No financial or membership records are modified by the repair.

Customer PDF errors unrelated to reconciliation now use the existing general
export error rather than claiming that the account is unbalanced. Replace the
obsolete native-PDF build warning with folder/share instructions in Arabic,
English and Turkish; the current APK already contains `expo-print`.

## Verification and rollout

- Emulator regression: existing Rules deny the active owner's authorization.
- Fixed Rules: authorization reads work for owner/editor/viewer. Nonmembers,
  anonymous users, removed members, unsupported roles, inactive memberships and
  archived spaces remain denied. Profile listing and all direct writes remain
  denied for all three supported roles.
- Existing Excel tests cover one-action preparation from 6/9 to 9/9 without
  navigating to merchant screens, bounds, cancellation and concurrent changes.
- Run the full unit suite, TypeScript, web build and CI including the trusted
  backend emulator suite before merge.

No Firebase deployment or APK build is part of this branch's preparation.
After review and explicit deployment approval, the Rules fix can unblock the
existing installed APK without a new Expo build. The wording changes require
a subsequent web release / application update. Confirm actual Excel and PDF
file creation on the user's device separately; emulator and CI success alone
do not establish device acceptance.
