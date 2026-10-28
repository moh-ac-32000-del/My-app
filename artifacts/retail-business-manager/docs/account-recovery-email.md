# In-app email account recovery

## Scope

Add **Forgot password?** to the existing My-app sign-in screen. The recovery
view requests only the account email, clears the password draft and uses
Firebase Authentication `sendPasswordResetEmail`. Firebase's hosted action page
handles the reset code and new password. The app never receives the reset code
or chooses the user's new password, never creates a replacement user, and never
changes a workspace, membership or business record.

Use the app's Arabic, Turkish or English language for both the UI and the reset
email. Keep the existing sign-in/create-account flows, appearance controls and
language controls. Returning from recovery opens the existing sign-in view.

## Request and privacy behavior

- Require an email, not a password, for recovery.
- Send only on an explicit button press. Seal a pending request with a ref to
  avoid duplicate messages from repeated taps. Lock email/mode/language controls
  while sending. Editing the email clears any previous recovery message.
- Show a conditional confirmation: if the address belongs to an available
  account, a recovery email will arrive. This does not confirm account existence
  or inbox delivery. Preserve the same message when old project configurations
  return user-not-found or user-disabled; don't expose public account lookup.
- Network, invalid-email, configuration and throttling errors remain errors.
  Do not claim success after a failed request or automatically retry an uncertain
  email request. Haptic feedback errors cannot overturn the Auth result.
- No new storage, dependencies, credential logging, Firestore reads/writes,
  Cloud Functions, Rules, indexes or native modules.

## Phone recovery is deliberately separate

The owner chose to finish email recovery now and discuss phone costs before
implementing it. Phone sign-in is currently disabled and no verified phone is
linked to the reported account (read-only check; no number retained here).
Do not enable the phone provider, SMS regions, paid SMS, or add an unverified
phone-to-email recovery shortcut. Future phone recovery must prove ownership of
a previously linked number and preserve the original Firebase UID/memberships.

## Validation and rollout

Tests cover localized SDK requests, conditional account-status handling, email
only recovery, clearing a previous password, pending-request deduplication,
network failure/retry, returning to sign-in and absence of account creation or
sign-in from the recovery action. Tests use fake addresses and never send email.
Run app TypeScript, full tests, Expo configuration, web build and CI before merge.
The separately authorized live reset request was accepted by Firebase; inbox
delivery and completion of the reset remain user-confirmed steps. No live
password was inspected or changed by the agent.

No APK build or deployment is part of preparing this change for review.

## Primary references

- https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email
- https://firebase.google.com/docs/reference/js/auth#sendpasswordresetemail
- https://firebase.google.com/docs/auth/web/phone-auth
- https://firebase.google.com/docs/auth/limits
