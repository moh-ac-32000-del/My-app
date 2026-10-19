# Workspace management continuation

Repository: `moh-ac-32000-del/My-app` only. Builds on the authorization foundation in PR #52; no new parallel workspace or authentication system.

## Implemented

- Canonical server-verified space/member session, scoped live listeners, read-only Viewer controls, guarded business mutations and screen/provider/query-cache reset on account, space or role transitions. Revoked/unverified sessions clear displayed business state. Old export callbacks cannot repopulate a cleared session cache. Last workspace is a per-account presentation hint, not membership storage or authorization.
- New accounts explicitly choose creating a named private/shared workspace or accepting an invitation; existing accounts restore a valid candidate. Every selected space requires fresh server validation. No silent fallback to a different space after an explicit failed selection. Opening the chooser refreshes canonical names/roles in batches of four workspaces, omitting revoked hints and surfacing connection failures. These are necessary metadata reads, not financial scans or background polling. Invitation navigation intent survives sign-in in memory only and is never accepted automatically or saved to device storage.
- The dashboard button beside notifications opens the workspace list; existing app settings remain accessible through the bottom navigation. Workspace settings and owner-only member/invitation management are a separate screen.
- Trusted metadata-only `workspaceCommand`: create, rename, quota, overview, invite, revoke, accept, role change and member removal. Owner/editor/viewer rules are shared with existing financial commands. No ownership transfer, archive or permanent-deletion buttons are exposed: those require a separately reviewed retention procedure, not a financial cascade delete.
- Creation and private-to-shared conversion serialize against the same user document as legacy bootstrap and transactionally inventory canonical owned spaces. Default limits: one private and two shared, configurable by trusted account fields only. Joined spaces do not count. Every retained owned space counts, including suspended/archived. Legacy bootstrap is also quota guarded. New ISO metadata remains readable by older bootstrap clients; existing Timestamps remain supported.
- Invitation links contain a cryptographically random 256-bit secret in the URL fragment; only its hash is stored server-side. Authenticated acceptance consumes it atomically, with seven-day expiry checked on every transaction retry. Concurrent acceptors cannot both join. A consumed invitation cannot revive removed access or overwrite a later role. Owners issue editor/viewer invitations only; the first invitation converts a private space in place after shared-quota validation. Profile initialization is required before invitations.
- Pending invitation scans exclude expired/consumed records, using a declared composite index. No invitation cleanup scheduler or polling was added. Personal app-language controls remain independent of shared business settings. Existing shared profile edits are disabled for non-owners.

## Verification and disclosure

Unit tests, server-rendered control tests and app/Functions type checks are included. Server-render tests are not Android or interactive browser testing. CI additionally builds the standalone web app, runs direct SDK security-rule tests, and runs the compiled trusted workspace handler against the demo Firestore emulator with actual concurrent transactions (including legacy bootstrap races).

The local Java installation remains Java 8, so the actual emulator run requires CI's Java 21. No successful local emulator, Android, live financial, or newly deployed workspace acceptance test is claimed.

On 2026-10-19 a read-only Firebase Console metadata inspection observed two private active spaces, each with one distinct, matching active canonical owner membership. Both inspected user primary-space pointers and both membership discovery entries also matched their canonical spaces, with active Owner roles. No legacy role or quota override appeared in these inspected records. This is a bounded UI observation, not an automated complete inventory or a promise that state cannot change. No financial collections were opened and no metadata was edited. Revalidate before deployment and confirm owner access after activating new rules. Private account identifiers are intentionally omitted from this document.

## Deployment gate

No rules, indexes, Functions, web bundle, APK/EAS build, paid backup/PITR setting, or financial data change is authorized by this branch alone. Obtain explicit security deployment approval after tests and metadata review. Deploy the reviewed index and trusted backend/rules coherently before activating the new UI. Preserve the existing hosted APK and roll back reviewed application/rule versions if needed; never delete financial data or silently remap legacy roles.

After workspace deployment and practical cross-account acceptance, proceed to the later task (archive calendar, journal details, server automatic closing and eventual removal of manual closing). Those later requirements have not been implemented in this branch. Paid backup/PITR activation stays deferred until shortly before final testing, with cost/retention approval and a separate recovery target.
