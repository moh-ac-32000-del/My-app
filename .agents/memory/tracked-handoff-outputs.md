---
name: Tracked handoff outputs
description: Packaging rule for repositories that version the handoff ZIP itself.
---

When the handoff ZIP is a tracked repository path, rebuilding it can make Git report a binary change even when every application source file is unchanged.

**Why:** A byte-level ZIP rewrite can change compression metadata or ordering. Treat the archive as an intentional delivery output, and separately verify that no source or configuration files changed.

**How to apply:** Compare the staged package contents with the current source before replacement, exclude the prior ZIP from the new package, and report the archive output separately from source-code status.