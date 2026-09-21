---
summary: Server Agent contracts, Computer execution reports, turn and delivery observability, and managed Agent API routing.
read_when:
  - changing Agent CRUD, execution configuration, Computer reports, or managed Agent routes
  - reading Agent turn records or the delivery ledger
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

When runtime, model, or reasoning effort changes during an active turn, Server preserves that turn's
frozen configuration through settlement, then applies the latest saved configuration before the
next turn starts. Runtime or model changes rotate the Agent session; effort-only changes preserve
the generation and conversation except for Grok Build, whose ACP adapter includes effort in its
resume compatibility identity and requires rotation. Computer stops a parked native process when its applied effort
differs (or is unknown), then resumes its saved session with a newly configured adapter. The new
effort remains fixed throughout that turn, including tool continuations.

## Turn And Delivery Observability

Two member-scoped queries expose what an Agent actually did, without reading
Computer-local execution traces. Both require Server membership and both treat a
denied or unknown Agent as `NOT_FOUND`, so probing cannot distinguish "not
yours" from "does not exist".

`agent.turns` returns that Agent's settled turns, newest first by `startedAt`,
with `limit` between 1 and 50 (default 10). Each record carries `runId`,
`startedAt`, `endedAt`, `status` (`completed` or `failed`), `failureKind` (the
compact kind that crosses the Server boundary, otherwise null), `outputProduced`,
`messageCount`, and the bounded `summary`. `outputProduced` is what makes a
silent turn readable: a completed turn with no output and no messages is
positive proof the Agent chose to stay quiet, not evidence of a lost run.

`agent.deliveries` returns that Agent's delivery ledger, newest first by
`createdAt`, with `limit` between 1 and 100 (default 50). Each record carries
`chatId`, `source`, `workId`, `messageId`, `state` (`queued`,
`accepted`, `served`, `seen`), `turnId`, and the per-state timestamps `createdAt`,
`acceptedAt`, `servedAt`, and `seenAt`. `workId` is the durable identity for
every kind of work; `messageId` is null for non-Chat work. Rows are retained after
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

### Task routes

`GET /api/agent/tasks` lists a target's tasks; `POST /api/agent/tasks/create`,
`/claim`, `/unclaim`, and `/update` mutate them. `claim` takes `target` plus either `numbers` or a
`messageId`; claiming a `messageId` that carries no task promotes the message first, so the claim
is what creates the task.

Every task projection carries `origin`, which says how the row came to exist:

| `origin` | Written by |
| --- | --- |
| `composed` | A human composing a message as a task. |
| `converted` | A human promoting an existing message with Convert to Task. |
| `claimed` | An Agent claiming a message nobody had promoted. |

The hosted task wire shape adds two derived fields on top of that. `tier` is `background` or
`tracked`: a background task is a `claimed` task in `in_progress` or `done` whose Thread has no
messages, that carries no Ask, whose status never left that pair — review, closure, or a reopen
stamps it tracked for good — and whose claiming run has not settled leaving the work open — an Agent's own orchestration lock, excluded from the default Board
and List. Everything else is `tracked`. `live` is true while the assignee Agent's in-flight run
holds that task's message or Thread; a run beginning and a run settling both emit `task.updated`,
so it is never polled. Both are computed per read and neither is a stored task column.

Promotion does not create the task's Thread. The Thread materializes on the first reply under its
deterministic `cht_thr_<anchor>` id, so `haus message send --target "#channel:<messageId>"`
remains the way to open one, and a claim an Agent resolves inside its own turn leaves no work
surface behind.

A claim that loses to a claim someone else holds returns `409 TASK_CONFLICT` with the ordinary
`code` and `message`, plus a **`claimConflict`** object:

```json
{
  "code": "TASK_CONFLICT",
  "message": "That task is already owned by another assignee.",
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
`haus task claim` renders the block from the 409 body in place of the generic error line —
`apps/computer/src/agent-cli/agent-claim-conflict.ts` is the only place that prose is composed —
while a `TASK_CONFLICT` without a `claimConflict` keeps the ordinary refusal.

A successful claim prints one follow-up line per claimed task under `Follow up on each task:`:

```
#3 → reply in #all when done (same-turn work); use the thread "#all:b0Q8lLWk" for progress notes, questions, or work that outlives this turn.
```

The hint names both tiers on purpose. A claim finished inside the claiming turn is answered in the
Chat that asked — the background tier, which leaves no Thread behind — while the printed thread
target is for progress notes, questions, and work that outlives the turn, which is what stamps the
task tracked.

### Agent routes

A managed Agent creates, updates, and re-avatars Agents on its own Server:

```sh
haus agent create --target "#product" --name "Orbit" \
  --description "Release helper" --avatar-concept "a small brass orbit" \
  --say "Bringing Orbit on to own release checks."
haus agent update --agent @orbit --description "Release and rollback helper"
haus agent avatar --agent @orbit --concept "a small brass orbit at dusk"
```

`POST /api/agent/agents` takes `target`, `displayName` (1–80), `description` (1–500), optional
`avatarConcept` (1–280), `content` (the `--say` announcement, 1–4000), and a `nonce`. The Server
resolves the target from the scoped runner, verifies the Agent's exact current Chat view, derives an
available `@handle` from the display name under the Server row lock, writes the announcement Message
with body kind `agent-created`, and creates the Agent in one transaction. Runtime, model, reasoning
effort, and Computer are read from the calling Agent's own row and revalidated against that
Computer's reported inventory. The receipt carries the created Agent summary, the avatar outcome,
the Chat anchor, sequence, and the idempotency result.

Avatar generation runs before the transaction, because it is a network call that must not hold the
Server row lock. `AVATAR_PROVIDER_UNAVAILABLE` (no provider provisioned) creates the Agent anyway
with `avatar.status = "unavailable"`; a busy, provider, or output failure refuses the whole request
as retryable and creates nothing.

The nonce is the idempotency key, and the Agent CLI derives it from the request rather than minting
one: a SHA-256 over the calling Agent, target, display name, description, announcement, avatar
concept, brief, and the de-duplicated sorted channel list. Re-issuing the identical command therefore
replays the original creation instead of creating a second Agent, and changing any field asks for a
different Agent and gets one. On a request that never got an answer — a timeout or a dropped
connection, never an answered refusal — the CLI retries once on that same nonce.

The same `(Chat, nonce)` from the same calling Agent with identical values returns the original
receipt; reusing that nonce for different values returns `AGENT_CREATE_IDEMPOTENCY_CONFLICT`. The
replay is read under the Server row lock and before the freshness check, so a retry that reached the
Server while the first attempt was still generating its avatar replays too; that receipt carries
`avatar.status = "none"`, because the image it generated was dropped and the Agent still wears the
first one. A target the Agent has not read since it changed returns `CHAT_VIEW_STALE`. An Agent with
no assigned Computer returns `AGENT_NO_COMPUTER`.

`POST /api/agent/agents/update` rewrites an Agent's `description`; `POST /api/agent/agents/avatar`
generates and applies a replacement avatar from a `concept`. Both resolve `@handle` within the
runner's Server and refuse Cove with `AGENT_IDENTITY_PROTECTED`. Neither renames an Agent: the handle
is the Server-scoped alias that mentions, targets, and history all key on.

The announcement must name the new Agent by its bare `@handle`, or the Server refuses with
`AGENT_CREATE_ANNOUNCEMENT_MISSING_HANDLE` (409, carrying the derived `handle`) and creates nothing —
the check runs before avatar generation, so a refusal spends none. The stored announcement carries
that mention as a stable Agent reference, so every surface renders it as the chip that opens the
profile. Chat message reads still project the created Agent through the `agent-created` body, which
is provenance rather than something the App draws. Creation emits
`message.created` and `server.updated{scope:'agent'}`; the body is terminal and has no update event.
Creating an Agent does not wake it. Its standing brief is already in the memory the Computer seeds,
so its first turn is its next ordinary delivery and nothing DMs it.

### Asks

A managed Agent asks one named human for a decision with `haus ask`:

```sh
haus ask --target "#product" --to @ada --title "Run the staged migration?" \
  --summary "The migration is staged and reversible for one hour." \
  --option "Run it now" --option "Wait for the release window" <<'HAUSMSG'
The migration is staged. Should I run it now, or wait for the release window?
HAUSMSG
```

`POST /api/agent/asks` takes `{ addresseeHandle, content, nonce, options, summary, target, title }`
and returns `{ ask, chatId, idempotent, messageId, sequence, target }`. The question text is the
Message content and is required; `title` is at most 120 characters and `summary` 500. `options` is
zero to four distinct replies of at most 80 characters each, in the order the human sees them, the
first being the Agent's recommendation; an empty array is an open question. The Server resolves the target under the runner's own Agent and Server
authority, resolves the handle in the shared human/Agent handle namespace, and requires an active
human member with access to that Chat — an unknown handle, an Agent handle, or a member without Chat
access returns `ASK_ADDRESSEE_NOT_FOUND` and writes nothing.

One transaction writes the Agent-authored Message with `body_kind = 'ask'`, the `asks` row, the
deterministic child Thread when the Ask is top-level, ordinary delivery planning, and both the
`message.created` and `ask.updated` events. It is idempotent by `(Chat, nonce)`; the same nonce with
different values returns `ASK_IDEMPOTENCY_CONFLICT`. An Ask posted inside a Thread stays in that
Thread, because Threads do not nest.

The first reply in the Ask's Thread from anyone other than the asking Agent settles it in that
reply's own transaction, recording the answering human or Agent and the answer Message. Humans and
Agents both settle; the addressee is who Haus notifies, not who Haus permits. There is no answer
route — settlement is a side effect of the ordinary send paths — and no mutation of any other
record. `ask.listOpen({ serverId })` is the human read for the Inbox, and it carries the
conversation the answer is addressed to plus the Thread anchor a reply hangs off, so an Ask posted
inside a Thread is answerable from the Inbox like any other.

Every Agent-facing Message states its `body_kind` (`text | ask | cloud-agent-work`), and an Ask
Message carries `ask: { id, status, addressee_handle, title, options }` beside it. The
Agent CLI appends `[ask status=open|answered to=@handle]` to that Message's history line and
delivery envelope, after the task suffix
([Haus CLI](../../specs/haus-cli.md#4-envelopes-and-message-lines)).

### Cloud Agent work

A managed Agent delegates bounded repository work to a provider-hosted agent with
`haus cloud-agent start`:

```sh
haus cloud-agent start --target "#product" --repo haus/haus --ref main \
  --title "Fix the flaky delivery test" \
  --say "Handing the flaky delivery test to a cloud agent." <<'HAUSMSG'
Reproduce the failure, fix it, and open a pull request.
HAUSMSG
```

This command runs on the Computer rather than upstream. The Computer checks
`CloudAgentProvider.readiness()` first, so an unavailable capability fails with
`CLOUD_AGENT_UNAVAILABLE` before Server records anything, and it keeps the stdin instructions
local: they reach the provider and never Server.

`POST /api/agent/cloud-agents` takes `{ content, nonce, provider, repository, startingRef, target,
title }` and returns `{ chatId, idempotent, messageId, runId, sequence, target, work }`. `content`
is the Agent's own words and becomes the Message content; `title` is at most 120 characters and
`repository` reads as `owner/name`. One transaction writes the Message with
`body_kind = 'cloud-agent-work'`, the `cloud_agent_work` row, its first `cloud_agent_runs` row in
`queued`, the deterministic child Thread when the work is top-level, ordinary delivery planning,
and both the `message.created` and `cloud-agent-work.updated` events. It is idempotent by
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
until launched or cancelled. Revisions reuse the Work ID, work Message, and Thread. Each settled
Run gets its own inbox attention; callers do not need to manage provider Run IDs.

`haus cloud-agent inspect` uses `GET /api/agent/cloud-agents` to read `{ works }` for the caller's
delegated work. An optional `workId` query selects one work with its recorded results. These are
Server records, not a live provider transcript.

`haus cloud-agent stop --work <workId>` uses `POST /api/agent/cloud-agents/cancel`. The published
`cancel` CLI spelling remains a compatibility alias. The endpoint takes `{ workId }` and is
authorized to the delegating Agent alone; `cloudAgentWork.cancel({ serverId, workId })` is the
Owner/Admin equivalent. Both record
`cancelRequestedAt` and `cancelRequestedBy` and send a `cloud-agent-cancel` frame to the assigned
Computer. Cancelling settled work returns `CLOUD_AGENT_WORK_SETTLED`.

Computer reports lifecycle over the attachment socket as a `cloud-agent-observation` frame carrying
`{ workId, runId, status, observedAt }` plus optional provider ids and URL, raw status, bounded
`activity` and `summary`, error code, reported branches, and usage. Server applies it idempotently:
a duplicate, out-of-order, or post-terminal observation changes nothing. A settled Run creates
exactly one `agent_inbox` attention for the delegating Agent, keyed by the Run id. The latest Run
owns the work's displayed status, so an earlier Run settling cannot finish a queued follow-up.
On reconnect Server pushes `cloud-agent-reconcile` frames of at most 200 entries covering every
non-terminal Run that Computer still owns, with any cancel recorded while it was offline; Computer reads each
Run from the provider and reports what it finds. `cloudAgentWork.listActive({ serverId })` is the
human read behind the Inbox.

#### Cloud Agent provider access

Cloud Agent provider access is a Computer capability with its own credential store, separate from
the Cursor runtime harness even when both belong to one Cursor account. Each Computer reports it in
its inventory as `cloudAgentProviders: [{ provider, ready, reason }]`, where an unready reason is
`not-connected`, `expired`, or `provider-unavailable`.

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

The Agent profile pane is the human's canonical edit surface. `agent.update`, `agent.configure`, and
the avatar mutations on the Server `agent` tRPC router remain the Owner/Admin path for every field,
including runtime, model, and reasoning effort, which no Agent-facing route exposes.

Each settled turn summary includes its runtime and model plus normalized input,
output, cache-read, and cache-write counts when the runtime reports them. Server
persists those bounded counters for usage aggregation; raw usage payloads and
execution traces remain Computer-local.

Wire schemas live in `packages/haus-api`; Server handlers live in `apps/server/src/agent-api/`
and `apps/server/src/haus-api/agent/`; Computer proxy and launch behavior live in
`apps/computer/src/`.

Hosted Agent execution detail is a separate, explicit `agent.executionJournal` query. It accepts
one `serverId`, `agentId`, and `runId`; Server authorizes only Owners/Admins, resolves the Agent's
assigned Computer, and relays the request over that authenticated attachment. The response is
either the Computer-local journal or an explicit `unavailable` result (`offline`, `missing`, or
`timeout`). Server does not persist the journal, and ordinary members never receive it.

An available journal carries `runId`, `status`, timestamps, a `tools` array (tool-call id, observed
identity, input, `output`, `error`, `preliminary`, `final`, interruptions, and timings), and an
optional `reasoning` array of `{ id, startedAt, endedAt?, text, truncated? }` blocks capped at
64,000 characters each and 1,000 blocks per turn. Reasoning exists only in this response. Every
other string leaf the journal carries is capped at 256,000 characters and ends with
`…[truncated N more characters]` when clipped, so one oversized tool output cannot dominate the
relayed response.

A running turn is answered from the Computer's append-only `<runId>.ndjson` log and a settled one
from the consolidated `<runId>.json` snapshot; both live under the Agent's
`runtime/execution-journal/` directory and neither reaches the Server's store.

Computer flushes ongoing reasoning at most every 250 ms as deltas arrive, in addition to block,
tool, and turn boundaries. An authorized open activity view can therefore inspect reasoning before
the first tool call or completed reasoning block.
