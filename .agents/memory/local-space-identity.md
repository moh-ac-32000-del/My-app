---
name: Local Space identity
description: The boundary between Firebase account identity and Space-namespaced local business data.
---

Space identity is separate account metadata: a Firebase UID maps to a generated Space ID in its own local AsyncStorage entry. The Space ID selects the local business-data namespace but must not replace `StoreProfile.id` or any business entity `storeId`.

**Why:** Multiple Firebase accounts can use the same device, so unscoped business keys leak one account's local data to another. Legacy `local-store` data has no trustworthy owner and must remain untouched outside all Firebase Space namespaces.

**How to apply:** Resolve the identity after Firebase Auth restores a user, select its Space namespace before any business read or write, clear only in-memory business state on account transitions, and leave legacy keys unmigrated and undeleted.