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

## Product decision required before recipient binding

The user was asked whether reminders/daily follow-up should reach every active member who opted in on their own device, or only the reminder creator. Do not silently choose recipients. The second option additionally requires a clear policy for overdue debt summaries and legacy/generated rows without a meaningful creator. This choice affects privacy, fan-out and cost, not the existing read permissions inside the workspace.

## Remaining implementation gates

1. Apply the confirmed recipient rule and time ownership; derive due work even if no client opens the notification screen. Persist due metadata in a server-owned bounded queue rather than poll all financial history for every device every minute.
2. One shared scheduled dispatcher, explicit per-run/query/send caps, fresh authorization and payment/deletion checks. Keep all business data in Firebase and do not change debt/cash arithmetic.
3. Atomically claim stable scoped delivery identities before calling FCM. Provider acceptance, device delivery and ambiguous network outcomes are distinct; never promise exactly-once external delivery or retry uncertain sends blindly. Rebinding, revocation, disabling and token expiry must not leak another user's financial details.
4. Test real Firestore concurrency/deduplication and source-change races on the demo emulator, plus provider errors with controlled stubs. Document bounded cost and any deliberate delivery limits. No new live schedule is enabled by this branch alone.
5. After CI/review, obtain the scoped deployment approval and a fresh secure Firebase CLI session when needed. The previous grant was revoked by the user; never reuse or print credentials from prior logs.
6. Actual Android receipt/tap/sign-out/background tests remain part of the one combined final APK, not an excuse to consume another Expo build now. Keep web support text truthful.

Cloud backup/PITR activation and the combined APK remain the next later release tasks. The user's manual-closing change was cancelled because automatic closing replaces that control; do not resurrect it in this task.
