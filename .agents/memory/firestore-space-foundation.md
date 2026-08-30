---
name: Firestore Space foundation
description: Guardrails for the first cloud Space document and its relationship to local business data.
---

Firestore stores only Space ownership metadata at this stage. The document ID is the existing local Space ID, and ownership is the Firebase UID; neither `StoreProfile.id` nor `local-store` is a cloud identity.

**Why:** Cloud ownership must be established without turning Firestore into a sync layer or risking the already-isolated AsyncStorage data when the network or rules fail.

**How to apply:** Keep cloud Space creation idempotent at one document per Space ID, enforce immutable ownership in rules, and treat Firestore failure as non-blocking for local login and local business operations until Cloud Sync is separately approved.