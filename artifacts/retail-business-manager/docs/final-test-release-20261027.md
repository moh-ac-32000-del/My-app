# My-app final acceptance candidate — 1.0.1 (Android 2)

Sole repository: `moh-ac-32000-del/My-app`.

Merged #63 (presentation/PDF), #64 (one-action spreadsheet preparation), and
#65 (session live reads/plain-language UI) form the test candidate. The owner
confirmed Push works in practical testing. This does not prove every delivery
condition or replace acceptance of the new APK.

Source cleanup removes obsolete attached prompt text, the historical baseline
tarball, and Replit configuration/metadata from the current tree. These remain
recoverable in Git history; history is not rewritten. Existing application,
Functions, tests, approved specifications and monorepo dependencies stay intact.
Ignore rules keep historical artifacts out of future source/build uploads.
Android package, EAS owner/project, Firebase identity and signing credentials are
unchanged. The version increment distinguishes this candidate from old APKs.

## Release gates

- Review cleanup diff, full CI, then merge with explicit approval and verify main.
- Build exactly one APK from the final merged source after successful checks.
- Deploy the matching web build; distinguish deployment from device acceptance.
- Verify Excel preparation without manual paging, native save/share, and complete
  localized customer/merchant PDF statements. Public merchant PDF must not expose
  customer identities; cancelled entries remain excluded.
- Financial reset is a separate administrative action: inventory the exact
  project/database/accounts, confirm the deletion manifest, block concurrent
  writes, verify deletion, preserve services/Rules/indexes/configuration. Never
  embed an automatic wipe in the application or a deployment hook.
- Cloud protection is separate from build-artifact cleanup: verify billing and
  retention configuration and recovery evidence. Report backups as configured
  only after read-back; do not claim a restore test without performing it.

No new financial arithmetic, database schema, security Rules or business features
are part of this cleanup. A successful build is not proof of final real-device
Excel/PDF acceptance or a guarantee against data loss.
