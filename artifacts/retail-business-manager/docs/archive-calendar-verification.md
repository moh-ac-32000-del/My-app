# Archive calendar — task 5, 2026-10-21

Repository: `moh-ac-32000-del/My-app` only. Base main: `509b42a2cc236e7f29a0ee2cf37f88b05f92ad43` (task-4 post-merge CI 39646461507 passed). Independent branch: `feat/archive-calendar`.

## Scope and compatibility

### Owner visual correction after review — 2026-10-21

The owner requested an icon-only calendar, not a large archive-day selector. Replace the inline day toolbar with a 44px calendar icon in the archive header. It opens a real month-grid dialog, shared by Web and Android, with month navigation, selected-day highlight, Today and Cancel. Browsing months does not query Firebase; only selecting a day changes the existing scoped reader. Same-day closings use compact numbered/time chips, not large dated cards. This supersedes the initial inline/native-picker presentation described below; no new backend deployment or financial change is needed.

The supplied screenshot showed October 21 and October 18 archives together and no new calendar control, unlike the already deployed day-scoped source. HTTP inspection confirmed the current server bundle was `entry-437fcde6935fb2fe6fe406c98542fc29.js`; an already-open old page is a likely explanation, not a proven browser-cache diagnosis. Provide a versioned review link after publishing the correction and request a full page reload, without clearing financial data or signing out automatically.

- The existing archive stores immutable snapshots, one record per closing, with multiple closings per day. Reuse these records, the existing event/detail rendering and selected-snapshot sharing.
- Add a calendar control, previous/next day and Today. Start at the device's current calendar day, consistently with the existing manual closing date; do not introduce a store-timezone or automatic-closing policy in this task. Web uses the existing browser date input; Android uses the existing native date-picker dependency. Labels use the AR/TR/EN dictionaries and RTL-aware directions.
- The existing trusted `dailyArchiveCommand` list action accepts an optional validated real calendar date and applies both store and date filters in Firestore. Return all closings for that day, ordered by closing number. The storeId/date index already exists. No new index or Rules change.
- Omit the date for the original full-list API. Old clients and existing full-export/journal observations remain unchanged. The calendar's partial response must never claim complete archive-export coverage or overwrite that session-only observation.
- Require the server to echo the filtered date and validate every returned archive's space/store/day. An older backend that ignores the filter must fail closed rather than display a misleading empty day or leak other-day records. Deploy the reviewed Function before publishing the new UI.
- Hide old data immediately on day, authenticated session, workspace, store or role changes. Ignore responses after focus cleanup. A failed read shows an error/retry, not a successful empty archive. A confirmed empty day shows its selected date and a localized message.

## Deliberately unchanged

No financial arithmetic, closing writes, counters, archive snapshots, existing financial records, Firebase Rules, dependencies, scheduled jobs, backup retention, APK/EAS build or main Hosting publication. The daily journal's separate existing full-list read is not refactored here; the cost reduction applies to archive-screen navigation, not a claim that every app history read is now day-scoped.

## Verification and handoff

- Focused automated tests cover valid/leap/invalid dates, boundary navigation, scoped responses, old-client full lists, all three roles, access denials, no financial writes, export completeness, separate same-day closings and selected-snapshot sharing.
- Component/hook tests are bounded handler/state simulations, not physical Android or real-browser acceptance. They cover Web/native picker branches, three languages, empty/error/retry states, scope changes and late response races.
- The existing CI demo Firestore emulator invocation also runs `archive-calendar.emulator.mjs`, with isolated synthetic data only. It checks real filtered queries, all closings, exact preserved snapshots, roles, invalid dates, denied access and unchanged financial collections. This invokes the trusted handler with test auth contexts, not a claim of a live deployed callable or physical-device test.
- Record full test/build/CI results against the exact PR commit. Publish only after checks/review and appropriate deployment approval. Automatic closing and notification work remain separate tasks.
- Local Node 22 verification: all 954 tests in 77 files passed, followed by clean app and Functions TypeScript checks. Java 21 emulator and independent web/Android/iOS JS bundle verification run in CI, not claimed as local device testing.
- The owner explicitly approved deploying the reviewed archive-reading Function and the web review channel after checks/review. No main Hosting publication, financial-data mutation or APK build is authorized by that approval.
