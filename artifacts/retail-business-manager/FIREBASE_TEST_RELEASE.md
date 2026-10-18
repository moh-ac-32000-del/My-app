# My app Firebase test release

Repository: `moh-ac-32000-del/My-app` only.
Authorized test project: `retail-business-manager` (number `786943009866`).
Use the existing registered Firebase Web app; do not create a duplicate project.

1. From the repository root, install the locked dependencies with pnpm 10.
2. In this app directory, copy `.env.example` to ignored `.env.local` and set the
   Firebase Web SDK values from the project's General settings. These public
   client settings do not grant Admin access. Never include a service-account key.
3. Run `pnpm --dir functions install --frozen-lockfile --ignore-workspace`.
4. Run `pnpm run build:web`; `dist/index.html` and its assets are the Hosting release.
5. Authenticate the Firebase CLI using the owner's normal interactive login.
6. After required CI passes and review is complete, deploy only these resources:

```sh
pnpm dlx firebase-tools@15.34.0 deploy --project retail-business-manager --only functions:bootstrapPrimarySpace,functions:storeProfileCommand,functions:createCashTransaction,functions:trustedDebtCommand,functions:createPayment,functions:settleCustomerDebt,functions:reminderCommand,functions:dailyArchiveCommand,firestore:rules,firestore:indexes,hosting:retail-business-manager
```

The Functions hook compiles the existing TypeScript sources. This command does
not seed, migrate, delete, or clear Firestore records. It updates the named
Functions, reviewed Rules and the application Hosting site. Cloud operations can
consume billable resources. Do not use `--force` to accept resource deletion.

The closing queries require the four existing composite indexes in
`firestore.indexes.json`. Before deploying indexes, inspect the project's current
indexes and reject any deletion prompt; wait until all required indexes are READY.
The emulator does not prove that composite indexes exist in the deployed project.
To repair missing indexes without redeploying Rules, Functions or Hosting, use
`firebase deploy --project retail-business-manager --only firestore:indexes`.

Verify the deployed functions, login page, direct page navigation and basic
authenticated initialization on the Hosting URL before declaring Development
Freeze. Then perform the owner's practical test checklist; repair only defects
found during testing. CI success and a generated web bundle do not prove live
Firebase or device acceptance.
