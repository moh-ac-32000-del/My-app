---
name: Daily archive isolation
description: Persistence rule for immutable daily-closing snapshots and corruption containment.
---

Persist each closed store-day as an independent immutable snapshot, keyed by store and local calendar date. Never move or delete the source transactions, debts, or payments when closing a day.

**Why:** A shared archive array makes one malformed JSON value capable of hiding every valid historical day, while per-day records allow corrupted entries to be skipped without affecting intact archives.

**How to apply:** New archive features should read snapshots independently, keep duplicate prevention scoped to store plus local date, and treat source business records as separate live data.