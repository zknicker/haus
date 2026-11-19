---
summary: Normative runtime contract after ADR 0057. Each Agent's loop runs in the runner, a sandboxed Server-side process, on the Claude Agent SDK or Pi Durable, with sessions on the runner's volume. The Agent's machine runs its tools through invocations with Server-minted ids, an accepted-before-run ledger, and fixed outcomes (completed, failed, timed-out, cancelled, unknown, offline). Covers the tool set, the `haus` CLI on the runner, inbox delivery to the runner, logins, the frames that change, and what stays on Computers for Workers.
read_when:
  - changing where an Agent's loop runs, the runner, its container, its volume, or its credentials
  - changing the Claude Agent SDK or Pi Durable harness, harness pinning, or session reset
  - changing the invocation contract, the Computer result ledger, timeouts, cancellation, output limits, or offline answers
  - changing the Agent's tools (bash, shell, the edit tools, execute) or how the haus CLI runs for an Agent
  - changing how inbox items, notices, steering, or turn reports move between the Server and the runner
  - changing model logins, runner settings, or which models an Agent can use
  - changing the Computer or runner protocol frames for Agents, drive pulls, or pushes
  - changing the native Claude Code, Codex, or Grok Build drivers that run Workers on Computers
---

# Runtime drivers

This is the target contract that
[ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) sets, built
by R2 to R5 of the [program plan](../docs/plans/capy-direction-program.md). Until R4 merges,
Agents still run on Computers as this file described at `cc8a8cd18`
(`git show cc8a8cd18:specs/runtime-drivers.md`).

An Agent has three parts in three places:

| Part | Where | Owns |
| --- | --- | --- |
| Loop | The runner, beside the Server | The harness session, the turn executor, prompt composition, the inbox store, steering, the `haus` CLI, and `execute` |
| Tools | The Agent's machine, a Computer in v1 | `bash` and edit invocations, the result ledger, the `drive/` folder, and agent-browser |
| State | The Server | Everything canonical: chats, inbox items, Drive, invocation records, the Agent's machine setting, and every id |

The runner never talks to a Computer. Every frame between them passes through the Server, which
owns routing. Workers keep the old shape, a native harness on a machine (Workers below).

## The runner

The runner is one process in its own container, `haus-runner`, in the Server host's Compose
project `haus`, with the named volume `haus_runner_data` mounted at `/data`. It is built and
released with the Server from the same commit, so the runner and the Server never negotiate a
version. Its code lives in `apps/runner/`.

What the runner holds:

- `HAUS_SERVER_URL` and `HAUS_RUNNER_TOKEN`. The token opens the runner socket and does nothing
  else.
- Model logins (Logins below).
- Each Agent's harness session under `/data/agents/<agent-id>/`.

What it never holds: database credentials, the Server's own secrets, MCP credentials, Computer
credentials, or any Server-valid credential beyond a run's. Oxlint rules in the repo plugin stop
`apps/runner/**` importing `apps/server/**`, PostgreSQL clients, or Server secrets modules (R3).
The container's network reaches the Server's runner endpoint and the internet, and is denied the
database port and private address ranges. R3 proves the deny from inside the container.

A run's authority comes in its start frame: a run credential the Server mints for that Agent and
run, with the Agent API scopes a Computer mints today, revoked when the run settles. The runner
uses it for `haus` commands, `execute`, Drive reads, and invocation requests. Nothing else in the
runner can act as an Agent.

In development, `bun run dev` runs the runner as a local process with the same environment
contract and no container. The Oxlint rules hold the boundary there.

The volume holds sessions only. Rules, memory, and skills are canonical in Drive. The Server host
has no off-machine backup ([deploy](../docs/operations/haus-server-deploy.md#off-machine-backup)),
so the volume shares that posture: losing it costs every Agent its live context, and each Agent
recovers through the reset path below.

### Capacity

The runner runs one turn per Agent at a time (ADR 0011) and many Agents at once. It keeps a warm
harness process per Agent for 60 minutes after its last turn, the length of Claude's one-hour
prompt cache, and caps warm processes at `HAUS_RUNNER_MAX_WARM` (default 16), closing the least
recently used idle one first. A turn never waits for a warm slot. It opens a cold process, which
resumes from the volume.

## Harnesses

Each Agent is pinned to one harness by its model:

| Models | Harness | Session store |
| --- | --- | --- |
| Every Claude model | Claude Agent SDK | `CLAUDE_CONFIG_DIR=/data/agents/<agent-id>/claude/` |
| Every other model, including GPT, Grok, and Gemini | Pi Durable | Pi's file backend under `/data/agents/<agent-id>/pi/` |

`/data/agents/<agent-id>/session.json` records `{ generation, harness, nativeSessionId }`. The
session never leaves the volume. Changing the Agent's machine changes where tools run and nothing
about the session.

### Claude Agent SDK

- Pinned in `apps/runner/package.json` with an exact version. A bump is its own PR and
  re-records the fixtures.
- Native tools off except `WebSearch` and `WebFetch`, which run in the runner and reach the
  internet, never the machine. `Task`/`Agent`, `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`,
  `NotebookEdit`, `TodoWrite`, `Skill`, `Monitor`, and the cron tools are off.
- Haus tools are one in-process SDK MCP server named `haus`, the only MCP server
  (`strictMcpConfig`). The model sees them as `mcp__haus__<name>`.
- The system prompt is the Haus composed prompt alone, not the `claude_code` preset, because the
  preset teaches tools that are off. R3 measures that change through the prompt contract.
- No setting sources: no user, project, or local settings, `CLAUDE.md`, plugins, or hooks from
  disk.
- Effort, adaptive thinking, and Haiku 4.5's extended thinking carry over from the Claude Code
  driver unchanged.
- Streaming input mode. Busy delivery writes a user message into the live query, which Claude
  queues to its next safe boundary, as the stream-json driver did.
- Plan usage (`turn-finish.claudePlanUsage`) is read after a turn when
  `HAUS_CLAUDE_USAGE_REFRESH=1`, as before.

### Pi Durable

- Pinned to an exact version and kept behind the harness boundary, so a Pi API change touches one
  module (R5).
- Pi's own tools are off. Haus registers its tools as Pi custom tools.
- The system prompt is the Haus composed prompt. Pi's default prompt and its context files
  (`AGENTS.md` discovery) are off.
- Busy delivery uses Pi's steering queue, which delivers at the next tool boundary.
- Providers come from Pi: OpenAI (ChatGPT plans through the Codex sign-in), xAI, Google, and
  OpenRouter, as runner logins allow.

### Pinning and reset

A model change resets the session, as ADR 0011 already says. A change that crosses harnesses is
the same reset and nothing more: the native stores are incompatible, so nothing carries over.

Reset rebuilds from Drive. The next turn starts a fresh session with the composed prompt, which
carries the current rules and `MEMORY.md`, and the pending inbox. There is no constructed
briefing ([ADR 0011](../docs/adr/0011-agents-own-one-global-session.md#considered-recycle-on-cold-wake)).
The Agent reads recent history itself with `haus message read`.

Resume recovery stands as [Sessions](sessions.md) defines it. A native session the harness proves
unusable throws `RuntimeResumeRejectedError`, the runner rotates the generation, and the Agent
cold-starts once.

### Cutover

R4 moves every Agent at once and resets every session. No native session is copied from a
Computer. Codex and Grok Build stores cannot load in Pi, and a Claude Code session would resume
with a recorded system prompt and tool set that no longer exist. Each Agent's first runner turn
is a reset turn as above, with its generation rotated and its pending inbox offered again. R4
rehearses this on the dev Server with every seeded Agent first.

## Turns

The turn executor moves from `apps/computer/src/harness/` to the runner unchanged in contract.
The `TurnEvent` vocabulary, steering, unconsumed steers, instruction updates on resume,
compaction reporting, activity projection, the execution journal, and thoughts keep their current
shapes and consumers. Below is what each now means on the runner.

### Driver contract

A `RuntimeDriverFactory` binds a harness to one turn's launch facts: harness, model, reasoning
effort, composed instructions, the Agent's session directory, the tool set, and the run's
credential.

| Member | Contract |
| --- | --- |
| `bootstrapFingerprint(signal)` | Hash of the harness version and its launch options. Drift parks and restarts a resumed session. |
| `openSession({ sessionId, resumeFrom, signal })` | Fresh session, or a native resume of `resumeFrom`. A resume the harness proves unusable throws `RuntimeResumeRejectedError`, and nothing else does. |

A `RuntimeSession` keeps `isResume`, `sessionId`, `startTurn({ prompt, signal })`, `steer(text)`,
`detach()`, `stop()`, and `destroy()` with their current meanings. `startTurn` loses `wake`,
because nothing starts a turn on its own (Removed below). `RuntimeTurn.unconsumedSteers()` and
`settle()` keep their contracts and the 20-second settle bound.

### TurnEvent

```ts
type TurnEvent =
  | { type: 'progress'; nativeType: string }
  | { type: 'reasoning-start' | 'reasoning-end'; id: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'tool-call'; toolCallId; toolName; input; nativeName?; providerExecuted?; invalid? }
  | { type: 'tool-result'; toolCallId; toolName; output; isError?; nativeName?;
      providerExecuted?; invocation?: InvocationOutcome }
  | { type: 'tool-error'; toolCallId; toolName; error; nativeName?; providerExecuted? }
  | { type: 'session-failure'; category; severity: 'error' | 'warning'; title }
  | { type: 'step-finish'; usage: RuntimeTokenUsage | null; contextTokens: number | null }
  | { type: 'turn-finish'; usage: RuntimeTokenUsage | null; claudePlanUsage }
  | { type: 'error'; error: unknown }
  | { type: 'abort' };
```

- `providerExecuted` marks `WebSearch` and `WebFetch`. Every other tool is a Haus tool.
- A `tool-result` for a machine tool carries its invocation outcome, so activity and the journal
  show `offline` and `unknown` as themselves, not as generic errors.
- The `subagent-*` events, `tool-read-location`, and `sourceToolCallId` are deleted with the
  native tools that produced them.
- Usage, `contextTokens`, fatal `session-failure`, `error`, and `abort` keep their current
  semantics.

### Instructions

The runner composes every turn's instructions from the Server's current Drive revisions
([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md) decision 7), read with
the run credential, never from a machine. The prompt contract (the size cap, the divergence
register, `test:prompt-contract`, `instructions.test.ts`, and `managed-instructions.test.ts`)
moves with the composition code to `apps/runner/` in R3.

A resumed native session keeps the instructions it started with on both harnesses. The executor
keeps resumed sessions current as it does today (specs/sessions.md "Instruction updates").

Skills load from Drive. The runner lists the Agent's skills in its instructions by name and
description, from `agents/<handle>/skills/*/SKILL.md`, and the Agent opens one with
`haus skill view`. The listing text goes through the prompt contract in R3.

### Idle compaction

Idle compaction moves to the runner's Claude Agent SDK harness with every rule unchanged: the
gate, arming at 90 percent of the one-hour cache, the skips, `/compact` on the parked session,
the races, the spend reading, and the `agent-idle-compaction` record. The Server sends
`server-runtime-settings` to the runner instead of to Computers. Pi Durable has no idle
compaction, and the setting has no effect on its Agents.

## The Agent's tools

| Model family | Machine tools | Runner tools |
| --- | --- | --- |
| Claude | `bash`, `str_replace_based_edit_tool` | `execute`, `WebSearch`, `WebFetch` |
| GPT | `shell`, `apply_patch`, `view_image` | `execute`, provider web search where Pi exposes it |
| Every other Pi model | `bash`, `str_replace_based_edit_tool` | `execute` |

Each machine tool keeps the input shape its models are trained on:

| Tool | Input |
| --- | --- |
| `bash` | `{ command: string, timeout?: number, description?: string }`, Claude Code's Bash shape without `run_in_background` |
| `str_replace_based_edit_tool` | `{ command: 'view' \| 'create' \| 'str_replace' \| 'insert', path, file_text?, old_str?, new_str?, insert_line?, view_range? }`, Anthropic's text editor shape |
| `shell` | `{ command: string[], workdir?: string, timeout_ms?: number }`, Codex's shape |
| `apply_patch` | `{ input: string }`, Codex's patch grammar |
| `view_image` | `{ path: string }` |

The implementations come from Pi's MIT tool code where Pi has the operation (bash spawning,
process-tree kill, truncation, file reads, image resizing, exact-match replacement) and from
OpenAI Codex's Apache-2.0 `apply_patch` parser for the patch grammar. Every ported file carries
`// Ported from <repo> <path> (<license>)`, as Raft ports do.

Every call starts in the Agent's working directory on the machine, with no cwd or environment
carried from the call before. `view` returns an image file as an image, resized as Pi resizes.

### `haus` runs on the runner

The `haus` CLI is the Agent's way to act in Haus, and it never needs the machine. When a `bash`
or `shell` command is exactly one `haus` invocation, the runner runs it itself against the Server
with the run credential, and nothing reaches the machine. That covers every message send, so an
Agent talks while its machine is offline. The prompt's commands stay as they are.

The runner parses each command with a POSIX shell parser. It is a lone invocation when it is one
simple command whose program is `haus` and whose words are literal after quote removal. Its
stdin may be a quoted heredoc, an unquoted heredoc with no `$` or backquote, or a literal
here-string. Otherwise:

- A command with `haus` anywhere else (a pipeline, a list, a substitution, a variable or glob in
  its words, a redirection) is refused before dispatch with `Code: HAUS_NOT_ALONE` and the next
  action "run `haus` as its own command". This is the existing one-command-per-shell-call rule
  ([haus-cli.md](haus-cli.md#1-shape)) made exact.
- Every command without `haus` goes to the machine as an invocation.

A `haus` flag that names a machine path reads or writes it through a `file-read` or `file-write`
invocation: `attachment upload --path`, `image generate --reference <path>`,
`image wait --out`, and `trigger create|rotate --output`. The CLI's flag table marks these flags,
and only those commands need the machine. A webhook secret written by `--output` crosses the
Server once, inside the invocation, and is never stored in an invocation record or the journal.

The machine has no `haus` wrapper, proxy, or runner token for Agents. The Computer's loopback
proxy, its local inbox answers, its visibility receipts, and its send-outcome tracking move into
the runner's `haus` handler. Workers get their own CLI scope (W1).

### `execute`

`execute` moves from the Computer to the runner unchanged in contract ([MCP](mcp.md#agent-execution)):
Headless Executor in a disposable QuickJS child, `tools.search`, `tools.describe`, and
`tools.call`, with today's limits. Its catalog holds the Agent's granted Server MCP tools and one
built-in, `browser`, which relays agent-browser on the machine as a `browser` invocation.

### Removed

These end at R4 and are named here as intentional capability removals:

- **Sub-agents.** `Task`/`Agent` is off. Parallel work goes to cloud agents until W2, then to
  Workers ([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md)).
- **Background shells.** A command runs within its invocation's timeout. Work longer than ten
  minutes goes to a Worker.
- **Everything that served them:** the sub-agent wake, `agent-background-work`, the background
  work reporter, the warm-pool exemption, the `subagent` inbox kind, and `agent-stop-background`.
- **Codex native image generation.** Agents generate images with `haus image`
  ([Image Generation](image-generation.md)).
- **Grok Build as an Agent runtime.** Grok models run on Pi Durable through xAI.

## Invocations

Every machine tool call is one invocation. An `execute` program makes one invocation per
`browser` call. A `haus` command with a machine path makes one per path.

### Operations

| `operation.kind` | Payload | Default timeout | Max timeout |
| --- | --- | --- | --- |
| `bash` | `command`, `cwd?` | 120 s | 600 s |
| `edit` | one editor command, or one patch | 30 s | 30 s |
| `view-image` | `path` | 30 s | 30 s |
| `file-read` | `path`, `maxBytes` | 60 s | 60 s |
| `file-write` | `path`, `bytes`, `mode` | 60 s | 60 s |
| `browser` | `args` (today's allowlist) | 60 s | 60 s |

`shell` maps to `bash`, with argv quoted into one command and `workdir` as `cwd`. A model's
`timeout` above the max is clamped and the result says so.

### Lifecycle

1. **Request.** The runner sends `invocation-request` with the run id, the harness tool call id,
   and the operation. The Server keys it by `(runId, toolCallId)`, so a resend returns the same
   invocation.
2. **Route.** The Server mints the invocation id and resolves the Agent's machine from its
   setting. No machine, a detached one, or one in update-required mode answers `offline` at once,
   recorded, and nothing is sent.
3. **Send.** The Server sends `invoke` to the Computer with the id, Agent, run, operation, and
   timeout.
4. **Accept.** The Computer looks the id up in its ledger. A known id answers with what the
   ledger holds and never runs again. A new id is written to the ledger as `accepted` and synced
   to disk. Only then does the Computer send `invoke-accepted` and start the operation.
5. **Run.** An Agent's invocations run one at a time, in arrival order, after any drive pull in
   progress for that Agent.
6. **Result.** The Computer writes the result to the ledger, then sends `invoke-result`. The
   Server records the outcome, answers the runner with `invocation-result`, and confirms to the
   Computer with `invoke-result-ack`. The Computer resends every unconfirmed result on each
   connect.

### Outcomes

| Outcome | Meaning | The model sees |
| --- | --- | --- |
| `completed` | The operation finished. A non-zero exit is `completed` with its code. | The output and exit code |
| `failed` | The operation refused its input and changed nothing (no match for `old_str`, a bad patch, a missing file). | The refusal |
| `timed-out` | The timeout fired and the process group was killed. | The partial output and the timeout |
| `cancelled` | Stop or the turn's abort killed it. | The partial output |
| `unknown` | Accepted or possibly accepted, with no result: the Computer crashed or disconnected past the grace. | It may or may not have run; check its effects before running it again |
| `offline` | The Server never sent `invoke`. Nothing ran. | The machine is offline; `haus` and `execute` still work |

The outcome text rides the tool result, never the prompt.

**Never twice.** No layer reruns an invocation. A Computer that starts with ledger entries in
`accepted` or `running` marks each `unknown` and reports it. The Server resends `invoke` for an
id it holds no acceptance for, and the ledger answers any id it has seen, so a lost
acknowledgement never runs a command twice. The model may choose to run a command again. That is
a new tool call and a new invocation.

**Grace.** When the Computer's socket drops with an invocation sent, the Server waits for the
invocation's timeout plus 30 seconds for a reconnect. A reconnect inside it resends unacknowledged
`invoke` frames and receives pending results. Past it the runner gets `unknown`. A result that
arrives later is recorded on the invocation and in the journal, and not delivered to the model.

### Cancellation

Stop, a fatal turn event, or the no-progress deadline makes the runner send `invocation-cancel`
for each open invocation of the run. The Server forwards `invoke-cancel`. The Computer sends
`SIGTERM` to the process group, then `SIGKILL` after five seconds, and reports `cancelled` with
the output so far. A cancel for an id still waiting its turn removes it, reported `cancelled`.
On reconnect the Server sends `invoke-cancel` for every open invocation whose run has settled.
A process that detaches itself from the process group survives, as it would in any shell, and
Haus does not track it.

### Output limits

- Output to the model is the last 2,000 lines or 50 KiB, whichever is smaller, with a line naming
  what was cut. The full output stays on the machine at
  `agents/<agent-id>/runtime/invocations/<invocation-id>.log`, kept seven days, and the result
  names that path.
- `view` and `file-read` return the first 2,000 lines or 50 KiB of text. Images are resized and
  capped at 5 MiB.
- `file-read` for an attachment upload takes up to the attachment limit and streams to the
  Server, outside the 1 MiB frame cap.
- Every frame stays under 1 MiB.

### Ledger

Each Agent's ledger is `agents/<agent-id>/runtime/invocations/` on the Computer: one
`<invocation-id>.json` per invocation with `{ invocationId, runId, operationKind, state,
acceptedAt, finishedAt?, outcome?, exitCode?, outputBytes }`, written by atomic replace. A record
the Server has confirmed is pruned after 24 hours. Payloads and output live only in the `.log`
file and the result frame, so a webhook secret is never written to the ledger.

The Server keeps `agent_invocations`: id, Agent, run, tool call id, Computer, operation kind,
state, outcome, and timestamps, with no payload or output. It is evidence and routing, and the
execution journal remains the record of what the model saw.

## Inbox delivery

The Server delivers inbox items to the runner. The Agent frames move from the Computer socket to
the runner socket with their schemas unchanged: `start` and `notice` down, `ack`, `notice-ack`,
and `turn` up. Each inbox state keeps its meaning, read with "runner" for "Computer":
`accepted` when the runner acknowledges the run, `served`, and `seen` ([inbox](inbox.md)). The
inbox store, pending notices, and the seen ledger move to `/data/agents/<agent-id>/runtime/`.

A start reaches the runner whether or not the Agent's machine is online. The Server routes it by
the Agent alone, never by a Computer.

### Drive folder

When a run starts and the Agent's machine is online, the Server sends `drive-pull` with the run
id to that Computer, which pulls as [drive-folder.md](drive-folder.md) describes. Invocations for
that Agent wait for it. When the runner reports the run settled with `turn`, the Server sends
`drive-push` with the run id, and the Computer pushes. A machine offline at either moment does
nothing then, and its next pull or push catches up from the folder's records.

## Logins

Model logins live in runner settings. There are no sign-in screens in v1.

| Login | Where | Set by |
| --- | --- | --- |
| Claude plan | `HAUS_RUNNER_CLAUDE_SETUP_TOKEN`, a `claude setup-token` value | `.env.schema`, from 1Password |
| ChatGPT plan | Pi's Codex sign-in file at `/data/logins/openai-codex.json`, refreshed in place by Pi | `haus-runner login chatgpt`, a device-code sign-in run once in the container |
| xAI, Google, OpenRouter | `HAUS_RUNNER_XAI_API_KEY`, `HAUS_RUNNER_GEMINI_API_KEY`, `HAUS_RUNNER_OPENROUTER_API_KEY` | `.env.schema`, from 1Password |

The ChatGPT sign-in is a file, not an environment variable, because its refresh token rotates.

The runner reports which logins work in `runner-inventory`, on connect and on change. The Agent
model picker offers exactly those models. Computers no longer report runtimes or models for
Agents. A login that fails mid-turn is a fatal `session-failure` with category `access`, as
today.

## Protocol frames

R2 bumps `packages/haus-api/computer-protocol.json` for the frames it adds. R4 bumps it again
when it deletes the Agent-session frames, so a Computer still holding an Agent session store
never attaches after the cutover. An older Computer connects update-required.

**Computer protocol, added by R2:**

| Frame | Direction | Carries |
| --- | --- | --- |
| `invoke` | Server → Computer | `invocationId`, `agentId`, `runId`, `operation`, `timeoutMs` |
| `invoke-accepted` | Computer → Server | `invocationId` |
| `invoke-result` | Computer → Server | `invocationId`, `outcome`, `exitCode?`, `output`, `truncated`, `logPath?` |
| `invoke-result-ack` | Server → Computer | `invocationId` |
| `invoke-cancel` | Server → Computer | `invocationId` |
| `drive-pull` | Server → Computer | `agentId`, `runId` |
| `drive-push` | Server → Computer | `agentId`, `runId` |

**Computer protocol, removed by R4:** `start`, `notice`, `stop`, `ack`, `notice-ack`, `turn`,
`agent-activity`, `agent-thought`, `agent-execution-journal-records`,
`agent-execution-journal-ack`, `agent-restart`, `agent-configure`, `agent-background-work`,
`agent-stop-background`, `agent-subagent-wake`, `agent-subagent-wake-result`,
`agent-subagent-wake-retire`, `agent-idle-compaction`, `cove-apply`, `cove-apply-result`, and
`server-runtime-settings`. D3 retires `agent-skill-file-*` and `agent-workspace-*` where Drive
replaces them, and R4 deletes any that remain.

**Computer protocol, changed by R4:** `agent-reset` with `kind: 'full'` and `agent-retire` stay
and only clear the Agent's directory on that machine. A session reset no longer reaches a
Computer.

**Computer protocol, unchanged:** `browser-request` and `browser-result` for Browser settings,
`reminder-script`, inventory, disk, update, secrets, heartbeat, and cloud-agent frames until W2.

**Runner protocol.** The runner socket carries the Agent frames removed above, with the same
schemas, except the sub-agent and background-work frames, which are deleted. It adds
`invocation-request`, `invocation-result`, `invocation-cancel`, and `runner-inventory`.
`cove-apply` runs on the Server after D3, because Cove's guidance is Drive content. The runner
protocol has no version of its own, since the runner ships with the Server.

## Workers

Computers keep the native drivers for Workers: Claude Code, Codex, and Grok Build, with their
launch isolation, process groups, fixtures, and ported Raft tests as they stand at `cc8a8cd18`.
A Worker runs a fresh native session in a worktree with that machine's logins
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decision 7). The Workers
contract (W1) owns what changes for them: their CLI scope, reports, and drive folder.

R4 deletes from Computers what only served Agent sessions: the Agent executor and turn runner,
`session.json` and resume state, the Agent warm pool, idle compaction, the background-work
reporter, the sub-agent wake, the inbox store, the `haus` wrapper injection and loopback proxy,
the host-tool MCP server, the Computer's copy of `execute`, prompt composition, and Agent runtime
and model discovery.

Computers keep the invocation handler and ledger, the `drive/` folders, agent-browser and Browser
settings, reminder scripts, host skill discovery, inventory, updates, and Workers.

## Verification

| Contract | Guard | PR |
| --- | --- | --- |
| A crash after accepting and before the result reports `unknown` and never runs the command again | `apps/computer/src/invocations/ledger-crash.test.ts` | R2 |
| A resent `invoke` whose acknowledgement was lost returns the ledger's answer and runs nothing | `apps/computer/src/invocations/ledger-replay.test.ts` | R2 |
| Timeout and cancel kill the process group and return partial output | `apps/computer/src/invocations/run.test.ts` | R2 |
| An Agent with no machine or an offline one gets `offline` at once, and a turn with only `haus` calls completes | `apps/server/test/agent-invocations-offline.test.ts` | R2 |
| A lone `haus` command runs on the runner, and a composed one is refused with `HAUS_NOT_ALONE` | `apps/runner/src/haus-command.test.ts` | R3 |
| The runner cannot import Server or PostgreSQL modules | Oxlint rule tests in `scripts/lint/haus-rules` | R3 |
| The SDK runs with native tools off and only `mcp__haus__*` tools reachable | `apps/runner/src/claude/claude-tools-live.test.ts` | R3 |
| Ported Pi and Codex tools keep their upstream behavior | Ported upstream tests, provenance-marked | R2 |

Each harness gets replay fixtures captured from the real SDK and Pi, scrubbed and committed, as
the native drivers have. Live proof follows the plan: with every Computer offline an Agent
answers a DM and dispatches nothing to a machine, and with its Computer online it runs `bash`
there and edits a file in `drive/`. The perf gate is time to first token, trunk against head,
20 interleaved runs, failing above 20 percent slower.
