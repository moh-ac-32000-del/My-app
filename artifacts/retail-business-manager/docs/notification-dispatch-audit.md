# Task 7 — notification dispatch audit and timing regression gate

Repository: `moh-ac-32000-del/My-app` only. 2026-10-22.

This branch starts the next approved release task, not an optional feature. It is stacked on the verified automatic-closing PR #59 until that PR is accepted/merged. No closing behavior, existing financial records, deployed settings, device registration or actual sender is changed by this timing/audit increment.

## Findings from actual source

- `pushDeviceCommand.ts` registers, disconnects, synchronizes preferences and sends an explicitly requested connection test. It has no reminder dispatcher. Test provider acceptance is not proof of Android receipt while closed.
- `reminderCommand.ts` currently creates generated `system:due-date` reminders in `listAndReconcile` when an Owner/Editor loads the list. A Viewer list is genuinely read-only. Simply adding an FCM timer over the current reminders would miss due debts if nobody opened the screen.
- Generated reminders contain a local wall-clock string without UTC offset (`YYYY-MM-DDTHH:mm:00`). Explicit manual reminders can contain an absolute instant. A server must not parse a wall-clock value using its own machine timezone or silently re-date existing reminder documents.
- The standard due-date reminder preference defaults to **09:00**. The separate daily follow-up preference defaults to **17:00**, with overdue-debt and unhandled-reminder categories enabled. These are two different settings, not an accidental conflict to resolve by overwriting one.
- Follow-up preferences and the handset IANA zone reach the server on authenticated Android connect/update. The due-date notification-time preference is not currently included in that handshake. Preserve saved user choices; any additional hand-off must be explicit and tested.
- Reminder deletion uses a tombstone (`deletedAt`, dismissed status). Existing completed/dismissed/deleted generated reminders must suppress automatic re-creation/sending. A later settlement must suppress delivery, not manufacture a financial write.
- Device identity is a hash of the FCM token. Disable strips the token/preferences. Scope changes can rebind a token to another account/workspace. Before transmission the sender must revalidate active canonical membership, store and device ownership/current scope; notification bodies should not contain customer names or amounts.
- Web/iOS use the non-native implementation and do not request native Push permissions or register devices. The in-app notification center exists on web; background web Push is not implemented and must not be claimed as available.

## Implemented here

`data/notificationSchedule.ts` computes explicit-IANA-zone UTC slots without I/O. It preserves absolute manual reminder instants, resolves existing generated wall-clock reminders explicitly, rejects invalid/rolled/skipped dates instead of guessing, and reuses the reviewed DST policy (first repeated minute; first valid minute after a missing minute). Daily advancement is strictly future; a worker must claim its persisted due slot before advancing it. This is not a receipt, delivery or scheduler implementation.

`tests/notification-schedule.test.ts` covers server-zone independence, Turkey/17:00, UTC offsets with minutes, ±date boundaries, missing midnight, DST gaps/repeated times, a skipped whole local date, malformed input and exact-time retries. No Firestore reads/writes or FCM requests occur.

## Confirmed recipient decision — 2026-10-22

The user selected **all members**. Reminders and daily follow-up target every currently active Owner, Editor or Viewer who explicitly enabled notifications for that account/workspace on their device. Membership alone does not enroll a phone. Reminder creator is not a delivery filter. Revalidate canonical membership, workspace, store and device scope before external sending.

## Second increment — bounded server queue and Android hand-off (not deployed)

- `notificationPlan.ts` derives outstanding-debt due events without creating reminder documents or depending on someone opening the notification screen. Completed/dismissed/deleted generated reminder markers suppress that event. The separate overdue category reflects the still-unpaid debt; dismissing an individual reminder does not silently disable the user's daily overdue category.
- `notificationDispatch.ts` queries only due, enabled, version-1 device registrations. It reads at most 500 outstanding debts and 500 pending reminders per eligible device, plus direct completion/deletion markers for those due debts. It does not scan old paid debt or completed reminder history. Existing source scope/format problems and lookahead overflow fail closed.
- Source write triggers on debts/reminders coalesce wake-ups in the server-only device queue. They never write financial records. Transient Eventarc wake retries expire after 15 minutes; permanent fan-out overflow is acknowledged, not retried forever. A later daily check is a catch-up path if a source event expires; exact-time delivery is not guaranteed.
- One shared five-minute dispatch schedule, at most 5 devices per run and 20 newly claimed event identities in one grouped notification per device. Larger due queues wait subsequent cycles. Workspaces with more than 500 opted-in device records require a reviewed fan-out change; do not silently truncate them. These are explicit initial capacity limits, not a universal five-minute delivery SLA or a billing ceiling.
- Stable server-only receipt IDs include device, user, workspace, store and source identity/local follow-up day. Claims are transactional; cancellation, payment, membership and token revision are checked again before handing a generic message to FCM. Short in-flight claims prevent a wake-up from overwriting an active send. No customer name, note, amount or balance is put in the OS payload.
- Receipts prevent repeated application-level send calls, including after provider errors/uncertain outcomes. A crash after reservation can lose that attempt; it is not blindly resent. FCM/transport/OS behavior is external and is not guaranteed exactly-once delivery. Deterministic Android notification tags reduce replacement duplicates. Accepted/failed/cancelled/uncertain states are distinct; privacy and no-repeat safety take priority over claiming delivery that was not proven.
- Three processing failures pause that device and surface a problem through authenticated status; reconnect resets processing state but does not erase delivery receipts/test budgets. Expired FCM tokens are disconnected only if the same registration revision is still current. An older failed send cannot disable a newly rebound token.
- Old connection-test-only registrations are **not** auto-enrolled. New Android explicit connect sends scheduled version 1, existing reminder-time preference, follow-up preferences and handset IANA zone. Status says scheduled-enabled only when that registration and `NOTIFICATION_DISPATCH_READY` are both active. Preference updates alone do not upgrade an old registration. Token rotation does not request permissions or rebind another account/workspace.
- Reminder-time changes acknowledge the connected Android server preferences before local success. Web/iOS remain non-native; in-app reminders remain available, background web Push is not implemented. Localized connection/status/support text is available in Arabic, Turkish and English.
- New source registration: `notificationDispatch`, `notificationDebtChanged`, `notificationReminderChanged`; existing `pushDeviceCommand` extended compatibly. `NOTIFICATION_DISPATCH_READY` defaults false and gates the schedule and both triggers. No deployment/flag change occurs in this source branch. Four composite indexes are added; default-deny Rules already protect delivery receipts, with direct-SDK regression cases. No Rules changes.
- Tests add controlled-provider queue/lifecycle/race coverage and actual demo Firestore handler concurrency tests. Neither is live FCM acceptance or physical Android delivery; those remain for the one combined APK.

## Remaining implementation gates

1. Finish source/CI/security review, including real Firestore concurrency and Rules regression results. Keep the PR source/CI state separate from deployment and physical delivery.
2. Obtain scoped deployment approval for the three new functions/triggers, the device command update and four indexes; review event-read/compute cost. There is one shared job, not a job per device or reminder. Necessary authorization/source/receipt reads and trigger invocations still cost usage; do not promise zero fees or use a hard spending cutoff that stops financial operations.
3. Use a fresh secure Firebase CLI session when approved/needed. The previous grant was revoked; never reuse/print credentials from prior logs. Deploy gated off first, verify indexes and revisions, then enable in an isolated opt-in test. Do not enroll old tokens or change existing financial data.
4. Actual Android receipt/tap/sign-out/background tests remain part of the one combined final APK, not an excuse to consume another Expo build now. Web background Push remains unsupported. Restore/backup protection and final release decisions remain separate tasks.

Cloud backup/PITR activation and the combined APK remain the next later release tasks. The user's manual-closing change was cancelled because automatic closing replaces that control; do not resurrect it in this task.
