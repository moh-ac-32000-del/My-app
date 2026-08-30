---
name: Local Space identity
description: The boundary between Firebase account identity and the unchanged local store data model.
---

Space identity is separate account metadata: a Firebase UID maps to a generated Space ID in its own local AsyncStorage entry. It must not replace `StoreProfile.id` or any business entity `storeId`.

**Why:** Space identity is groundwork for later isolation, but this phase explicitly forbids migrating, rewriting, deleting, or cloud-syncing existing business data.

**How to apply:** Resolve the identity after Firebase Auth restores a user, retain it across sign-out, and keep all current business and backup operations scoped to the existing local store identity until a separately approved isolation migration.