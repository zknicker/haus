---
summary: Testing strategy for choosing focused lanes, writing durable tests, keeping suites current, and avoiding unnecessary route or smoke coverage.
read_when:
  - adding tests, changing execution-runtime contracts, or choosing a verification lane
  - changing OpenAPI, Server stores, SDK, App e2e, or Computer execution behavior
  - adding or changing an agent-behavior scenario under scripts/agent-tests/
  - running or changing an eval (`bun run eval`, scripts/eval/), or comparing a change against a baseline commit
  - changing lint rules, source-size policy, or Quality CI gates
  - changing the visuals lab, its battery, or how rendered visuals are judged
  - measuring or changing App interaction performance (chat switch, profile open, pop-in)
---

# Testing

Verify at the owner of the changed rule with the smallest lane that can fail.

## Development Cycle

Complete the requested behavior and cleanup, then select proof from the final
diff.

Run a focused test during implementation only when it is part of reproduction
or TDD, when the next design decision depends on its result, or when long,
sweeping, or risky autonomous work would benefit from a checkpoint. At roughly
ten minutes of uninterrupted implementation, consider a checkpoint when it
can prevent compounding risk.

When an iteration check is warranted, run one test file:

```sh
# server, Computer, and website (bun test; run from the package directory)
cd apps/server && bun test test/haus-server-production.test.ts
cd apps/computer && bun test src/harness/instructions.test.ts
cd apps/website && bun test src/features/shell/sidebar-chat-list.test.ts
```

After development is complete, use [Change Routing](#change-routing) and gate
the affected behavior. Nontrivial code changes normally use the touched
package gates:

```sh
bun run lint
bun run --filter @haus/<touched-package> typecheck
bun run --filter @haus/<touched-package> test
```

Each package gate includes its tests and typecheck:

| Touched path | Gate |
| --- | --- |
| `apps/server` | `@haus/server test` + `typecheck`. Hosted Server tests provision a throwaway cluster from locally installed PostgreSQL binaries; install PostgreSQL 16 or point `HAUS_POSTGRES_BIN` at its bin directory. Avatar generation tests inject a deterministic fake provider and never call OpenAI. |
| `apps/computer` | `@haus/computer test` + `typecheck` |
| `apps/website` | `@haus/website test` + `typecheck` |
| `packages/haus-api` | `@haus/api check`, plus typecheck of the consuming apps you touched |
| `packages/haus-sdk` | `@haus/sdk test` + `typecheck` |
| Browser-level contracts (navigation, reload, websocket, chat flows, layout) | `bun run test:app`, scoped to the affected spec file when possible |
| Execution runtimes, harness adapters, provider auth wiring, or `@ai-sdk/harness-*` bumps | `@haus/computer test` + `typecheck`; add a scoped `bun run test:agents` scenario when deterministic proof is insufficient |

Rules that keep runs cheap and honest:

* Every code change runs `bun run lint` at handoff. Use `bun run lint:fix` for
  fixes; the raw Biome command applies the wrong ruleset. Lint enforces a
  cognitive-complexity ceiling of 20 and a 300-line source-file limit.
  Existing debt has named per-file ceilings in `biome.jsonc` and
  `scripts/source-size-policy.json`; line-count debt may not grow, while
  complexity hotspots cannot cross their bounded legacy bands. Named
  exceptions are for declarative corpora or generated sources, require a
  reason, and retain a concrete ceiling. Do not add a blanket directory or
  file-type exemption.
* Documentation-only changes use `bun run docs:list` plus direct link and
  rendering inspection. Copy-, token-, and CSS-only changes use lint, adding a
  suite only for an encoded browser contract.
* If a suite fails in code you did not touch, verify against an untouched
  checkout before chasing it — worktrees have carried baseline failures that
  are not your regression. Do not rerun whole suites to investigate.
* Full-package runs are for handoff gates; full-repo runs are for release
  prep, not development.

Before handoff, report the commands you ran and anything you did not verify.

## Change Routing

Choose proof after the implementation and cleanup are complete. For a change
that matches multiple rows, run the union of their required proof.

| Completed change | Required proof | Escalate when |
| --- | --- | --- |
| Documentation only | `bun run docs:list`; inspect changed links and rendered Markdown | Run code gates only when documented generated output or executable examples changed. |
| App copy, tokens, or CSS only | `bun run lint`; typecheck when TS or TSX changed | Run a scoped App e2e only when an existing browser contract covers the changed behavior. |
| iPhone app models, presentation, or interaction | `swift test` from `apps/ios-swift`; build the app target for a Simulator destination | For UIKit text layout or rendering performance, run the [HausRenderingTests Simulator target](../../apps/ios-swift/README.md#local-checks). Drive the Simulator when the change is a gesture, layout, or chrome treatment that a unit test cannot show. |
| React presentation, view model, or local interaction | Focused behavior test; website typecheck | Use the website gate for shared primitives or several features. Context, providers, or anything every transcript row reads: add the render isolation tests (`transcript-render-isolation`) and `render-budget.spec.ts`. |
| React query, mutation, cache, realtime, optimistic UI, or shared state | Focused regression plus website gate (it runs `query-policy-contract` and `query-polling-contract`, which pin polls, timers, and keyless invalidation to allowlists with reasons) | Add scoped App e2e for reload, reconnect, navigation, or a complete user flow. Polls, focus or reconnect refetch, socket session, or reconnect recovery: run `idle-silence.spec.ts`. A subscription or `select` on a kept view: run `render-budget.spec.ts`. A realtime stream, its restart, or its recovery: run the incident detector `realtime-server-restart.spec.ts` (it restarts the Server child with `restartHausServer()` from `e2e/support/server.ts`) and `server-restart-harness.spec.ts`. |
| Route tree, persistent shell, navigation, side pane, or layout-critical behavior | Website gate plus scoped App e2e | Use the full App e2e suite for broad shell or cross-flow changes. Kept views, tab switching, or router hooks: run `render-budget.spec.ts`; large App changes run the [Perf sweep](../../.agents/skills/perf-haus-app/SKILL.md#perf-sweep). |
| Hosted Server API, authorization, PostgreSQL state, or realtime | Focused regression plus server gate | Add App e2e when the public browser flow or reconnect behavior changed. |
| Computer execution, delivery, or local capability behavior | Focused regression plus computer gate | Add a scoped `test:agents` scenario when deterministic proof cannot cover the observable model-driven behavior. |
| Computer execution-runtime mapping, delivery semantics, or agent behavior | Focused regression plus Computer gate | Add provider smoke or a `test:agents` scenario for executor/provider-boundary changes. |
| API or SDK contract | API or SDK gate plus affected consumer typechecks | Add Server, Computer, or App coverage when behavior changed behind the contract. |
| Agent prompt or managed instructions | Prompt contract and snapshot review plus owning package gate | Run the affected [eval](#evals) (`bun run eval attention`, `bun run eval placement`) with `--baseline` after meaningful prompt-text changes, as required by AGENTS.md. |
| Live Agent behavior, agent-test kit, or eval harness | Run the affected scenario with `bun run test:agents --only <name>` after deterministic support tests | Run the full `test:agents` set when shared kit or prompt behavior can affect several scenarios or for release confidence. |
| App-to-Computer-to-model path through the real browser | `bun run test:tracer` | Nothing else escalates here; behavior belongs in `test:agents`. |

## Quality CI And Check Lanes

The App browser suite signs in through a local Clerk issuer. Its fixture session tokens last one
hour because the browser fixture does not load Clerk's token-refresh client. The shared issuer's
default remains five minutes for Server identity tests, and expired-token fixtures remain expired.

Per-commit CI answers exactly one question: is the contract intact and does the
fast stuff pass? The `Quality` workflow runs `bun run check:fast` on
`pull_request` and on `push` to `main`, and nothing else. That is policy, not
an oversight — CI minutes are a quota, and weight belongs where no coverage is
lost.

| Lane | Contents | Runs in |
| --- | --- | --- |
| `check:fast` | `env:check`, `env:contract`, `lint`, `typecheck:fast` (api, sdk, usage packages, Server), `test:fast` (`packages` + `scripts` + `apps/website/electron`), `test:prompt-contract` (pure managed-prompt contract and budget) | Quality, and inside `check` |
| `check:heavy` | `typecheck:licensed` (App, Computer), `test:app-unit`, `test:server`, `test:computer`, `build` | `bun run check` only |
| Neither | `test:app` (Playwright), `test:agents`, `eval:*`, release builds | opt-in, by hand |

`bun run check` is `check:fast` then `check:heavy`, and that is what gates
local work, cloud-agent runs, and release preflight. The split is structural,
not a list of exclusions:

* Everything in `check:heavy` needs something Quality must not do. The App
  typecheck and its unit tests both resolve `@heroui-pro/react`, whose dist is
  a licensed download, and so does the desktop packaging check — which is why
  that one file is named `*.licensed-check.mjs`, out of `bun test`
  auto-discovery, and run by `test:licensed`. The Server suites each provision
  a real PostgreSQL cluster. The Computer suites spawn execution runtimes. The
  build is the deploy path's proof, not CI's.
* `check:fast` is fully offline: it pins the schema's `test` lifecycle, so no
  gate in it reaches 1Password. It runs in about ten seconds.
* The Electron main-process suites under `apps/website/electron` are in the
  fast lane even though the rest of the App is not. They are plain Bun tests
  over extracted `.cjs` modules — no HeroUI dist, no Electron runtime, no
  browser — so the shell's production contracts (the preload bridge globals,
  trusted-renderer origins, Clerk SSO callback handling, external-link routing)
  are gated per commit. `test:app-unit` stays heavy because `apps/website/src`
  resolves `@heroui-pro/react`. That is also why the iOS agent-HTML token drift
  test sits in `apps/website/src/agent-html/` rather than beside its generator
  under `scripts/`: it resolves the Pro dist stylesheet, so it belongs in the
  lane that runs after the licensed download, not in `test:fast`.
* `test:prompt-contract` is the narrow exception from the otherwise-heavy
  Computer suite. It renders managed instructions in-process, never starts an
  execution runtime, and keeps prompt-budget drift out of release preflight.
* A lane that cannot run everywhere is a bug, not a lane. Quality runs on
  Linux, so anything in `check:fast` has to pass there: a macOS-only code path
  answers "nothing here" off darwin rather than shelling out to a binary that
  does not exist.
* Keep the Quality job free of licensed downloads, databases, browsers, and
  builds. Adding one there is how a polite CI stops being polite.

## Test Lanes

| Lane | Use when | Keep current by |
| --- | --- | --- |
| Focused unit/domain tests | Pure logic, view models, hooks, mappers, scheduling rules, validation, or regressions. | Add one targeted regression for behavior changes. Avoid asserting implementation calls. |
| Computer service tests | Workspaces, queues, execution state, recovery, or execution evidence. | Use real temp directories and the real service boundary. |
| Hosted Server tests | Haus Server identity, Chats, messages, reads, search, ordering, authorization, or realtime. | Drive the public tRPC surface through `test/haus-server-harness.ts`: a throwaway PostgreSQL cluster plus a local Clerk issuer. Never mock PostgreSQL or the transaction. |
| Contract/API/SDK gates | `packages/haus-api`, OpenAPI, SDK client shape, generated types, or cross-boundary request/response contracts. | Run `@haus/api check`, SDK tests/typecheck, and update docs with the product contract. |
| App component/hook tests | React state rules, cache invalidation, optimistic UI, row models, filters, keyboard behavior, or rendering transforms. | Prefer hook/model/component tests before e2e. Use the `architect-react-features` skill for nontrivial React architecture. |
| Desktop shell tests | Electron main-process and preload behavior: the injected bridge globals, trusted-renderer origins, Clerk SSO callback and native requests, external-link routing, window state. | Extract the rule into a `.cjs` module beside its caller and cover it with a `*.test.cjs` in `apps/website/electron`; the fast lane runs them. Keep them free of the `electron` runtime. |
| App e2e | Browser-level app contracts: navigation, reload recovery, websocket reconnect, full chat identity, user flows, or layout-critical behavior. | Use deterministic Playwright against isolated ports and a throwaway PostgreSQL cluster. |
| Computer executor tests | Execution-runtime mapping, event projection, delivery semantics, local sandbox behavior, or capability degradation. | Verify with Computer fixtures, deterministic fake executors, or an opt-in `test:agents` scenario. |
| Agent tests | Observable Agent behavior across real Server, Computer, and model: attention, routing, tasks, coordination, skills, workspace, reminders, and proven silence. | Headless scenarios under `scripts/agent-tests/scenarios/`. Assert structural Server state plus literal markers; never prose shape, except the shared voice gate (`scripts/agent-tests/voice-gate.mjs`) that rejects a few banned voice patterns in model-authored channel messages. |
| Live/manual smoke | Real provider behavior, local environment diagnosis, or release confidence that deterministic lanes cannot cover. | Keep opt-in. Record temporary chat ids/titles and clean up only those records. |

## Writing Tests

* Prefer Vitest for package-local tests unless the package already uses Bun
  tests.
* Test the domain owner behind a thin route. Test the route itself when it owns
  auth, coercion, error mapping, streaming, or transport behavior.
* Prefer real temp SQLite databases, temp directories, and schema validation
  over module mocks.
* Mock only true external boundaries: model calls, process/container execution,
  network transports, time, and randomness.
* Assert user-visible or contract-visible outcomes: persisted rows, emitted
  events, returned JSON, cache state, rendered rows, or task transitions.
* Do not write tests whose main assertion is that a spy was called.
* Keep fixtures small and source-shaped. Use raw adapter frames or captured
  provider payloads when the product depends on exact external shape.
* For production bugs, add a focused regression at the boundary where the bug
  should have been impossible.

## App E2E

Use Playwright against the real App and hosted Server for browser-level
contracts. The lane uses isolated ports, PostgreSQL, attachments, and Clerk
fixtures. It must not point at developer model-provider credentials or start a
real Computer.

Chat E2E should prove identity and recovery, not styling details:

* accepted user message appears once
* reload and websocket reconnect recover without duplicates, missing rows, or
  ordering bugs
* completed messages and Threads remain available as durable history
* Agent-authored effects use the public runner contract rather than a real model

The App test wrapper runs preflight before Playwright starts service readiness
timers. Preflight verifies Playwright Chromium and builds the SDK with visible
terminal progress.

Browser E2E uses the hosted product boundary by default:

```bash
bun run test:app
```

Run one spec while repairing a focused surface:

```bash
bun e2e/run-playwright.ts e2e/tests/messaging.spec.ts
```

The lane starts only the hosted Server, throwaway PostgreSQL, Clerk issuer, and
website. Computer inventory and Agent-authored effects use deterministic
fixtures or public runner contracts; no model runs. The membership spec still
drives the real invitation round trip across two Clerk identities. Actual
App-to-Computer-to-model behavior belongs to the agent-test lanes below.

### Fresh-Server onboarding proof

`apps/website/e2e/tests/onboarding-entry.spec.ts` covers the short opening path without a Computer:
neutral delayed loading with a persistent mark and uninterrupted animation clock, reduced-motion
behavior, owner reload and Server switching, invitation
acceptance by a member, member/admin gating, and automatic entry at the retained destination when
setup completes. It also checks that a completed Server with no Computer remains accessible.

`apps/website/e2e/tests/servers.spec.ts` is the one browser tracer for a fresh
Server. It drives the real App, hosted Server, throwaway PostgreSQL and Clerk
fixtures, deterministic Computer protocol, and public Agent runner contract.
It proves the route gate, actionable inventory/application repair, reload and
Computer reconnect, replay convergence, immediate unlock before the delayed
greeting, ordinary failed-turn repair, exact hosted Cove identity/avatar, one
canonical Agent-authored greeting, and permanent post-onboarding Cove deletion.
It makes no provider calls.

The browser cannot observe Computer-local files and must not pretend to.
Pair that tracer with `packages/agent-workspace/src/starter-kit.test.ts` and
`cove-starter-kit.test.ts` for the minimal ordinary workspace and exact Cove
four-file/12-summary seed under root `MEMORY.md` and `notes/`,
`apps/computer/src/agent-configuration.test.ts` and
`launch.test.ts` for durable application plus Agent-kind reset, and
`apps/server/test/haus-agent-manual.test.ts` for authenticated Manual overview,
full-card access, and audit metadata.

## Execution Runtime Adapter Contracts

When changing executor routes, event projection, chat behavior, or delivery
semantics, verify against deterministic service fixtures, hosted Browser E2E,
or an opt-in live harness smoke when a concrete ambiguity remains.

Add raw-frame or fixture-backed tests for behavior Haus depends on.

## Manual Smoke Hygiene

Manual real-provider chats are rare. Prefer deterministic e2e or unit/service
tests.

The Grok Build live interjection smoke is opt-in and still checks for a local
login before running:

```sh
HAUS_RUN_LIVE_GROK_TEST=1 bun test apps/computer/src/harness/grok-build-live.test.ts
```

Set `HAUS_LIVE_GROK_MODEL` to test a specific model, such as `grok-4.7` or
`grok-4.7-build-fast`; the smoke defaults to `grok-4.6`.

The Codex live smoke runs only with its variable set and then checks `codex login status`. It
drives the production runtime table through codex-acp: a steered message lands
mid-turn, a Computer host tool answers over the harness MCP relay, a stopped
session resumes with its conversation, and MCP servers in the Agent's own Codex config never start.

```sh
HAUS_RUN_LIVE_CODEX_TEST=1 bun test apps/computer/src/harness/codex-live.test.ts
```

If manual validation creates real Haus chats, use an obvious temporary first
message such as `Codex smoke <timestamp>: <purpose>`, record the created chat
ids, and delete only those chats before finishing. If cleanup fails, report the
exact chat ids or titles left behind.

Agent-test teardown uses the localhost-only `dev.cleanupEvalChats`
procedure to delete exact test-created Chat ids. This is an authenticated,
non-production test seam, not a product Chat archive or deletion contract.

## Agent Tests

`bun run test:agents` is the lane for observable Agent behavior. It is
headless: scenarios drive the same hosted tRPC and Agent API contracts the App
uses, against the real Server, Computer, and model. No browser is involved.

```sh
bun run test:agents                            # every scenario
bun run test:agents --only mention             # scenarios whose name contains "mention"
bun run test:agents --list                     # scenario names, no live turns
bun run test:agents --json                     # machine-readable run summary
bun run test:agents --lanes 4                  # override the lane count
bun run test:agents --include-opt-in --only cove-composes-agent-creation --lanes 1
```

Repeat `--only` to run a small named subset in one process.

Most scenarios belong to one of the [evals](#evals), which is the usual way to run them. A few
are opt-in because they need something the default dev stack lacks; `--include-opt-in` adds
them, and `bun run eval` always passes it:

* `cloud-launch-and-link` spends a real Cursor Cloud Agent run on a read-only Haus README review
  and needs connected Cursor access to `zknicker/haus`. It gates on one work item launched as an
  inline reply to the request, with at most a pickup note before it and nothing else from the
  launch turn, cancels it, and then gates on the Agent linking the same work
  from a second channel. The completion wake is Server plumbing and is not re-proved live.
* `memory-feedback-implicit` and `memory-feedback-control` overwrite a test Agent's `MEMORY.md`
  on the stack's own Computer.
* `cove-composes-agent-creation` is a standalone Cove smoke outside every eval (below).

Scenarios that place answers (`placement-*`, `ack-reaction-thanks`,
`thread-reply-stays-in-thread`, `solo-progress-threads-on-ack`, `mention-wakes-only-addressed`,
`task-thread-routing`, `cloud-launch-and-link`, `github-trigger-*`) preserve every child conversation and all
available execution journals under `.context/agent-tests/evidence/<stamp>/` before cleanup, so
the eval grader can read placement and `--done` flags. One clean run is limited evidence.

`mcp-granted-lookup` asks for a private Audit Ledger record before any grant (no call, an honest
reply, at most four discovery tools beyond turn bookkeeping such as the claim, reaction, and
reply, and no local configuration search), then grants without a reset and
gates on the exact title and owner from one real call plus a ticket id only the first turn
carried. `webhook-secret-stays-out-of-chat` asks for a webhook and gates on one webhook Trigger,
its URL in the reply, and no `grtt_` secret in any Chat the Agent wrote to.

`github-trigger-ci-setup` and `github-trigger-fire-reply` need no GitHub account.
`scripts/agent-tests/github-world.mjs` seeds a connected `github` connection, the worker's grant,
and an active `acme` installation with a fresh access cache straight into the stack's PostgreSQL,
and tombstones them afterwards. Setup gates on one failure-filtered CI `github` Trigger on that
installation anchored in the channel, no webhook Trigger, no `grtt_` secret, and a confirmation in
the channel. Fire creates the Trigger through the Agent route on a human FYI, POSTs a
`workflow_run` failure to `/api/github/webhook` signed with `HAUS_GITHUB_APP_WEBHOOK_SECRET`, and
gates on one recorded fire, one top-level post in the anchor channel whose cause is that fire with
`explicit` attribution, no Thread posts, and a journaled `haus message send --cause <fireId>`.
Both need the varlock environment, so run them by hand as
`bunx varlock run -- bun scripts/agent-tests/cli.mjs --only github-trigger --lanes 1`.

`linear-trigger-setup` and `linear-trigger-fire-reply` need no Linear account and never call
api.linear.app. `scripts/agent-tests/linear-world.mjs` seeds a `linear` connection (on an
unreachable URL, so the worker has no Linear tools), the worker's grant, an `active` workspace with
a valid credential, and DES/ENG team access straight into the stack's PostgreSQL, and tombstones
them afterwards. Eval stacks boot with `HAUS_LINEAR_API_ORIGIN` pointed at
`scripts/agent-tests/fake-linear.mjs`, which answers the Trigger catalog the Server resolves names
against. Setup gates on exactly one `linear` Trigger owned by the worker, anchored on the asking
message, with an issue group whose `stateFrom`/`stateTo` hold the Design Review and Changes
Requested state ids, and no token or webhook secret in any Chat or the journal. Fire creates the
Trigger through the Agent route, POSTs the captured `issue-update-state` delivery re-pointed at the
seeded workspace and signed with `HAUS_LINEAR_APP_WEBHOOK_SECRET` to `/api/linear/webhook`, and
gates on one fire, one top-level `--cause` answer with `explicit` attribution, and no Thread posts.

The memory-feedback scenarios seed two Standing Preferences, send one channel request (a
self-contained question, with passing feedback for `implicit` and none for `control`), reset the
session, and ask a probe question in a new channel. They gate only structure; rule grammar,
merge, and post-reset application are scored from evidence under
`.context/agent-tests/memory-feedback/` by a separate, rerunnable grader:

```sh
bun scripts/agent-tests/memory-feedback-grade.mjs [--since <stamp>] [--json]
```

Run agent-test commands serially against one dev stack, because startup cleanup sweeps prior run
records.

The Cove creation scenario is opt-in because it needs a real active Cove on an
attached healthy Computer plus the local deterministic avatar fixture. Start
the dev stack with an absolute JSONL path, then run the scenario:

```sh
HAUS_AGENT_E2E_AVATAR_FIXTURE=1 \
HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH="$PWD/apps/website/public/prototypes/cove-avatar.png" \
HAUS_AGENT_E2E_AVATAR_REQUEST_LOG=/tmp/haus-cove-avatar-requests.jsonl \
bun run dev

HAUS_AGENT_E2E_AVATAR_FIXTURE=1 \
HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH="$PWD/apps/website/public/prototypes/cove-avatar.png" \
HAUS_AGENT_E2E_AVATAR_REQUEST_LOG=/tmp/haus-cove-avatar-requests.jsonl \
bun run test:agents --include-opt-in --only cove-composes-agent-creation --lanes 1
```

It proves a prose proposal that creates nothing, then exactly one Agent created
by `haus agent create` with Cove's own runtime, model, reasoning effort, and
Computer, introduced by one ordinary Message in `#all` that mentions the
confirmed handle and carries Cove's unchanged session generation, joined to `#all` and the requested `#product`, carrying its standing
brief in the workspace `MEMORY.md`, and no second Agent when the request is
repeated. The scenario never uses browser E2E or
asserts model wording, selected name, character, aesthetics, or acknowledgment. Its report is written under
`.context/agent-tests/<run>/`; if the required Cove/Computer/provider setup is
unavailable, record that exact precondition gap rather than running a partial
substitute.

Cove is the seeded factory Agent rather than a provisioned fixture, so the
scenario owns its own starting state: it retires the Agents an earlier run had
Cove create and runs a Full Reset (`agent.reset` with `kind: 'full'`) so Cove's
session, workspace, and `MEMORY.md` are factory again. The Owner asks in a
channel the run creates rather than in Cove's standing Owner DM, which
accumulates — Cove reads its own earlier creation announcement there and repeats
it in that chat instead of `#all`, and the DM cannot be cleared because a chat
holding an Agent's creation Message cannot be deleted. Rerunning the scenario
against one dev stack therefore needs no restart.

A scenario is one file under `scripts/agent-tests/scenarios/`, exporting a
`name`, a one-sentence `contract` stating exactly what must be true, and a
`run` that receives the kit. Keep a scenario to one to three live turns; a
longer story belongs in several scenarios or in a deterministic lane.

A scenario declares the Agents it needs by kind (`worker`), and
the lane creates them for that scenario and retires them after the verdict.
Isolation is by construction: a fresh Agent has a fresh session, a fresh
workspace, and a fresh implicit Agent-DM selection, so nothing carries over between scenarios. No
Chat exists until the scenario performs its first durable send.
Creation is bounded to two concurrent Agent applies process-wide — more races
the Computer into an Agent missing its session. Lanes default to three, capped
by scenario count; `--lanes` overrides it without a clamp.

Every created Agent and chat id is recorded in `.context/agent-tests/state.json`
(`state.<HAUS_DEV_STACK_ID>.json` when a stack id is set, so an eval stack never sweeps the
worktree stack's records) under the run stamp before it is used. Teardown deletes chats by exact id and
then retires the Agents, and the ledger forgets only what a delete confirmed, so
a crashed run's leftovers are swept — by exact recorded id, never by name or age
— at the start of the next run.

Two rules keep assertions honest:

* Settle the turn, do not poll for prose. `settleTurn` waits for the Server's
  turn record to settle through `agent.turns`, then the scenario asserts against
  the collaboration that turn produced.
* Assert structural Server state plus literal marker containment — the exact
  chat, thread, task state, assignee, message count, ordering, and a random
  marker string the prompt asked for. Never assert phrasing, tone, or length.

Silence is proven, not assumed: a settled turn with `outputProduced` false, no
authored messages in the chat, and a delivery row in state `seen` distinguishes
"received it and chose to stay quiet" from "never received it".

Each run writes `summary.json` plus one `transcript.json` per scenario under
`.context/agent-tests/<run>/`, carrying the contract, assertions, observed
messages, and settled turns. Read the transcript before rerunning a failure.
Failed scenarios also capture each Agent's current delivery state, recent turns,
and retained delivery rows before cleanup. Query failures are recorded beside
the available evidence rather than replacing the original scenario failure.

The lane needs `bun run dev` and configured development Clerk keys, plus one
attached Computer whose reported inventory carries a `codex` runtime with a
`terra` model — that is what every test Agent is built on, unless
`HAUS_AGENT_TESTS_MODEL=<runtime>/<model>` names another.

To measure behavior rather than check one scenario, run an [eval](#evals): it
repeats a named set of these scenarios on its own stack, grades them, and can
compare against a baseline commit.

## Full-Stack Tracer

`bun run test:tracer` is the one Playwright spec that still drives the real
browser against the real Server, Computer, and model
(`apps/website/agent-e2e/tests/live-tracer.spec.ts`): a mention typed into the
App composer reaches the Agent and its reply renders in the chat. It proves the
wire end to end, nothing more. Agent behavior belongs in `test:agents`.

## Evals

An eval measures Agent behavior as a rate. It is a named set of `test:agents` scenarios plus the
grader profiles applied to their runs, run several times on a stack of its own:

```sh
bun run eval --list                               # registered evals
bun run eval placement                            # 3 passes against this checkout
bun run eval placement --baseline origin/main     # the same passes against that commit too
bun run eval attention --passes 5 --model claude-code/opus --notes notes.md
```

Options: `--baseline <rev>`, `--passes <n>` (default 3), `--lanes <n>` (the eval's default, else
3), `--model <runtime>/<model>` (every test Agent is created on it), and `--notes <file>` (Markdown
rendered as the report's "What was changed" section). The registry is
`scripts/eval/evals.mjs`; grader profiles (caps, tails, judge question) are data in
`scripts/eval/profiles.mjs`.

| Eval | Measures |
| --- | --- |
| `placement` | An answer lands where the asker looks (inline reply, or the Thread they chose), says only what was asked, and stops. |
| `attention` | A mention wakes only the addressed Agent and its unmentioned inline follow-up stays with it; an FYI DM gets a seen, silent turn; an irreversible publish waits for the human's pick; an explicit task is claimed and answered inline; a reminder fires once. Serial. |
| `memory` | Passing feedback becomes a Standing Preference that survives a session reset; with no feedback, nothing changes. Score rule quality with `memory-feedback-grade.mjs`. |
| `triggers` | GitHub and Linear Triggers on an `acme` GitHub installation and a Linear workspace seeded on the eval stack (no GitHub or Linear account; a loopback fake Linear resolves names): a plain "wake me when CI fails on main" ask becomes one failure-filtered CI `github` Trigger, and "ping me when a Design issue goes from Design Review to Changes Requested" one state-transition `linear` Trigger, each with a short confirmation; a signed `workflow_run` failure or Issue update gets one top-level `--cause` answer naming the workflow and branch, or the issue. Serial. |
| `room` | Two Agents and a human share a channel, and each scenario carries a decoy the Manual warns against: a multi-step pickup gets the signature reaction and one inline "on it" note while the bystander stays silent; a task a peer claimed is left to that peer; a peer handoff carrying its evidence is delivered without re-asking the human; a peer's guess at a pending question to the human is not taken as the human's answer; a reminder fire during a live Thread exchange is answered at its anchor with `--cause`, not in the Thread; a chart request gets one SVG visual fence, no table inside it, with text beyond a caption. Serial. |
| `tools` | Work that leaves the chat: a Cloud Agent launch and cross-channel link (Cursor), granted-only MCP use with a hot grant, a webhook Trigger whose secret stays out of chat, and a file shared with the team without naming Files (one `haus files push` of a `.md` file whose stable URL is linked, not attached). |

The Files-backed scenarios (`placement-found-the-kit-files` in `placement`,
`shared-artifact-discovery` in `tools`) run on the eval stack's own local Files storage gateway, so
the only prerequisite is the `versitygw` binary (`brew install versitygw`; see
[Development](development.md)).

Each build boots its own isolated dev stack (`HAUS_DEV_STACK_ID=eval-<name>-change`, then
`eval-<name>-base`), runs the passes serially through `scripts/agent-tests/cli.mjs`, and stops it,
checking that no workspace image stays mounted and nothing still listens. The two stacks run one
after the other, never together. A running `bun run dev` in this checkout is unaffected. With
`--baseline`, the eval creates or reuses a detached worktree at
`.claude/worktrees/eval-baseline-<sha>` beside the main checkout, runs `bun run setup:worktree`
there when `node_modules` is missing, and replaces its `scripts/agent-tests` and `scripts/eval`
with exact copies of this checkout's (scenarios the change retired are removed), so both builds
run identical scenarios and grader and differ only in the product code.

The terminal shows one line per scenario as it settles (`✓`, `✗`, or `⚠` for infra), then a
scenario × build table of runner pass, grader spec pass, mean words, and judge, a one-line verdict
(change versus baseline in points), and the report path. Everything lands under
`.context/evals/<eval>/<stamp>/`: `report.html` (headline tiles, pass-rate bars, grader detail,
representative transcripts with placement and `--done` badges, caveats), `report.json` with every
grade underneath, and the stack and per-pass logs. Raw runs stay in each build's
`.context/agent-tests/`.

Evals are rates, not gates. The command exits 0 whenever the runs complete, whatever the pass
rate, and 1 only on infrastructure failure: a stack that never boots or a pass that leaves no run
report. A scenario that fails on infrastructure (provisioning, an unreachable Server, a journal
that never syncs) is marked `⚠`, listed in caveats, and left out of the rate. Session variance
swamps one run, so compare at least three passes per build.

The scenarios gate structure only. A grader profile adds what its spec says about length, tail
phrases ("want me to", "happy to", …), question counts, placement of the result post, and the
`--done` and reply-to flags read from the execution journal. The Jev judge score runs only with
`HAUS_TYPESAFE_API_KEY`, which `bun run eval` resolves through varlock; otherwise the report says
it was skipped. Placement helpers shared with the scenarios live in
`scripts/agent-tests/placement.mjs` and `placement-kit.mjs`. `placement-found-the-kit-local`, the
storage-free workspace variant of the kit scenario, is not in the `placement` eval; run it by hand
with `bun run test:agents --only placement-found-the-kit-local`. The `attention` profiles grade
`mention-wakes-only-addressed` and `task-thread-routing` the same way. The `triggers` profiles
grade each setup confirmation as an inline reply (one post, no question, no URL) and each fire
answer from its first fire-caused post (one post in the anchor chat naming the GitHub workflow and
branch, or the Linear issue identifier); `memory`, `room`, and `tools` are graded on runner verdicts alone.

To isolate one failing scenario, use `bun run test:agents --only <name> --lanes 1` against
`bun run dev`.

### Prompt-text changes

The composed Agent system prompt has two guard layers. Text loss and the reviewed size budget are
caught in CI by `bun run test:prompt-contract`. Behavior loss is measured on demand by the evals
above, run with `--baseline` against the commit before the prompt change. See AGENTS.md ("Agent
System Prompt Changes").

During development prompt iteration on a standing Agent, reset its **session only** before the
live behavioral test, preserving workspace memory and Chat history. Verify that the fresh native
session received the revised instructions. Creating a new Channel does not reset the Agent's global
session. The managed Agent prompt-version bump belongs to release, not each local prompt edit.
Capture any failing-session evidence before resetting; a fresh-session test does not prove hot
instruction refresh. Eval and `test:agents` Agents are created fresh per scenario, so they need no
reset.

## Session Behavior Evals

`bun run eval:sessions` uses the same hosted lane and checks the public
agent-global session contract end-to-end (`specs/sessions.md`): cross-chat
continuity, full serialization with offer-once notices, mid-turn freshness, accepting
the next delivery after a session reset, and exact model-switch application.
It restores changed Agent configuration afterward. Internal generation and
resume bookkeeping remain covered by deterministic Computer tests; this live
lane asserts only behavior exposed by the hosted product contract.

It requires `bun run dev`, configured development Clerk keys, two applied online Agents, and the
seeded Channels. Authentication uses a localhost development sign-in ticket and Clerk's headless
session refresh; it does not use an auth bypass. It shares `scripts/eval-harness.mjs` with
`test:agents` and `bun run eval`.

## Design Battery

`bun run eval:design` is a dev tool, not a suite: it drives the fixed
battery of visual prompts (`scripts/design-battery/battery.mjs`) through a
running dev stack as real model turns, screenshots each rendered result in
dark and light themes with Playwright, and writes per-run output plus a
`contact-sheet.html` under `scripts/design-battery/output/` (gitignored).
The verdict is human: judge the sheet against
`scripts/design-battery/RUBRIC.md`, revise the visuals skill sources
(`packages/agent-workspace/src/visuals-skill/`), restart the stack to
reseed, and rerun. `--model <provider>/<model>` runs the battery on a
specific executor model (restored afterward unless `--keep-model`);
`--only <slug>` reruns a subset; `--reuse-chats` recycles the battery chat.
The battery chat is intentionally left unarchived for transcript
inspection. Rerun the loop after skill-text, token, or executor-model
changes (PRD-86, ADR 0012).

## Visuals Lab

`bun run visuals:lab` starts the one in-repo tool for judging what the agents
actually render. It shows what each model renders under each version of the
visuals skill: the one in the working tree, plus any revision set beside it. It
is where a change to the skill, a fragment, or the visual frame gets looked at
before it ships. Open the URL it prints (port 4390 by default, `PORT`
overrides).

**Runs** is a question tab per battery prompt over two multi-select rows,
**Model** and **Skill**. The cells are their cross product: one row per selected
model, one column per selected skill, as PNGs for the at-a-glance read. When the
selection is a single cell, or a grid cell is clicked, that cell opens full size:
the live sandboxed frame the chat card would build, with the agent's reply
rendered beneath it, plus what the turn cost in wall time and output tokens and
which skill files the trace shows it opened. The selection lives in the URL and
is remembered per browser; it defaults to the first model under Current.
**Fragments** is the skill's own copy-ready fences, grouped by the module whose
index points at them, rendered live from the working tree; **Check all fragments** renders every one of them headlessly and reports
console errors and collapsed heights.

The question tabs are the battery the server hands the page, so adding a prompt
to `scripts/visuals-lab/engine/prompts.mjs` shows up as a tab with no page edit.
Each model's reasoning effort is a select beside its name, defaulting to medium
and shared across skills; every model runs the harness bridge Haus itself ships,
so a result is a judgement about the product. Runs land in
`scripts/visuals-lab/results/<model>/<stamp>/` (gitignored), and a cell reads the
newest run that carries that prompt, so a narrow rerun never hides the rest.

**Current** is the skill in `packages/agent-workspace/src/visuals-skill/` as the
working tree has it, so it stays correct when a revision is promoted. To compare
a revision against it, drop it in `scripts/visuals-lab/skills/<name>/`
(gitignored; same layout, with `fragments/` beside `SKILL.md`; `current` is
reserved). It shows up in the Skill row on reload; its runs pass `--skill-dir`
and land in `results/<model>@<name>/<stamp>/`. A cell's **Run** spends one turn,
and the header **Run** menu spends exactly the selected cells, for this question
or every question, with the cell list and turn count shown before you press.
Nothing reaches an unselected model and skill pair.

Every cell's stats line also carries an objective read on the fences it
shipped: layout findings and console errors from an in-frame geometry probe
(`scripts/visuals-lab/engine/layout-probe.ts`: horizontal overflow, text
clipped by `overflow: hidden`, SVG text outside its svg, text colliding on
a line, and two series lines in one svg drawn almost on top of each other,
judged in `engine/coincident-lines.ts`; messages on hover). Runs from before the probe are backfilled into a
`<slug>.findings.json` sidecar the first time the lab reads them.

The verdict is human. Judge a rendered cell against
`scripts/design-battery/RUBRIC.md` and the Non-negotiables in
`packages/agent-workspace/src/visuals-skill/SKILL.md`, revise the skill sources,
and rerun the cell. "It rendered" is not "it looks right".

**Pressing Run spends real money.** Every cell is a real model turn on the
developer's own provider logins. Nothing in the lab is part of `check`, CI, or
any agent workflow, and it has no `eval:`, `test:`, or `check:` script by
design. This is a human-driven tool. Agents do not run it unless a person asks
for a visuals run.

The parts that do run in `check:fast` are the static ones:
`packages/agent-workspace/src/visuals-fragments.test.ts` lints the same fences
for published token names, hardcoded colors, stray headings, bordered plates,
and the SVG anatomy a hand-drawn chart needs: an accessible role, `aria`
wiring and a title, a visible scale derivation rather than baked coordinates,
and (in `visuals-chart-geometry.test.ts`) a 736 viewBox or the fluid-plot
anatomy with no svg text past the drawing's left or right edge;
`packages/agent-workspace/src/managed-skills.test.ts` pins that every fragment
seeds and is reachable from a module index.

## Interaction Performance

`bun run perf:web` drives real pointer interactions (channel and DM switch,
Agent profile open) in installed Chrome against a running dev stack and writes
per-interaction timings under `.perf/` (gitignored): time to URL, to the target
view displayed, to a stable main pane, plus long tasks, DOM mutations, tRPC
batches, and chunk loads. The rest of the toolkit lives in `scripts/perf/`
(prod-bundle build, sweep, before/after compare, frames-to-visible, single-switch
trace, scroll-anchoring check); each script's header documents its flags.

It is a measurement tool, not a CI lane. Judge performance changes on the
prod bundle (`--serve-dist`) at CPU×1 and CPU×4 against a baseline taken
before the change, and keep the realtime guard tests green. The
`perf-haus-app` skill (`.agents/skills/perf-haus-app/SKILL.md`) owns the
process, metric definitions, guard tests, and past results.

## Keeping Suites Current

* Add tests with the feature or bug fix, not in a later cleanup.
* Delete or rewrite tests when the product contract changes; do not preserve
  stale assertions to keep old behavior alive.
* Update docs when a new lane, mock provider behavior, fixture source, or
  verification command becomes the preferred path.
* Keep e2e focused on durable product contracts. Move logic regressions down to
  unit, hook, store, or service tests when possible.
* If a lane becomes flaky, either fix the product/test boundary or move the
  unstable part into an explicit live/manual lane.
