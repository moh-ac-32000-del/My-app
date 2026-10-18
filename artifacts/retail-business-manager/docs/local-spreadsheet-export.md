# Local spreadsheet export — My app

Repository: `moh-ac-32000-del/My-app` only. This is a user-initiated XLSX review export for Excel and manual Google Sheets import. It is not a restorable backup, an offline ledger, a new financial source, a Google Drive connection or an automatic upload.

## Zero additional data reads on export

The initial read-only callable proposal was removed before commit/deployment at the user's explicit request. There is no new callable, backend function, Firestore query, refresh, prefetch, subscription or scheduler in the export path. Existing customer/debt/payment/cash listeners copy their already-delivered full collection snapshots into a bounded in-memory session cache. Metadata events are included on those same listeners so a server-confirmed empty collection is distinguishable from an incomplete cache result; this does not add another subscription. Existing screen loading, reconnects and ordinary synchronization can still incur normal Firestore reads. No claim is made that the application as a whole is free of reads.

Archive list responses already requested by normal application screens are copied too. A single newly closed archive response is not treated as a full archive list. Store-specific archive coverage is checked independently from workspace-wide collections. No reads are performed to fill gaps when exporting.

Each account/workspace is isolated. Snapshots received from cache only, pending writes, unknown metadata, terminal errors and over-limit sections are not treated as complete source sections. The UI shows which of five sections are missing and disables export until all are available. It does not silently substitute zero or export the first subset. Existing screen visits are needed to receive missing sections and those normal visits can incur reads. The cache is session-only, not a durable local backup; restarting/signing out requires receiving sections again. Authentication transitions clear the cache before exposing the new session, and late old-account callbacks cannot populate another account's cache.

Data from different sections may have different capture times. The file lists each time in UTC and its export creation time separately. It is **not** an atomic or guaranteed-current Firebase snapshot. No live membership revalidation is performed by the export button; it copies only data already delivered under the existing application's access rules. There is no new server-side owner/admin export permission claim. Firebase remains the financial source of truth.

## Contents and validation

Eight sheets: export details, customers, debts, payments, cash movements, closings, closing events and recorded closing cash balances. Deactivated customers are captured before the existing UI filter; settled debts are not omitted. Optional missing original debt amounts/legacy closing balances remain unavailable, not fabricated zero. Amounts are copied from stored records; different currencies are never summed or converted. Cash movements, payments and closing events are distinct views and must not be summed together. No financial calculation implementation is changed.

There is a 1,000-record limit per captured section, 10,000 expanded archive rows and a bounded projected payload. Invalid/mismatched records and unsupported dates fail the export rather than disappear from it. The file intentionally excludes authentication data, passwords, Firebase keys, Push tokens, membership lists and internal receipts. It is not suitable for full application restoration.

Workbook text is explicitly typed as strings, including formula-looking names/notes, phone numbers and IDs. No formulas, hyperlinks, macros or external connections are generated. Amounts remain numeric. Date-only cells and UTC timestamp cells are numeric Excel dates with explicit formats. Headings support Arabic, English and Turkish. SheetJS 0.20.3 is pinned to the publisher's official CDN tarball with SHA-512 integrity in pnpm-lock.yaml; no stale npm-registry SheetJS build is used.

## Saving and confidentiality

Explicit inline confirmation warns that the file is readable, unencrypted financial/personal data. Android uses the system folder chooser, creates a new file and verifies full read-back before reporting success. A failed write only attempts to remove the newly created incomplete file, never an existing user file. A storage provider that refuses verification results in failure, not a false success. Device/provider support determines available USB/SD folders; the user can also move the saved file later. No broad storage permission is requested.

iOS opens the share/save sheet and reports only that handoff, not confirmed retention. Its temporary app-cache copy is removed afterward. Web requests a normal browser download and does not claim download completion. Scope/account guards stop stale exports before file operations. Test native APIs are mocked; actual Android directory/USB/SD behavior must be checked in the single combined APK later.

For Google Sheets the user manually uploads the local XLSX to Google, with the associated disclosure of its contents. There is no automatic transfer or account integration. Keep copies outside the phone in secured storage. XLSX export does not replace the postponed Firebase backup/PITR plan or the separately pending encrypted/restorable local backup feature. No EAS build or paid cloud protection is enabled by this change.
