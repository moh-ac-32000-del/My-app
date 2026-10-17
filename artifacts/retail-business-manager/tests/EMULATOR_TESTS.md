# Firestore rules runtime tests

From the repository root, install locked dependencies with pnpm 10, then run:

```sh
pnpm --filter @workspace/retail-business-manager run test:rules
```

Requirements: Node 20 or newer, Java 21 or newer, and network access to download
the pinned Firebase CLI and the official Firestore emulator on the first run.

The command uses the `demo-firestore-rules` demo project and a dedicated config
that starts only Firestore on `127.0.0.1:8080`. It requires no Firebase login,
service account, production config, or deployment. The test script refuses to
run without the loopback emulator endpoint and clears only its demo database
between cases. Do not run it against an emulator shared with another test run.

The `firestore-rules` CI job executes the same command and fails on any unexpected
allow or deny result. Coverage includes workspace membership, discovery indexes,
customer field/store boundaries, protected financial writes, and cross-workspace,
inactive-member, and anonymous access. Legacy `/stores` tests check the existing
compatibility rules; they do not add a runtime persistence path.

Authentication identities in these tests are supplied by `rules-unit-testing`.
This verifies the real Firestore Rules engine, but does not exercise the Auth or
Functions emulators, app screens, or a physical device. Full Auth → callable →
Firestore flow tests and device acceptance remain separate verification work.
