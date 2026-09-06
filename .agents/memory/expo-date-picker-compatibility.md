---
name: Expo date picker compatibility
description: Compatibility constraint for the native date/time picker in this Expo app.
---

Use `@react-native-community/datetimepicker` 8.4.4 with the current Expo SDK 54 app.

**Why:** The Expo workflow reports a compatibility warning for newer picker versions, even when TypeScript and Metro can bundle them.

**How to apply:** Keep the picker dependency aligned with Expo’s expected version when adding or updating native date/time controls.