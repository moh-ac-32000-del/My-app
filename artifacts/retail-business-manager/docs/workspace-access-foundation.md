# My-app workspace access: foundation and release gates

This document records the original authorization-only stage of PR #52. The reviewed continuation is documented in [workspace-management.md](workspace-management.md); its implementation supersedes the client/management items marked not yet implemented below, without removing deployment and practical-test gates.

Repository: `moh-ac-32000-del/My-app` only. This change is the authorization foundation, not activation of the complete workspace feature. No financial calculation implementation is changed. No live financial data, memberships, rules or functions have been deployed/migrated by this change.

## Approved contract

One canonical Space boundary across existing/future business sections, with separate user/space/store/entity IDs. Exactly one owner; editor can perform existing permitted business operations, viewer is read-only. No admin/manager/cashier or per-section permission system. Only the canonical owner manages workspace settings, ownership, members and invitations. Existing financial validation/idempotency/closing rules remain authoritative.

Free ownership limits are one private and two shared spaces per account; joined memberships do not count. Active, suspended and restorable archived spaces count. Future per-account plan limits must be trusted server configuration, not UI-only constants; no payments/subscriptions now. Creating/converting spaces must use a per-owner transactional quota boundary so concurrent devices cannot exceed limits. Private-to-shared must preserve IDs/data. Do not activate creation/invitations before those quota transactions and safe existing-data reconciliation are implemented.

Invitations last seven days, are authenticated/non-owner-only, revocable, and accepted through a trusted transaction. The user confirmed single-use acceptance after sign-in: the holder of the link may accept once, after which the invitation is consumed. Do not require an email binding that the user has not requested. Competing accounts must not both consume one invitation. A retry by the accepted account must not duplicate membership, revive removed access or restore an outdated role. Expiry must be checked at use time; no per-invitation scheduler is needed. Invitation handling is not activated in this foundation. Hard deletion/ownership transfer require a separate reviewed retention/quota procedure, not a financial cascade delete in this phase.

## Implemented in this branch

- Single shared owner/editor/viewer policy imported by the client membership validator and trusted backend. Unknown/missing/legacy roles fail closed; discovery hints and request-supplied role fields never grant access.
- Financial writes use freshly read canonical membership inside their existing transactions, including before idempotent replay responses. Cash/debt/payment/settlement arithmetic and receipt comparisons are unchanged.
- Closing authorization now reads space/member/profile in the closing transaction and is refreshed on retry. Listing remains a separate read path.
- Reminder mutations and automatic reconciliation now include canonical authorization in the same transaction as their writes. Viewer listing reads stored visible reminders without generating/rescheduling/deleting anything. Existing automatic due-date, completion and tombstone semantics remain; writes are bounded to 450 and all reads precede writes.
- Existing store profile reads work for all three roles; creation/update of shared business settings requires an active owner membership and matching `space.ownerUserId`.
- The customer's direct Firestore write path is limited to owner/editor in draft security rules. Reads require a known active role and active space. All existing direct financial/member/space write denials remain.
- Personal Push connection/preferences remain scoped to the authenticated member's own device, including for a viewer; this grants no business write capability. Disconnection remains possible after removal so sign-out can revoke its token.
- New debt creation/edit/settlement metadata records the authenticated updating actor; closing records include the authenticated closer. Existing creator IDs/history are not overwritten or deleted.

## Legacy transition: no automatic privilege grant

`assessMembershipRoleTransition` only classifies records; it performs no I/O or writes. Valid owner/editor/viewer records stay unchanged only when consistent with the canonical single owner. Old roles, missing roles, suspended/malformed records and ownership inconsistencies require review. In particular, never map admin/manager/cashier to editor silently and never demote the canonical owner.

Before any deployment: inventory **only workspace/membership/discovery metadata** in the target project, reconcile existing canonical owner records and indexes, and obtain explicit approval for any necessary mapping. No financial documents or IDs are moved. Any eventual migration must be dry-run-first, idempotent, transactional and auditable; no migration script is executed here. Roll back by restoring reviewed authorization versions, not by deleting memberships or financial data.

## Verification and remaining release gates

Unit tests cover all business mutation boundaries, forged request roles, unknown/legacy roles, owner/editor success, viewer denial, revoked/cross-space membership, conflict retries after downgrade, denied replay after downgrade, owner-only settings, suspended spaces, actor metadata and viewer reads with zero writes. Rules tests use a **demo-only local emulator** and cover direct SDK writes, role downgrade/removal on the same device with stale discovery, cross-space isolation and retained historical data. No emulator test is permitted against production.

The available local Java is 8; Firebase CLI 15 requires Java 21, so local emulator startup failed before testing or touching any database. The existing GitHub CI rules job installs Temurin 21 and must pass before this branch is considered validated. No local emulator success or real-device/live-Firebase testing is claimed.

Not yet implemented: live role observation/read-only UI, safe permission-error cache clearing across every screen, workspace selection/last-active behavior, transactional ownership quotas/create/rename/convert, invitations/member management, and safe archive/transfer/delete workflows. The current initialization still auto-bootstraps one primary space and rejects multiple active memberships. **Do not activate invitations or deploy this foundation alone as a complete multi-user release.**

No APK/EAS build, automatic Push dispatcher, paid backup/PITR setting, scheduler, migration, Functions deployment, rules deployment or web deployment is included. Do not claim zero overall Firebase reads: canonical authorization and transaction retries incur necessary normal reads; draft rules now also check the active space document. No polling across all financial spaces or new scheduler is introduced. The existing local XLSX export remains unchanged and adds no export-triggered reads.
