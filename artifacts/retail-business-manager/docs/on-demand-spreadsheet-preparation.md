# Explicit spreadsheet preparation

Repository: moh-ac-32000-del/My-app. Base: PR #63, source f3385b6 used for the installed review APK. This focused fix does not merge or rebuild that APK.

## Approved behavior

- One Export Excel action in Settings. Missing sections no longer disable the action for a valid authenticated workspace session.
- Confirmation explains Firebase usage before any preparation read. Existing complete receipts are reused without additional financial queries. Missing collections are fetched only after confirmation; no export listener or startup/navigation preload is added.
- Complete merchant accounts are skipped. Incomplete accounts are paged automatically using the existing merchantId/createdAt/document-ID index. Partial receipts may have gaps, so bounded head/page reads can overlap old receipts while trusted balance revisions prove completeness. The UI discloses this overlap and access-check reads; do not claim every billed read is a newly downloaded record.
- Progress reports the section, completed sections and received record count, not an exact billing estimate. In-flight Firestore reads cannot be aborted; cancellation stops subsequent requests and prevents output.
- Failure, account/space/role/session change, revoked access, repeated cursors, excessive data or changed live receipts prevents saving a partial/stale file. Preparation is staged in memory and only a validated complete result is committed to the session export cache.
- Limits are unchanged: 1,000 records per collection, and 10,000 expanded archive events/balances. Large exports fail clearly rather than truncate.
- File schema, workbook layout, exact financial projections, currency isolation, native/web saving and cancellation audit behavior are unchanged. No local persistent financial store, financial command, Rules/index or production-data change.

## Security / cost

The client reader uses getDocsFromServer, selected space/store scoping and the existing membership Rules. Before and after new preparation it reads space, own membership and store profile (six document checks on the normal successful path). Each financial read is still independently authorized by Firestore. All three valid roles may export data they are allowed to read, as before. No write API is used by preparation.

## Verification and release gates

- Synthetic orchestration tests: 6/9 to 9/9, >100-record pagination, duplicate prevention, skipping complete accounts, zero-read reuse, consent, cancellation, offline/access failure, oversized/mixed-scope data, concurrent receipt changes and bounded repeated pages.
- Reader tests verify exact query constraints, all three roles, revocation, account changes and server-confirmed-only replies. Render contracts cover enabled actions, consent, progress, cancellation and AR/TR/EN.
- Full local regression suite passed 1,287 tests in 103 files; app/Functions TypeScript passed. No workbook renderer or financial formula was changed.
- Exact query-shape permission cases added to the existing demo-only Firestore Rules emulator suite. GitHub CI is required for these and the Web/static builds. The local checkout's dependency junction prevented Metro export; local Java 8 is unsuitable for the current emulator. Do not count those checks as locally passed or change app dependencies to conceal the environment constraint.
- No real-device/new-APK or live-Firebase export test is claimed. The installed APK still has the old manual-page behavior until a later approved combined build. Navigation latency remains a separate unresolved device-reported issue, not a claimed outcome of this export fix.
