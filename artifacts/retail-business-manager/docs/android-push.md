# Android Push: connection milestone

> Historical connection milestone below. The next source increment implements the default-off bounded dispatcher and the user-approved **all opted-in active members** policy; see `notification-dispatch-audit.md` for its current architecture, capacity limits, safety trade-offs and rollout gates. No new deployment, FCM/device delivery or APK is implied by that source implementation.

Repository: `moh-ac-32000-del/My-app`. Firebase: `retail-business-manager` (`786943009866`). Android package: `com.retailbusinessmanager.app`.

This milestone implements Android permission/channel setup, authenticated FCM device registration, disconnection, account/workspace-checked tap navigation and a **user-requested connection test**. It does not implement the reminder/daily-follow-up dispatcher. UI explicitly states this; saving the 17:00 preference does not schedule a notification yet. No web/iOS Push is enabled.

## Build configuration

`expo-notifications` is pinned to the Expo SDK 54-compatible range. `app.json` references local `google-services.json`; Git ignores it. The EAS upload allowlist includes **only** this app's config file, not other files with that name. Use the user's existing downloaded Android Firebase config; verify project ID/number/package above before placing it next to `app.json`. It is client Firebase config, not an Admin service-account private key. Do not commit private credentials. No new service-account keys or Expo Push-service credentials are needed: the server uses Firebase Admin's deployed identity and sends directly through FCM.

Do not run another EAS build until the agreed feature batch is complete. Source/web checks do not demonstrate Android runtime behavior. Test permissions, actual foreground/background receipt, tapping, disconnection, account switching and sign-out in the **one combined APK** later.

## Server/privacy/cost

`pushDeviceCommand` requires Firebase Auth and revalidates active workspace membership and store profile in its transaction. Root `pushDevices` records are server-only under existing default-deny Firestore rules. Device IDs are SHA-256 hashes of FCM tokens; raw tokens never appear in client responses, logs or shared messages. Registering the same token rebinds it to the current opted-in account/workspace. Disabling removes its stored token; owners may disable after membership revocation. Android sign-out disables the server registration or invalidates the native token before signing out. If both fail, sign-out remains blocked with an explicit retry message.

No automatic scheduler, background polling, financial reads/writes or continuous sender is added. The new callable scales to zero with one maximum instance. Connection tests are limited transactionally to five attempts per device per UTC day and at least 60 seconds apart; reconnect/disable does not reset that budget. Failed/ambiguous sends consume an attempt and are not automatically retried. FCM acceptance is not proof of delivery. Test bodies contain no customer names, amounts or financial details.

Next milestone: due-only, bounded background dispatch with scoped opt-in preferences, cancellation/tombstone handling, token rotation/expiry and daily follow-up (default 17:00). Evaluate reads/compute before enabling its shared scheduler; never create one job per reminder/user or disable billing for financial operations as a spending guard.

## Follow-up settings hand-off

Android connect now includes the current locally saved scoped follow-up settings (default 17:00, both categories enabled) and the handset's IANA time zone. Saving follow-up settings on an already connected Android device first obtains an authenticated server acknowledgement, then persists locally. Network errors use the existing explicit save-error/retry path. If local persistence fails after server acknowledgement, the save still reports failure; retry repeats the metadata update safely. No offline queue or silent background retry is added. Settings remain device-specific, not shared with another user's devices. The web/iOS implementation remains local-only and never imports native notification APIs.

The server validates the time, booleans, time zone, active membership, device ownership and exact store/workspace. It allowlists preference fields, leaves test-send budgets intact, and never re-enables a disabled device through a settings update. Legacy clients may register without settings; an existing same-scope setting is retained, but is not copied when token ownership/scope changes. Disable removes the settings together with the token.

This is **preparation only**: no scheduler, automatic send, due queue, financial read/write, new Firestore rule/index or EAS build is introduced. The existing UI correctly continues to say automatic delivery is not enabled. Before enabling the dispatcher, implement next-due calculation (including DST/time-zone changes), bounded reads, deletion/payment checks, concurrency/deduplication and token lifecycle tests. Do not infer actual Android delivery from mocked native API tests.
