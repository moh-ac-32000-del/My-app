---
name: Firebase Auth persistence typing
description: How to preserve AsyncStorage-backed Firebase Auth sessions with Firebase 12 in this Expo universal app.
---

Firebase 12 resolves the React Native implementation of `getReactNativePersistence` at runtime, but the universal `firebase/auth` TypeScript surface does not declare that named export.

**Why:** A direct named import fails TypeScript even though Expo Metro selects the React Native implementation correctly. Falling back to plain `getAuth()` on native would silently lose durable session persistence.

**How to apply:** Keep the universal Auth module as a namespace import, narrow it locally to include the React Native persistence factory, and invoke that factory only on native. Use the normal web Auth initialization path on web.