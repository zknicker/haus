---
summary: Normative contract for the Haus-owned runtime drivers (Claude Code, Codex, Grok Build) that run every Agent turn inside Haus Computer — driver and session interfaces, TurnEvent vocabulary, steering, resume state, isolation, host tools, fixtures, and the completed migration from the AI SDK harness.
read_when:
  - changing apps/computer/src/runtime/ (driver contract, TurnEvent, resume state, legacy resume conversion, test fake driver)
  - adding or changing a Claude Code, Codex, or Grok Build driver, or its launch flags, env, or event normalizer
  - changing how a turn's events reach activity, the execution journal, thoughts, usage, or steering
---

# Runtime drivers

Haus Computer runs every Agent turn through a **runtime driver**: Haus code that speaks one
execution runtime's native protocol and normalizes it into the Haus `TurnEvent` vocabulary.
Drivers replaced the AI SDK harness, which is gone along with its packages and patches (Phases).
Pi is not carried forward. Session ownership stays as [Sessions](sessions.md) and
[ADR 0011](../docs/adr/0011-agents-own-one-global-session.md) define it: one Agent, one
persistent session, resumed across turns and Computer restarts.

Contract types live in `apps/computer/src/runtime/`: `driver.ts`, `turn-event.ts`,
`resume-state.ts`. The executor (`harness/executor.ts`) and every stream consumer read only these.

## Driver contract

A `RuntimeDriverFactory` binds a driver to one turn's launch facts (runtime, model, reasoning
effort, composed instructions, isolated HOME, workspace, launch env, host tools).

| Member | Contract |
| --- | --- |
| `bootstrapFingerprint(signal)` | Hash of whatever the driver installs before a session runs; `null` when it installs nothing. Drift parks and restarts a resumed session. |
| `refreshBootstrap({ sessionId, signal })` | Re-installs that bootstrap for a parked session before it resumes. |
| `openSession({ sessionId, resumeFrom, signal })` | Fresh session, or a native resume of `resumeFrom`. A resume the runtime proves unusable (missing, archived, another runtime's or unreadable state) throws `RuntimeResumeRejectedError` (`resume-rejected.ts`); nothing else becomes a rejection. A busy writer is retryable, never a rejection. |

A `RuntimeSession` is the live native session:

| Member | Contract |
| --- | --- |
| `isResume`, `sessionId` | Whether the open resumed; the runtime's own session id, persisted as `runtimeSessionId`. |
| `startTurn({ prompt, signal })` | Starts one turn. `events` yields `TurnEvent`s and ends after a settlement event; aborting `signal` cancels the turn. |
| `steer(text)` | Delivers text into the running turn → `SteerResult`. |
| `detach()` / `stop()` | Park at an idle boundary and return `RuntimeResumeState`. `detach` may keep a native process warm; `stop` ends it. |
| `destroy()` | Tear down with no resume state (after a failed turn). |

`RuntimeTurn.unconsumedSteers()` names steers the turn reported `delivered` with no evidence the
model received them (Claude Code lifecycle `started`/`completed`, a Codex `userMessage` item, a Grok
`_x.ai/session/interjection`): a Stop cancelled them or they were still queued at turn end. The
executor puts the latest back on the pending-notice path (`turn-notices.ts`) unless a newer notice
is already stored, so a notice is never lost.

`RuntimeTurn.settle()` drains a cancelled turn to the runtime's idle boundary. The executor waits
at most `stoppedTurnSettleMs` (20s) before failing the turn as a retryable timeout; parking a
turn that never settled would store a continuation the next prompt cannot start over.

Startup is bounded by the machine-wide start gate and startup deadline (`start-gate.ts`); a
session opened after its window was abandoned is destroyed.

## Session lifecycle

| Runtime | Native process | Turn | Busy delivery |
| --- | --- | --- | --- |
| Claude Code | One long-lived `claude` per Agent session: `--input-format stream-json --output-format stream-json --include-partial-messages --verbose`, plus `--resume <id>` on resume. Survives across turns while the Computer runs; `detach` keeps it, `stop` ends it. | Write one user message to stdin; the turn ends at the `result` message. | Write another user message to stdin mid-turn (Raft model). Claude Code queues it to its next safe boundary. |
| Codex | One `codex app-server --listen stdio://` per session, JSON-RPC. `thread/start` or `thread/resume`. | `turn/start`; ends at `turn/completed`. | `turn/steer` with the expected turn id, only after `turn/started` (Raft regression #238). |
| Grok Build | One `grok` ACP agent per session, JSON-RPC. `session/new` or `session/load`. | `session/prompt`; ends at the prompt response (deduplicated against the terminal notification). | `_x.ai/interject`. Unsupported interjection is `unsupported`, never a failed turn. |

The attachment daemon opens one `RuntimeContext` (`runtime/runtime-context.ts`) that the
production factory (`runtime/driver-factory.ts`) hands every driver: the Computer's host-tool
server, the process registry every runtime process joins (`runtime/process-registry.ts`), and the
shared warm pool (`runtime/warm-pool.ts`). The pool parks one process per Agent session, keyed by
the Agent root, reused only when runtime, native conversation, and launch fingerprint all match;
an idle process closes after 30 minutes. Agent reset or removal evicts its process; shutdown
closes the pool, then the host-tool server, then reaps any process still registered. Every
runtime process runs in its own process group (`runtime/process-group.ts`): terminating it ends
the whole group, even after the CLI leader exited, and the group stays registered until no member
is left. A leader that exits on its own still has its group ended, and a parked process that
exits is closed by the pool, which also revokes its host-tool scope. A parked
Haus resume state needs no resume-to-stop at shutdown: parking and stopping store the same state.

Background work stays off: Claude keeps `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` and `Monitor`
disallowed. A long-lived Claude process is what later makes background sub-agents possible, so
the Claude driver must not assume a turn ends the process.

## TurnEvent

Every event counts as turn progress (first-event timing, stall watchdog, no-progress deadline).
A driver emits at least one event per native message it receives; payload-free liveness is
`progress`.

```ts
type TurnEvent =
  | { type: 'progress'; nativeType: string }
  | { type: 'reasoning-start' | 'reasoning-end'; id: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'tool-call'; toolCallId; toolName; input; nativeName?; providerExecuted?; dynamic?;
      invalid?; sourceToolCallId? }
  | { type: 'tool-result'; toolCallId; toolName; output; isError?; preliminary?; nativeName?;
      providerExecuted?; dynamic? }
  | { type: 'tool-error'; toolCallId; toolName; error; nativeName?; providerExecuted?; dynamic? }
  | { type: 'tool-read-location'; toolCallId; path }
  | { type: 'subagent-started'; taskId; toolCallId; description?; subagentType? }
  | { type: 'subagent-progress'; taskId; description?; usage? }
  | { type: 'subagent-status'; taskId; status?; endTime?; usage? }
  | { type: 'subagent-tool-call'; parentToolCallId; toolCallId; toolName; input }
  | { type: 'subagent-tool-result'; parentToolCallId; toolCallId; output; isError }
  | { type: 'session-failure'; category; severity: 'error' | 'warning'; title }
  | { type: 'step-finish'; usage: RuntimeTokenUsage | null; contextTokens: number | null }
  | { type: 'turn-finish'; usage: RuntimeTokenUsage | null; claudePlanUsage }
  | { type: 'error'; error: unknown }
  | { type: 'abort' };
```

Semantics the consumers rely on:

- `providerExecuted` marks a runtime builtin (activity category from `activity-tool-fixtures.ts`);
  absent means a Haus host tool. `nativeName` is the runtime's wire name when it differs.
- `tool-read-location` precedes the read call it names (Codex shell-parsed reads).
- `sourceToolCallId` on a synthetic `fileChange` folds it into the edit call it restates.
- Sub-agent lineage is explicit (task id → delegating call; child calls name their parent). A
  sub-agent's own calls are journal evidence only.
- `step-finish.contextTokens` is that request's full input; the last one is the context size.
  `turn-finish.usage` wins over summed steps. Raft's normalizers own token-shape parsing.
- `session-failure` with `severity: 'error'`, or `category: 'access'`, ends the turn now; the
  stream stops at a fatal warning because the runtime keeps retrying behind it.
- `error` fails the turn (`HarnessTurnFailedError` keeps billable usage). `abort` is a cancelled
  turn. A fatal session failure outranks an abort.

## Steering and busy delivery

`SteerResult` is `{ delivered: true }`, or `{ delivered: false, reason }` with `unsupported`,
`idle` (no running turn), or `failed` (a running turn refused it; logged as
`inbox-notice-deferred`). Undelivered text stays in `runtime/pending-notice.json` for the next
turn. Busy notices still wait for a tool boundary with no call in flight
(`createNoticeCoordinator`), and the primary notice is delivered immediately. Steering resolves
only once the runtime acknowledges the write (stdin flushed and accepted for Claude, the JSON-RPC
response for Codex and Grok).

## Resume state

Stored in the Agent's `session.json` as `resumeState`, validated at read
(`parseRuntimeResumeState`). Each driver owns one versioned shape:

| Runtime | Shape |
| --- | --- |
| Claude Code | `{ runtime: 'claude-code', version: 1, claudeSessionId }` |
| Codex | `{ runtime: 'codex', version: 1, threadId }` |
| Grok Build | `{ runtime: 'grok-build', version: 1, sessionId }` |

The conversation itself stays in the runtime's own store under the Agent HOME. A legacy AI SDK
harness state (`{ type: 'resume-session', harnessId, data }`) converts on the driver's first open
(`runtime/legacy-resume-state.ts`) instead of rotating the generation; detach then stores the Haus
shape. Verified against real `session.json` files: Claude Code under `data.claudeSessionId`,
Codex and Grok Build under `data.acpSessionId` (the Codex app-server thread id names its rollout).
A missing native session falls back to a fresh one only through the existing resume-rejection
recovery; Raft's silent `fallback_fresh_thread` is not adopted. The same holds for a stored state
this Computer cannot read (an unknown version, a damaged Haus shape, a non-object): it parses as
`UnreadableResumeState`, never as no state, and every driver rejects it as `invalid-state`.

## Isolation and launch environment

Every driver launches with HOME = the Agent HOME and the Agent workspace as cwd, inherits the
turn's `env` (Haus CLI, PATH, runner token), and links host logins into the HOME through the
auth profiles (`runtime/auth-profiles.ts`). What each runtime must keep, carried over from the AI
SDK harness setup and its patches:

**Claude Code**
- Settings from user scope only (`--setting-sources user`); no project/local `CLAUDE.md`.
- `--strict-mcp-config` with only the Haus host-tool MCP server; no operator MCP servers.
- `--disallowedTools` = `CLAUDE_DISALLOWED_TOOLS`; `--allowedTools` names `Glob` and `Grep`
  (the native build otherwise drops both from the Agent and sub-agents).
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; `--effort` from reasoning effort; extended thinking
  enabled for `claude-haiku-4-5`; `--permission-mode bypassPermissions`.
- Instructions through `--append-system-prompt-file` (owner-only file), never argv.
- Never persist live credentials in any Haus-written launch record.
- Plan usage read after a turn when `HAUS_CLAUDE_USAGE_REFRESH=1` (`turn-finish.claudePlanUsage`).
- A sub-agent's failure or error never ends the parent turn.

**Codex**
- Isolated `CODEX_HOME=<home>/.codex`; host `auth.json` linked.
- Config: `developer_instructions` = composed instructions, `model_reasoning_effort`,
  `web_search = live`, `project_doc_max_bytes = 0`, `features.apps/plugins/multi_agent = false`,
  `agents.enabled = false`; approval never, sandbox full access; `NO_BROWSER=1`.
- Typed provider failures: the app-server's `error`/`thread/status/changed systemError` become
  `session-failure`/`error`; a 401 retry is fatal.
- Native image generation stays enabled (`generated-images.ts` moves output into the workspace).

**Grok Build**
- `GROK_HOME=<home>/.grok`, instructions at `$GROK_HOME/AGENTS.md`; `GROK_INSTRUCTION_COMPAT_ENV`,
  foreign MCP sources off, `GROK_ASK_USER_QUESTION=false`, `GROK_SUBAGENTS=0`,
  `GROK_MAX_MCP_OUTPUT_BYTES=102400`; the operator's installed `grok`, never an npm copy.
- Permission requests auto-approve only with both launch and session yolo facts (Raft).

Each driver's launch test (`claude-launch.test.ts`, `codex-launch.test.ts`, `grok-launch.test.ts`)
is the deterministic proof; `claude-context-isolation-live.test.ts` and
`codex-isolation-live.test.ts` prove it against the real CLI.

## Host tools

Haus host tools (`execute` for Server MCP, `browser`) are a `HostToolSet` served to every runtime
through one Computer-local MCP server (`apps/computer/src/host-tools/`), bound to the turn and
addressed to the runtime as its only MCP server. Drivers report host-tool calls without
`providerExecuted`.

## Behavior catalog

Ported Raft tests carry `// Ported from botiverse/raft-source <path> (FSL-1.1-ALv2)`. Port by
case, adapted to `TurnEvent`; skip Windows, probe/discovery, model-detection, and telemetry-only
cases.

| Raft file | Port |
| --- | --- |
| `claudeLaunch.test.ts` | disallows provider-native cron tools; passes exact model and effort; resume passes the session id; standing instructions via prompt file only; no chat-MCP flags; prompt file owner-only. |
| `claude.test.ts` | stream-json launch args; launch continues without managed MCP when discovery fails; oversized startup payload blocked before launch. |
| `claudeEventNormalizer.test.ts` | result `error_during_execution`, `is_error`, budget, `max_tokens` errors; provider API failure text as error (not when the turn also called a tool); assistant SDK `error` field; rate-limit classification; stream events as progress; tool_use id and tool_result outcome (Haus keeps the bridge's projection: a Bash non-zero exit is a `tool-error`, not Raft #17's ok call); sub-agent lineage (6a/6b, task_notification status); user tool_result as a steering boundary; result usage per turn. |
| `codex.test.ts` | fresh/resume thread start; resume missing rollout or active writer; archived thread; initialize/thread/turn start errors as startup failures; waits for the MCP server before the first turn; idle `turn/start` vs busy `turn/steer`; steering gate (#238) and its fallback; no duplicated agent text; commentary vs final_answer phases; no-output success as error; compaction and review lifecycle; tool output for completed items; secondary-thread isolation; `systemError` to error; retryable errors as liveness; raw capacity errors; interrupted turns non-success; model/effort on thread request. |
| `codexBlankFinalAnswer.contract.test.ts` | blank final answer handling. |
| `grok.test.ts`, `grokEventNormalizer.test.ts` | handshake, model select, dedup completion; missing resume; auth failure message; permission auto-approve rules; idle prompt vs busy interjection; unsupported interjection; late terminal notification; text/thought/tool normalization; failed or cancelled tool outcome. |
| `runtimeSession.test.ts`, `runtimeContract.test.ts` | split UTF-8 stdout decoding; exit emitted once; abandoned child fails; idle prompt vs busy steering per lifecycle. |
| `cliTransport.test.ts` | stdin write flushing and backpressure cases the Claude driver uses. |

Haus-side parity proof stays the existing suite: `executor*.test.ts`, `turn-stream.test.ts`,
`activity-projector*.test.ts`, `subagent-steps.test.ts`, `file-change-fold.test.ts`,
`steer-inbox-notice.test.ts`, `session-*.test.ts`, `runtime-session-failure*.test.ts`, the
token-usage tests, and the opt-in live tests.

## Recording fixtures

Each driver gets replay fixtures captured from the real CLI, so normalizers are tested against
real streams rather than hand-written frames:

1. A capture script (`scripts/runtime-fixtures/capture.ts`) launches the CLI exactly as the
   driver does in a throwaway HOME and records every stdin write and stdout/stderr line with
   relative timing to `apps/computer/src/runtime/fixtures/<runtime>/<scenario>.jsonl`.
2. Scenarios per runtime: plain reply; reasoning; shell tool; file edit; host MCP tool call;
   steer mid-turn; Stop mid-tool; resume after restart; provider auth failure; Claude sub-agent;
   Codex image generation.
3. Fixtures are scrubbed (tokens, paths, account ids) and committed; a replay helper feeds a
   fixture through the normalizer and asserts the `TurnEvent` sequence.
4. Re-capture when a runtime upgrade changes its stream; the diff is the review surface.

## Phases

1. **Seam (done):** contract types, `TurnEvent` consumers, the temporary AI SDK adapter
   (`runtime/ai-sdk-adapter.ts`, `runtime/ai-sdk-turn-events.ts`); no behavior change.
2. **Host-tool MCP server (done)** (`host-tools/`), used by the adapter first.
3. **Claude Code, Codex, and Grok Build drivers (done)** with fixtures, ported tests, and live
   tests.
4. **Drivers are the execution path (done):** `driver-factory.ts` maps each runtime to its driver
   through the daemon's `RuntimeContext`; Pi left execution; legacy resume conversion; typed
   resume rejection; returned steers; bridge prewarm replaced by `runtime-prewarm.ts`. The
   adapter remains, unused outside tests. Proof: `harness/runtime-driver-e2e-live.test.ts`.
5. **Remove the adapter (done):** the adapter, its resume-rejection mapping, the harness
   packages, bridge bootstrap and prewarm, the AI SDK sandbox, every AI SDK dependency, and their
   patches and Dependency Patches rows are gone. Facts the drivers still use moved under
   `runtime/` (`process-registry.ts`, `process-group-liveness.ts`, `auth-profiles.ts`,
   `runtime-subagents.ts`, `runtime-assets.ts` for the release and doctor check, one
   `event-queue.ts` for Claude Code and Grok Build). Executor, launch, and shutdown tests script
   `TurnEvent`s through `runtime/testing/fake-runtime-driver.ts`. A legacy AI SDK resume state
   still converts on first open (`legacy-resume-state.ts`).

Each phase gates on: Computer test + typecheck, the runtime's fixtures, its opt-in live test,
and a time-to-first-event and turn-latency comparison against the previous build
(`AgentTurnTimings`: `harness_ready`, `session_create`, `first_stream`, `first_tool`). A driver
that regresses either does not ship.
