# Practical-test defects: exports, currencies and merchant refresh

Base: main `1507155b933f02222771778e267108bdd32fb1e5`, My-app only.

## User-visible changes

1. Add a separate **Share archive PDF** button while preserving text sharing.
   Export only the selected saved closing, its saved cash balances, notes,
   party/type, date, amount and currency. Noncash entries stay visible without
   being added to cash. Legacy missing closing balances are explicitly unknown;
   never recompute them from today's ledger. Display the historical-snapshot
   notice in Arabic, English and Turkish.
2. Force Latin digits (`12345`) in the shared number/date formatters and remaining
   localized calendar/date labels. Keep translated labels, RTL and existing
   currency-specific formatting. Do not change input parsers or financial math.
3. Compact exact quantity/unit-price padding in account PDFs: `1.000` → `1`,
   `12.5000` → `12.5`, `0.001` stays `0.001`. No floating-point conversion,
   rounding, or mutation of stored purchase values.
4. Reconfirm the open merchant account after a successful trusted command rather
   than relying on closing/reopening the screen. Failed commands do not trigger
   a success or a refresh. Read only that merchant's metadata, balances and
   existing bounded latest-history query (101 read / 100 displayed). Keep the
   snapshots-in-sync/server-confirmation safeguards. No polling, optimistic
   arithmetic or scan of all merchants' histories. A command refresh restarts
   the bounded head; older pages remain explicitly loadable.
5. Merchant creation/openings, purchases and payments use enabled currencies.
   Customer repayment currency choices also use enabled currencies; the debt
   form already did so. Validate new submissions against the current selection.
   An existing financial operation retains its original, locked currency even
   if subsequently hidden; hiding a currency never removes historical balances.
6. Merchant payment-method settings wait for the acknowledged canonical revision
   before reporting success. Reuse the live snapshot if already caught up;
   otherwise read the single settings document. Ignore late older revisions and
   retain a newer revision if another editor saved during the read. The editor
   receives the confirmed list directly, without clearing it and restarting the
   listener. Regression: the second saved method appears without adding a third.
7. Customer PDF direct-payment rows use the historical method name on their
   explicitly linked merchant operation, rather than translating the generic
   `other` payment category. Reuse confirmed session operations; explicitly read
   only missing linked documents (at most four in flight), verifying the space,
   store, merchant, customer, payment ID, action and currency. Include only the
   method name in the public statement, not merchant/actor identity or private
   notes. A historical custom label is literal even if named `cash`. Legacy
   records without any historical method name retain the generic fallback;
   failed/mismatched reads block output rather than guess a name.

## Export security and cost

- Fresh archive PDF authorization checks the active space, canonical member,
  canonical store and selected archive document. It compares immutable content,
  ignores current-status decorations and checks account/screen scope throughout
  the existing native/browser file export flow. Owners, editors and viewers may
  export an archive they may read. No new write path.
- Single-account subscriptions are partial. They must not replace complete
  workspace merchant/balance receipts used by Excel export.
- Refresh reads are limited to the selected account; they are not guaranteed
  free. PDF checks read four documents at each existing export authorization
  gate. No history scans or extra export reads while merely navigating settings.
- Saving merchant reference settings adds at most one settings-document read
  when its live snapshot lags behind the successful command. Customer PDF adds
  reads only for direct-payment operation links absent from confirmed session
  receipts; normal customer repayments add none. No scan of merchant history or
  financial data migration is needed for older existing payments.
- No Rules, index or Cloud Function changes. No Firebase data changes, new
  dependencies, Expo SDK change or APK build.

## Validation and rollout

Regression tests cover Latin digits, exact fractional display, selected immutable
closing export, current access/revocation/offline rejection, merchant refresh
after acknowledgement, failed-command behavior, partial export receipt retention,
selected currency choices and editing older hidden currencies. Rules emulator
tests exercise the exact narrowed merchant queries and selected archive reads.

Nine synthetic PDF fixtures (merchant/customer/archive × Arabic/English/Turkish)
are generated from the actual HTML renderers using local headless Chrome, then
rendered with Poppler for visual review. No live financial data is used.

Run the full unit suite, TypeScript, Expo config, web/static builds and GitHub CI
before merge. Actual installed-device acceptance remains separate. Do not deploy
or build another APK as part of preparing this review; batch the eventual app
update with the previously merged PDF wording fix when authorized.
