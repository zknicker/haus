# Website E2E

This folder holds Playwright coverage for user-facing App behavior.

## Lane

- The default lane runs the website and hosted Server against throwaway PostgreSQL and real AppSession fixtures.
- Browser tests fake only external Computer/model effects, normally by reporting inventory or authoring through the public runner contract.
- Real App-to-Computer-to-model behavior belongs to `bun run test:agents` and `bun run test:tracer`.
- Tests stay user-shaped: drive behavior through the UI or a public product contract, then assert visible behavior over time.

## Layout

- `run-playwright.ts`: allocates unique ports and run ids for each Playwright run.
- `preflight.ts`: verifies Playwright Chromium and builds the SDK before service readiness timers start.
- `start-haus-server.ts`: boots the hosted Server with run-scoped PostgreSQL and attachments.
- `support/server.ts`: authenticated Server setup and durable navigation helpers.
- `support/test.ts`: shared Playwright exports.
- `tests/*.spec.ts`: user-facing specs grouped by current hosted surface.

## Rules

- Do not point automated tests at a developer or production Agent home, config, or database.
- Do not add mock-only product APIs for convenience.
- Prefer one focused regression over broad fixture setup and brittle assertions.
- Use role/name locators scoped to a semantic region or row. Avoid generated ids and document-wide text selectors.
- Create each spec's Server in `beforeAll` or its test. Never depend on another spec's rows or execution order.
- Reuse `openChannel` and `openSection` so navigation follows the accessible tree contract.

Run one file while repairing a focused surface:

```bash
bun e2e/run-playwright.ts e2e/tests/messaging.spec.ts
```

The default lane starts no local sidecar, Runtime, Computer, or model. Chat, task, membership,
reminder, Agent, Computer, settings, and reconnect coverage all use the same isolated hosted
architecture.
