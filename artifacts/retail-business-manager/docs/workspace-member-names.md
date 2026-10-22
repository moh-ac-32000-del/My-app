# Per-workspace member names

Approved scope: My-app only; one user's display name is independent in each workspace. This is a new source change after the combined APK build, NOT included in APK `fd82f359-eabc-45f8-a507-a2ec6037d75a`. No new APK or Firebase deployment in this PR.

## Behavior and identity

- New create/join forms ask for a 1–40 character name. Existing members are prompted to confirm their name within the currently verified space. Arabic, Turkish and English UI supported. Names normalize NFC/whitespace, rejecting controls/bidi overrides. No automatic Auth name/email fallback.
- Names live only in canonical `spaces/{spaceId}/members/{uid}`, never local storage or a parallel identity system. Only the authenticated user can confirm their own name, including Viewer; no role/permission/financial fields are changed. Confirmed names are stable in this increment: no rename UI is introduced. Rejoining cannot replace a confirmed name or historical attribution. Older clients can still create/join without this optional field; the new UI asks those members to complete it later rather than breaking existing financial commands.
- The UID remains the attribution and authorization key. Names are labels, can be identical, and never prove permissions or legal identity. Small name text uses a stable space/UID-derived color independently of the operation type. Colors are visual assistance, not a guarantee of globally unique hues or an identity proof.
- One shared, in-memory, session-scoped member directory (maximum 500, overflow explicitly fails) serves all visible rows. One coalesced refresh per unknown actor/session plus manual refresh in workspace settings; no request per operation and no polling. Scope/account/role changes remount it and stale async results are discarded. No device financial/identity fallback.
- An active member can read confirmed names/UIDs only, not emails, invitation tokens, roles or quotas through the directory action. Former member names remain readable to still-authorized members for historical attribution; removed users themselves cannot read it.
- Cash/debt/payment projections retain existing server-created author UIDs; transaction normalization now retains that optional metadata. New archive snapshots copy author UIDs from existing sources. No amounts, cash effects, grouping, time boundaries or old archived records are recalculated/rewritten. Old snapshots without an author cannot be reconstructed reliably and show an unnamed label; no actor is invented.
- Name badges appear in customer debt/payment histories, merchant rows/details, daily journal and archive event lists. PDFs/WhatsApp exports are unchanged; no employee/customer disclosure added to external merchant statements.

## Compatibility, verification and rollout

- No Firestore Rules, indexes, financial arithmetic or production records changed. Named member fields remain protected by the existing default-deny membership writes; new trusted self-metadata action grants no general Viewer business-write permission.
- Future reviewed rollout needs `workspaceCommand` plus matching web/client source, and `dailyArchiveCommand` / `automaticDailyClosing` to preserve the new optional author metadata in future snapshots. Existing published APK remains unchanged. No permission to deploy or build another APK is inferred from this PR.
- Tests cover scope separation, current canonical authorization, Viewer self-name only, forged target/role fields, normalization, no Auth email/name leakage, create retry payload mismatch, immutable confirmed name/rejoin, directory overflow, stable badge rendering/escaping/localization and existing journal/financial regressions.
- Additional real demo-Firestore emulator tests are attached to the existing workspace integration job: name isolation, Viewer directory access, concurrency, revocation, retained attribution and unchanged financial fixtures. This is not live Firebase or physical Android testing.

## Known limits

- No full audit-log UI or new edit-history system is created; the badge identifies the creator stored on the existing source operation, not every past edit. Existing old records without reliable author metadata remain unnamed.
- Directory failures never display an Auth email, another space's cached names, or a success claim. Labels remain unnamed until verification succeeds; settings provides an explicit refresh.
- Confirmed-name correction/rename and custom color selection are outside this focused increment; do not silently rewrite member names or old financial snapshots.
