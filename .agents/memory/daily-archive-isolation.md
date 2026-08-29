---
name: Cash-closing archive isolation
description: Persistence rules for repeatable immutable cash-closing snapshots and journal filtering.
---

Persist every cash closing as an independent immutable snapshot with its store, local calendar date, and same-day closing number. Never move or delete the source transactions, debts, or payments.

**Why:** Cash closing is an archive boundary, not an end-of-day boundary. A store can close repeatedly on the same date, and later same-day events must remain visible without re-archiving earlier events.

**How to apply:** Give each closing a separate record, exclude current-journal events only when their event IDs already exist in a snapshot for that local date, and never derive cash balances from archive state.