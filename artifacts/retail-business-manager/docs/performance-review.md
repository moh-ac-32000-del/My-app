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
