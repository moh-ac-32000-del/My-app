---
name: Animated overlay hit-testing
description: Cross-platform rule for reliable animated menu interaction on React Native Web without changing native touch behavior.
---

Mount interactive menu and backdrop layers only while the overlay is active; do not rely on dynamically animated `pointerEvents` values to control hit-testing. Keep menu rows as normal React Native `Pressable` components and use menu/menuitem accessibility semantics.

**Why:** React Native Web can visually update an animated overlay while retaining stale hit-testing behavior, causing clicks to pass through to content behind it or making the `Pressable` itself non-interactive.

**How to apply:** For animated cross-platform overlays, animate visual properties such as opacity, manage layer mounting separately, and keep any backdrop above content but outside persistent navigation that must remain interactive.