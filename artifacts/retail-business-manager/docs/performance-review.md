# App-wide performance review — 2026-10-23

Repository: `moh-ac-32000-del/My-app`, PR #62 draft only. Review Web and compatible
Functions were deployed on 2026-10-23; no main publication, merge or APK build.

## Confirmed redundant work corrected

1. CI: the navigation regression imported Node `fs`/`url` into the app TypeScript
   project. Clean CI lacks these types at that stage. Use Vite raw-source imports
   plus a local declaration instead; the test stays typechecked, with no new Node
   dependency or weakened compiler settings.
2. Dashboard / cash journal: each cash, debt, customer, payment or merchant snapshot
   previously started another callable request for the entire archive history.
   A scoped live archive observation now supplies the same immutable records, and
   projection is pure/memoized. New closings update suppression by event ID. No
   repeated archive I/O on financial-source updates or callable cold start there.
   Cached/pending snapshots are not authoritative; errors clear the visible result.
   Cleanup and scope keys block late results on space/role changes.
3. Keep full archive coverage for the existing zero-extra-read spreadsheet export.
   Initial observation still reads archive history: it is NOT claimed eliminated.
   Subsequent listener updates normally read changes rather than fetching history
   after every unrelated write. Navigation remounts/reconnects can still re-read.
   No complete export is inferred from a partial selected-day result.
4. Shared money/date rendering: reuse bounded Intl formatter machinery and the
   three app languages' digit/separator tables. No balances, dates, business data
   or drafts are cached/persisted by this optimization. Exact decimals and legacy
   precision are unchanged. An implicit device time zone is deliberately NOT cached.
   Calendar boundary search/DST algorithms remain unchanged, but no longer allocate
   a new formatter for every binary-search step. Invalid zones still fail.
5. Repeated presses on the already-open primary page no longer replace/remount it.
   Detail-to-parent and cross-section navigation remain available. Theme objects and
   translation callbacks are stable until their actual presentation inputs change.
6. Prior stage: customer reminders no longer gate the whole account or refetch after
   every payment/debt update; their own loading/error/retry remains visible.

## Measurements / limits

- Synthetic local Node run: 1,000 exact money labels, old implementation ~132 ms,
  new ~4 ms; outputs identical. This measures only formatting CPU, not app startup,
  network latency, React Native rendering or phone performance. No time threshold
  is used as a regression pass condition.
- Hook lifecycle test: 100 financial-source updates retain one archive subscription;
  new archive events, scope changes, role loss, failures and explicit retry tested.
- Calendar construction-count test and existing DST/date-boundary tests check that
  reuse does not change financial-day results.

## Still needs practical measurement, not assumed fixed

- Real Android cold/warm launch, primary navigation, scrolling, search and saves
  under the user's actual data volume/network. Local/SSR tests cannot establish this.
- Merchant account subscriptions/history loading and long lists: no invented speed
  claim or broad authorization/cache refactor. Customer/provider observations are
  already root-scoped; merchant list/detail observations remain separately scoped.
- Initial auth -> discovery -> canonical membership -> profile setup is serial in
  part for security. Do not skip it, trust a local space ID or optimistically confirm
  a financial write to make a loading indicator disappear.
- Global historical transaction/debt/payment load and nonvirtualized long detail
  lists remain potential scaling costs. Do not truncate data or totals without a
  separately tested paging/aggregation design and observed need.
- Cloud Functions cold starts / server region / network round trips have not been
  measured. No paid warm instances, region migration, local financial persistence,
  Firestore Rules changes or accounting changes were introduced for performance.

The fixes remove demonstrated shared overhead; they do not prove that all reported
slowness is resolved. Keep CI, build results and actual device acceptance separate.

## Archive follow-up — 2026-10-24

The user reports partial improvement, but Archive still slow. Inspection found
that its full-page spinner still waited for the callable to read every selected-day
source's current edit/cancel status, including unselected same-day closings.

- Read immutable closings through a server-confirmed, store/date-filtered Firestore
  listener under existing Rules. Current status checks run separately; saved values
  are visible while an explicit localized notice says statuses are being checked.
  This removes the status RPC from the saved-values rendering gate; it is not a
  measured phone-speed result and does not eliminate network latency.
- Status failure is shown as unverified, not an empty day or a verified active
  operation. Backend authentication/authorization/precondition rejection clears
  data. Cached/pending, malformed and cross-scope snapshots never become trusted.
  Date/space/session/role changes and newer snapshots invalidate late results.
- Overlay status labels only for matching closing/event/source identities; never
  overwrite saved snapshot amounts, notes, cash balances or sharing data.
- Deduplicated current-source reads use one transaction `getAll` batch rather than
  one RPC per source. Same <=500 document budget and transaction authorization;
  document billing is NOT reduced just by batching.
- Tradeoff: selected-day closings are read once by the listener and again by the
  status callable. Only the selected day is queried, with no polling or history
  scan. This extra day-sized read buys earlier trustworthy rendering. Empty days
  do not call the status backend. Partial day results never replace full export
  coverage. No paid warm instances, Rules/index changes or accounting changes.
- Test coverage includes selected-day query filtering/server confirmation, late
  responses, status failure/revoked access, immutable snapshots, and real `getAll`
  execution plus query allow/deny cases in the CI demo emulator.

Long-list rendering and other navigation bottlenecks remain unmeasured on the
user's device; this targeted fix must be practically checked before claiming the
app-wide slowness is resolved.

## Party-list rendering follow-up — 2026-10-24

User confirms the archive release is better but requests further speed work.
Inspection found a customer FlatList with scrolling disabled inside AppShell's
ScrollView, and merchant cards created with an unbounded map. Both prevent a
bounded list viewport from doing useful incremental rendering.

- AppShell has an optional single-scroll-owner FlatList path; existing screens
  retain their original ScrollView path. The header/search/summary scroll with the
  list, safe-area/footer clearance is preserved, and customer form overlays stay
  outside the scrolling header. Authorization errors hide both rows and overlays.
- Customer and merchant directory screens pass their complete filtered datasets,
  not truncated pages, to the list. Initial render target 12, batch size 8, viewport
  window 7; no fixed-height assumptions or clipping of variable-height RTL rows.
  Session-key changes remount the viewport so prior-space cell state is discarded.
- All existing totals still use complete authoritative snapshots. No changes to
  Firestore queries, listeners, local business persistence or write acknowledgement.
- Merchant filtering/sorting is memoized. Balances are grouped by merchant once,
  rather than scanning the full balance array for each rendered merchant card.
  Currency order, exact amounts and the full summary calculations are unchanged.
- A bounded mock-viewport contract with 1,000 records checks full dataset delivery,
  12 initial cards, access to row 1,000, routing, totals, languages, loading/errors,
  viewer controls, session key and footer. This verifies wiring/CPU-work counts,
  NOT actual React Native/Web frame rate, scrolling or phone timing. Practical
  scrolling, search, keyboard and modal acceptance is still required before merge.

No backend, Rules, index, scheduler, accounting, APK/EAS or paid-resource changes
are part of this follow-up. It targets list rendering, not proven network latency.

## Debt/settlement save follow-up — 2026-10-24

User reports long confirmation waits for creating debts and settlements. The
separate 30 + 10 cash entries in the screenshot match the immutable original
payment plus its current-period correction. A regression now reproduces 100 debt,
30 payment, edit to 40: remaining debt 60, journal original settlement 30 plus
cash adjustment 10, total cash 40 (not 50). This is a synthetic test, not proof of
the user's actual balance; user confirmation was requested.

Read-only metadata confirms database nam5 and deployed functions us-central1.
Aggregate recent successful POST logs (small last-24h sample, before this change)
show 2 debt requests ~1.43–3.28s, 4 settlement requests ~0.26–3.98s. These are
server request timings, not phone end-to-end timings or proof of a sole cause.
No amounts, identities or raw request payloads were collected into this report.

- Debt creation/update loaded six independent documents with six sequential
  transaction get RPCs. Use one transaction getAll with exactly the same read set.
- Settlement already overlapped its reads, but used seven independent document
  RPCs plus the debt query. Use one getAll alongside the unchanged complete debt
  query. Customer-credit reads/validation, financial planning, write set, receipts,
  auth/role/space/customer checks and transaction retries are unchanged.
- Same number of billed document reads; no financial shortcut, local fallback,
  optimistic success, region move, paid min-instances, query narrowing or indexes.
- Existing idempotency/scope/credit/precision/concurrency suites remain required.
  New tests assert batch membership, unchanged outcomes, replay/conflict rejection,
  and revoked-membership rejection on a transaction retry. Existing CI demo
  emulator exercises both real handlers through customer/merchant scenarios.

This reduces demonstrated read-transport overhead only. Cold starts, mobile
network latency and client subscription/render time may still contribute. Do not
claim a measured end-to-end speedup until the user repeats practical saves.
