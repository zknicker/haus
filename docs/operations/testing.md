---
summary: Testing strategy for choosing focused lanes, writing durable tests, keeping suites current, and avoiding unnecessary route or smoke coverage.
read_when:
  - adding tests, changing execution-runtime contracts, or choosing a verification lane
  - changing OpenAPI, Server stores, SDK, App e2e, or Computer execution behavior
  - adding or changing an agent-behavior scenario under scripts/agent-tests/
  - changing lint rules, source-size policy, or Quality CI gates
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
| iPhone app models, presentation, or interaction | `swift test` from `apps/ios-swift`; build the app target for a Simulator destination | Drive the Simulator when the change is a gesture, layout, or chrome treatment that a unit test cannot show. |
| React presentation, view model, or local interaction | Focused behavior test; website typecheck | Use the website gate for shared primitives or several features. |
| React query, mutation, cache, realtime, optimistic UI, or shared state | Focused regression plus website gate | Add scoped App e2e for reload, reconnect, navigation, or a complete user flow. |
| Route tree, persistent shell, navigation, side pane, or layout-critical behavior | Website gate plus scoped App e2e | Use the full App e2e suite for broad shell or cross-flow changes. |
| Hosted Server API, authorization, PostgreSQL state, or realtime | Focused regression plus server gate | Add App e2e when the public browser flow or reconnect behavior changed. |
| Computer execution, delivery, or local capability behavior | Focused regression plus computer gate | Add a scoped `test:agents` scenario when deterministic proof cannot cover the observable model-driven behavior. |
| Computer execution-runtime mapping, delivery semantics, or agent behavior | Focused regression plus Computer gate | Add provider smoke or a `test:agents` scenario for executor/provider-boundary changes. |
| API or SDK contract | API or SDK gate plus affected consumer typechecks | Add Server, Computer, or App coverage when behavior changed behind the contract. |
| Agent prompt or managed instructions | Prompt contract and snapshot review plus owning package gate | Run `eval:prompt` after meaningful prompt-text changes, as required by AGENTS.md. |
| Live Agent behavior, agent-test kit, or eval harness | Run the affected scenario with `bun run test:agents --only <name>` after deterministic support tests | Run the full `test:agents` set when shared kit or prompt behavior can affect several scenarios or for release confidence. |
| App-to-Computer-to-model path through the real browser | `bun run test:tracer` | Nothing else escalates here; behavior belongs in `test:agents`. |

## Quality CI And Check Lanes

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
| Agent tests | Observable Agent behavior across real Server, Computer, and model: attention, routing, tasks, coordination, skills, workspace, reminders, and proven silence. | Headless scenarios under `scripts/agent-tests/scenarios/`. Assert structural Server state plus literal markers; never prose shape. |
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

Conversation routing has a natural-language lane: `--only conversation-natural-followups`
checks a basic question, a planning request, and a human Thread follow-up without routing
instructions in the requests. `--include-opt-in --only cloud-conversation-handoff` spends
a real Cursor Cloud Agent run on a read-only Haus README review and checks the completion
wake and outcome in the requesting Chat. It requires connected Cursor access to `zknicker/haus`.
Both scenarios preserve every child conversation and all available execution journals,
including resumed cloud turns, under `.context/agent-tests/evidence/<stamp>/` before cleanup.
Repeat them with fresh Agents when evaluating routing changes; one clean run is limited evidence.

Memory-refresh and response-efficiency probes are opt-in. They check same-session context
retention with a current MEMORY.md read and bounded discovery for an unavailable MCP, using
Computer execution journals rather than a flaky wall-clock threshold:

```sh
bun run test:agents --include-opt-in --only warm-dm-memory-refresh --only response-efficiency --lanes 1
```

They log durations for comparison; a single model run is not a latency guarantee. Run agent-test
commands serially against one dev stack, because startup cleanup sweeps prior run records.

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
Computer, announced by one `agent-created` Message in `#all` that mentions the
new handle, joined to `#all` and the requested `#product`, carrying its standing
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

A scenario declares the Agents it needs by kind (`worker`, `coordinator`), and
the lane creates them for that scenario and retires them after the verdict.
Isolation is by construction: a fresh Agent has a fresh session, a fresh
workspace, and a fresh implicit Agent-DM selection, so nothing carries over between scenarios. No
Chat exists until the scenario performs its first durable send.
Creation is bounded to two concurrent Agent applies process-wide — more races
the Computer into an Agent missing its session. Lanes default to three, capped
by scenario count; `--lanes` overrides it without a clamp.

Every created Agent and chat id is recorded in `.context/agent-tests/state.json`
under the run stamp before it is used. Teardown deletes chats by exact id and
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

Like `eval:prompt`, the lane needs `bun run dev` and configured development
Clerk keys, plus one attached Computer whose reported inventory carries a
`codex` runtime with a `terra` model — that is what every test Agent is built
on.

## Full-Stack Tracer

`bun run test:tracer` is the one Playwright spec that still drives the real
browser against the real Server, Computer, and model
(`apps/website/agent-e2e/tests/live-tracer.spec.ts`): a mention typed into the
App composer reaches the Agent and its reply renders in the chat. It proves the
wire end to end, nothing more. Agent behavior belongs in `test:agents`.

## Prompt Behavior Evals

During development prompt iteration, reset the test Agent's **session only** before the live
behavioral test, preserving workspace memory and Chat history. Verify that the fresh native session
received the revised instructions. Creating a new Channel does not reset the Agent's global session.
The managed Agent prompt-version bump belongs to release, not each local prompt edit. Capture any
failing-session evidence before resetting; a fresh-session test does not prove hot instruction refresh.

The composed Agent system prompt has two guard layers. Text loss and the reviewed size budget are
caught in CI by `bun run test:prompt-contract`. Behavior loss is caught on demand by `bun run
eval:prompt`. That command is a stable, serial subset of `test:agents`: addressed-only
mention handoff, explicit silence in Channels and DMs, concise DM reply, multi-Chat drain, and
instruction-injection resistance.

The lane provisions fresh isolated Agents and exact cleanup-tracked Chats through the same Server
→ Computer → model path as the full Agent suite; it never depends on seeded Agents or shared demo
conversations. Run it after prompt-text edits and before releases. Use
`bun run test:agents --only <substring> --lanes 1` to isolate one failing scenario. See AGENTS.md
("Agent System Prompt Changes").

## Session Behavior Evals

`bun run eval:sessions` uses the same hosted lane and checks the public
agent-global session contract end-to-end (`specs/sessions.md`): cross-chat
continuity, full serialization with offer-once notices, mid-turn freshness, accepting
the next delivery after a session reset, and exact model-switch application.
It restores changed Agent configuration afterward. Internal generation and
resume bookkeeping remain covered by deterministic Computer tests; this live
lane asserts only behavior exposed by the hosted product contract.

Both evals require `bun run dev` and configured development Clerk keys. Prompt eval provisions its
own Agents and Chats; session eval still requires two applied online Agents and the seeded Channels.
Authentication uses a localhost development sign-in ticket and Clerk's headless session refresh;
it does not use an auth bypass. Both lanes share `scripts/eval-harness.mjs`.

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

## Visuals Eval

`bun run eval:visuals --model <runtime>/<model> [--reasoning <effort>]` is the
design battery's offline sibling, for iterating on the visuals skill without a
stack. It needs no dev server, no website, and no MCP: the prompts in
`scripts/visuals-eval/prompts.mjs` carry a fixed MerchBase sales payload
(`scripts/visuals-eval/fixtures/merchbase-sales.json`) inline, so the only
variables are the seeded skill text and the model.

Each prompt is one turn on the same harness agent the Computer executor builds
(the default `--runner harness` lane) — same harness package, the same
`seedFactoryManagedSkills` visuals skill, the same auth-profile symlinks —
with instructions reduced to the product's
`## Visuals` pointer plus an Outputs rule that puts the fence in the reply body
(`scripts/visuals-eval/instructions.mjs`; `instructions.test.ts` pins the
pointer against `renderAgentInstructions` so it cannot drift). The runner
extracts the ```visual fence, renders it through the real
`buildVisualSrcDoc` frame inside a mirror of the chat card shell, and
screenshots dark and light with Playwright.

Per run it writes `<slug>-{dark,light}.png`, `<slug>.reply.md`,
`<slug>.visual.html`, `<slug>.trace.jsonl` (every tool call, so you can see
whether the model read `references/design-system.md`), `usage.json`, and
`contact-sheet.html` under `scripts/visuals-eval/output/` (gitignored).
`--only <slug>` runs a subset, `--width` sets the card width (default 820),
and `--out-dir` redirects the run. `--runner direct` swaps the pinned bridge
for the `claude` or `codex` CLI installed on this machine, for model ids the
bridge rejects; it keeps the same temp agent root, skills, instructions and
prompt, so only the executable differs. `--skill-dir <dir>` overrides any of the
seeded markdown from a variant on disk — `SKILL.md`, a module such as
`design-system.md` or `charts.md`, or a `fragments/` directory of its own —
which is how one revision of the skill text is measured against another.
The verdict is human, same as the design battery.

## Fragment Render

`bun run eval:fragments` renders the visuals skill's own copy-ready fragments,
the other half of the same problem: a model copies a fragment far more
faithfully than it follows a rule, so a fragment that renders wrong ships that
defect through every model at once. It reads every file under the skill's
`fragments/` directory (`scripts/visuals-eval/skill-fragments.mjs`), renders each
through the same `createVisualRenderer` frame at 736px in dark and light, and
writes the PNGs plus an `index.html` contact sheet under
`scripts/visuals-eval/output/fragments/<stamp>/` (gitignored).

Unlike the two batteries it is not purely a dev tool: it exits non-zero when a
fragment logs a console error or reports a height under 60px, so a fragment
whose script throws cannot sit in the skill unnoticed. It needs a browser and
the network — Chart.js and the map atlases are fetched, as they are in the
product — so it stays out of `check:fast`. Run it after editing any fragment,
and read the contact sheet: "it rendered" is not "it looks right".

The static half does run in `check:fast`:
`packages/agent-workspace/src/visuals-fragments.test.ts` lints the same fences
for published token names, hardcoded colors, stray headings, bordered plates,
canvas accessibility, and the Chart.js floor.

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
