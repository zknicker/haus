---
summary: Agent activity — Server-persisted semantic work history, the live sidebar strip, avatar status dots, and Computer-local detailed execution evidence.
read_when:
  - changing Agent activity events, presence dots, or the sidebar activity strip
  - changing the Agent profile Activity tab or Turn Details drawer
  - changing Computer tool observation or the Server/Computer execution-evidence boundary
---

# Agent Activity

Agent activity answers two related questions without turning execution into Chat content:

- **What is happening now?** The Agent activity strip and status dots project current unsettled
  work.
- **What happened before?** Agent activity history is a durable chronological list of summarized
  execution events.

Activity is Agent-scoped because one Agent owns one global session and one turn may work across
several Chats. It carries a `runId`, never claims that one Chat owns the turn, and never enters the
Chat transcript.

## Semantic catalog

The public catalog is intentionally small. Copy is centralized and rendered with an ellipsis while
the category is current.

| Category | Current label | Evidence |
| --- | --- | --- |
| `starting_work` | `Starting work…` | Server admits a turn to its assigned Computer |
| `checking_messages` | `Checking messages…` | A structured Haus message check/read/search boundary runs |
| `received_message` | `Received a new message…` | Server consumes a notice-ack that marks new queued work noticed by the run |
| `thinking` | `Thinking…` | Harness reasoning starts; text stays out of Activity |
| `updating_instructions` | `Updating instructions…` | A managed instruction or factory-guidance refresh runs |
| `browsing` | `Browsing…` | A known Browser capability runs |
| `searching_web` | `Searching the web…` | A known provider or Haus web-search capability runs |
| `reading_files` | `Reading files…` | A known file-read capability runs |
| `editing_files` | `Editing files…` | A known file-write/edit capability runs |
| `running_command` | `Running a command…` | A known shell/process capability runs |
| `using_tool` | `Using a tool…` or `Using <safe name>…` | A known safe tool identity has no narrower category |
| `sending_message` | `Sending a message…` | Server begins the canonical Agent message-send boundary |
| `working` | `Working…` | No narrower truthful category is current |

Completed, failed, and interrupted phases appear in history with past-tense copy. The strip never adds a
synthetic `Finished` row; the Agent leaves the strip when its turn settles.

`received_message` is Server-owned history rather than work. The Server writes one completed event
when it consumes a Computer notice-ack that marks queued work newly noticed by the accepted run; an
ack naming only work the run already noticed, or a run that is no longer accepted, writes none. It
never becomes the current strip label and never counts as a turn operation.

## Mapping evidence to activity

Mapping is conservative and versioned. Prefer a less-specific truthful category over a specific
inference.

1. **Haus product boundaries** map directly. Message checks come from the structured local proxy;
   sends and turn lifecycle come from Server write boundaries.
2. **Known tools** map through an explicit registry owned by the Computer activity projector.
   Provider-specific Codex, Claude, and Pi identities have fixture-backed mappings. Haus-owned
   host tools declare their category at registration. codex-acp names only shell calls
   (`exec_command`, the `bash` builtin); Computer declares its fixed-title unnamed calls as
   builtins, so an ACP `edit` call titled `Editing files` is `apply_patch` (`editing_files`) and
   `Compact conversation` is the reserved `compaction`. A provider-executed builtin whose input
   fails its schema keeps that builtin's category. The one exception is a file read Codex parsed
   out of a shell command: codex-acp sends it as an ACP `read` call named `exec_command` with no
   command and the file in `locations`, so the projector reads that file from the raw ACP update
   and records `reading_files`, journaling a `read` step of the workspace-relative file.
3. **Unknown and MCP tools** default to `using_tool`. Their names, descriptions, and inputs are not
   parsed for intent. A tool named `search` does not prove web search; `cat` inside a shell command
   does not turn a shell event into file reading.
4. **Harness-synthesized runtime events** arrive as reserved provider-executed tool calls:
   `fileChange` maps to `editing_files`, so a runtime whose only file-edit evidence is a file-change
   event still reports file work. A `fileChange` that harness-acp tags with an already-seen ACP
   tool call is that call's edit, not a second one: the source call (Codex's `apply_patch`) keeps
   the edit's single activity, and a source step with no input of its own takes the first file's
   name and path. A multi-file patch journals each further file as its own step without opening
   more activity. `compaction` maps to no activity at all — context compaction is harness bookkeeping rather than agent work — while still landing in the execution journal. Both
   names stay generic when the call is not provider-executed, so a host or MCP tool cannot claim them.

An optional tool label crosses only when it is a canonical Haus-controlled display identity.
Unknown native or third-party names remain Computer-local and render `Using a tool…`.

## Event contract

Server and Computer produce the same narrow event shape:

```ts
type AgentActivityEvent = {
  id: string
  serverId: string
  agentId: string
  runId: string
  position: number
  producer: "server" | "computer"
  producerId: string
  producerSequence: number
  category: AgentActivityCategory
  phase: "started" | "completed" | "failed" | "interrupted"
  occurredAt: string
  toolRef?: string
}
```

Each producer assigns a monotonic `producerSequence` within the run. Server validates the currently
assigned Computer and active run, deduplicates `(serverId, agentId, runId, producer,
producerId, producerSequence)`, assigns the next run-local `position` while holding the owning
  delivery/turn lock, persists the event, then broadcasts it when the run is eligible for the
  current projection. `position` is the only presentation order within a run; the Server's recorded
  run start preserves cross-Agent turn ordering. Producer timestamps never resolve event ordering.
  Server-originated lifecycle events use their own producer identity and the same ordered journal
  without pretending they came from Harness.

The hosted Server API exposes this journal through `agent.activityHistory`, the unsettled-run
`agent.activeActivity` snapshot, and one Server-scoped `agent.onActivity` subscription. Current
activity includes only an active run after the assigned Computer's acceptance ack; a dispatched
but unaccepted run remains durable history without entering the current projection. History pages
use a run-local `{ runId, position }` cursor; the legacy compact `agent.activity` turn summary
remains a separate compatibility read.

The current-activity snapshot adds `runStartedAt` to each projected event. It preserves the
Server's `starting_work` timestamp across every step in the same run; it is null when that
start evidence is absent. Live App projections retain the same timestamp, and snapshot recovery
restores it after reload or reconnect. Journal and subscription events retain their original shape.
The Inbox uses this timestamp for a locally ticking, second-resolution total-turn clock.

Heartbeats and repeated identical current states are not persisted. Short adjacent events may be
coalesced for the live strip, but every meaningful transition remains available in history.

Activity events never contain reasoning text, model narration, draft messages, URLs, search terms,
paths, commands, tool inputs or outputs, authorization data, or private file contents.

## Computer projection and execution journal

One raw Harness event fans into two deliberately separate products:

```text
Harness tool call/result
  -> Computer-local execution journal (detailed)
  -> Computer activity projector (semantic) -> Server activity journal
```

The **Agent execution journal** is keyed by `runId` and retains tool-call ids, exact observed tool
identity, inputs, outputs, errors, timings, and the turn's model reasoning blocks. A tool's timing
runs from the observed tool call to its result. The ACP adapter holds a runtime tool call for up
to a second while it checks whether the call is a host-tool invocation echoed back; Codex calls
that codex-acp does not tag as MCP are Codex's own and skip that window, so their steps span the
real start and completion. Tool payloads are
read from the translated stream's `output` field, and a failed call keeps the `tool-error` the
runtime reported rather than a synthetic stream failure. Reasoning is stored per block id with its
start and end timestamps, capped at 64,000 characters per block and 1,000 blocks per turn
(`truncated: true` marks a clipped block, and Computer stops opening blocks at the ceiling so an
over-long turn cannot cost the whole journal its parse);
deltas buffer in memory and reach disk at the next tool boundary, block end, or turn finish, so an
interrupted turn keeps its partial text. Journals written before reasoning capture still load.

On disk a run is either a live log or a settled snapshot, never both. While the turn runs, the
Computer owns `<runId>.ndjson`: an append-only record log opened with the state the turn resumed
from, then one small record per mutation (tool call, tool result, reasoning start/append/end,
interruption, finish). Finishing writes the consolidated `<runId>.json` atomically and drops the
log, so a settled run costs one write rather than a full rewrite per tool call. Readers prefer the
snapshot and otherwise replay the log, which is how a still-running turn and one a crash left open
are both served; a torn trailing record from a partial append is ignored. Every string a tool
input, output, or error carries is capped at 256,000 characters per leaf — nested, so a
`{ stdout, stderr }` payload keeps its shape with each field clipped — and a clipped string ends
with `…[truncated N more characters]`. Reasoning text keeps its own 64,000-character cap.

The journal stays on Computer; Server Owners and Admins may inspect it through an authorized live
Server-to-Computer relay. Server does not persist the response, and reasoning never reaches the
Server activity journal or any Activity event. When Computer is offline, detailed evidence is
unavailable.

This workstream assigns no retention or cleanup policy to the execution journal. Holistic cleanup
is owned by Linear PRD-216.

## Surfaces

### Agent activity strip

The strip sits at the bottom of every Server sidebar and is absent from full-width destinations
without a sidebar, including Search and Reminders.

- Membership is exactly the Server's Agents with unsettled, Computer-accepted turns.
- Each row shows the Agent avatar with its ordinary global status dot plus the latest semantic
  activity label.
- Show at most four rows, then `N more working`.
- Order is stable by turn start, oldest first. A category change does not reorder rows. Entry and
  exit reflow with a restrained layout animation; reduced-motion users get no rerank motion.
- Clicking a row opens that Agent's profile.
- Settlement removes the row with a short fade. Status dots never pulse.

The strip consumes live current-state projection, not the historical query. Reconnect obtains a
current active-activity snapshot before applying later events. A semantic operation's
`completed`, `failed`, or `interrupted` event falls back to `Working…`; only the Server's terminal turn event
removes the Agent. Snapshot and live-event reconciliation preserves live events that arrive while
an older snapshot request is still in flight.

### Agent activity history

The Agent profile Activity tab reads the durable Server journal newest-first with pagination and
groups it by turn. Each collapsed turn shows its duration, outcome, exact persisted message count,
and exact Computer-reported totals by semantic operation category. These compact totals are part of
the durable turn summary, so a settled row does not depend on every best-effort live activity frame
having arrived. Silent completion and interruption are explicit. Expanding a turn reveals the
existing granular semantic timeline when retained; repeated heartbeats and raw details never appear.

Every Server member may see the summarized history. Complete execution evidence is restricted to
Server Owners and Admins and remains Computer-local. Agent creation provenance grants no additional
access.

This workstream adds no expiry or pruning to Server activity history. Any holistic retention change
belongs to PRD-216.

### Turn Details

An Agent-authored Chat message stores the real `runId` that produced it. Its Turn Details drawer
shows the same turn summary and Server-persisted semantic timeline to members who can access that
message. Owners and Admins may additionally request the run's detailed execution journal while
Computer is online.

A global turn may touch several private Chats. Ordinary members never receive global raw evidence
through one Chat message. Opening a Chat never fetches detailed evidence until the user explicitly
opens Turn Details.

### Avatar status dots

Agent avatars in the Chat transcript render the same global status dot as Agent avatars in the
sidebar and profile. The dot answers whether that Agent is currently working anywhere on the
Server; it is not Chat-scoped and never pulses.

DM headers mirror global Agent status with concise text such as `Online`, `Working`, `Offline`,
`Stopped`, or `Needs attention`. Channel headers do not aggregate Agent status.

### Agent hover preview

Hovering or focusing an Agent avatar in the Chat transcript or an Agent rich
reference opens one shared HeroUI hover card. It shows the Agent identity and
global availability, current effective runtime and model, reasoning effort,
and the newest five durable activity events in one compact summary.
The preview reads Server history and remains useful while Computer is offline;
it never requests Computer-local execution evidence. Clicking the avatar or
reference still opens the full Agent profile.

## Failure behavior

- Server history remains readable while Computer is offline.
- A missing live activity update falls back to `Working…` while the unsettled turn remains known.
- Computer disconnect clears current strip membership through Agent availability reconciliation;
  it does not delete durable history.
- Unknown tools stay generic. Classification failure never blocks the turn or tool call.
- Activity transport is best effort during a turn. Settlement must still record the terminal turn
  outcome even if intermediate semantic events were lost.

## Non-goals

- Streaming model text or reasoning into Activity.
- Guessing intent from arbitrary tool names, arguments, commands, or output.
- Showing raw execution evidence in the sidebar or ordinary-member Activity views.
- Treating activity as Chat history, typing state, or a promise that the Agent will reply.
- Defining retention or cleanup policy.
