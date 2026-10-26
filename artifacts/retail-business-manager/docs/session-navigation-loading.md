# Navigation loading and plain-language copy

The user reports that routes open immediately, followed by a data spinner, on
Android and desktop web. Inspection found that the merchant directory and Home
journal/archive listeners were recreated after each route unmount. This change
retains those three live queries after first use for the current authorized
workspace session. It does not prefetch them at login or load merchant histories.

The application-root provider owns the lifetime. Account/session, workspace,
store, role, authorization/loading/error transitions replace the pool and stop
the old listeners. Query keys include refresh tokens and the journal financial
window. Each channel holds at most one query. Permission errors discard values;
late callbacks cannot republish cleared or replaced entries. Existing services
still enforce server-confirmed snapshots and unchanged document validation.
No persisted business cache, optimistic write, financial arithmetic, backend,
Rules or indexes change. A retained listener continues receiving updates while
the user is elsewhere in the app, so those updates can incur normal reads; this
is not a promise of zero reads or lower billing in every workload.

The lifecycle regression verifies one source subscription across 100 simulated
route remounts, live updates while detached, errors, query replacement, cleanup
and late-result isolation. These counts are not device latency measurements.
First load, individual merchant history and archive-day loading still require
their existing server requests. The change does not claim to resolve every
source of latency; actual Android/web acceptance remains pending deployment.

User-facing Arabic, Turkish and English copy no longer names Firebase/Firestore.
Internal identifiers and technical documentation remain intact. Copy retains
export usage/cost consent, incomplete-export restrictions, local-file limitations
and the distinction between push request acceptance and actual delivery.
