---
name: Local persistence guardrails
description: Constraints for evolving the retail manager's local persistence without premature architecture.
---

Keep the AsyncStorage boundary as a very small set of direct read/write functions. Do not introduce repositories, dependency injection, adapters, factories, or a broad data layer merely to prepare for a future Firebase replacement.

**Why:** The current phase is only isolating local persistence from UI state; premature abstractions would expand scope without serving current behavior.

**How to apply:** Add a schema version only when a concrete current-data migration cannot be handled safely by the existing normalization logic. Otherwise keep stored profiles versionless and validate them at runtime.