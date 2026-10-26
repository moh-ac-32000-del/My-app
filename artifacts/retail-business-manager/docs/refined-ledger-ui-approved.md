# Approved My-app presentation update - 2026-10-25

Repository: moh-ac-32000-del/My-app. Base main b42ee1e.

## Scope approved by the owner

1. Calm, compact, consistent Home, Customers, Merchants, Archive and Settings, including party account pages and entry/edit sheets. Keep existing handlers, roles, retries, subscriptions, archive/calendar behavior, signed balances and exact arithmetic.
2. Real Light / Dark / Device appearance, stored as a device UI preference, including login. Preserve all existing silver, white, gold, blue, violet and green accent choices; purple is not mandatory.
3. New ledger/check app icon based on the last approved concept; proposed public name Store Accountant / محاسب المتجر. Repository identity, Android application ID, Firebase and EAS identity must not change.
4. Add customer account PDF and improve customer/merchant PDF legibility, grouping currencies, party/store identification, period summary and tables. Hide cancelled operations and internal provenance. Merchant-facing statements must never disclose customer identities. No partial/uncertified balances.
5. Show drawer balance before an event inside journal details, in the same currency, using verified financial posting order rather than editable documentary dates. No invented legacy values or guesses for ambiguous order/incomplete source history. Do not rewrite old archives.

## Delivery gates

- Dedicated feature branch; regression tests, app/Functions TypeScript, app configuration and builds, CI, diff/security review, and preview Web acceptance before merge.
- No optional business features, financial rule changes, production record edits, Rules deployment, automatic Push activation, backup billing changes or APK build in this implementation step.
- Do not claim mockups are implemented, automated tests are device testing, or a successful build proves real delivery.
- Export generation/renderer work uses the PDF verification workflow. Asset preparation uses image generation for edits to the approved raster icon.

## Implementation status

- Implemented locally: Light / Dark / Device preference, six accent palettes, quieter shared shell/navigation (including Archive), compact Home cash rows and closing notice, party directories/account balance lists, unified customer ledger, compact edit controls, grouped Settings and side-by-side merchant quantity/price fields. Existing form handlers and archive/calendar behavior remain in place.
- Implemented locally: customer current-state PDF, reconciled against canonical remaining debts/credit; refuses incomplete history. Shared customer/merchant template separates currencies, puts the summary above the first table, preserves long descriptions with explicitly labelled continuations and prints each financial amount once. Merchant privacy/cancellation projection is unchanged.
- Implemented locally: journal detail drawer-before/effect/after from complete server-confirmed session cash history and actual posting timestamps. Missing history, over-1000-record cache, invalid scope or ambiguous simultaneous postings show unavailable rather than a guessed balance. No historical records are rewritten.
- Prepared static launcher artwork and configured icon/splash/favicon. Existing public display name remains unchanged pending a final name choice. No EAS/APK build requested.
- Automated tests, app/backend TypeScript, Expo config, local Web export and Android JS packaging are being verified for review. GitHub CI, interactive preview acceptance and combined-APK/device testing remain delivery gates; do not infer them from local checks.

## Safety and cost notes

- No financial command/calculation implementation, Firestore Rules/indexes, production financial/Auth records, cloud functions deployment, Push activation or backup billing changes.
- Customer PDF uses complete already-received server-confirmed session collections, with no new financial-history query. Fresh authorization reads four documents per check (space, membership, profile, customer); native saving can perform the check multiple times around permission/output steps. This is **not** a zero-Firestore-read claim. Offline/revoked access fails closed.
- Device storage contains only the appearance preference; the existing financial session cache remains memory-only and clears on session changes.
- Six synthetic PDF samples (customer/merchant x AR/EN/TR, TRY and USD, long descriptions) were rendered offline with Chromium, checked as 5 nonempty A4 pages each and visually inspected. No real account data was used.
- Browser inventory is empty in this environment. Interactive layout checks, real print/save/share flows and phone installation/mask checks are not yet performed for this redesign. The earlier accepted review site/APK does not contain these changes.

## Remaining review checklist

1. Pass both GitHub CI jobs, including Rules and real demo-emulator backend integration.
2. Authorize/publish an isolated Web preview and check Home, Customers, Merchants, Archive, Settings and forms at phone widths in AR/TR/EN, Light/Dark, and all six accents. No financial production writes for design review.
3. Verify customer/merchant PDF save/share and unavailable-history behavior in the preview. Keep cancelled records in the application audit but not public statements.
4. Obtain owner acceptance before merge, final combined APK and device acceptance. Do not consume another EAS build during visual iteration.
