# Task 6 — workspace time and safe automatic-closing transition

Repository: `moh-ac-32000-del/My-app` only. Approved 2026-10-21: a workspace time zone, default Europe/Istanbul, independent of device/member location; previous archives are never re-dated. The financial day boundary stays midnight. The configurable execution time, default 00:00, schedules the previous day's closure, not a different financial-day boundary.

## First reviewed increment: prepared settings and UTC day bounds

- Reuse the existing workspace metadata command and canonical Owner/Editor/Viewer policy, not a separate settings/permission system.
- Store only prepared `closingSettings` on the canonical Space: timeZone, executionTime, revision, prepared status, server update time and authenticated owner. Default legacy spaces display Turkey/midnight without an automatic migration/write.
- Editors/Viewers can inspect shared settings, never change them. Use a revision precondition against concurrent devices; identical same-owner retries do not write twice. Malformed stored metadata fails closed; never silently reset a configured zone.
- UI explicitly says preparation only, automatic closing is not enabled and manual closing remains available. A device-zone button is an explicit owner choice, not a change on member login/location or device clock changes.
- A pure UTC day-bound utility handles different workspace dates for one instant, minute offsets, 23/25-hour days, half-hour DST changes, nonexistent midnight and skipped local dates. It is planning code, not a change to current posting, journal subscriptions or archives.
- No scheduler registration, activation endpoint, new financial writes, historical migration, Rules/index changes, paid protection or APK build in this increment.

## Required next increment before activation

Audit findings: the current journal/merchant subscriptions/manual close use device-local bounds; `trustedDebtCommand` accepts client-created dates and `createPayment` accepts client paidAt. These are existing compatibility paths. A scheduler alone would not make them safe across store midnight.

1. Establish authoritative server-recorded posting timestamps for opted-in spaces, preserving client documentary dates separately where necessary. Keep idempotent retries and legacy receipts compatible. Do not rewrite old source records or change their arithmetic.
2. Define a reviewed activation boundary for existing data. Inventory open legacy periods without guessing the old device timezone or silently reclassifying already archived events. Existing current-day manual closings and prior snapshots must remain immutable and deduplicated by canonical event IDs.
3. Reuse the existing archive transaction/projection rather than create a second financial ledger. Automatic snapshots must capture balances as of the period end, not the later execution time; current cash/account balances must not change. Late/conflicting writes need a shared transactional closing barrier and retry proof, not merely a clock comparison before a write.
4. Add persistent, idempotent period checkpoints, separate prior manual closings and a bounded due-work query. Process backlog days independently, recover from failure, do not scan all spaces/history every minute. Set explicit per-run read/write/work limits and expose failures instead of advancing a failed checkpoint.
5. Timezone/time changes after activation require a future effective boundary and UTC interval continuity; no overlap, skipped transactions or re-dating old snapshots. Resolve ambiguous/nonexistent DST execution times explicitly and test them. A saved prepared configuration does not yet claim this transition is active.
6. Use one shared server schedule, not one job per workspace/member. Review source and emulator concurrency/day-boundary tests before merging. Obtain a concrete deployment/activation approval for the named test spaces before running against live financial records.
7. Only after verified scheduler activation: switch journal/merchant/calendar day scope to the workspace policy, add automatic/manual archive indicators, then replace manual-close buttons with the verified next-run notice. Do not hide a working close action merely because settings have been saved.

## Acceptance gate

Owner role and concurrency checks, cross-space isolation, day/timezone/DST boundaries, source/linked-event deduplication, immutable old/manual closings, historical period-end cash, simultaneous posting/closing and retries/backlog must pass. CI/build success is distinct from scheduler deployment and physical-device testing. Paid backup/PITR and one combined APK remain later tasks.

## Second increment — opt-in engine (source implementation; deployment separately gated)

- `automaticDailyClosing` uses one shared five-minute UTC schedule. `AUTOMATIC_CLOSING_READY` defaults to false; while false it performs no due-space query and owner activation is rejected. Existing spaces are never auto-enrolled.
- Activation requires the canonical owner, saved settings, an explicit confirmed legacy timezone and the readiness gate. It inventories existing data once without rewriting it. The current owner's legacy zone was confirmed as Europe/Istanbul; it must not be assumed for other owners.
- A due query selects at most three spaces; each dispatch closes at most one independent period per selected space. Each source query uses a 501-record lookahead and rejects more than 500 records rather than silently truncating. Activation also bounds each historical collection to 500 records. Larger histories/periods require a reviewed follow-up, not partial archives.
- Automatic snapshots reuse the existing archive projection and cash summation. A derived cash checkpoint carries period-end balances; it is not a drawer transaction. Prior manual snapshots and existing event-ID deduplication remain intact. Empty periods advance only the checkpoint and do not manufacture an archive.
- Financial writers read the canonical Space in their transactions; the worker updates that same document with its checkpoint. Conflicting posting/closing transactions retry. New postings in opted-in spaces use server time; original submitted dates are retained as documentary metadata. Legacy spaces keep the existing date behavior. Old clients cannot manually close an activated space.
- Three failures pause dispatch for that space and expose an owner retry action. A failed transaction never advances the checkpoint or saves a partial snapshot. No live balances or source records are changed by closing.
- Setting changes apply at the next midnight in the current workspace zone. UTC intervals stay continuous, including a short transition period when changing zones. DST repeated execution minutes choose the earlier occurrence; a missing execution minute advances to the first valid local minute after the gap.
- Activated spaces use the workspace financial interval for the journal and merchant subscriptions and Today in the archive calendar. Archives record automatic/manual mode, historical zone and UTC interval. Manual-close controls are replaced only when the canonical Space contains an activated policy, not merely saved settings.
- Unit/handler tests are separate from the real Firestore emulator suite. The latter covers simultaneous worker retries, posting/closing races, linked cash deduplication, prior manual archive immutability and independent backlog days. Neither constitutes live scheduler/device acceptance.

### Rollout order (requires scoped approval)

1. Pass CI, emulator/build checks and review the diff. Deploy the financial writers, workspace/archive functions, schedule and due-space index with readiness false.
2. Verify all deployed writer revisions and that the index is ready, then enable readiness for the workspace endpoint and schedule. Existing spaces still remain inactive.
3. Activate only a new isolated test space, verify an actual scheduled archive and period-end balance, then publish the review web build. Do not activate the owner's existing space without separate confirmation.
4. Keep the PR/deployment/device acceptance statuses distinct. No data wipe, APK build, paid backups or PITR is part of this increment.

Scheduler reference: https://firebase.google.com/docs/functions/schedule-functions . A shared schedule limits job count; usage is not a guarantee of zero cost.
