---
name: Due-date reminder reconciliation
description: Durable rules for identifying and rescheduling automatic debt due-date reminders.
---

Automatic debt due-date reminders are identified with an internal marker in the optional reminder note field. Manual reminders must remain unmarked, while completed and dismissed generated reminders are retained as history.

**Why:** Reconciliation needs to remove or replace stale pending schedules without deleting manual reminders or historical reminder outcomes.

**How to apply:** Use a local calendar timestamp representation for generated due-date reminders, keep the global reminder time space-local and validated as `HH:mm`, and reconcile pending records when debts or that setting change.