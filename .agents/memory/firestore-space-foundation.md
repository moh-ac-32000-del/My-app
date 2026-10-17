---
name: Firebase authoritative Space foundation
description: Firestore Space membership and trusted commands are the authoritative business-data boundary.
---

Firestore and trusted Firebase Functions are the authoritative platform. A Space is not a local-only namespace; business data must be stored/read from Firestore and all sensitive operations must validate authenticated UID, active membership, and store/workspace identity.

**Why:** The project explicitly forbids local-first behavior and local fallback for business data.

**How to apply:** Keep cloud Space creation idempotent, enforce ownership and membership in rules/backend, and treat Firebase failure as blocking for business operations. Never use local login or local business data as an offline alternative. Do not deploy rules or write production data during this migration without separate authorization.