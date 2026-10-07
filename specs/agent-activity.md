---
summary: Agent activity — Server-persisted semantic work history, the live current-activity projection on the Inbox, avatar status dots, and Computer-local detailed execution evidence.
read_when:
  - changing Agent activity events, presence dots, or the Inbox's live Agent rows
  - changing the Agent profile Activity tab, the Server Activity page, or Turn Details drawer
  - changing Computer tool observation or the Server/Computer execution-evidence boundary
---

# Agent Activity

Agent activity answers two related questions without turning execution into Chat content:

- **What is happening now?** The Inbox's live Agent rows and status dots project current
  unsettled work.
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
| `delegating` | `Running a sub-agent…` (past: `Ran a sub-agent`) | A runtime sub-agent tool runs (Claude Code `Agent`, listed as `Task` in older inits) |
| `sending_message` | `Sending a message…` | Server begins the canonical Agent message-send boundary |
| `working` | `Working…` | No narrower truthful category is current |

Completed, failed, and interrupted phases appear in history with past-tense copy. Current
activity never adds a synthetic `Finished` row; the Agent leaves it when its turn settles.

`received_message` is Server-owned history rather than work. The Server writes one completed event
when it consumes a Computer notice-ack that marks queued work newly noticed by the accepted run; an
ack naming only work the run already noticed, or a run that is no longer accepted, writes none. It
never becomes the current activity label and never counts as a turn operation.

`delegating` covers only the parent sub-agent call. The sub-agent's own tool calls never open
activity and never become thoughts; they are execution-journal evidence nested under the parent
call. A settled turn counts each sub-agent once under the `delegating` operation category, so a
delegation-heavy turn does not read as idle.

Turn operation counts also have two turn-only categories, `generating_image` and
`generating_video`: a runtime-native image or video tool (`generated-images.ts`) opens ordinary
`using_tool` activity while it runs but counts as the media it makes, because that media is usually
what the human asked for. Neither is a live activity category.

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
   The one command the projector reads is the `haus` CLI's own: a shell call whose whole command
   is one `haus …` invocation (an absolute path to the shim, leading `env`/`NAME=value`
   assignments, a runtime's `sh -c` wrapper, or a trailing heredoc body allowed) opens no activity
   at all, like `compaction`. Its semantic work is already projected at the product boundary — the
   structured proxy reports message checks and the Server reports sends — and task, profile, and
   inbox calls are the Agent's bookkeeping, not work; counting the shell call too would double
   message checks and message counts. A compound command (`haus … && curl …`) stays
   `running_command`. The command text never enters Activity; a non-`haus` command may cross only
   as the scrubbed description of an action thought (ADR 0036), and a `haus` call never does.
3. **Unknown and MCP tools** default to `using_tool`. Their names, descriptions, and inputs are not
   parsed for intent. A tool named `search` does not prove web search; `cat` inside a shell command
   does not turn a shell event into file reading. The `haus` CLI exception above is the only
   command recognized.
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
  operationId?: string // /^[0-9a-f]{16,64}$/
}
```

`operationId` is an opaque Computer-made id that pairs one operation's `started` event with its
settlement. Computer derives it by hashing the runtime's tool-call id (the first 32 hex characters
of its SHA-256), so the id never reveals provider identifiers. Only `delegating` carries one today.

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

The same projection also keeps `activeDelegations: { operationId, startedAt }[]`, the run's
sub-agents that started and have not settled, oldest first and at most 16; the field is omitted
when none run. A `delegating` start adds its `operationId`, any settlement removes it, and the
Server's terminal turn event clears the row. While a sub-agent still runs, a settled step falls
back to `delegating` rather than `Working…`. It is enough to show "N sub-agents running" with an
elapsed clock without any model-authored text; sub-agent labels stay in the execution journal.

Heartbeats and repeated identical current states are not persisted. Short adjacent events may be
coalesced for live presentation, but every meaningful transition remains available in history.

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
identity, inputs, outputs, errors, timings, and the turn's model reasoning blocks. A runtime
sub-agent's tool calls are journal tools whose `parentToolCallId` names the delegating call, and
that call carries a `subagent` record (label, sub-agent type, status, timings, token and tool-use
totals, latest progress line); see [Agents API](../docs/api/agents.md). Claude Code reports both
only through raw SDK messages (`task_*` system messages and the sub-agent's messages tagged with
`parent_tool_use_id`), which the projector maps in `subagent-steps.ts`. A sub-agent the turn's
interruption or end leaves running is settled `interrupted`. A tool's timing
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
Server activity journal or any Activity event. The thought bubble
([ADR 0036](../docs/adr/0036-agent-thoughts-surface-as-condensed-phrases.md)) is a separate,
volatile `agent-thought` frame carrying a title phrase, a scrubbed reasoning excerpt, or a
scrubbed description of a tool action (with a scrubbed excerpt of a finished command, search,
page, or tool's output) that the Server summarizes and discards; it is not activity. When Computer is offline, detailed evidence is
unavailable.

This workstream assigns no retention or cleanup policy to the execution journal. Holistic cleanup
is owned by Linear PRD-216.

## Surfaces

### Current activity

Current activity is the live projection of the Server's Agents with unsettled,
Computer-accepted turns and each one's latest semantic label. The Inbox's **Happening now**
rows render it with the turn clock ([Inbox](../docs/features/inbox.md)), and the sidebar's
Haus mark quickens while any Agent works. There is no sidebar activity strip: which Chat an
Agent is answering is the typing strip above that Chat's composer
([ADR 0035](../docs/adr/0035-chat-engagement-shows-as-typing.md)), not Agent activity.

The projection consumes live events, not the historical query. Reconnect obtains a current
active-activity snapshot before applying later events. A semantic operation's `completed`,
`failed`, or `interrupted` event falls back to `Working…`; a committed Agent message reads
`Finishing up…`; only the Server's terminal turn event removes the Agent. Snapshot and
live-event reconciliation preserves live events that arrive while an older snapshot request
is still in flight.

### Agent activity history

The Agent profile Activity tab reads the durable Server journal newest-first with pagination and
shows it as one full-width event log. The page's trail (`Haus › Tiny › Activity`) names it; there
is no section heading. A band pinned to the top of the tab's scroll region holds the day bar —
older/newer day buttons, the day's label, a readout (`12 turns · 13m 12s working · 1 failed`), and
the diagnostic copy action — over an overview strip of that day: every turn a block at its real
time on a dotted lane, idle stretches longer than 12 minutes folded to a broken-axis mark, each
block at least a pointable minimum width, today's axis running to `Now`. The band takes the page
ground and shows a hairline edge only while the log scrolls under it, follows the day under it as
the log scrolls, and below a 42rem log drops the strip, keeping the day bar. Pointing at a block
lights its turn in the log and names it in the readout; pointing at a turn or step lights its
block and the step's span; pressing a block opens its turn and brings it into view.

Under the band, turns sit under day rows (`Yesterday`, `Oct 4`; the band names the first day),
newest first, as collapsible groups divided by hairlines. Rows run edge to edge — hover, linked,
and failure tints included — while text keeps the shell's page gutter. A turn's header is one line
on the log's columns: start time (tabular), a status glyph only when it is news — failed,
interrupted, or still working, with a folded repeat count (`3×`) after the title — then the title
in semibold, truncated to one line, with its place regular-weight and muted, then the duration in a
tabular, non-wrapping column, then the chevron. A completed turn carries no glyph. The title is the
trigger — the first line of the waking message with its Chat as muted context (`#product`, or `DM`
for a direct message, never the peer's name), or the kind of typed work (`Reminder`). Durations use
at most two units with no zero padding (`<1s`, `42s`, `1m 24s`, `6m`, `1h 2m`), and a running
turn's duration ticks live. Consecutive failed turns with the same failure kind and trigger fold
into one row with a count. When the trigger is private, unrecorded, or its message is unreadable to
the viewer, the header is titled, muted, by what the turn did in words, most telling first
(`Edited 3 files · read 4 · sent 1 message`), from the exact Computer-reported totals by semantic
operation category and the exact persisted message count; a noun the previous action named is not
repeated. A turn with no actions and no messages reads `Stayed quiet` when it completed and `Ended
before any action` otherwise. A header whose request came from a Chat the viewer can open reveals,
on hover or keyboard focus, a ghost button back to it (`View in #product`, or `View in DM with
Tiny` naming this Agent, the one place a DM names its peer), at the end of the header's empty
track column (on a narrow log, as an icon at the end of the title), so it covers and fades nothing.

An open turn puts a thin ruler row under its header: the track column only, inert and hidden from
assistive tech, labeling the turn's rounded scale. Its steps follow one depth in on the same
columns, each step's time its offset from the turn's start (`+2.3s`) and its bar on that scale;
the ruler's ticks run down through every step row as gridlines, the 0 line darkest. Reasoning
titles are `Thought` rows like any step. Every step row stays closed until opened, a failed one
included; failure shows as its tint and mark. The newest day's ten latest turns
open on arrival; everything older waits for a click. Journals are read through a queue of at most
three in flight; a settled journal is read once and kept, so collapsing, reopening, or revisiting
costs nothing. The overview draws a closed turn's steps from its execution outline instead: the
day's settled turns are outlined in one batched `agent.executionOutlines` read, a settled outline
is never read again, and a turn whose Computer is offline stays a plain block until it reconnects. Viewers without execution access, and turns whose Computer did not answer, see one
muted line instead of steps. A running turn has not settled into
`agent.turns`, so its row reads its trigger through `agent.runTrigger` and is titled the same way
while it works. Trigger messages are read once per list through a small rolling
window of ordinary message reads, never one burst per row. These compact totals are part of
the durable turn summary, so a settled row does not depend on every best-effort live activity frame
having arrived. A run the Server resends after a Computer restart keeps its first start and the
totals its lost launch settled (the Computer-local turn ledger), so duration and counts cover the
whole run. Each settled turn also names its trigger — the message, task, reminder, or other inbox
work that woke it — as ids the App resolves through ordinary message reads
([Agents API](../docs/api/agents.md#turn-and-delivery-observability)). Silent completion and interruption are explicit. Expanding a turn reveals the
existing granular semantic timeline when retained; repeated heartbeats and raw details never appear.

### Server Activity page

The Server's Activity page (`/s/:slug/activity`, in the sidebar's top menu after Tasks) is the same
event log with every Agent's turns interleaved; an Agent's Activity tab is that log filtered to one
Agent, and reads unchanged. When a log shows more than one Agent, each turn header names its Agent
(avatar and name) after any status glyph, and the overview's hover readout leads with the Agent's
name. The overview keeps one lane with status tones; concurrent turns of different Agents slide
past each other as any neighbours do. A stock multi-select menu at the end of the day bar narrows
the Agents (`All Agents`, one name, or `2 Agents`), kept in the URL as `?agents=<id>,<id>` so a
narrowed view reloads and links; it shows only when the Server has more than one Agent.

Settled turns come a page at a time from `agent.serverTurns` (one request per page, narrowed on
the Server when filtered), refreshed when any Agent's turn settles. A working run comes from the
Server's one current-activity projection, started at its recorded run start; its steps stream
from the live journal for Owners and Admins, and other members see only its header. Turn
titles, trigger messages, and journals read as in the Agent tab. Outlines are still one batched
`agent.executionOutlines` read per Agent per day, and every log in a window shares one gate of at
most three outline reads in flight, so a day with many Agents never bursts the Server.

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
and its activity. While the Agent works, the run's trigger titles the section as a turn row's
title does, then one live line names the current step, a status line counts running sub-agents,
and a short log lists the run's latest steps. Every length and time in the card sits in one
right-aligned tabular column in the turn-row duration format (`Running a command` … `42s`). The log lists
the run's latest steps: settled steps in past tense, and a start only while it is still running, so
stale `…ing` lines never pile up. While idle, it shows the last two turns, each titled by its
trigger with what it did in words, duration over relative time in the same column, repeated failures folded as in Activity History.
The preview reads Server history and remains useful while Computer is offline;
it never requests Computer-local execution evidence. Clicking the avatar or
reference still opens the full Agent profile.

## Failure behavior

- Server history remains readable while Computer is offline.
- A missing live activity update falls back to `Working…` while the unsettled turn remains known.
- Computer disconnect clears current activity through Agent availability reconciliation;
  it does not delete durable history.
- Unknown tools stay generic. Classification failure never blocks the turn or tool call.
- Activity transport is best effort during a turn. Settlement must still record the terminal turn
  outcome even if intermediate semantic events were lost.

## Non-goals

- Streaming model text or reasoning into Activity.
- Guessing intent from arbitrary tool names, arguments, commands, or output.
- Showing raw execution evidence in the Inbox or ordinary-member Activity views.
- Treating activity as Chat history, typing state, or a promise that the Agent will reply. Typing
  is chat engagement (ADR 0035), derived from delivery visibility rather than activity.
- Defining retention or cleanup policy.
