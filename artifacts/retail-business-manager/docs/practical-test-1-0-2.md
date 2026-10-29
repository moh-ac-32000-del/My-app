# Practical test candidate 1.0.2 (Android code 3)

Includes the reviewed statement layout, bounded merchant loading with retry,
removal of manual closing UI, and read-only journal history from main.

Before enabling scheduled notifications, both registration/preferences and every
dispatch now derive their zone from the authorized canonical workspace document.
An active automatic-closing transition takes precedence over prepared settings;
a fresh workspace uses the existing Europe/Istanbul default. Handset zone inputs
remain accepted for compatibility but cannot control server scheduling. Invalid
workspace clock metadata fails closed. Daily hours and opt-in behavior are unchanged.
The dispatch resolves the clock again before sending, including older registrations.
No additional Firestore reads are introduced: the workspace is already read for access.

Deployment is separate from source merge. The existing five-minute due-device
dispatcher remains unchanged; this release does not implement Cloud Tasks. A clock
change is reflected at the next queued inspection, without waking all devices on
every workspace write. No financial records or archive snapshots are modified by
the notification code. Device enrolment remains explicit after a data reset.

Full test-data reset requires a fresh exact document/account manifest, verified
backup protection and bounded deletion. Cloud infrastructure, backup retention,
signing credentials and developer identities must be preserved. Do not reuse an
earlier reset's counts or manifest. Record actual deployment, reset verification
and EAS build identity outside source; source merge alone proves none of these.
