---
name: Space identity and Firebase authority
description: Firebase Auth and Firestore are authoritative; local Space identity is only a non-authoritative routing hint.
---

Firebase Auth is the source of authentication truth, and Firestore is the only source of truth for business data. A locally stored active Space ID may be used only as a navigation/cache hint; it never proves authentication, membership, or authorization and must never select a local business-data namespace.

**Why:** Local business namespaces and local fallback behavior are prohibited by the current architecture decision.

**How to apply:** Resolve the active Space from authenticated cloud membership, validate membership and store ownership on trusted backend operations, clear in-memory business state on account transitions, and do not read/write local business-data keys. Legacy local business data is disposable test data and does not need migration.