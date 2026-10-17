---
name: Firebase-only business data guardrails
description: Mandatory rule for removing legacy local business persistence and using Firebase as the only source of truth.
---

Firebase/Firestore is the only source of truth for all business data. Do not preserve AsyncStorage as a business persistence boundary and do not introduce local-first repositories, fallback paths, dual writes, or local business Backup/Restore.

**Why:** The project has explicitly moved to Firebase-only business data. Legacy local business data is test data and does not need migration or preservation.

**How to apply:** Audit every AsyncStorage/localStorage access and every Firebase-configured/local-mode branch. Keep only explicitly approved non-business UI preferences local; authentication comes from Firebase Auth, and a local Space ID is only a navigation hint. When Firebase is unavailable, show an actionable error and do not report success.