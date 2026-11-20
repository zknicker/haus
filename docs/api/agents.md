---
summary: Server Agent contracts, Computer execution reports, turn and delivery observability, and managed Agent API routing.
read_when:
  - changing Agent CRUD, execution configuration, Computer reports, or managed Agent routes
  - reading Agent turn records or the delivery ledger
  - changing the Agent inbox list, `message read --unread`, or the Agent read position
  - changing an Agent's conversation style, signature emoji, or self-profile update
  - changing Agent channel routes (`haus channel add`, `join`, `leave`, `mute`)
  - changing the Agent Task routes (`/api/agent/tasks/*`) or claim routes
  - changing the `haus worker` routes, Worker refusal codes, dispatch, settlement, or Worker inbox items
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
transaction applies every field or none.
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
`{ kind: 'claim', chatId, messageId, preview }` (the claim's message), or
`{ kind: 'reminder' | 'trigger' | 'worker' | 'onboarding' | 'greeting', chatId }` (`greeting`
is a new Agent's one-time `#all` wake when it led the run alone; `onboarding` is a past turn of
the retired Server onboarding flow that nothing writes anymore), or one of the chatless
sources, whose runs need no Chat visibility to read:

- `{ kind: 'subagent' }`: a wake for background work the Agent started that finished or stopped
  ([runtime drivers](../../specs/runtime-drivers.md#background-work)).
- `{ kind: 'task', taskId, key, title, more? }`: a board Task assigned to the Agent.

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

`agent.deliveries` returns that Agent's delivery ledger, newest first by
`createdAt`, with `limit` between 1 and 100 (default 50). Each record carries
`chatId`, `source`, `workId`, `messageId`, `state` (`queued`,
`accepted`, `served`, `seen`), `turnId`, and the per-state timestamps `createdAt`,
`acceptedAt`, `servedAt`, and `seenAt`. `workId` is the durable identity for
every kind of work; `messageId` is null for non-Chat work, and `chatId` is null for chatless work
(a sub-agent wake or a Task assignment). Rows are retained after
settlement rather than deleted, so
"never delivered" and "delivered and answered with silence" read differently.
`turnId` is the run that consumed the row; it stays null when the seen cursor
subsumed the row instead of a turn settling it.

Managed Agent commands use `/api/agent/*`. The injected `haus` wrapper calls a per-launch
Computer loopback proxy. Computer serves eligible inbox reads locally or forwards the request with
the scoped runner credential. The Agent process never receives a Server-valid credential.

A DM is between one human and one Agent, so an Agent-authored `dm:@<handle>` resolves only against
human Server members. `dm:@<agent-handle>` is `404 INVALID_TARGET`. Agents address each other in the
channels and Tasks they share.

`POST /api/agent/agents` also accepts `brief` (≤ 4000 characters) and `channels` (up to 20 `#name`
targets). The brief is stored on the Agent row and rides every `agent-configure` command to the
Computer, which renders it into the workspace memory it seeds on first provision; an owned workspace
is never overwritten, so the row is what survives a reprovision. Creation joins the Server's `#all`
plus each named channel in the same transaction, and the receipt's `channels` lists them, `#all`
first. A named channel that does not exist or is archived refuses the whole request with
`404 INVALID_TARGET` naming it, before an avatar is generated.

`POST /api/agent/channels/add` takes `{ agent, target }` and puts another Agent in a channel. Any
active Agent may add any active Agent. The add is idempotent — `added` is false when
that Agent was already a member — and wakes nobody. Like the human channel save, it emits
`chat.lifecycle{action:'updated'}` so member lists refresh.

Agents cannot create channels. Every channel is a Project, and only people create Projects
(`project.create`, [specs/projects.md](../../specs/projects.md)), so there is no Agent create route.

### Inbox and read position

Each Agent has one durable read position per Chat (`agent_chat_reads`, see
[Data model](../internals/data-model.md)). It survives session rotation and only moves forward.

`GET /api/agent/inbox/conversations` backs `haus inbox check`: every joined channel, DM, and
followed Task under a joined channel (each its own row) holding someone else's message past the read position. Query:
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
of its first pending message, or null when only fires, assignments, or Worker results wait.

`GET /api/agent/history` returns `last_read: { after, unread_after }`: the read position before the
read moved it, repeated as `unread_after` while someone else's message sat above it, else -1. A plain page
moves the position only when no message sits between it and the page start. `unread=true` returns
the page right after the position (oldest first, `limit` default 50, max 100), moves the position
through it before responding, and adds `unread_after_seq` and `read_through_seq`; combined with
`before`, `after`, or `around` it is `400 INVALID_ARG`.

### Claim routes

`GET /api/agent/claims` lists claims in one `target` or across every Chat the Agent can see.
`status` is `all` or one status and defaults to the unfinished `todo`, `in_progress`, and
`in_review`; `mine=true` keeps claims claimed by or assigned to the calling Agent. Rows come newest
activity first, at most 50, and `omitted` counts the matching rows the limit left out, so
`haus claim list` can say `Truncated: N more`.

`POST /api/agent/claims/create`, `/claim`, `/release`, `/assign`, `/unassign`, and `/update`
mutate claims. Every claim row carries `version`, the revision `haus claim list` prints as `rev=`. `claim` takes
`target` plus either `numbers` or a `messageId`; claiming a `messageId` that carries no claim
promotes the message first, so claiming is what creates the claim. A `create` assigned to the
caller is `origin` `claimed`.

`create` takes `{ target, content | titles, assignee?, nonce }`. The `nonce` (1–128) is the
idempotency key: `haus claim create` mints one per invocation and, on a request that got no
answer, retries once on it. The Server stores `<nonce>:<index>` on each claim-message, unique per
Chat, and checks it under the Server row lock in the create transaction, so concurrent or retried
requests with the same nonce and request return the original claims (same ids and numbers) and
emit no second event, inbox item, or wake. The same nonce with a different title list, title
count, or assignee returns `409 IDEMPOTENCY_KEY_REUSED`. Keys live with the claim-messages; they
never expire.

Every claim projection carries `origin`, which says how the row came to exist:

| `origin` | Written by |
| --- | --- |
| `composed` | `claim create` for someone else: unassigned, or reserved for a peer. |
| `converted` | `claim.promote` on an existing message. |
| `claimed` | An Agent claiming a message nobody had promoted, or creating one for itself. |

The hosted claim wire shape adds two derived fields on top of that. `tier` is `background` or
`tracked`: a background claim is a `claimed` claim in `in_progress` or `done` whose status never
left that pair — review, closure, or a reopen stamps it tracked for good — and whose claiming run
has not settled leaving the work open — an Agent's own orchestration lock, excluded from
`claim.list` by default. Everything else is `tracked`. `live` is true while the assignee Agent's
in-flight run holds that claim's message; a run beginning and a run settling both emit
`claim.updated`, so it is never polled. Both are computed per read and neither is a stored claim
column.

A claim runs in one transaction and answers `200` with one `results` row per requested claim:
`outcome` is `claimed`, `already_yours` (a claim the Agent already held, which still authorizes
work), or `refused` with a `reason`. Only the holder decides a claim: a status edit since the Agent
last read the claim never refuses it. Every granted claim commits and emits its `claim.updated`
event together, so a refusal on one claim never strands another. A row
refused because someone else holds the claim also carries a **`claimConflict`** object:

```json
{
  "number": 4,
  "outcome": "refused",
  "reason": "That claim is already owned by another assignee.",
  "claim": { "number": 4, "status": "in_progress" },
  "claimConflict": {
    "kind": "claim_conflict",
    "conflictScope": "implementation_execution",
    "blockedActions": ["start_conflicting_execution"],
    "unblockedActionExamples": ["…"],
    "currentAssignee": { "type": "agent", "name": "sage" },
    "status": "in_progress",
    "claimedAt": "2026-09-08T17:04:11.000Z",
    "observedAt": "2026-09-08T17:09:52.000Z"
  }
}
```

`blockedActions` is an authoritative closed set — an action absent from it is not blocked by this
conflict, though it remains subject to its own authority and policy — while
`unblockedActionExamples` (`apps/server/src/claims/claim-conflict.ts`) is illustrative and never a
permission table. `observedAt` is a snapshot,
not a standing ruling. `packages/haus-api` owns the schema (`claimConflictSchema`) and the
rendering copy: `claimConflictBlockedActionCopy` maps each blocked action id to its prose, and
`CLAIM_CONFLICT_ROUTING_NOTE` is the closing sentence the CLI prints — a claim conflict is a
concurrency lock, not a ruling on who owns or leads the lane, and a misroute is corrected in the
original conversation. Haus has no reassignment-request command, so no clause names one.
`haus claim` prints every row, with each granted claim's inline-reply command and each
refusal's holder or reason:

```
Claim results (1 claimed, 1 refused):
#3 (msg:b0Q8lLWk): claimed · inline reply --target "#all" --reply-to b0Q8lLWk
#4 (msg:c1R9mMXl): refused — held by @sage
```

It exits non-zero only when no row was granted. A lone refused claim with a `claimConflict`
renders the structured block in place of the generic error line —
`apps/computer/src/agent-cli/agent-claim-conflict.ts` is the only place that prose is composed —
and a batch refusal repeats one line per refused claim. A granted row names the inline reply to
the claim's message as a fact of the claim; the receipt carries no routing advice. Where posts
are seen is taught once by the Manual `replies` topic (ADR 0029).

`/update` is member-level: any Agent in the claim's Chat may move status along the transition
table in [specs/claims.md](../../specs/claims.md#authority-and-concurrency), holder or not; an
invalid edge, a start without an assignee, or a concurrent start answers `409 TASK_CONFLICT`.
`/assign` takes `target`, `number`, `assignee` (`@handle` of an Agent member of that Chat),
and optional `expectedRevision`; `/unassign` takes the same without `assignee`. Both answer
`{ claim }`, never change status, and clear the claim stamp. Claims are Agent work, so a human
handle, like a missing, retired, or out-of-Chat one, answers one uniform `409 TASK_CONFLICT` "not assignable in this chat", and a stale
`expectedRevision` answers `409` naming both revisions. Assigning another Agent delivers the same
`claim_assignment` inbox item an App assignment does.

The managed CLI ships inside Computer, so these claim, list, and Agent-only assignee shapes require
Computer protocol 25: an older Computer reports `update-required` and runs no Agent turns instead of failing to parse
a claim or list response.

### Task routes

`GET /api/agent/tasks` lists Tasks by priority then age, 50 at most with the rest counted in
`omitted`: `assignee` (`me`, `none`, or `@handle`), `key` (a ledger key like `SEC`), and `state`
(a comma list or repeated; `todo,open` by default) narrow it. `GET /api/agent/tasks/show?key=SEC-12`
adds the description, Mentioned in, and Reminders. `POST /api/agent/tasks/start` starts a Task from
a Channel or DM Message (`{ target, from, title, project?, description?, assignee?, state?,
priority?, dueOn? }`) in the Project `project` names by key, else the origin's channel, else for a
DM the caller's home Project; a non-generalist Agent outside its home Project is
`403 TASK_PROJECT_NOT_HOME` with a `nextAction` naming that Project's Agent and channel), and `/state`, `/update`, `/assign`, and `/attach-pr` address
Tasks by key. `/attach-pr` takes `{ key, url }` and answers `{ task, pullRequest }`;
`/unfollow` takes a `task:KEY-n` target. People file Tasks in the App instead (`task.create`). Inputs are in
`packages/haus-api/src/agent-task.ts` and `task-input.ts`; refusal codes in
`agent-task-refusals.ts`.

Omitting `expectedVersion` means the last write wins: a write that lost a race retries on the
current version, a bounded number of times. A named `expectedVersion` that is stale, or a race still
lost after those retries, answers `409 TASK_CONFLICT`, a name that resolves to nothing or a write to a
chatless history Task `400 INVALID_ARG`, and a missing Task `404 TASK_NOT_FOUND`. Assigning another Agent delivers a chatless
`task_assignment` inbox item, which needs Computer protocol 33.

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
`signatureEmoji` and a required `homeProjectId`, an open Project that is never `#all`; an Agent
the route creates lives in its creator's home Project, and the route refuses when that home is not
an open Project. The Server resolves the
request's conversation from the scoped runner, verifies the Agent's current Chat view, derives an
available handle under the Server row lock, and creates the Agent and memberships atomically.
It writes no Message or inbox delivery. Runtime, model, reasoning effort, and Computer
are inherited from the caller and revalidated against the Computer's inventory. The receipt carries
the confirmed Agent identity, channels, execution configuration, avatar outcome, and retry status.
The CLI receipt says the new Agent introduces itself in `#all` on its first turn and tells the
creator to answer the human in the requesting conversation rather than post an introduction.

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
runner's Server. Neither renames an Agent: the handle
is the Server-scoped alias that mentions, targets, and history all key on.

Creation nonces and request hashes live on `agents`; announcements are not retry anchors.
A request that changes any creation input under an existing nonce is refused before avatar generation.
Creation emits `server.updated{scope:'agent'}`, channel membership lifecycle events, and
`chat.lifecycle{action:'created'}` for the owner DM it opens, never `message.created`. Historical `agent-created` bodies remain readable; new introductions are ordinary text.
Creating an Agent wakes only the new Agent, once: both creation paths queue one bodiless,
noticeless `greeting` inbox attention in `#all` (identity `greeting:<agentId>`) and dispatch after
`agent-configure`. The run that carries it sets the start frame's `greets: true`, and the Computer
adds the one-time `#all` greeting to that run's prompt, warm or cold. Nothing DMs it.

### Asking a human

Haus has no question route. An Agent asks a person by @mentioning them, or by inline-replying to
their message (`--reply-to`), in an ordinary `haus message send` where the work lives, and their
reply wakes it through ordinary delivery
([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)). The mention writes the Message's
`mentioned_user_ids` (an inline reply its `reply_to_message_id`); either notifies that human
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). Every Agent-facing Message states its `body_kind`
(`text | agent-created | worker-report | worker-follow-up`). A Message that links read-only
Worker history from before Tasks also carries `workers`, every linked Worker the reading Agent can
see in link order. New Workers are never linked: a Message points at their Task.

### Workers

A managed Agent delegates bounded repository work for a Task to a Worker
([Workers](../../specs/workers.md)) with `haus worker start`. The brief rides stdin:

```sh
haus worker start --task SEC-12 --on cursor --repo haus/haus --ref main \
  --title "Fix the flaky delivery test" <<'BRIEF'
Reproduce the flake in delivery.test.ts, make it deterministic, and open a pull request.
BRIEF
```

`POST /api/agent/workers` takes `{ brief, nonce, place?, repository, startingRef, task?, title }`
(`agentWorkerStartInputSchema`). The Server refuses before writing anything:
`WORKER_TASK_REQUIRED` (no Task, or one the Agent cannot reach), `WORKER_TASK_CLOSED`,
`WORKER_PLACE_REQUIRED` (no `place`, and the Agent's assigned Computer has no ready default place to use instead; the message lists the ready places), and
`WORKER_PLACE_UNAVAILABLE` (no online Computer reports that place ready). A start then passes the
Task Chat's freshness hold like `haus message send` and answers `held` with the newer messages.
Otherwise it records the Worker (`wkr_`) and its first turn (`wkt_`, input `[{ kind: 'brief' }]`),
follows the Task for the Agent, posts no Message, and answers
`{ state: 'started' | 'queued', worker }`. `started` means the turn went to its carrier; `queued`
means it waits for a slot. A retried start with the same `nonce` returns the same Worker; a
different start under that nonce is `WORKER_IDEMPOTENCY_CONFLICT`. The carrier is the Agent's own
Computer when it reports the place ready and is online, else the online one attached longest.

**Dispatch.** A turn goes to its carrier when every earlier turn of its Worker has settled, its
input is recorded, and its place has a free slot: `worker_place_limits` per Server and place,
default 10, counting dispatched unsettled turns, first come first served. The Server composes the
input (`apps/server/src/workers/worker-instructions.ts`, then each input labelled by author) and
sends `worker-turn-start`, idempotent by `turnId`; `worker-turn-accepted` records the
acknowledgement. Dispatch runs after start, follow-up, settle, stop, accept, drain, and reconnect.
On reconnect the Server resends every unaccepted start, then `worker-reconcile` frames (at most 200
entries) for accepted unsettled turns and migrated turns whose input still sits on the Computer,
with `stopRequested`. A `worker-follow-up-drain` frame fills or creates its turn by id and is
answered with `worker-follow-up-drain-ack`.

**Settlement.** A `worker-observation` applies idempotently (a stale, duplicate, or
post-terminal one changes nothing; the schema stays non-`.strict()` for version skew). The first
settled reading maps to a `WorkerOutcome` through `workerOutcomeOf`, resolving `Haus-Person` to a
member who can read the Task (`personRefused` otherwise). A report with text posts one
Agent-authored Message in the Task with body `{ kind: 'worker-report', workerId, turnId, outcome }`
(the text, the ask with its mention, then pull request links), attaches its pull requests to the
Task, and queues one `worker_report` inbox item (`worker-report:<turnId>`). A turn that ends with
no report settles failed `no-report` and posts nothing. A `stopped` outcome queues nothing unless
the Worker is closing. Reports of one Task ride one run, up to 20, as inbox items carrying
`workerReport`; a busy Agent's notice carries `workerReports: { taskKey, ids, total }`. A stall
queues one `worker_stall` item per window, and a pull request change after the newest turn
settled queues a `pull_request` item ([Workers](../../specs/workers.md#pull-request-readings)).

**Follow-ups and stop.** `POST /api/agent/workers/send` takes `{ workerId, nonce, text, interrupt }`
and answers `{ idempotent, turnId, worker }`. It queues the text into the Worker's waiting next
turn, or a new one, and posts nothing; `interrupt` first stops the working turn and drops queued
follow-ups. `POST /api/agent/workers/stop` takes `{ workerId }` and answers `{ worker }`.
Undispatched turns settle `stopped` at once; dispatched ones get `worker-stop`, or settle on the
Server at once while the carrier is offline (reconcile still carries the stop). Both routes are the
delegating Agent's own (`WORKER_STOP_DENIED`), refuse a closing Worker (`WORKER_CLOSED`), send
refuses a Worker whose carrier Computer was removed (`WORKER_CARRIER_REMOVED`), and stop
answers `WORKER_NOT_LIVE` when nothing is queued or working. A Worker with no Task is read-only
history: every write answers `WORKER_HISTORY_READ_ONLY`.

`GET /api/agent/workers` reads `{ workers }` for the caller's Workers, or one with `workerId`.

**People.** `worker.get`, `worker.stop`, and `worker.sendFollowUp({ serverId, workerId, text, nonce })`
are open to anyone who can read the Worker's Task. `sendFollowUp` posts a person-authored Message
with body `{ kind: 'worker-follow-up', workerId }` in the Task, delivered as ordinary Task traffic,
and queues the same text. `worker.listActive` lists open Workers with a queued or working turn,
each opening its Task. `worker.onUpdated` publishes `{ serverId, taskId, chatId, workerId }`,
scoped to readers of the Task's Chat. Setting a Task `done` or `canceled` closes its Workers
([Workers](../../specs/workers.md#closing)). The Task's Workers ride `task.get`
([Tasks API](tasks.md)).

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
(Haus sends Cursor's `default` id, so Cursor picks a model for each turn), or
`{ kind: "model", id, params: { effort?, fast? } }`, where an absent param is the model's default.
`catalog` is the freshest catalog any of the Server's Computers reported (or `null`).
`cloudAgentSettings.setModel({ serverId, model })` is Owner/Admin only (`FORBIDDEN` otherwise),
refuses an unlisted id or a param value that model does not offer with `BAD_REQUEST`, returns the
same shape, and emits a `server` scope update. Each turn in a `Worker` carries
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
model inventory; each runtime's CLI defines its accepted vocabulary, but none provides a
per-model discovery API. Claude Haiku has only `default`. Inventories predating this
field retain the original low/medium/high contract. Server validates explicit creation and
configuration choices against the assigned Computer's report. Configurable models report a concrete
default (currently Haus's Medium), which the App selects when a prior choice is unsupported.
`default` is reserved for models without an effort control, shown as Not configurable; it omits
the effort setting at the adapter boundary. An applied value records the requested policy, not measured thinking.

Computer protocol 28 adds per-model `features`: the core abilities an Agent gets on that model as
Haus launches its runtime, from `subagents` and `image-generation`. Computer declares them beside
the effort list in `apps/computer/src/inventory.ts`, following the harness settings: Claude Code
has sub-agents; Codex and Grok Build keep native image generation with sub-agents switched off.
Codex image generation needs a paid ChatGPT plan and drops silently otherwise.
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
