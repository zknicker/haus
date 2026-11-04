---
summary: Normative contract for the Haus-owned runtime drivers (Claude Code, Codex, Grok Build) that run every Agent turn inside Haus Computer — driver and session interfaces, TurnEvent vocabulary, steering, resume state, isolation, host tools, fixtures, and the completed migration from the AI SDK harness.
read_when:
  - changing apps/computer/src/runtime/ (driver contract, TurnEvent, resume state, legacy resume conversion, test fake driver)
  - adding or changing a Claude Code, Codex, or Grok Build driver, or its launch flags, env, or event normalizer
  - changing how a turn's events reach activity, the execution journal, thoughts, usage, or steering
  - changing Claude Code background sub-agents or shells, the sub-agent wake, or the warm-pool exemption for background work
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
| `startTurn({ prompt, signal, wake? })` | Starts one turn. `events` yields `TurnEvent`s and ends after a settlement event; aborting `signal` cancels the turn. A turn the runtime started on its own is folded in; with `wake` it replaces the prompt (Background work). |
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
an idle process closes after 60 minutes (`idleMs`, the daemon's `warmIdleMs`), the length of
Claude Code's one-hour prompt cache, so a turn inside the window reuses both the process and the
cached prefix. Agent reset or removal evicts its process; shutdown
closes the pool, then the host-tool server, then reaps any process still registered. Every
runtime process runs in its own process group (`runtime/process-group.ts`): terminating it ends
the whole group, even after the CLI leader exited, and the group stays registered until no member
is left. A leader that exits on its own still has its group ended, and a parked process that
exits is closed by the pool, which also revokes its host-tool scope. A parked
Haus resume state needs no resume-to-stop at shutdown: parking and stopping store the same state.

A process holding background work (below) is exempt from the idle close and from the
launch-fingerprint close: new launch facts wait until the work ends, and the next claim
relaunches. Evict (reset, retirement, Restart, Stop) and pool close still end it. The exemption is
bounded: once the oldest live background task has run for `backgroundLimitMs` (a pool option,
default four hours, checked at each idle window) the work counts as hung and the idle close ends
the process as an unplanned end, so the Agent is woken with reason `stopped`.

## Background work

Claude Code runs background sub-agents and background shells past the turn that starts them, as
in Raft. The turn ends at the result for its own prompt; the Agent goes idle (the run settles and
its reservation is released) and stays reachable while the work runs. Only Claude Code does this:
Codex and Grok Build start no sub-agents.

| Concern | Contract |
| --- | --- |
| Launch | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` is never set (dropped from inherited env), so `run_in_background` and auto-backgrounding of long commands stay on, Raft's default. `Monitor` stays disallowed: it streams output into the conversation, a wake source Haus does not surface. Known gap: Claude Code (seen in 2.1.284) blocks a foreground `sleep` behind a remote feature flag (`tengu_amber_sentinel`), and both that block's tool error and the Bash tool description then tell the model to use `Monitor`. No CLI flag or env var turns the steer off short of disabling all remote flags, so the model can try `Monitor`, get the disallowed-tool error, and fall back to the error's other advice (`run_in_background`). |
| Default | Since 2.1.317 an Agent call without `run_in_background` runs in the background (only `false` keeps it in the foreground). Fork sub-agents are off (`CLAUDE_CODE_FORK_SUBAGENT=0`, forced over any inherited value): a fork inherits the whole global session, every chat it spans, so each sub-agent starts blank-slate. |
| Cap | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=4` (`claude-launch.ts`), enforced by Claude Code itself: an Agent call past it is a tool error telling the model not to retry. It counts foreground and background sub-agents together; shells are not capped. |
| Handshake | Every process sends the SDK `initialize` control request with `perTaskStopAffordance: true` before its first turn. Its response names `claude_code_version`; a pinned install that reports another release is logged (`[claude-code] pinned ...`). Without it Claude Code kills every background task on interrupt; with it an interrupt (Stop, a fatal event, the no-progress deadline) ends only the turn. A resumed conversation Claude Code no longer has exits before answering, which is the typed `missing` rejection at open. |
| Tracking | `system/background_tasks_changed` carries the whole live set (replace semantics); ambient tasks never count. `ClaudeConnection.backgroundWork` is `{ subagents, tasks }` (`local_agent` tasks, all tasks). A task's lifetime runs from the first report of its `run_id`: a continued sub-agent keeps its task id under a new run. A sub-agent's own background shell is a task with `parent_task_id`, and can outlive it. Since 2.1.317 a finish arrives as `task_updated`, `task_notification`, then `background_tasks_changed`, all before the self-started turn's `init`, so a wake sees the live set without the finished task. |
| Between turns | The connection keeps reading stdout with no turn attached. When a task finishes and no turn holds the connection, Claude Code starts a turn of its own (`system/init`, then a `result` with `origin.kind = 'task-notification'` and no `user_message_uuid`). The connection buffers it from `init` and reports a wake once it reaches the model. A notification-origin result never settles a Haus turn that did not adopt it. Only a line that asks the model (a `requesting` status, or the Agent's own stream or message) asks for a wake: a self-started run that never reaches the model (an orphan notice, a compaction) is kept for adoption and wakes nobody. |
| Claude Code's own idle compaction | Claude Code 2.1.299+ compacts an attended session (interactive, or an IDE/desktop entrypoint) at 90% of its one-hour prompt-cache TTL, but never arms it for the `sdk-ts` entrypoint Haus launches (2.1.317: a parked 240K-token session wrote nothing in 57 idle minutes). Haus runs the same compaction itself (Idle compaction below). Should the CLI ever start one between turns it prints `status`, `init`, `compact_boundary`, the summary, and a zero-turn result naming no message: it wakes nobody, a turn that starts after it never sees it, and a turn that adopts it mid-flight journals the compaction and settles only on its own result (`claudeResultOwner` `self`; `claude-idle-compaction.test.ts`). |
| Fold | A task that finishes while a Haus turn runs is folded into that turn by Claude Code: one result, no wake. |
| Adoption | `startTurn` takes any running self-started turn into the new turn (its buffered lines replay first): one run holds the Agent at a time, so the run that starts next is the only one that can own it. With `wake: true` (the sub-agent wake run) the adopted turn replaces the prompt. Any other run (a human message's run that reached the session before the wake) folds it in as Claude Code folds a completion into a running turn: its prompt is written and queues behind the adopted turn, the run owns that turn's output and `haus` calls (its runner releases the proxy hold), and the Computer retires the wake asked for it (`agent-subagent-wake-retire` with that wake id), so no wake re-prompts afterwards. A self-started turn that reached its result before any run adopted it is dropped, and the wake run writes its prompt. |
| Fence | `ClaudeConnection.fenceSelfStartedTurn` interrupts a self-started turn whose wake the Server refused, sparing background tasks (`perTaskStopAffordance`); a process that does not answer within five seconds is ended. Tool calls the turn made before the refusal arrived (one Server round trip) are the unavoidable unadmitted window; its `haus` calls wait at the proxy hold and never run unadmitted. |
| Orphans | A resumed process reports tasks the previous process left running as `task_notification` `stopped` and records the notice in the conversation without calling the model (a zero-turn `result`). |

The Computer side (`background-work-reporter.ts`, wired through `RuntimeContext.background`):

- **Wake.** A self-started turn asks the Server for a sub-agent wake (`agent-subagent-wake`,
  reason `finished`, a Computer-minted `wakeId`, the session generation from `session.json`), and
  the loopback proxy holds the Agent's `haus` calls (`holdForRunner`, up to 120 seconds) until a
  run's runner arrives. The Server queues one chatless concrete inbox item (source `subagent`,
  like a dream) only for the Agent's current generation, its assigned Computer, and a running
  Agent; one queued wake covers every report. It spends the automation chain. The wake run
  (`subagentWake` on the start frame, trigger kind `subagent`) adopts Claude Code's turn, or
  prompts the Agent to report or stop (`subagentWakeTurnLine`).
- **Admission.** The Server answers every request with `agent-subagent-wake-result`:
  `accepted` (queued, covered by a queued wake, or a resend of one it already queued) or
  `refused` (another generation or Computer, a stopped Agent, or the automation chain at its
  ceiling with no reset work queued to lead and no active run). A refusal of the wake for the
  turn still running fences that turn (Fence above) when its process is parked; a process a run
  already claimed was adopted by that run. A refused report stays in the conversation for the
  next admitted turn.
- **Delivery.** Each request is written to `runtime/subagent-wake.json` before it is sent and
  resent on every connect until its result arrives, so a request sent between connections is
  never lost. A deliberate end and a run that folded the turn in retire it. Every marker and
  wake-file write runs on a per-Agent queue in call order (`keyed-queue.ts`), and a deliberate
  end waits for that queue, so a stale write can never land after a later end or cleanup.
- **Lost work.** A process that ends with tasks still live (a crash, a failed turn's destroy, a
  daemon restart, a hung task past the lifetime bound) wakes the Agent with reason `stopped`, so
  it can tell whoever was waiting. During shutdown a marker (`runtime/background-work.json`)
  carries it to the next daemon start. A deliberate end (`evictWarmRuntime`: reset, retirement,
  Restart, Stop) wakes nobody, clears the marker, and retires any pending wake request.
- **Stop.** A human Stop sends `agent-stop-background`; the Computer waits for any live turn to
  settle and park, then evicts the process. Stop and session reset retire queued wakes.
- **Restart.** An instruction Restart ends the parked process the same way, deliberately and
  unreported as Stop does, before disposing its loopback proxy; the next turn resumes the
  conversation on a new process.
- **Activity.** The live sub-agent count reaches the Server as `agent-background-work`
  (specs/agent-activity.md "Background sub-agents"), with the live task count beside it. Any live
  task holds the Agent's heartbeats and dreams (specs/heartbeat.md "Who runs, and who skips").

## Idle compaction

Haus compacts a parked Claude Code session shortly before its one-hour prompt cache expires,
mirroring Claude Code's own idle compaction exactly, which the CLI ships on but never arms for a
headless `sdk-ts` session. A session idle past the cache would otherwise resume cold and re-write
its whole prefix (production: 200K-950K-token Agent sessions, about 58% of Claude Code Agent
spend). Compacting first also refreshes the system prompt: with Claude Code's default
`--system-prompt-snapshot on` the recorded prompt updates only after a compaction.

| Concern | Contract |
| --- | --- |
| Gate | The Owner's Server setting **Idle compaction** (`servers.idle_compaction`, default off, `server.settings` / `server.setIdleCompaction`). The Server sends `server-runtime-settings` (`packages/haus-api/src/server-settings.ts`) to each Computer on attach and to every attached Computer on change; the daemon applies it to the warm pool (`setIdleCompaction`). Until the first frame arrives every setting is off. Turning it off cancels every armed timer; a compaction already running finishes. |
| Arming | After every turn the process parks; the pool (`runtime/idle-compaction-scheduler.ts`) arms one timer when the last main-conversation request wrote the one-hour cache (`cache_creation.ephemeral_1h_input_tokens`; a full cache hit keeps the lifetime last written). It fires at `lastActivityAt + 0.9 × (cacheExpiresAt − lastActivityAt)`, about 54 minutes after that request answered (`runtime/idle-compaction.ts`). Nothing is armed for a throwaway (heartbeat) session, before a process's first request, or when the 60-minute idle close would come first. |
| Skips | At fire time, Claude Code's rules: fired more than 60s late (a sleeping machine), a newer main request since arming, context under `max(100000, CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS ?? 200000)` (the whole prompt: fresh, cache-read, and cache-written input), or the last `rate_limit_event` status anything but `allowed`. Plus Haus's own: background work or a self-started turn is live, a run holds or waits for the Agent, or the Agent is being reset or retired. Each skip is logged (`runtime-idle-compaction-skipped`). |
| Compaction | `ClaudeConnection.compact()` (`claude-compaction.ts`) writes `/compact` with no instructions, exactly what Claude Code's idle compaction calls, as a user message on the parked process. A dedicated sink takes the stream until the zero-turn result naming that message: `compacting` status, `compact_boundary` (trigger `manual`, pre and post tokens), the summary, the result. PreCompact and PostCompact hooks fire as for `/compact`. A refusal, a result with no boundary, or an exit rejects it; past ten minutes the process is ended as hung and the next turn resumes cold. |
| Races | A turn that claims the process mid-compaction waits for it (`WarmProcessPool.claim`) and then runs on the compacted conversation; nothing interleaves. The turn's 120-second startup deadline (`harnessStartupDeadlineMs`) still bounds that wait: a compaction slower than it fails that start (a 501K-token Haiku session took 8 seconds). The idle close never cuts a running compaction: it runs once the compaction finished. Evict (reset, retirement, Restart, Stop) and pool close still end it. |
| Spend | The compaction's own result reports zero usage; its spend appears only in the CLI's cumulative `total_cost_usd` and `modelUsage`. `ClaudeIdleActivity` keeps the last cumulative reading, and the result carries the difference: token usage (fresh, cache read, cache written, output; every model) and API-equivalent cost. |
| Record | The daemon (`idle-compaction-reporter.ts`) writes one execution journal under a Computer-minted id `compaction-<uuid>` holding the same `compaction` tool pair a compaction inside a turn writes (trigger `idle`, tokens before and after, summary; Activity skips it), uploads it like any run's journal, and sends `agent-idle-compaction`. The Server records that as the Agent's completed turn under the compaction id (summary `Compacted idle context: 812K → 41K tokens.`, no messages), so the daily usage rollup counts it; a resend is the same row. It settles no delivery. A report sent while the socket is down is lost (logged, not queued). |
| Verify | Unit: `idle-compaction.test.ts`, `idle-compaction-scheduler.test.ts`, `claude-compaction.test.ts` (the recorded `/compact`), `idle-compaction-reporter.test.ts`, `server-runtime-settings-frame.test.ts`, Server `haus-server-idle-compaction.test.ts`. Live, timer shortened to 5s (Claude live lane): `HAUS_RUN_LIVE_CLAUDE_CODE_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-live.test.ts`. Live, the real 54-minute timer under the default 60-minute close (about an hour): `HAUS_RUN_LIVE_CLAUDE_IDLE_COMPACT_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-live.test.ts`. Recall on a ~500K-token session (under a dollar of Haiku): `HAUS_RUN_LIVE_CLAUDE_IDLE_RECALL_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-recall-live.test.ts`. |

Recall (2.1.317, Haiku 5.5, 2026-11-04): a 501K-token session compacted to 3.4K tokens in 8s for
$0.09. The Agent kept the facts stated in prose early and last, and its in-progress task in full
(step, table, next step). It lost facts buried mid-session inside filler (an auditor's name, a
serial number, a single ledger line) and said "unknown" for them and for a fact never stated; it
invented nothing. The summary points the Agent at the full transcript, so a lost detail stays
recoverable with a file read.

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
response for Codex and Grok). A Claude steer whose stdin write succeeded is never dropped: when
its queue receipt is late it still reports `delivered`, stays tracked (holding the turn open), and
counts as unconsumed until Claude Code starts it. A Claude turn settles only on results for the
messages it wrote, so a stray result on the warm connection never finishes another turn. The
executor closes the turn's notices, waiting out every steer still awaiting its answer, before it
reads `unconsumedSteers()`.

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
- The pinned CLI is `CLAUDE_CODE_VERSION` (2.1.317) in `claude-install.ts`, one npm registry
  integrity per platform package; a bump changes the bootstrap fingerprint, which restarts parked
  sessions, and re-records the fixtures.
- Background work on, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=4`, `CLAUDE_CODE_FORK_SUBAGENT=0`,
  and the `initialize` handshake with `perTaskStopAffordance` (see Background work); `--effort`
  from reasoning effort; adaptive thinking with summarized display, except Haiku 4.5, which runs
  extended thinking with no display override (Haiku 5.5 supports adaptive thinking and effort,
  so it takes the default); `--permission-mode bypassPermissions`.
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

1. A capture script (`apps/computer/src/runtime/<runtime>/fixtures/capture.ts`; Codex
   `capture-fixtures.ts`) launches the CLI exactly as the driver does in a throwaway HOME and
   records every stdin write and stdout/stderr line with relative timing to
   `<scenario>.jsonl` beside it. Claude:
   `bun apps/computer/src/runtime/claude-code/fixtures/capture.ts <scenario> <claude-binary>`,
   one scenario per run, against the pinned install under `~/.haus/cache/claude-code/`.
2. Scenarios per runtime: plain reply; reasoning; shell tool; file edit; host MCP tool call;
   steer mid-turn; Stop mid-tool; resume after restart; provider auth failure; Claude sub-agent;
   Codex image generation. Claude background work has its own
   (`capture-background-scenarios.ts`): `background-subagent`, `background-fold`,
   `background-interrupt`, `background-orphan`, replayed by `claude-background-replay.test.ts`;
   `claude-background-live.test.ts` proves the flow against the real CLI.
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
