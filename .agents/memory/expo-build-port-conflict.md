---
name: Expo build port conflict
description: The Expo static build script is fixed to Metro port 8081, which can collide with the mockup sandbox workflow.
---

The Expo static build cannot start its temporary Metro server while the mockup sandbox is occupying port 8081.

**Why:** The build script probes and downloads from localhost:8081 and does not expose a port override; the mockup sandbox commonly uses the same port.

**How to apply:** If a static Expo build reports that `npx expo` needs another port in non-interactive mode, treat the first failure as a workflow port collision and free the mockup sandbox port before retrying. This does not indicate an application bundle error.