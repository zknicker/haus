---
summary: Normative runtime contract after ADR 0057. Each Agent's loop runs in the runner, a sandboxed Server-side process, on the Claude Agent SDK or Pi Durable, with sessions on the runner's volume. Every dispatch (a machine invocation, a runner-side haus command, an execute MCP call) is keyed by (runId, toolCallId, seq), recorded as accepted before it runs, and never runs twice; unknown is terminal. Machine invocations have fixed outcomes (completed, failed, timed-out, cancelled, unknown, offline), and payloads over 1 MiB move as attachment references. Covers the tool set, the `haus` CLI on the runner, inbox delivery to the runner, logins, the frames that change, and what stays on Computers for Workers.
read_when:
  - changing where an Agent's loop runs, the runner, its container, its volume, or its credentials
  - changing the Claude Agent SDK or Pi Durable harness, harness pinning, or session reset
  - changing the invocation contract, the Computer result ledger, timeouts, cancellation, output limits, or offline answers
  - changing the Agent's tools (bash, shell, the edit tools, execute) or how the haus CLI runs for an Agent
  - changing how inbox items, notices, steering, or turn reports move between the Server and the runner
  - changing model logins, runner settings, or which models an Agent can use
  - changing the Computer or runner protocol frames for Agents, drive pulls, or pushes
  - changing the native Claude Code or Codex drivers that run Workers on Computers
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
database port and private address ranges. The container entrypoint installs that deny and drops
its capabilities before the runner starts, and `apps/runner/container/prove-network-deny.sh`
proves it from inside the container on the Server host.

A run's authority comes in its start frame: a run credential the Server mints for that Agent and
run, with the Agent API scopes a Computer mints today, revoked when the run settles, stops, or
fails. Its row in `agent_runner_credentials` has no Computer. The start frame on the runner socket
is `runner-start { start, runCredential, reasoningEffort? }`, so the Agent start schema itself is
unchanged. `reasoningEffort` is the effort frozen onto the run, which a Computer learns from
`agent-configure` instead; without it the runner launches at the model's default. The
runner uses the credential for `haus` commands, `execute`, Drive reads, and invocation requests.
Nothing else in the runner can act as an Agent.

The runner socket is `/runner/attachment`. Its first frame is `runner-hello` with the runner
token, which the Server compares in constant time to its own `HAUS_RUNNER_TOKEN`. Until R4, the
Server delivers to the runner only when `HAUS_AGENT_LOOP=runner`, one switch for every Agent so
there is never a mixed state; Computers keep the default `computer`. R4 deletes the switch with
the Computer path.

In development, `bun run dev` runs the runner as a local process with the same environment
contract and no container. The Oxlint rules hold the boundary there.

The volume holds sessions and the runner's dispatch ledger. Rules, memory, and skills are
canonical in Drive. The volume is backed up with the Server's data
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 2):
whatever backs up the Server's database backs up `haus_runner_data` on the same schedule, and a
restore brings both back together. Today that is the nightly local backup on the Server host
([deploy](../docs/operations/haus-server-deploy.md#backups)), which archives this volume beside the
database dump once the volume exists. Off-machine backup is future work and must include it too.
When a restore is impossible, each Agent falls back to the reset path below.

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

R3 left these Computer turn features unported, and R4 ports each before it moves an Agent:
execution journal upload (including journaling dispatches the ledger recovers as `unknown`),
thoughts, idle compaction, rich-reference projection of message content, Cove guidance, the
managed-skill change notice, Claude plan usage after a turn, Agent restart and reset frames to
the runner, and
`haus cloud-agent start`, which the Computer handled locally. R4 also sends `drive-pull` when a
runner run starts and `drive-push` when it settles (Drive folder below), because runner-hosted
Agents depend on their `drive/` folder from the cutover on.

R5 lands Pi Durable before R4, so the cutover has both harnesses and every Agent has one for
its model. R4 moves every Agent at once and resets every session. No native session is copied from a
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
the run credential, never from a machine. The guarded prompt text, the inbox formatters, and the
memory block live in `packages/agent-prompt` (`@haus/agent-prompt`), so the Computer and the
runner render the same text from one source until R4 deletes the Computer's composition. The
prompt contract (the size cap, the divergence register, `test:prompt-contract`, and
`managed-instructions.test.ts`) moved there in R3.

A resumed native session keeps the instructions it started with on both harnesses. The executor
keeps resumed sessions current as it does today (specs/sessions.md "Instruction updates").

Rules and memory ride the turn input, ahead of the turn content, as ADR 0052 delivers
`MEMORY.md`. The runner reads the rule layers broadest first, `haus/AGENTS.md` then
`agents/<handle>/AGENTS.md`, by path with the run credential; an absent file is no layer. A fresh
session receives every present layer. A resumed session receives a layer only when its digest
differs from the session's rule receipt, and a layer the session saw that is now gone is announced
once as deleted. The receipts sit in `session.json` beside the memory receipt and move the same
way: they advance after a completed turn, hold after an interrupted one, and reset after a
compacted one. A layer the runner could not read keeps its receipt. Home Projects arrive in J3,
and the home Project's `projects/<key>/AGENTS.md` joins between the two layers then. The block
text is `formatRulesBlock` in `@haus/agent-prompt`.

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
process-tree kill, truncation, file reads, exact-match replacement) and from OpenAI Codex's
Apache-2.0 `apply_patch` parser for the patch grammar. Ported code lives in its own folder
(`apps/computer/src/invocations/pi/` for Pi) with the upstream license and a `PROVENANCE.md` that
maps each file to its upstream path and commit. The no-comments lint rule forbids a provenance
header in the file itself.

R2 builds the Claude tools: `bash` and `str_replace_based_edit_tool`, plus `view-image`. The GPT
tools (`shell`, `apply_patch`, `view_image`) arrive with R5, the first harness that serves GPT
models, which adds the patch variant of the `edit` operation and ports the Codex parser.

Every call starts in the Agent's working directory on the machine, `<agent-root>/workspace`, with
no cwd or environment carried from the call before. A command runs under `/bin/bash -c` in its own
process group, with the environment reminder scripts get: the Agent's `HOME`, a `PATH` of the
secrets wrapper and the runtime search path, and `LANG`, `LC_ALL` and `TMPDIR` when set. `view`
returns an image file as an image. The Computer sends images as they are, up to 5 MiB, and the
runner resizes them for the model it serves, because the runner knows that model's limits and the
Computer carries no image library. `create` overwrites an existing file.

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
invocation: `attachment upload --path`, `attachment view --output`,
`image generate --reference <path>`, `image wait --out`, `trigger preview --payload-file`, and
`trigger create|rotate --output`. Only those commands need the machine. A webhook secret written
by `--output` crosses the Server once, inside the invocation, and is never stored in an
invocation record or the journal.

A `haus` argument never resolves against the runner's disk, which holds every Agent's sessions.
The runner's command table (`apps/runner/src/haus/command-access.ts`) classifies every Agent CLI
command as Server-only, routed through the flags above, or refused. `drive view` writes into the
Computer's Drive cache, so it is refused with `Code: HAUS_WORKSPACE_UNREACHABLE` and points at
the `drive/` folder the Computer keeps in the Agent's workspace (D4). A command the table
does not know is refused with `Code: UNKNOWN_HAUS_COMMAND`, so a new CLI command cannot touch a
local path until it is classified. The CLI child runs in a fresh per-call directory with an
empty `HOME`.

The machine has no `haus` wrapper, proxy, or runner token for Agents. The Computer's loopback
proxy, its local inbox answers, its visibility receipts, and its send-outcome tracking move into
the runner's `haus` handler. Workers get their own CLI scope (W1).

In R3 the runner runs the existing Agent CLI from the `@haus/computer` package (`__agent`) as a
child process against a runner-local loopback proxy. The proxy holds the run credential and adds
`Haus-Dispatch-Id`, so the CLI never sees a Server-valid credential. Moving the CLI into its own
package comes before R4 deletes the Computer's Agent paths.

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

## Dispatches

A dispatch is one action a tool call takes outside the model: a machine invocation, an Agent API
request from a `haus` command, or a Server MCP call from `execute`. Every dispatch keeps one
contract wherever it runs. It has an id, it is recorded as accepted before it runs, and it never
runs twice.

A dispatch's id is `(runId, toolCallId, seq)`. `toolCallId` is the harness's id for the tool
call, and `seq` counts that call's dispatches from 0 in the order the runner makes them. A
`bash` call with no `haus` makes one dispatch. A `haus` command with a machine path makes one
`file-read` or `file-write` dispatch per path, then its Agent API requests. An `execute` program
makes one per `tools.call`, `browser` included. The Server mints a stored id for each dispatch it
records, keyed by `(runId, toolCallId, seq)`, so a resend of the same key returns the same
record.

### Runner ledger

The runner keeps a ledger per Agent at `/data/agents/<agent-id>/runtime/dispatches/`, one
`<runId>.<toolCallId>.<seq>.json` per dispatch with `{ kind, state, acceptedAt, finishedAt?,
outcome? }`, written by atomic replace. The runner writes `accepted` and syncs it to disk before it
sends the request, then writes the outcome when the answer arrives. A finished record is pruned 24
hours after its run settles. The runner stores a run's turn summary, then writes its settle time
once to `/data/agents/<agent-id>/runtime/settled-runs/<runId>.json`, then reports the run. A run
with no settle time keeps every record however long the runner was down, and a settle time goes
with its run's last record.

A runner that starts with records still `accepted` marks each `unknown`, writes it to the Agent's
execution journal for that run, and never sends it again. A run the runner finds still `accepted`
is never relaunched: when the Server resends its start, the runner settles it failed with
`runner-crashed`. Every settled run, crashed or not, reports `outputProduced` when it sent a
message or the ledger holds any dispatch for it, so the Server does not requeue work whose effects
may already exist; a failed run with neither reports none, and its inbox requeues. The Agent's next turn opens by naming the tool calls left
`unknown`, once, so its next move is a new model decision that checks their effects first, never
a replay.

### Agent API requests

Every request the runner sends to `/api/agent/*` for a `haus` command carries
`Haus-Dispatch-Id: <runId>:<toolCallId>:<seq>`. One layer over every mutating route keeps the
dispatch contract, with records in `agent_dispatches` keyed by Agent and dispatch id. It records
the dispatch `accepted` before the route runs and stores the response status and body after. A
repeat of a stored id returns the stored response and changes nothing. A repeat of an id whose
first request is still in flight waits for it. The same id with a different request body is
refused with `IDEMPOTENCY_KEY_REUSED`. An id still `accepted` with no live request, because the
Server stopped mid-request, turns `unknown` and answers `DISPATCH_OUTCOME_UNKNOWN`; the route
never runs again, and the Agent checks the effect before acting again. The header's run must be
the credential's run. Read routes ignore it.

The routes with their own keys (a message or claim `nonce`, a reminder `commandId`) keep them,
and the runner sets them from the dispatch id, so those mutations stay exact even across a Server
crash. A per-route transaction for every other route is not worth its cost while unknown is
terminal.

### MCP calls

A `tools.call` to a Server MCP tool carries its dispatch id. The Server records the call as
accepted before it contacts the upstream server, and a repeat of a known id returns the stored
result, waits for one still in flight, or answers `unknown` when the first attempt never
finished, without calling upstream again. MCP
tools are not idempotent, so a lost answer is never retried upstream.

## Invocations

Every machine tool call is one invocation, and an invocation is a machine dispatch. An `execute`
program makes one invocation per `browser` call. A `haus` command with a machine path makes one
per path.

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
`timeout` above the max is clamped and the result says so. The Computer clamps `timeoutMs` to the
same maximum again, so a bad frame cannot hold a command past it.

### Lifecycle

1. **Request.** The runner records the dispatch as accepted in its ledger, then sends
   `invocation-request` with `runId`, `toolCallId`, `seq`, and the operation. The Server keys it
   by `(runId, toolCallId, seq)`, so a resend returns the same invocation: a settled one answers
   its outcome again (without output, which the Server never keeps), and one still in flight
   answers once, when its result arrives.
2. **Route.** The Server mints the invocation id and resolves the Agent's machine from its
   setting. No machine, a detached one, or one in update-required mode answers `offline` at once,
   recorded, and nothing is sent.
3. **Send.** The Server records the invocation `sent`, then sends `invoke` to the Computer with
   the id, Agent, run, operation, and timeout clamped to the operation's maximum. A send the
   socket refuses at that moment settles `offline`.
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
| `unknown` | Accepted or possibly accepted, with no result inside the grace: the Computer crashed, disconnected, or answered too late. | It may or may not have run; check its effects before running it again |
| `offline` | The Server never sent `invoke`. Nothing ran. | The machine is offline; `haus` and `execute` still work |

The outcome text rides the tool result, never the prompt.

**Never twice.** No layer reruns an invocation. A Computer that starts with ledger entries in
`accepted` marks each `unknown` and reports it. The Server resends `invoke` for an
id it holds no acceptance for, and the ledger answers any id it has seen, so a lost
acknowledgement never runs a command twice. The model may choose to run a command again. That is
a new tool call and a new invocation.

**Unknown is terminal.** Once the Server records an invocation as `unknown`, from the Computer,
the grace below, or the runner, no path sends its `invoke` again. That includes a resend queued
for a reconnect: the Server drops every pending send for an invocation the moment it turns
`unknown`. An `invocation-request` that repeats its key gets `unknown` back. A result that already
exists still reconciles: the Server records a late `invoke-result` on the invocation (its
`late_outcome`, `late_exit_code`, and `late_result_at`), confirms it with `invoke-result-ack`, and
does not deliver it to the model or change the outcome the model saw. Runner runs upload no
execution journal yet, so the invocation record is the only place a late result lands; the
journal gains it when runner runs start uploading one.

**Grace.** Each invocation gets its timeout plus 30 seconds (`invocationGraceMs`), the same
window the runner waits, so the record never disagrees with what the model saw. The window is a
timer per open invocation, armed when the Server sends `invoke`. Past it the invocation turns
`unknown` and the runner gets that answer, whether the Computer stayed connected or not; a result
after that is late. A dropped socket neither shortens nor extends the window. It only adds the
reconnect resend: a reconnect inside the window resends unaccepted `invoke` frames and receives
pending results. An unaccepted invocation that was cancelled, or whose run has settled, is not
resent: it gets `invoke-cancel` and runs out its window, because only the Computer's ledger knows
whether it ever arrived. The PostgreSQL record decides every race between a result and the grace,
so exactly one of them answers the runner. A Server that starts turns every invocation still `sent` or
`accepted` `unknown`, because it keeps no operation to resend. An answer the runner socket cannot
take waits in memory and goes out when the runner attaches again.

The runner holds the same bound on its side. A drop of its own Server socket abandons nothing: a
start the Server resends for a run already running only re-acknowledges it, so the run keeps its
tools and its open invocations still receive their results. Each open invocation resolves
`unknown` at its timeout plus 30 seconds if no result arrives, so no tool call waits forever.
`haus` commands and `execute` programs end at their own timeouts, and their machine paths and
`browser` calls are invocations under the same bound.

### Cancellation

Stop, a fatal turn event, or the no-progress deadline makes the runner send `invocation-cancel`
for each open invocation of the run. The no-progress deadline is 15 minutes with no turn event,
whether or not a tool call is open; every tool call resolves well inside it. The Server forwards `invoke-cancel`. The Computer sends
`SIGTERM` to the process group, then `SIGKILL` after five seconds, and reports `cancelled` with
the output so far. A cancel for an id still waiting its turn removes it, reported `cancelled`
with "Cancelled before it started.". A timeout kills the group at once with `SIGKILL`, stopping
it first on macOS, as Pi does.
On reconnect the Server sends `invoke-cancel` for every open invocation whose run has settled.
When the shell exits, the Computer kills what is left of its process group before it reports
the result, as Claude Code's Bash tool does, so a `&` background job never outlives its
invocation or escapes its timeout and cancel. A process that leaves the group with `setsid`
survives, as it would in any shell, and Haus does not track it. Long-running work goes to a
Worker.

A payload upload or download runs under the invocation's abort signal, so a cancel or timeout
during a transfer settles as `cancelled` or `timed-out` and the Agent's next invocation runs.

### Output limits

- Output to the model is the last 2,000 lines or 50 KiB, whichever is smaller, with a line naming
  what was cut. The full output stays on the machine at
  `agents/<agent-id>/runtime/invocations/<invocation-id>.log`, kept seven days, and the result
  names that path.
- `view` returns the first 2,000 lines or 50 KiB of text, with a line naming the `view_range` to
  read on. Images are capped at 5 MiB and sent unresized. `file-read` returns raw bytes up to its
  `maxBytes`, because it feeds `haus` commands rather than the model.
- Every frame stays under 1 MiB.

### Large payloads

One rule covers every handler. Bytes that would push a frame past 1 MiB never ride a frame. They
move through the existing streamed attachment upload (`attachment-upload-stream.ts`), and the
frame carries a reference: `{ kind: 'attachment', attachmentId, mediaType, sizeBytes, sha256 }`.

- **Results, machine to runner.** A Computer whose result payload is over the limit (an image
  from `view` or `view_image` up to 5 MiB, a `file-read` for
  `attachment upload --path` or `image generate --reference`) streams the bytes to the Server
  under the invocation id with its Computer credential, then sends `invoke-result` with the
  reference. The runner reads the bytes with the run credential when the model or the `haus`
  command needs them. An attachment upload uses the reference as the attachment, with no second
  upload.
- **Payloads, runner to machine.** A `file-write` over the limit (`image wait --out`, or any
  other write) uploads first, and `invoke` carries the
  reference. The Computer downloads it under the invocation id before it writes the file. A
  download that fails is the invocation's `failed` outcome, with nothing written.
- The Computer uploads with `PUT /computer/invocations/:invocationId/payloads`, its Computer
  credential as the bearer and the media type as `Content-Type`. The Server answers
  `{ attachmentId, mediaType, sha256, sizeBytes }`, and the Computer refuses an answer whose digest
  or size differs from what it sent. It downloads with
  `GET /computer/invocations/:invocationId/payloads/:attachmentId` and checks the digest and size
  before it writes. Bytes up to 700 KiB ride the frame as base64, which keeps the frame under
  1 MiB. R2 builds the Computer side, and R3 builds both routes on the Server.
- The runner reads a result payload with `GET /api/agent/invocation-payloads/:attachmentId`,
  its run credential as the bearer, and checks the digest and size against the reference
  (`readInvocationPayload` in `apps/runner/src/invocations/invocation-payload.ts`). The runner's
  invocation client swaps every attachment reference for its bytes before a tool sees the
  result, so `view` images and `haus` machine-path reads take one shape.
- The runner has no upload path yet. The Server mints the invocation id only when the request
  arrives, so a payload cannot be bound to its invocation before `invoke` carries it. Until a
  runner upload route exists, a `haus` write of a file over 700 KiB is refused, and nothing is
  written.
- The reference is bound to its invocation and Agent, and only that invocation's run reads it.
  A payload is not an attachment to anyone else: `GET /api/agent/attachments/:id` answers 404
  for it, even for a later run of the same Agent, and an Agent cannot attach it to a message,
  so the App's attachment routes never reach it either. Bytes uploaded only to carry a payload expire with the invocation record. A webhook secret
  written through `--output` always rides the frame, which it fits, so it is never stored.

### Computer ledger

Each Agent's ledger is `agents/<agent-id>/runtime/invocations/` on the Computer: one
`<invocation-id>.json` per invocation with `{ invocationId, runId, operationKind, state,
acceptedAt, finishedAt?, outcome?, exitCode?, outputBytes, result?, confirmedAt? }`, written by
atomic replace (write, fsync, rename, fsync the directory). `result` is the `invoke-result` frame,
kept so a restarted Computer can resend a result the Server never confirmed. A record the Server
has confirmed is pruned after 24 hours, and a `.log` file after seven days. The operation and its
payload are never written to the ledger, and a `file-write` result never echoes its bytes, so a
webhook secret never reaches it.

The Server keeps `agent_invocations`: id, Agent, run, tool call id, `seq`, Computer, operation
kind, timeout, state, outcome, exit code, and timestamps, with no payload or output, unique by
Server, Agent, and dispatch key. Its states are `sent`, `accepted`, `finished` (with the outcome,
`offline` included), and `unknown`; `unknown` is terminal there, and a late result fills its
`late_*` columns only. It is evidence and routing, and the
execution journal remains the record of what the model saw. `agent_invocation_payloads` binds
each payload attachment to its invocation. Records keep the execution journal's 30-day window;
the retention sweep deletes them with their payload attachments and bytes.

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
| `invoke` | Server → Computer | `invocationId`, `agentId`, `runId`, `operation` (its bytes inline or an attachment reference), `timeoutMs` |
| `invoke-accepted` | Computer → Server | `invocationId` |
| `invoke-result` | Computer → Server | `invocationId`, `outcome`, `exitCode?`, `output` (inline or an attachment reference), `truncated`, `logPath?` |
| `invoke-result-ack` | Server → Computer | `invocationId` |
| `invoke-cancel` | Server → Computer | `invocationId` |

R2 bumps the protocol to 39 for these frames. Their schemas live in
`packages/haus-api/src/agent-invocations.ts`, and the three Server → Computer frames are members of
`agentCommandSchema`. R3's invocation router (`apps/server/src/agent-invocations/`) sends
`invoke`, and the Computer ingest chain hands it the two upstream frames.

**Computer protocol, added with runner turns:** `drive-pull` and `drive-push`
(Server → Computer, `agentId` and `runId`). They come with the PR that first sends them, when the
runner reports a run started or settled, and D4's pull and push code handles them. R2 does not add
them, because a frame with no sender and no handler is dead contract.

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

Computers keep only the Claude Code and Codex native drivers for Workers, with their
launch isolation, process groups, fixtures, and ported Raft tests as they stand at `cc8a8cd18`.
A Worker runs a fresh native session in a worktree with that machine's logins
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decision 7). The Workers
contract (W1) owns what changes for them: their CLI scope, reports, and drive folder.
Workers do not use Grok Build in v1, so R4 deletes the Grok Build driver with the Agent runtime
([specs/workers.md](workers.md#deferred)).

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
| A Computer that restarts after recording `unknown` answers every resent `invoke` with `unknown` and never runs it | `apps/computer/src/invocations/ledger-crash.test.ts` | R2 |
| An Agent with no machine, a detached one, or one in update-required mode gets `offline` at once, recorded and with nothing sent, and a turn with only `haus` calls completes | `apps/server/test/agent-invocations-offline.test.ts` | R3 |
| After an acknowledgement is lost and the Computer reconnects, an invocation already `unknown` is never sent again, a connected Computer that answers past the grace leaves it `unknown` as the runner saw it, and a late result is recorded without reaching the model | `apps/server/test/agent-invocations-unknown.test.ts` | R3 |
| An invocation is sent once with its clamped timeout, its result is recorded, answered, and acknowledged, a repeated key sends nothing, a cancel reaches the Computer, and a reconnect resends unaccepted `invoke` frames and cancels a settled run's | `apps/server/test/agent-invocations-routing.test.ts` | R3 |
| A payload is stored and read only under its invocation and Computer, its digest and size match, a run reads only its own invocations' payloads, and no general attachment route reads or attaches one | `apps/server/test/agent-invocation-payloads.test.ts`, `apps/runner/src/invocations/invocation-results.test.ts` | R3 |
| A result or write over 1 MiB moves as an attachment reference, and no frame exceeds 1 MiB | `apps/computer/src/invocations/large-payload.test.ts` | R2 |
| A lone `haus` command runs on the runner, and a composed one is refused with `HAUS_NOT_ALONE` | `apps/runner/src/haus/haus-command.test.ts` | R3 |
| A `haus` path argument never reads the runner's disk: workspace commands are refused, path flags read the machine, and every CLI command is classified | `apps/runner/src/haus/haus-cli.test.ts`, `command-access.test.ts` | R3 |
| A runner crash after recording a dispatch accepted reports `unknown` and never sends it again | `apps/runner/src/dispatch/dispatch-ledger-crash.test.ts` | R3 |
| A run a crashed runner left accepted settles `runner-crashed` without relaunching, with output when it dispatched anything, and the next turn names its unknown tool calls | `apps/runner/src/turn/crash-recovery.test.ts`, `turn-input.test.ts` | R3 |
| A repeated `Haus-Dispatch-Id` on a mutating Agent API route returns the stored result and mutates nothing; one with a different body is refused with `IDEMPOTENCY_KEY_REUSED` | `apps/server/test/agent-api-dispatch-id.test.ts` | R3 |
| A repeated MCP dispatch id never calls upstream twice | `apps/server/test/mcp-dispatch-id.test.ts` | R3 |
| A turn stuck on an open tool call trips the no-progress deadline | `apps/runner/src/turn/observe-turn.test.ts` | R3 |
| A start resent after a runner reconnect reattaches the running run, its open invocation still resolves, and an invocation never answered resolves `unknown` at its timeout plus the grace | `apps/runner/src/server-link.test.ts` | R3 |
| The runner socket refuses a wrong token, a start reaches the runner with a working run credential while the Computer is offline, and settle, Stop, and reconnect behave as on Computers | `apps/server/test/runner-socket-auth.test.ts`, `runner-delivery.test.ts`, `agent-invocations-offline.test.ts` | R3 |
| The runner cannot import Server or PostgreSQL modules, and Computer code makes no model calls | `scripts/lint/haus-rules/runner-boundary.cases.mjs`, `computer-no-model-calls.cases.mjs` | R3 |
| The SDK runs with native tools off and only `mcp__haus__*` tools reachable | `apps/runner/src/claude/claude-tools-live.test.ts`, `claude-driver-live.test.ts` | R3 |
| Ported Pi tools keep their upstream behavior | Ported upstream tests, listed in `pi/PROVENANCE.md` | R2 |
| The ported Codex patch grammar keeps its upstream behavior | Ported upstream tests | R5 |

The two Server rows moved from R2 to R3. Offline answers, invocation records, and the grace that
turns a lost invocation `unknown` are Server routing, and R3 builds that routing with the runner
socket. R2 owns the Computer half and the shared protocol types, and ships the outcome texts
(`invocationOutcomeNotices`) that R3's offline and unknown answers use.

Each harness gets replay fixtures captured from the real SDK and Pi, scrubbed and committed, as
the native drivers have. Live proof follows the plan: with every Computer offline an Agent
answers a DM and dispatches nothing to a machine, and with its Computer online it runs `bash`
there and edits a file in `drive/`. The perf gate is time to first token, trunk against head,
20 interleaved runs, failing above 20 percent slower.
