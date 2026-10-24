---
summary: Server Agent contracts, Computer execution reports, turn and delivery observability, and managed Agent API routing.
read_when:
  - changing Agent CRUD, execution configuration, Computer reports, or managed Agent routes
  - reading Agent turn records or the delivery ledger
  - changing the dream record (`agent.dreams`, `agent.dream`, `agent-dream-record`)
  - changing the Agent inbox list, `message read --unread`, or the Agent read position
  - changing an Agent's conversation style, signature emoji, or self-profile update
---

# Agents API

Server owns each Agent's identity, Server membership, Computer assignment, desired execution
configuration (runtime, model, and reasoning effort), lifecycle state, Chat participation, and bounded turn summaries. Computer owns the
Agent's workspace, skills, queue, session process, execution runtime, model access, and effective
execution state. Each Computer report carries the applied runtime, model, and reasoning effort;
Server keeps that effective snapshot separate from the operator's desired configuration.

The App uses the Server `agent` tRPC router for Agent reads and mutations. Server validates that
runtime and model references came from the assigned Computer's reported inventory. Changes can be
recorded while Computer is offline and are applied after reconnect; Computer reports degraded state
instead of silently substituting another runtime or model.

Each Agent projection includes `hausAgent`: the release's `currentVersion`, the Computer-reported
`appliedVersion` and `appliedAt`, and `status` (`pending`, `current`, or `failed`). Computer carries
the applied version receipt in a separate additive snapshot frame, so an older Server can safely
ignore it and an older Computer simply leaves the new Server pending. Each snapshot replaces that
Computer's prior receipts; an omitted assigned Agent returns to pending instead of remaining
incorrectly current. Server derives **current**
only from an exact version match, so a newer Server deployment cannot claim that an older Computer
or an idle Agent has applied the release. A Computer reconnect clears the Server projection until
that connection reports its durable receipt, preventing a rollback to an older Computer from
leaving a stale Current label.

Each Agent projection also carries `wakePause`, null unless the Server has paused automatic wakes
after repeated failures. A pause reports `failureCount` (counted failures in a row),
`lastFailure` (`at`, `kind`, and the stable `code` or null), `pausedAt`, and `nextProbeAt`, the
time of the single probe run, null while that probe is running. `availability` stays `error`
while paused. Automatic work keeps queuing behind the pause; any human message, Start, Restart,
session reset, or runtime/model change lifts it. See
[Agent daemon delivery](../internals/agent-daemon-delivery.md#bounds-and-failures) for the policy.

When runtime, model, or reasoning effort changes during an active turn, Server preserves that turn's
frozen configuration through settlement, then applies the latest saved configuration before the
next turn starts. Runtime or model changes rotate the Agent session; effort-only changes preserve
the generation and conversation except for Grok Build, whose ACP adapter includes effort in its
resume compatibility identity and requires rotation. Computer stops a parked native process when its applied effort
differs (or is unknown), then resumes its saved session with a newly configured adapter. The new
effort remains fixed throughout that turn, including tool continuations.

## Description, Conversation Style, And Signature Emoji

Every description write — `agent.create`, `agent.updateProfile`, `haus agent create`,
`haus agent update`, and `haus profile update` — is capped at 280 characters after trimming
(`AGENT_DESCRIPTION_MAX_LENGTH`). The Agent routes refuse a longer one with `INVALID_ARG` and a
message that names the limit and points longer context at the standing brief. Reads keep the
500-character stored bound, so descriptions written before the cap still load and can be
shortened in place. The cap applies only to a new or changed value: the update paths accept up to
500 characters on the wire and pass a description equal to the stored one, because clients such
as iOS resend it with every profile save (`isAgentDescriptionWriteAllowed`).

Every Agent's prompt carries a built-in house `## Personality` section; it is product text, not
stored per Agent. On top of it, each Agent has two optional private fields:

- `conversationStyle` (up to 2000 characters): a voice and banter layer. Blank or `null` clears it.
- `signatureEmoji` (exactly one emoji, stored fully qualified): the reaction the Agent uses when it
  picks up a request that needs real work. `null` means the Computer default, 👀.

Owners and Admins read both with `agent.conversationStyle` and write them with
`agent.updateConversationStyle`; an absent field stays as it is. `agent.updateProfile` does not
carry them. The Agent reads its own pair in `haus profile show` (`GET /api/agent/profile`, self
only) and writes it with `haus profile update` (`POST /api/agent/profile/update`, which also takes
`description`). The runner token fixes the Agent, so that route changes only the caller, and one
transaction applies every field or none. Cove refuses a conversation style but accepts an emoji.
Neither field appears in the `Agent` projection, rosters, envelopes, `agent-configure` frames, or
another Agent's profile view.

They reach the assigned Computer only on the `start` frame, as `agentConversationStyle` and
`agentSignatureEmoji`. The prompt renders the house `## Personality` right after `## Who you are`,
then `## Conversation style` when one is set, and names the signature emoji in the pickup rule.

## Turn And Delivery Observability

Member-scoped queries expose what an Agent actually did, without reading
Computer-local execution traces. Each requires Server membership and treats a
denied or unknown Agent as `NOT_FOUND`, so probing cannot distinguish "not
yours" from "does not exist".

`agent.turns` returns that Agent's settled turns, newest first by `startedAt`,
with `limit` between 1 and 50 (default 10). Each record carries `runId`,
`startedAt`, `endedAt`, `status` (`completed` or `failed`), `failureKind` (the
compact kind that crosses the Server boundary, otherwise null), `outputProduced`,
`messageCount`, the bounded `summary`, the Computer-reported `activity` totals,
and `trigger`. `outputProduced` is what makes a silent turn readable: a completed
turn with no output and no messages is positive proof the Agent chose to stay
quiet, not evidence of a lost run.

`trigger` names the inbox work the Server chose when it dispatched the run, recorded
once at dispatch in `agent_run_triggers` so it survives a failed run requeueing its
rows: `{ kind: 'message', author: 'human' | 'agent', chatId, messageId, preview }`,
`{ kind: 'task', chatId, messageId, preview }` (the task's message), or
`{ kind: 'reminder' | 'trigger' | 'cloud_agent' | 'onboarding', chatId }`, or one of the chatless
sources (`dream`, `heartbeat`, `heartbeat_report`), whose runs need no Chat visibility to read ([workspace](../../specs/workspace.md#dreaming),
[heartbeat](../../specs/heartbeat.md)) and carry what the run came to, so the Activity Log can
say it under the row's title:

- `{ kind: 'dream', learned, added, removed }`: the Agent's private nightly heartbeat. `learned`
  is the first non-empty line of its `agent_dream_summaries` text with a leading `- ` removed
  (null when it wrote none); `added` and `removed` total `agent_dreams.files`.
- `{ kind: 'heartbeat', report, yielded }`: a daytime check-in. `report` is
  `{ text, posted, postedChatId }` when a `heartbeat-report:<runId>` inbox row exists (`text` is
  its head, at most 1,000 UTF-16 units; `posted` is whether the report run's Agent sent any
  message, whatever the reader can see; `postedChatId` the Chat of the first such message, null
  when it stayed quiet or the Chat is not one the reader can see), else null.
  `yielded` marks a run `yieldHeartbeatToAddressed` stopped, which `agent_heartbeat_checks`
  records because nothing else tells a stopped run from a finished one.
- `{ kind: 'heartbeat_report', heartbeatRunId }`: a heartbeat's report arriving in the main session.

The dream and heartbeat facts for a page come from a few bounded reads keyed by the page's run
ids, never one per turn.

`preview` quotes the waking message so a turn row is titled from the same read:
`{ content, attachmentCount }`, where `content` is the head of the message's raw
Markdown (at most 1,000 UTF-16 units; the reader collapses it to one line), or `null`
when the message no longer exists in that Chat. A trigger in a Chat the reader cannot
see is `{ kind: 'private' }` and quotes nothing, and `null` means the Server recorded
none (turns from before the record existed, or an unrecognized source). The listing is
one joined query plus one read quoting the waking messages; it never fans out per turn.
Membership and the Agent's existence are checked together, and a membership failure
always wins, so a non-member never learns whether an Agent exists.

`agent.runTrigger` (`{ serverId, agentId, runId }`) returns `{ trigger }` for one run
in the same shape and with the same visibility gate, so a turn that is still working
can be titled before it settles. The trigger is recorded in the dispatch transaction
that writes the run's `starting_work` activity, so any run the App sees already has
one; `null` means none was recorded. It is a Server-to-App read only and adds nothing
to the Computer protocol. `agent.activityHistory` pages carry the same answer for every
run they name as `runTriggers: [{ runId, trigger }]`, so the App reads `agent.runTrigger`
only for a run that started after its page was read.

`agent.serverTurns` (`{ serverId, agentIds?, before?, limit? }`) is the Server-wide
listing behind the Activity page: every Agent's settled turns on one Server, interleaved
newest first by `startedAt` (ties broken by `runId`), in exactly the `agent.turns`
record shape with the same trigger visibility gate. It requires Server membership only,
since every member can see every Agent; `agentIds` (1–100 distinct ids) narrows it, and
ids naming no Agent simply match nothing. `limit` is 1–50 (default 30). It returns
`{ turns, nextBefore }`, where `nextBefore` is the `{ startedAt, runId }` keyset cursor
for the next page, or null at the end. Like `agent.turns`, each page is one joined query.

A turn's `startedAt` is the run's first launch. When the Server resends an accepted
run after the Computer restarts, the relaunch resumes a Computer-local turn ledger
(`runtime/turns/<runId>.json`) holding that first start and every operation total the
lost launch settled, so the summary spans the whole run rather than its tail.

`agent.dreams` (`{ serverId, agentId, cursor?, limit? }`) lists what each nightly dream
changed in the Agent's memory, newest first by `startedAt` (ties broken by `runId`).
`limit` is 1–60 (default 20); the Server keeps only the newest 60 dreams per Agent. It
returns `{ dreams, nextCursor }`: each dream carries `runId` (the dream turn's run),
`startedAt`, `finishedAt`, `files` (`[{ path, change: 'added' | 'modified' | 'deleted',
added, removed, omitted? }]`, where `omitted` is `binary` or `too-large` for a file whose text
is not in the patch), and the `added` and `removed` line totals. A dream that changed nothing
is still listed, with no files. Each dream also carries `summary` (the run's `haus heartbeat
learned` text, or null) and `followUps` (`[{ reminderId, title, anchorChatId, fireAt }]`, the
reminders the Agent created during the run, derived at read). `agent.dream` (`{ serverId, agentId, runId }`) returns one dream
with its `patch`, or null when the Server has no record for that run. The patch is one unified
diff, a `diff --git a/<path> b/<path>` block per file, whose hunk headers name the enclosing
`## ` section as git's function context does; a file's text is dropped past 64 KiB and the
whole patch stays under 256 KiB. Both reads use the `agent.turns` gate: any member who may
view the Agent, with denied and unknown Agents as `NOT_FOUND`. The Computer sends the record
as an `agent-dream-record` frame just before the dream turn's summary; the Server stores it in
`agent_dreams` only for the assigned Computer and a run it started as a dream. There is no
dream event: a settled run already invalidates the App's dream reads.

Heartbeat writes use runner-token routes under `/api/agent/*`, scoped to the run that calls
them ([heartbeat spec](../../specs/heartbeat.md#wire-contract); routes in
`apps/server/src/agent-api/heartbeat-routes.ts`):

- `POST /api/agent/heartbeat/report { text }` files the run's one heartbeat report as a
  chatless `heartbeat_report` inbox item. Only a `heartbeat` or `dream` run may file one; a second
  report from the same run is refused with 409.
- `POST /api/agent/heartbeat/learned { text }` stores the nightly summary on the run's
  `agent_dream_summaries` row. Only a `dream` run may.
- `POST /api/agent/leads { topic, messageId? }` claims a shared lead, refused while another Agent
  holds a claim on the same message within seven days. Only an active `heartbeat` or `dream` run
  may claim (`403 HEARTBEAT_RUN_REQUIRED`), and a message an Agent holds as an open task answers
  `409 LEAD_HELD_AS_TASK` naming the holder. `GET /api/agent/leads` lists this Server's
  leads from the last seven days. `POST /api/agent/leads/:id/done { finding }` records the finding.
  Leads live in `agent_leads` and expire after fourteen days.

`agent.deliveries` returns that Agent's delivery ledger, newest first by
`createdAt`, with `limit` between 1 and 100 (default 50). Each record carries
`chatId`, `source`, `workId`, `messageId`, `state` (`queued`,
`accepted`, `served`, `seen`), `turnId`, and the per-state timestamps `createdAt`,
`acceptedAt`, `servedAt`, and `seenAt`. `workId` is the durable identity for
every kind of work; `messageId` is null for non-Chat work, and `chatId` is null only for a
`dream`. Rows are retained after
settlement rather than deleted, so
"never delivered" and "delivered and answered with silence" read differently.
`turnId` is the run that consumed the row; it stays null when the seen cursor
subsumed the row instead of a turn settling it.

Managed Agent commands use `/api/agent/*`. The injected `haus` wrapper calls a per-launch
Computer loopback proxy. Computer serves eligible inbox reads locally or forwards the request with
the scoped runner credential. The Agent process never receives a Server-valid credential.

A DM is between one human and one Agent, so an Agent-authored `dm:@<handle>` resolves only against
human Server members. `dm:@<agent-handle>` is `404 INVALID_TARGET`. Agents address each other in the
channels and threads they share.

`POST /api/agent/agents` also accepts `brief` (≤ 4000 characters) and `channels` (up to 20 `#name`
targets). The brief is stored on the Agent row and rides every `agent-configure` command to the
Computer, which renders it into the workspace memory it seeds on first provision; an owned workspace
is never overwritten, so the row is what survives a reprovision. Creation joins the Server's `#all`
plus each named channel in the same transaction, and the receipt's `channels` lists them, `#all`
first. A named channel that does not exist or is archived refuses the whole request with
`404 INVALID_TARGET` naming it, before an avatar is generated.

`POST /api/agent/channels/add` takes `{ agent, target }` and puts another Agent in a channel. Any
active Agent may add any active Agent; Cove is refused. The add is idempotent — `added` is false when
that Agent was already a member — and wakes nobody. Like the human channel save, it emits
`chat.lifecycle{action:'updated'}` so member lists refresh.

### Inbox and read position

Each Agent has one durable read position per Chat (`agent_chat_reads`, see
[Data model](../internals/data-model.md)). It survives session rotation and only moves forward.

`GET /api/agent/inbox/conversations` backs `haus inbox check`: every joined channel, DM, and
followed Thread (each its own row) holding someone else's message past the read position. Query:
`view` (`unread` | `mentions`, default `unread`), `before` (opaque keyset key, at most 200 characters), `limit`
(1–50, default 20). The response is `{ view, items, hasMore, nextBefore, totals }`; each item
carries `chatId`, `target`, `kind`, `unread`, `mentions`, `lastReadSequence`, `activityKey`,
`latestSenderHandle`, and `latestAt`. Rows order newest activity first by the conversation's newest message
`(created_at, id)`; `activityKey` is that pair as base64url of the microsecond UTC ISO
timestamp, `\u0000`, and the id, and `before` selects rows strictly older than it. A key the
Server did not issue is `400 INVALID_ARG`. The key is stateless: paging over unchanged data visits
each row once, but a conversation whose newest message arrives or is deleted between pages
reorders and may appear again. `mentions` counts this Agent's `mentioned` inbox rows past the position.
A muted channel counts only mentions and appears only while it has one. `totals`
(`conversations`, `dms`, `mentions`) cover every unread row whatever the view. The list is one
statement; any failure is `503 INBOX_UNAVAILABLE` with `retryable: true`, never a partial list.
Contract: `agentInboxConversationsResponseSchema` in `@haus/api`.

`GET /api/agent/inbox` is the pending-queue peek; each row's `firstSequence` is the Chat sequence
of its first pending message, or null when only fires, assignments, or Cloud Agent results wait.

`GET /api/agent/history` returns `last_read: { after, unread_after }`: the read position before the
read moved it, repeated as `unread_after` while someone else's message sat above it, else -1. A plain page
moves the position only when no message sits between it and the page start. `unread=true` returns
the page right after the position (oldest first, `limit` default 50, max 100), moves the position
through it before responding, and adds `unread_after_seq` and `read_through_seq`; combined with
`before`, `after`, or `around` it is `400 INVALID_ARG`.

### Task routes

`GET /api/agent/tasks` lists tasks in one `target` or across every Chat the Agent can see.
`status` is `all` or one status and defaults to the unfinished `todo`, `in_progress`, and
`in_review`; `mine=true` keeps tasks claimed by or assigned to the calling Agent. Rows come newest
activity first, at most 50, and `omitted` counts the matching rows the limit left out, so
`haus task list` can say `Truncated: N more`.

`POST /api/agent/tasks/create`, `/claim`, `/unclaim`, `/assign`, `/unassign`, and `/update`
mutate tasks. Every task row carries `version`, the revision `haus task list` prints as `rev=`. `claim` takes
`target` plus either `numbers` or a `messageId`; claiming a `messageId` that carries no task
promotes the message first, so the claim is what creates the task. A `heartbeat` or `dream` run
may not claim (`403 REGULAR_TURN_REQUIRED`); it claims leads instead.

`create` takes `{ target, content | titles, assignee?, nonce }`. The `nonce` (1–128) is the
idempotency key: `haus task create` mints one per invocation and, on a request that got no
answer, retries once on it. The Server stores `<nonce>:<index>` on each task-message, unique per
Chat, and checks it under the Server row lock in the create transaction, so concurrent or retried
requests with the same nonce and request return the original tasks (same ids and numbers) and
emit no second event, inbox item, or wake. The same nonce with a different title list, title
count, or assignee returns `409 IDEMPOTENCY_KEY_REUSED`. Keys live with the task-messages; they
never expire.

Every task projection carries `origin`, which says how the row came to exist:

| `origin` | Written by |
| --- | --- |
| `composed` | A human composing a message as a task. |
| `converted` | A human promoting an existing message with Convert to Task. |
| `claimed` | An Agent claiming a message nobody had promoted. |

The hosted task wire shape adds two derived fields on top of that. `tier` is `background` or
`tracked`: a background task is a `claimed` task in `in_progress` or `done` whose Thread has no
messages, whose status never left that pair — review, closure, or a reopen
stamps it tracked for good — and whose claiming run has not settled leaving the work open — an Agent's own orchestration lock, excluded from the default Board
and List. Everything else is `tracked`. `live` is true while the assignee Agent's in-flight run
holds that task's message or Thread; a run beginning and a run settling both emit `task.updated`,
so it is never polled. Both are computed per read and neither is a stored task column.

Promotion does not create the task's Thread. The Thread materializes on the first reply under its
deterministic `cht_thr_<anchor>` id, so `haus message send --target "#channel:<messageId>"`
remains the way to open one, and a claim an Agent resolves inside its own turn leaves no work
surface behind.

A claim runs in one transaction and answers `200` with one `results` row per requested task:
`outcome` is `claimed`, `already_yours` (a claim the Agent already held, which still authorizes
work), or `refused` with a `reason`. Only the holder decides a claim: an edit to status, priority,
or labels since the Agent last read the task never refuses it. Every granted claim commits and
emits its `task.updated` event together, so a refusal on one task never strands another. A row
refused because someone else holds the task also carries a **`claimConflict`** object:

```json
{
  "number": 4,
  "outcome": "refused",
  "reason": "That task is already owned by another assignee.",
  "task": { "number": 4, "status": "in_progress" },
  "claimConflict": {
    "kind": "claim_conflict",
    "conflictScope": "implementation_execution",
    "blockedActions": ["start_conflicting_execution"],
    "unblockedActionExamples": [
      "reading the task and its Thread",
      "replying in the Thread with findings, questions, or review",
      "claiming a different task in this lane",
      "raising the routing with the people in the original Chat"
    ],
    "currentAssignee": { "type": "agent", "name": "sage" },
    "status": "in_progress",
    "claimedAt": "2026-09-08T17:04:11.000Z",
    "observedAt": "2026-09-08T17:09:52.000Z"
  }
}
```

`blockedActions` is an authoritative closed set — an action absent from it is not blocked by this
conflict, though it remains subject to its own authority and policy — while
`unblockedActionExamples` is illustrative and never a permission table. `observedAt` is a snapshot,
not a standing ruling. `packages/haus-api` owns the schema (`taskClaimConflictSchema`) and the
rendering copy: `taskClaimConflictBlockedActionCopy` maps each blocked action id to its prose, and
`TASK_CLAIM_CONFLICT_ROUTING_NOTE` is the closing sentence the CLI prints — a claim conflict is a
concurrency lock, not a ruling on who owns or leads the lane, and a misroute is corrected in the
original Thread. Haus has no reassignment-request command, so no clause names one.
`haus task claim` prints every row, with each granted task's inline-reply command and each
refusal's holder or reason:

```
Claim results (1 claimed, 1 refused):
#3 (msg:b0Q8lLWk): claimed · inline reply --target "#all" --reply-to b0Q8lLWk
#4 (msg:c1R9mMXl): refused — held by @sage
```

It exits non-zero only when no row was granted. A lone refused claim with a `claimConflict`
renders the structured block in place of the generic error line —
`apps/computer/src/agent-cli/agent-claim-conflict.ts` is the only place that prose is composed —
and a batch refusal repeats one line per refused task. A granted row names the inline reply to
the task's message, never its task thread, as a fact of the task; the receipt carries no
routing advice. Where posts are seen, and why a thread on the request is the author's unread,
is taught once by the Manual `replies` topic (ADR 0029). `haus task create` names each created
task's thread address as a reference.

`/update` is member-level: any Agent in the task's Chat may move status along the transition
table in [specs/tasks.md](../../specs/tasks.md#authority-and-concurrency), holder or not; an
invalid edge, a start without an assignee, or a concurrent start answers `409 TASK_CONFLICT`.
`/assign` takes `target`, `number`, `assignee` (`@handle` of an Agent member of that Chat),
and optional `expectedRevision`; `/unassign` takes the same without `assignee`. Both answer
`{ task }`, never change status, and clear the claim stamp. Tasks are Agent work, so a human
handle, like a missing, retired, or out-of-Chat one, answers one uniform `409 TASK_CONFLICT` "not assignable in this chat", and a stale
`expectedRevision` answers `409` naming both revisions. Assigning another Agent delivers the same
`task_assignment` inbox item an App assignment does.

The managed CLI ships inside Computer, so these claim, list, and Agent-only assignee shapes require
Computer protocol 25: an older Computer reports `update-required` and runs no Agent turns instead of failing to parse
a claim or list response.

### Reminder routes

`POST /api/agent/reminders/schedule`, `/snooze`, `/update`, and `/cancel` each carry a
`commandId` (1–128), the idempotency key; the CLI mints one per invocation and retries an
unavailable Server once on it. The Server records each command in `reminder_commands`, scoped to
`(Server, authoring Agent, commandId)` and written in the same transaction as the reminder under a
per-key advisory lock. The same key and input replay the original reminder without a second
`reminder.changed` event; a different input returns `409 IDEMPOTENCY_KEY_REUSED`. Commands live as
long as their reminder.

`schedule` with a `daily@` or `weekly:` repeat requires `timezone` and may omit `fireAt`: the
Server derives the next slot in that zone, and refuses a supplied `fireAt` that is not a slot.
One-shots and `every:` repeats require `fireAt`. `update` keeps a calendar reminder on its cadence:
a new calendar `repeat` moves the next fire to its next slot, and a new `fireAt` must be a slot.
A supplied `timezone` must be an IANA zone name such as `America/New_York` or `UTC`; offsets like
`+05:00` are refused, and the Server stores the canonical spelling
([ADR 0040](../adr/0040-agents-resolve-human-timezones-explicitly.md)).

### People lookup

`GET /api/agent/server` (`haus server info`) and `GET /api/agent/channels/members`
(`haus channel members`) return each human's `timezone`, their IANA zone or `null` when their App
has not reported one. Agents carry none. The CLI prints it as `[timezone: <zone>]` so an Agent can
resolve a calendar reminder in the requester's zone. The App reports the device zone through
`member.syncIdentity`, which fills only a blank, and `member.setTimezone` sets it from Settings.
Both take the same IANA-name rule as reminders.

### Agent routes

A managed Agent creates, updates, and re-avatars Agents on its own Server:

```sh
haus agent create --target "#product" --name "Orbit" \
  --description "Release helper" --avatar-concept "a small brass orbit"
haus agent update --agent @orbit --description "Release and rollback helper"
haus agent avatar --agent @orbit --concept "a small brass orbit at dusk"
```

`POST /api/agent/agents` takes `target`, `displayName` (1–80), `description` (1–280), optional
`avatarConcept` (1–280), `brief` (1–4000), `channels`, `signatureEmoji` (one emoji, validated like
self-update; null keeps 👀), and a `nonce`. The App's `agent.create` takes the same optional
`signatureEmoji`. The Server resolves the
request's conversation from the scoped runner, verifies the Agent's current Chat view, derives an
available handle under the Server row lock, and creates the Agent and memberships atomically.
It writes no Message, Thread, or inbox delivery. Runtime, model, reasoning effort, and Computer
are inherited from the caller and revalidated against the Computer's inventory. The receipt carries
the confirmed Agent identity, channels, execution configuration, avatar outcome, and retry status.
The CLI hints an introduction in `#all` through ordinary message send after creation succeeds.

Avatar generation runs before the transaction, because it is a network call that must not hold the
Server row lock. `AVATAR_PROVIDER_UNAVAILABLE` (no provider provisioned) creates the Agent anyway
with `avatar.status = "unavailable"`; a busy, provider, or output failure refuses the whole request
as retryable and creates nothing.

The nonce is the idempotency key, and the Agent CLI derives it from the request rather than minting
one: a SHA-256 over the calling Agent, target, display name, description, avatar
concept, brief, and the de-duplicated sorted channel list. Re-issuing the identical command therefore
replays the original creation instead of creating a second Agent, and changing any field asks for a
different Agent and gets one. On a request that never got an answer — a timeout or a dropped
connection, never an answered refusal — the CLI retries once on that same nonce.

The same `(Server, creating Agent, nonce)` with identical values returns the original
receipt; reusing that nonce for different values returns `AGENT_CREATE_IDEMPOTENCY_CONFLICT`. The
replay is read under the Server row lock and before the freshness check, so a retry that reached the
Server while the first attempt was still generating its avatar replays too; that receipt carries
`avatar.status = "none"`, because the image it generated was dropped and the Agent still wears the
first one. A target the Agent has not read since it changed returns `CHAT_VIEW_STALE`. An Agent with
no assigned Computer returns `AGENT_NO_COMPUTER`.

`POST /api/agent/agents/update` rewrites an Agent's `description` (1–280); `POST /api/agent/agents/avatar`
generates and applies a replacement avatar from a `concept`. Both resolve `@handle` within the
runner's Server and refuse Cove with `AGENT_IDENTITY_PROTECTED`. Neither renames an Agent: the handle
is the Server-scoped alias that mentions, targets, and history all key on.

Creation nonces and request hashes live on `agents`; announcements are not retry anchors.
A request that changes any creation input under an existing nonce is refused before avatar generation.
Creation emits `server.updated{scope:'agent'}`, channel membership lifecycle events, and
`chat.lifecycle{action:'created'}` for the owner DM it opens, never `message.created`. Historical `agent-created` bodies remain readable; new introductions are ordinary text.
Creating an Agent does not wake it. Its standing brief is already in the memory the Computer seeds,
so its first turn is its next ordinary delivery and nothing DMs it.

### Asking a human

Haus has no question route. An Agent asks a person by @mentioning them, or by inline-replying to
their message (`--reply-to`), in an ordinary `haus message send` where the work lives, and their
reply wakes it through ordinary delivery
([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)). The mention writes the Message's
`mentioned_user_ids` (an inline reply its `reply_to_message_id`); either notifies that human
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). Every Agent-facing Message states its `body_kind`
(`text | agent-created`). A Message that links Cloud Agent work also carries `cloud_agent_works`,
every linked work the reading Agent can see in link order; the older single `cloud_agent_work`
field still names the first for released CLIs.

### Cloud Agent work

A managed Agent delegates bounded repository work to a provider-hosted agent with
`haus cloud-agent start`:

```sh
haus cloud-agent start --target "#product" --reply-to <messageId> --repo haus/haus --ref main \
  --title "Fix the flaky delivery test" \
  --say "Handing the flaky delivery test to a cloud agent." <<'HAUSMSG'
Reproduce the failure, fix it, and open a pull request.
HAUSMSG
```

This command runs on the Computer rather than upstream. The Computer checks
`CloudAgentProvider.readiness()` first, so an unavailable capability fails with
`CLOUD_AGENT_UNAVAILABLE` before Server records anything, and it keeps the stdin instructions
local: they reach the provider and never Server.

`start` also takes `--provider cursor|claude`; without it the Computer's default provider applies
(Cursor until a human picks another in Computer settings). A Run whose cloud agent stopped to ask
a question settles as `pending_input` and wakes the Agent once; it answers with
`haus cloud-agent send --work <workId>`.

`POST /api/agent/cloud-agents` takes `{ cause?, content, nonce, provider, replyToMessageId?,
repository, startingRef, target, title }`. `cause` (`start --cause <fireId>`) is the Trigger or
Reminder fire the launch answers; the Server validates and records it on the launch Message as
`haus message send --cause` does, and infers it the same way when absent
([Automation provenance](../../specs/automation-provenance.md)). The target is a Channel or DM, or a Thread that already holds
conversation: a launch never opens a Thread, so a `<target>:<shortId>` anchor without one, or
whose Thread holds no Messages, fails with
`CLOUD_AGENT_NEW_THREAD` before anything is written, and its message names the inline
`--target <parent> --reply-to <shortId>` to use instead. It returns `{ state: 'started', chatId, idempotent, messageId, runId, sequence, target,
work }`, or `{ state: 'held', newMessageCount, omittedMessageCount, formalMentionCount,
shownMessages }` when the `haus message send` freshness hold finds unseen newer messages in the
target Chat. A held launch creates nothing and launches nothing; the Agent reviews the shown
messages and re-runs the command if it still applies (no draft; see
[Cloud Agents](../../specs/cloud-agents.md#durable-cloud-agent-work)). `content`
is the Agent's own words; `title` is at most 120 characters and `repository` reads as
`owner/name`. One transaction writes a `text` Message whose content is `content`, a blank line, and
a Server-written `[<title>](cloud-agent://<workId>)` link, the `cloud_agent_work` row, its
`cloud_agent_work_links` rows (any work `content` links that the Agent can see, then the new work
last), its first `cloud_agent_runs` row in `queued`, the deterministic child Thread and the
Agent's follow when the work is top-level, ordinary delivery planning, and both the
`message.created` and `cloudAgentWork.updated` events. The work keeps the Chat and Message as
historical pointers with no foreign key, so it outlives both
([ADR 0044](../adr/0044-cloud-agent-work-is-referenced-not-embedded.md)). The CLI receipt prints
the Work ID, the Message, a `Work thread:` target, and a `Link:` line with that Markdown link,
which the Agent pastes into `haus message send` to show the work in another conversation. It is idempotent by
`(Chat, nonce)`; the same nonce with different values returns
`CLOUD_AGENT_IDEMPOTENCY_CONFLICT`. The Computer then calls `provider.start()`; a provider that
refuses settles that same recorded work as `failed` with an error code and returns
`CLOUD_AGENT_LAUNCH_FAILED` rather than erasing the attempt.

`haus cloud-agent send --work <workId>` takes follow-up instructions on stdin. The Computer
accepts `{ workId, nonce, instructions, interrupt }` at `POST /api/agent/cloud-agents/send`, retains
the instructions locally, and forwards `{ workId, nonce }` to Server. Server returns
`{ work, runId, idempotent, predecessors }` for a Run on the existing work. Computer sends it to the
same hosted agent after preceding work settles, or stops active work and discards older queued
prompts when `interrupt` is true. Pending instructions stay in a private Computer-local journal
until launched or cancelled. Revisions reuse the Work ID, launch Message, and Thread. Each settled
Run gets its own inbox attention; callers do not need to manage provider Run IDs.

`haus cloud-agent inspect` uses `GET /api/agent/cloud-agents` to read `{ works }` for the caller's
delegated work. An optional `workId` query selects one work with its recorded results. These are
Server records, not a live provider transcript. The CLI prints a `Link:` line for each work.
`inspect` and `send` stay delegator-only; another Agent sees linked work only through the
`cloud_agent_works` field of the Messages it reads.

`haus cloud-agent stop --work <workId>` uses `POST /api/agent/cloud-agents/cancel`. The published
`cancel` CLI spelling remains a compatibility alias. The endpoint takes `{ workId }` and is
authorized to the delegating Agent alone; `cloudAgentWork.cancel({ serverId, workId })` is the
Owner/Admin equivalent. Seeing the work through a link grants neither. Both record
`cancelRequestedAt` and `cancelRequestedBy` and send a `cloud-agent-cancel` frame to the assigned
Computer. Cancelling settled work returns `CLOUD_AGENT_WORK_SETTLED`; cancelling or following up
work whose Computer was removed returns `CLOUD_AGENT_COMPUTER_REMOVED`.

Computer reports lifecycle over the attachment socket as a `cloud-agent-observation` frame carrying
`{ workId, runId, status, observedAt }` plus optional provider ids and URL, raw status, bounded
`activity` and `summary`, error code, reported branches, and usage. Server applies it idempotently:
a duplicate, out-of-order, or post-terminal observation changes nothing. A settled Run creates
exactly one `agent_inbox` attention for the delegating Agent, keyed by the Run id. The latest Run
owns the work's displayed status, so an earlier Run settling cannot finish a queued follow-up.
On reconnect Server pushes `cloud-agent-reconcile` frames of at most 200 entries covering every
non-terminal Run that Computer still owns, with any cancel recorded while it was offline; Computer reads each
Run from the provider and reports what it finds. A settled Run's inbox attention targets the
requesting Chat only while that Chat is live; after it is deleted the Run settles without one, and
the notice never moves to another link.

`cloudAgentWork.listActive({ serverId })` is the human read behind the Inbox's Happening now. It
lists live work the viewer can see through any linking Message. Each row's `location` says where
opening it goes: `{ kind: 'work-thread', threadChatId, anchorMessageId }` when the viewer can read
the launch work Thread, otherwise `{ kind: 'message', chatId, messageId, threadChatId }` for the
newest visible linking Message, where `chatId` is the Channel or DM and a non-null `threadChatId`
is the Thread that Message sits in or anchors. Opening a location never creates or follows a
Thread. `cloudAgentWork.listForChat({ serverId, chatId })` lists work linked in a Chat and its
Threads, keyed by the Thread anchor for an in-Thread link and by the linking Message otherwise.

#### Cloud Agent provider access

Cloud Agent provider access is a Computer capability with its own credential store, separate from
the Cursor runtime harness even when both belong to one Cursor account. Each Computer reports it in
its inventory as `cloudAgentProviders: [{ provider, isDefault, ready, reason, models }]` (`provider` is `cursor` or
`claude`), where an unready reason is
`not-connected`, `expired`, or `provider-unavailable`. `models` is the provider's model catalog for
the connected account, `{ autoAvailable, models: [{ id, displayName, description, family, order,
effort, fast }], refreshedAt }`, or `null`; `autoAvailable` says Cursor listed its Auto entry
(see [Cloud Agents → Model](../../specs/cloud-agents.md#model)).

`cloudAgentSettings.get({ serverId, provider })` (`provider` defaults to `cursor`; each provider
keeps its own Server-wide model) answers any member with
`{ model, catalog, savedModelUnavailable }`. `model` is `{ kind: "auto" }`, shown as Auto
(Haus sends Cursor's `default` id, so Cursor picks a model for each Run), or
`{ kind: "model", id, params: { effort?, fast? } }`, where an absent param is the model's default.
`catalog` is the freshest catalog any of the Server's Computers reported (or `null`).
`cloudAgentSettings.setModel({ serverId, model })` is Owner/Admin only (`FORBIDDEN` otherwise),
refuses an unlisted id or a param value that model does not offer with `BAD_REQUEST`, returns the
same shape, and emits a `server` scope update. Each Run in `cloudAgentWork` carries
`model: { id, params, fallbackFrom, droppedParams }`: the model id sent to the provider (`default`
for Auto, or `null` when the launching Computer's catalog lacked Auto and Haus sent none), the params
sent with a catalog model (`[{ name, providerParamId, value }]`), the saved model that fell back to
Auto when the launching Computer's catalog did not list it, and the
saved params dropped because that model no longer offered them.

`cloudAgentProvider.get`, `.connect`, `.cancelSignIn`, and `.disconnect` take
`{ computerId, provider, serverId }` and answer with the Computer's own
`{ accountEmail, expiresAt, provider, ready, reason, signIn? }`. Server verifies current membership
plus Owner or Admin authority and that the Computer belongs to that Server, then relays a
`cloud-agent-capability-request` over its outbound socket. The Computer answers with
`cloud-agent-capability-result`; the App never touches a Computer socket.

`connect` starts one Computer-owned sign-in and returns as soon as Cursor supplies the browser
link. Repeated connects reuse the active attempt. The optional `signIn` is either
`{ status: "waiting", url, expiresAt }` or `{ status: "failed", message }`. The App opens the
HTTPS Cursor link on the user's current device and reads `get` every second while waiting.
Computer polls Cursor for approval and stores the resulting key in Cursor's credential store.
No browser opens on Computer, and no code needs to be pasted back. Only the public sign-in link,
expiry, bounded status, and account metadata cross Server; credentials and the login verifier
remain on Computer. Sign-in state is held in memory and never written to Server records.

Closing the dialog preserves sign-in and lets the user resume it from the row, including after
an App reload. `cancelSignIn` aborts the provider wait; it does not disconnect an existing
credential. Sign-in expires after five minutes and offers a fresh link through retry.
`disconnect` cancels pending sign-in and forgets the stored credential; the key stays revocable
from Cursor's dashboard. Haus never starts sign-in during an Agent turn. This contract uses
Computer protocol 21 so an older Computer cannot fall back to opening its own browser.

Computer protocol 23 adds per-model `reasoningEfforts` and `defaultReasoningEffort` to inventory and supports `default`,
`low`, `medium`, `high`, `xhigh`, and `max`. Computer maintains the capability list beside its
model inventory; AI SDK adapter settings define the runtime's accepted vocabulary, but do not
provide a per-model discovery API. Claude Haiku has only `default`; Pi's alias uses its adapter's
thinking budgets, with the native model determining their effect. Inventories predating this
field retain the original low/medium/high contract. Server validates explicit creation and
configuration choices against the assigned Computer's report. Configurable models report a concrete
default (currently Haus's Medium), which the App selects when a prior choice is unsupported.
`default` is reserved for models without an effort control, shown as Not configurable; it omits
the effort setting at the adapter boundary. An applied value records the requested policy, not measured thinking.

Computer protocol 28 adds per-model `features`: the core abilities an Agent gets on that model as
Haus launches its runtime, from `subagents` and `image-generation`. Computer declares them beside
the effort list in `apps/computer/src/inventory.ts`, following the harness settings: Claude Code
has sub-agents; Codex and Grok Build keep native image generation with sub-agents switched off;
Pi has neither. Codex image generation needs a paid ChatGPT plan and drops silently otherwise.
Web search is not a reported feature. An absent list means an older Computer, not "none". The
App shows these facts in the Agent model picker and Settings -> Models.

The Agent profile is the human's canonical edit surface. `agent.update`, `agent.configure`, and
the avatar mutations on the Server `agent` tRPC router remain the Owner/Admin path for every field,
including runtime, model, and reasoning effort, which no Agent-facing route exposes.

Each settled turn summary includes its runtime and model plus normalized input,
output, cache-read, and cache-write counts when the runtime reports them. Server
persists those bounded counters for usage aggregation; raw usage payloads and
execution traces remain Computer-local. A failed summary may also carry
`failureCode`, the stable cause (for example `compaction-failed` or
`turn-stalled`) that Server policy and App copy use instead of error text, and
`failureFingerprint`, a 16-hex hash the Computer computes from the normalized raw
error so the Server can tell the same failure repeating without receiving it.

Wire schemas live in `packages/haus-api`; Server handlers live in `apps/server/src/agent-api/`
and `apps/server/src/haus-api/agent/`; Computer proxy and launch behavior live in
`apps/computer/src/`.

Hosted Agent execution detail is a separate, explicit `agent.executionJournal` query. It accepts
one `serverId`, `agentId`, and `runId`; Server authorizes only Owners/Admins and answers from the
journal the Agent's Computer synced
([ADR 0048](../adr/0048-execution-journals-sync-to-the-server.md)): `{ status: 'available',
agentId, runId, journal }`, or `{ status: 'missing', agentId, runId }` when nothing is stored yet
or the run is past the 30-day retention. The Server never asks a Computer for evidence, so the
answer does not depend on the Computer being online. Ordinary members never receive it.

An available journal carries `runId`, `status`, timestamps, a `tools` array (tool-call id, observed
identity, input, `output`, `error`, `preliminary`, `final`, interruptions, and timings), and an
optional `reasoning` array of `{ id, startedAt, endedAt?, text, truncated? }` blocks capped at
64,000 characters each and 1,000 blocks per turn. A tool a runtime sub-agent made carries
`parentToolCallId`, the delegating tool call it ran under. That delegating tool carries an optional
`subagent` record: `{ label, subagentType?, status, startedAt, endedAt?, latestAction?, usage?,
failedToolCount? }`,
where `label` and `latestAction` are at most 128 characters, `status` is `running`, `completed`,
`failed`, or `interrupted`, `usage` is `{ totalTokens, toolUses, durationMs }`, and
`failedToolCount` counts the sub-agent's own failed calls so a sub-agent that completed
with failures can read as a warning. Sub-agent token
totals live only here; they are not yet part of turn token usage or daily usage. Reasoning exists only in this response. Every
other string leaf the journal carries is capped at 256,000 characters and ends with
`…[truncated N more characters]` when clipped, so one oversized tool output cannot dominate the
response.

Computer shapes each record as it uploads it; the file on disk stays raw. It redacts known
secret values, token shapes, credentials, and secret-named keys first (see
[Agent Activity](../../specs/agent-activity.md#computer-projection-and-execution-journal)). Paths
under the Agent workspace read workspace-relative (the workspace itself reads
`<workspace>`) and paths under the Agent home read `~/…`, in tool inputs, outputs,
errors, sub-agent progress lines, and reasoning, so host usernames and Server and Agent
ids never reach the App. A failed tool carries `failure: { message, exitCode? }` beside
its raw `error`: Codex's `{ formatted_output, exit_code }`, Claude's
`<tool_use_error>…</tool_use_error>` wrapper, an `Exit code N` first line, and the
Computer's own codes (`missing_result`, `stream_failed`) all normalize there. A failed
turn carries the same `failure` with the first line of its terminal error, so a turn that
failed before any tool ran still says why. Raw provider error text stays out of the
Server turn record; only `failureKind` crosses there.

`agent.executionOutlines` is the batched, compact companion: one `serverId` and `agentId`, and
1–50 distinct `runIds`, under the same Owner/Admin authorization. Server answers every run from
its store, in request order, each as `{ status: 'available', runId, outline }` or
`{ status: 'missing', runId }`. The Computer computes a run's outline when the run settles (or when
it resends the run whole) and uploads it with the run's last frame. An outline is `{ runId, status, startedAt, durationMs, steps, omittedSteps? }`:
each step is `{ id, kind, label, depth, parentId?, startOffsetMs, durationMs?, status, subagent?, toolKind? }`
with `kind` one of `tool`, `bookkeeping`, `reasoning`, or `subagent`, `subagent` as
`{ label, failedToolCount }`, and offsets from the outline's `startedAt`, its earliest evidence.
Exactly the `tool` steps carry `toolKind`, the call kind `readExecutionToolKind` in
`@haus/api` reads from the tool's wire name (`shell`, `file-read`, `web`, `image`, `mcp`,
`generic`, …). The App's turn trace classifies a read journal with the same function, so an unread
turn's overview colors its calls with the same kind palette a read trace uses.
Labels are the scrubbed action descriptions used for thoughts (ADR 0036), at most 96
characters; a shell call's label stops before any heredoc. An outline never carries tool inputs
or outputs, errors, reports, reasoning text, message bodies, or images. It keeps at most 200
steps, top-level first, and counts the rest in `omittedSteps`.

On the Computer a running turn writes an append-only `<runId>.ndjson` log and a settled one a
consolidated `<runId>.json` snapshot under the Agent's `runtime/execution-journal/` directory; a
`<runId>.uploaded` marker beside them records that the Server stored the settled run. The upload
frames (`agent-execution-journal-records`) and acks (`agent-execution-journal-ack`) are defined in
`packages/haus-api/src/agent-execution-journal-upload.ts`.

Computer flushes ongoing reasoning at most every 250 ms as deltas arrive, in addition to block,
tool, and turn boundaries, and each flush uploads. An authorized open activity view can therefore
inspect reasoning before the first tool call or completed reasoning block.
