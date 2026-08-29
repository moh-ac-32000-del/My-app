---
name: React Native Web alerts
description: Platform-specific constraint for confirmations and outcome messages in critical user flows.
---

Do not rely on `Alert.alert` for confirmations or result messages in critical flows that must work in the web preview. Use an in-app modal shared across all entry points instead.

**Why:** The installed React Native Web implementation defines `Alert.alert` as an empty function, so the press handler appears to do nothing and callbacks attached to alert buttons never run.

**How to apply:** Keep informational alerts only where web behavior is irrelevant. For any action whose execution is gated by confirmation, render a modal and invoke the operation directly from its confirm button.