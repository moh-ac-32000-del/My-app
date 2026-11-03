# Android notification registration diagnosis — 2026-10-27

The installed 1.0.1 APK reports the same internet/update error after several
unrelated failures. The owner confirms internet access and that the error follows
Connect; Wi-Fi is unavailable for comparison. The exact handset failure remains
unconfirmed, so do not claim a native connectivity or delivery fix.

Read-only checks found the deployed registration function active, no recent
registration requests in the queried logs, the expected native Firebase config,
initialization provider and messaging service in the actual APK, and the required
APIs enabled. A single temporary installation using that public config registered
successfully from the workstation and was immediately deleted. This is not a
phone/FCM token test. No financial/Auth records, API-key restrictions or Rules
were modified. The deployed scheduled-dispatch flag is false; this is separate
from connection-test registration and must not be silently activated here.

The focused client change preserves the operation stage through error handling:
channel initialization, permission check, native token, settings/timezone,
registration, local metadata and status verification. Existing explicit account,
workspace and test-rate errors get specific messages. A failed permission API
is distinct from the user denying permission. Arabic, Turkish and English copy
never displays raw provider text, device tokens or user identifiers.

No retry loop, altered registration protocol, automatic permission request,
financial behavior or cloud flag change is introduced. Original error messages
remain available to existing callers; UI renders only an allowlisted reason.
Existing compensation for local save failure remains intact.

Tests simulate native failures before network registration, server rejection,
permission states, nested status errors and retained connection safety. No new
APK or deployment is part of this diagnostic PR. The installed APK continues to
show its old message until the next approved combined APK release.
