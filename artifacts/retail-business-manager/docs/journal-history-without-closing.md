# Access to operations without a daily closing

Previously, Home restricted its journal to the current calendar interval, while Archive displayed only saved closing snapshots. An unclosed prior day could therefore become inaccessible from either entry point even though source records remained in Firestore. Archiving is not the persistence mechanism for those records.

The Operation history screen is a separate read-only view of existing source operations. Home links to it, and Archive passes its selected date to it even when no closing exists. It uses the existing daily-journal projection and linked-record deduplication, but does not suppress records merely because their identities appear in a saved archive. This is current source state, explicitly labelled separately from immutable closing snapshots. It does not create an archive, close a period, or change balances.

Historical merchant queries use only the selected store/day interval. Existing authorized customer/debt/payment/cash sources are reused. No local persistence, all-merchant-history scan, background prefetch, extra archive query, backend endpoint, permission or Security Rules change is added. Explicit historical subscriptions do not replace the root session's current-day merchant-journal channel. Leaving the screen, changing date/scope, or losing membership stops/discards the old subscription.

The selected historical calendar uses the workspace policy's active timezone, or the existing prepared workspace timezone/default when automatic closing has not been enabled. Dates are interpreted as local calendar days, including 23/25-hour DST days; invalid/skipped dates fail closed. Source posting timestamps and archive periods are never rewritten.

Regression tests cover prior-day cash, customer debt/payment and noncash merchant purchases after midnight without a closing; half-open midnight boundaries; linked-payment deduplication; source nonmutation; DST/skipped dates; independent dashboard/history subscriptions; late callbacks and membership loss; archive-to-history navigation in Arabic, English and Turkish. These are automated tests, not real-device acceptance.

This fix does not activate automatic closing for an unconfigured workspace or identify the underlying Android merchant-connection stall. Existing activation/catch-up and the separately reviewed bounded-loading handling remain unchanged.
