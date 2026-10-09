---
summary: Realtime contract for durable hosted chat/reminder events, tRPC invalidation, composition, and reconnect recovery.
read_when:
  - changing websocket subscriptions or reconnect behavior
  - adding a durable event type or a new tRPC invalidation event
  - changing the composition stream, presence, or realtime recovery semantics
  - changing chat engagement (typing) events or their recovery read
---

# Realtime

Realtime is notification plus recovery.

PostgreSQL is the source of truth for Server collaboration. WebSocket delivery is allowed to drop;
clients recover through durable reads.

## Components

| Component | Owner | Role |
| --- | --- | --- |
| Hosted `chat_events` | Haus Server | PostgreSQL cursor log for messages, reactions, reads, follows, Chat lifecycle, Cloud Agent work changes, and reminder changes |
| Hosted durable subscription | Haus Server | Live notification after commit; membership rechecked at delivery |
| Hosted composition hub | Haus Server | In-memory, membership-checked, no persistence or replay |
| Hosted Agent activity journal | Haus Server | Durable semantic execution metadata plus live current-state projection |
| Hosted Agent lifecycle hub | Haus Server | Volatile working/reading/sending/settled projection for presence and committed-send recovery |
| Hosted chat engagement events | Haus Server | Volatile Chat-scoped typing facts, recovered from `chat.engagements`; no persistence or replay |
| App subscriptions | Haus App | tRPC notification transport, catch-up cursors, and focused query invalidation |

`server.updated` is Server-scoped: `server.onUpdate` takes a Server id, checks
membership before the subscription starts, and delivers only that Server's
events. See [Haus Server](../internals/haus-server.md).

Its wire shape is `serverUpdatedEventSchema` in `@haus/api`. `scope`
(`agent`, `computer`, `mcp`, or `server`) selects the family of reads a listener
refreshes. `agentId` and `memberId` are optional precision: a mutation that
changes exactly one Agent or one human names it, and the App invalidates that
record's detail read instead of every cached detail read in the scope. Their
absence is meaningful — it says the change is broad, so the whole scope
refreshes. Every Server mutation that commits durable state announces after the
commit, so the App never depends on a refetch-on-mount to notice a change made
elsewhere: Agent create, configure, profile, start, stop, restart, reset, and
delete; skill import, Computer update checks, update starts, and removal; and a
human's profile edit or identity sync, which announces to every Server that
human belongs to.

The converse also holds: Haus announces only changes that happened. Every App
load syncs the Clerk identity (`member.syncIdentity`), and it announces only
when the sync wrote a field. A Computer re-sends its inventory, effective Agent
state, Haus Agent receipts, and usage snapshot after every turn and on timers;
each report announces `scope:'computer'` only when it changed a stored row a
read exposes (compared as `jsonb`, so key order is irrelevant), and a replayed
system event is a no-op. Attach, disconnect, and update-progress changes always
announce. An idle App therefore receives no `server.updated` traffic at all.

App websocket events are not the durable event source. Missed App notifications
recover through focused Haus Server reads.

The event list does not own a second event log. App notifications are derived
from durable `chat_events`.

An open live turn's execution journal (`agent.executionJournal`, Owner/Admin) changes without
semantic activity while the model streams reasoning or a sub-agent works. The Computer sends an
`agent-execution-journal-changed` frame (run id only, never evidence) after each journal write,
throttled to about once a second per run with a trailing notice for the last change. Server relays
it, unstored, on `agent.onExecutionJournal({ serverId, agentId, runId })`, authorized like the
journal read. The open view subscribes only while the turn is live and re-reads the journal per
notice (deferred while the page is hidden); there is no journal poll. A Computer that predates the
frame leaves the live view updating on activity events and settlement only.

## Hosted Server Realtime

`chat.send`, `chat.react`, an advancing `chat.markRead`, `thread.setFollow`, Chat lifecycle
mutations, task mutations, and reminder
mutations insert their durable event in
the same PostgreSQL transaction as the owned row. `chat.events` lists accessible
events after a cursor in ascending order. `chat.onEvent` does not replay; it
notifies the App after commit. On subscription start or reconnect, the App
seeds a new in-memory cursor from `chat.eventHead` and refetches the Server Chat
snapshot, or walks `chat.events` from its last cursor with a private catch-up
cursor. Live delivery can advance in parallel without skipping the catch-up
window. A catch-up walk accumulates every page's events and dispatches them in
one pass after the walk, so a long reconnect gap costs a single refetch. Live
delivery coalesces the same way over a short window: the App collects an event
burst for 150ms and then invalidates once, because one send lands as a message,
a read, and a follow within a few frames. Cursor advancement stays immediate and
exact regardless of that window, and a pending burst is flushed against the
Server it arrived on when the Server changes or the listener unmounts. Thread
events carry the child Chat id and nullable parent Chat id.

App-side, one transport owns the subscription, the cursor, the burst window, and
catch-up; it maps no event to a query. Each event type has its own listener hook
that registers with that transport and receives its events — one call per pass,
so a burst of thirty messages is one invalidation pass. Task creation and update
are one lane and register together. Every pass carries its delivery, `live` or
`catch-up`: cache listeners treat both alike, while a listener that announces
something (message notifications) acts on `live` passes only.

Each event invalidates only the reads it changes. `chat.list` renders Chat
ordering, unread counts, and Thread attention, so only `message.created`,
`chat.read`, `thread.follow.updated`, and `chat.lifecycle` target it.
`message.created` invalidates the exact message query and Thread transcript,
its parent summary when present, the Chat list, and Server search. `chat.read`
invalidates the Chat list alone, and skips even that when the settled list
already shows zero unread for the read Chat (or a Thread's parent) — a read only
lowers counts. `thread.follow.updated` invalidates the parent
summary and the Chat list, because parent unread counts include Thread
attention. `task.created` and `task.updated` invalidate the Server task list
and the affected Chat message snapshot, not the Chat list. `task.label.updated`
invalidates the task-label catalog and the task list, whose rows embed label
records. The Chat lane registers no `reminder.changed` listener: it is
participant-gated on both live delivery and replay, so it cannot reliably
refresh the operator-only reminder snapshot on an Agent profile.
`message.reaction.updated` invalidates the affected message Chat, its parent
Chat when the message belongs to a Thread, the Thread snapshot, and Server
search. It does not alter read state, Chat ordering, or unread counts.
`chat.lifecycle` carries `created`, `updated`, `archived`,
`unarchived`, or `deleted` plus the stable Chat id, and invalidates active and
archived lists, the focused Chat query, and the Server's Agent chat lists, whose
rows are the viewer's visible Chats filtered by Agent membership. Unlike
ordinary Chat events, its id is retained outside the live Chat foreign key so a
delete notification survives the purge.

Before invalidating transcripts for `message.created`, the App cancels their
in-flight reads. Otherwise, a request started before the send can finish after
invalidation and mark an outdated snapshot fresh, especially while its Chat is
unmounted. Active transcripts refetch immediately; inactive transcripts stay
stale until opened. The sidebar can already show an unread message while that
older transcript request is still pending.

Every Chat lifecycle mutation emits one: `chat.createChannel` emits `created`,
`chat.updateChannel` emits `updated` when the save changes the name, description,
appearance, or the Agent participant set, `chat.ensureDm` emits `created` for a DM's first resolution and
nothing for an idempotent reopen, and archive, unarchive, and delete emit their
own action. Every other path that opens an Agent DM without a first message
emits `created` too: a human-created Trigger anchoring on the creator's DM, and
an Agent creating an Agent for its owner. Audience is the Chat's own membership
rather than an explicit recipient: lifecycle events are announced Server-wide
and narrowed by the per-delivery Chat access check, which reaches both DM
members and no one else. `deleted` is the exception: the deleted channel is
already gone from Chat access, so every Server member hears it live (the event
carries only ids). Replay applies the same rule — a member walks a lifecycle
event while the Chat is still visible to them, or once the Chat row is gone
because a delete purged it.

Creating an Agent from an Agent (ADR 0028) emits `server.updated{scope:'agent'}`,
which refreshes the Agent list, Agent detail, Server detail, and Chat list,
plus `chat.lifecycle` `created` for the owner's DM it opens and `updated` for
each channel it joins.

`chat.markRead` does not invalidate anything from its mutation result. Viewing
a Chat zeroes its cached list row before the request leaves only when the
settled transcript cache holds the whole Chat with no unread Thread reply; its durable
`chat.read` event reaches the reader's own subscription, finds that row pending,
and owns the Chat list refresh, since `unreadCount` also rolls up followed
Thread replies. A read the Server found already done emits no event, so the
pending row refetches the list itself a second after the mutation settles.

The Server row owns the next durable cursor. Event transactions increment that
counter while holding the Server row lock, then insert `chat_events` before
commit. Therefore a visible higher cursor can never precede an uncommitted
lower cursor, including mutations in different Chats.

Durable event payloads stay small: Server id, Chat id, event id, cursor,
sequence, timestamp, nullable parent Chat id, and the message id when
applicable. Message bodies, anchors, and read models come from focused queries.

Every subscription is checked at registration and again before each delivery.
Read events are visible only to their reader. Cross-Server events are neither
listed nor delivered. A durable notification for a Chat the subscriber cannot
open is skipped without terminating the Server feed; loss of Server membership
fails the subscription.

Hosted composition events use a separate in-memory hub. They carry current
composition text or a clear signal, are never written to PostgreSQL, have no
cursor, and are never replayed. The subscriber's Chat access is rechecked for
every delivery. The first-party App does not publish human draft text or render
a provisional Agent response from this transport.

Hosted chat engagement events are volatile and Chat-scoped
([ADR 0035](../adr/0035-chat-engagement-shows-as-typing.md)). `chat.engagement.started`
announces after the write that grants a run exact visibility of an unanswered human message
commits; `chat.engagement.ended` (`sent`, `settled`, or `interrupted`) rides a committed Agent
`--done` send into the Chat or terminal turn proof; sends without `--done` end nothing. `chat.onEngagement({ serverId, chatId })` checks Chat
access at start and before every delivery. Nothing is persisted or replayed: the durable
`chat.engagements` read derives the same set from delivery state, and the App invalidates it
whenever the subscription starts or restarts, then patches it from live events.

Hosted Agent lifecycle events are also volatile and membership-checked. The
Server projects `working` when a run is dispatched, `reading` when Computer
acceptance arrives, `sending` after the Agent's message commits followed immediately
by `working`, and `settled` from the Computer's terminal turn proof.
The App maps every active phase to coarse Agent `working` availability. Settlement invalidates the durable Agent list,
delivery state, and activity reads. Reconnect recovers from those reads rather
than replaying lifecycle events.

Agent message rows render only from durable transcript reads. The App never renders
the lifecycle event's text as a temporary message: the following `working` event
can arrive before the durable notification's batched refresh. A confirmed `sending`
event also cancels and invalidates that Server's transcript reads, and invalidates
its Chat list and search as a fallback for a missed message notification. This
fallback includes mounted parent transcripts because lifecycle events do not name
a Thread's parent Chat. Inactive transcripts remain stale until opened. The normal
`message.created` listener retains its precise Chat and parent invalidation.

Semantic Agent activity is written before broadcast. Computer frames carry a narrow category,
phase, run id, per-run sequence, timestamp, optional canonical safe tool reference, and an optional
opaque hex `operationId` that pairs a `delegating` start with its settlement. They never
carry reasoning, drafts, commands, paths, inputs, or outputs. Reconnect reads durable Activity
History plus the current unsettled-Agent snapshot before applying later live updates. Hosted tRPC
uses one Server-scoped `agent.onActivity` subscription; `agent.activityHistory` and
`agent.activeActivity` are the durable history and reconnect snapshot reads. In the App, the
Server shell owns the only `agent.onActivity` and `agent.onLifecycle` subscriptions
(`AgentActivityProvider`, `AgentLifecycleProvider`); profile, Activity, and hover-card reads
never subscribe themselves. Each committed activity event is written into every cached newest
Activity History page that covers it, in Server order, so a live turn updates without a refetch
per event (`agent-history-cache.ts`). A patched page grows past its limit and keeps its cursor,
so loaded older pages stay contiguous; a smaller reader (the hover card) trims at read time. A
page whose read is in flight, first read included, reads again once that read lands. A `settled`
lifecycle event invalidates that Agent's `agent.turns`, newest Activity History pages,
`agent.serverTurns`, and `stats.agentUsage` once. Neither stream replays, so each
`agent.onActivity` start refreshes that Server's mounted Activity History, turn, Server turn, and
usage reads (a window handoff or Server switch hydrates them fresh). That restart is the only
recovery those reads get on a websocket reconnect, and an open turn journal re-reads itself. Activity positions
are assigned under the Server row lock and are never derived from producer timestamps.
A Server `sending_message:completed` activity is committed with the Agent message and presents the
run as `Finishing up…`. Terminal lifecycle proof owns both current-activity removal and the
Agent's working-to-idle transition, keeping those surfaces synchronized. Trailing completion events preserve
the finishing state; a later started operation replaces it. A Server `received_message:completed`
activity, committed when a notice-ack marks new work noticed by the run, is history only: it never
replaces the current row. Each current row also carries `activeDelegations`, the run's unsettled
sub-agents by `operationId` and start time (at most 16, omitted when none), projected by the same
`projectAgentCurrentActivity` the snapshot uses.

Agent thoughts ([ADR 0036](../adr/0036-agent-thoughts-surface-as-condensed-phrases.md)) are
volatile and never written. A Computer `agent-thought` frame carries `kind: 'phrase'` with a
finished `text`, `kind: 'reasoning'` with a scrubbed `reasoning` excerpt (40–3,000 characters), or
`kind: 'action'` with a scrubbed one-line `action` description of a tool call (at most 200
characters) and, once that call has finished, an optional scrubbed `result` excerpt of what it
returned (at most 400 characters, line breaks allowed). The Server phrases any of them against the
run's engaged human request and discards the input, never storing or logging a result; it paces
each request's lines by workstream (a floor between bubbles, a quiet stretch before a "still"
line), and a Server that predates `action` drops that frame as unknown. A frame is admitted under the activity frame's identity checks and its phrase is
announced once per Chat the run engages; `chat.onThought({ serverId, chatId })` delivers
`{ agentId, runId, chatId, serverId, text, at }` with `chat.onEngagement`'s access checks. There
is no read or recovery.

The [Inbox](../features/inbox.md) adds no event: its Unread section and badge are `chat.list`,
refetched on `message.created` and on the reader-scoped `chat.read`. `chat.unreadChatCount` (no
input) returns `{ count }`, the caller's unread Chats across every Server — the APNs badge, which
the iPhone app also puts on its icon. `chat.markRead` emits one
`chat.read` per marker it moves — with `includeThreads`, also one per Thread it reads.

**Message notifications** ([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)) ride
`message.created`. The event carries the notification facts — `authorUserId`, `conversationKind`
(the Channel or DM, a Thread reporting its parent's), `mentionedUserIds`, `replyToAuthorUserId`,
and `threadAnchorAuthorUserId` — and `messageNotificationReason` in
`packages/haus-api/src/message-notification.ts` reads them. The App applies it to the live events
its stream delivers for desktop and web notifications — never to a reconnect's catch-up replay —
and also reads `chat.read`, so a message whose Chat is read through it never notifies.

**iPhone push** is a Server-side consumer of the same post-commit `message.created` stream, not a
client subscription: `apps/server/src/push/` applies the same rule to the event's named humans and
the DM's members, keeps those who can still see the Chat and have a registered device, and pushes
each. The device contract is `push.registerDevice` / `push.unregisterDevice`
(`packages/haus-api/src/push.ts`); see [iPhone push](../operations/ios-push.md).

`cloud-agent-work.updated` is a participant-gated durable event for Cloud Agent work: the work id,
its Message id, the Chat id, the Message's Chat sequence, and the cursor. Creating the work emits
`message.created` and then `cloud-agent-work.updated` in one transaction; every applied Computer
observation and every recorded cancel request emits another. The payload carries no provider state:
clients refetch the affected Message — whose `body` projects the current work and its recent Runs —
and, for the Inbox, `cloudAgentWork.listActive`. A duplicate or stale observation applies nothing
and therefore emits nothing, so reconnect replay of these events is idempotent.

Hosted durable event kinds are `message.created`, `message.reaction.updated`, `cloud-agent-work.updated`,
`chat.read`, `chat.lifecycle`, the reader-private `thread.follow.updated`,
`task.created`, `task.updated`, and `task.label.updated`, plus `reminder.changed`.

Reminder scheduling, update, snooze, cancel, and fire append
`reminder.changed` to the same per-Server cursor. `reminder.changes` walks only
those events after a cursor; `reminder.onEvent` is live-only. Owner/Admin
authority is checked for catch-up, subscription start, and every live delivery.

A fire appends no `message.created`, because it writes no Chat message
(ADR 0026); the same is true of a Trigger fire, which appends no durable event at
all. `message.created` for an automation arrives later and only if the owning
Agent answers, as the ordinary event for the Agent's own message. That message
carries its `cause` inline, so the mark and hover card render from the message
the Chat lane already delivered, with no extra read.

The Reminders hook owns this subscription and its exact list/run
invalidations. On start or reconnect it merges durable catch-up with live
delivery using a monotonic in-memory cursor, so a newer live event cannot be
overwritten by an older catch-up page.

## Ephemeral Notifications

Ephemeral notifications are best-effort presentation hints. They can be dropped
under load and are not replayed after disconnect.

Examples:

* the ephemeral composition stream (`agent.composition` events) — a
  provisional bubble for an in-flight `haus message send`, never persisted
  or replayed (see [Agent Inbox](../../specs/inbox.md))
* hosted Agent lifecycle (`working`, `reading`, `sending`, `settled`) projected
  to coarse busy/idle presence
* chat engagement (`chat.engagement.started` / `ended`) projected to the typing
  strip, recovered from `chat.engagements`, never replayed
* short-lived hover/debug state
* app-only invalidation hints

## Reconnect Recovery

Clients do not rebuild state from missed websocket events. They refetch durable
resources and let React Query reconcile active views.

The Haus App keeps one tRPC client and React provider mounted for the signed-in
human. Clerk token rotation does not reconnect: the App hands each rotated token
to the open socket (`session.refresh`, see [Auth](auth.md#socket-sessions)), so
idle is quiet. Only a real gap or a human identity change reconnects. Credential
changes must not replace the tRPC provider, remount the Server shell, clear
composer drafts, or discard other local presentation state. A genuine human
identity change renders through a newly keyed hosted QueryClient/provider, so the
next identity never observes the previous identity's cache or local presentation
state.

Every read has exactly one recovery owner, so a reconnect refetches each read at
most once (`apps/website/src/lib/query-reconnect-recovery.ts`):

| Owner | Recovers on (re)start |
| --- | --- |
| `chat.onEvent` | Walks `chat.events` from its cursor and invalidates only what the missed events touch; without a cursor (or if the walk fails) refetches the Chat snapshot: Chat list, archived list, Chat, messages, search, tasks, task labels, Cloud Agent work, Agent Chats |
| `chat.onEngagement` | `chat.engagements` |
| `agent.onLifecycle` | Agent list and Agent details |
| `agent.onActivity` | Current activity, Activity History, turns, Server turns, usage |
| `server.onUpdate` | Its pushed reads (below): Chat list, member directory, member detail. The stream never replays, so its (re)start invalidates them outright |
| App-wide reconnect pass | Every other active Server tRPC read: its Server, invitation, Computer, MCP, settings, and stats reads recover here, as do reads with no stream (reminders, triggers, delivery state) |

A stream that starts recovering reads on its own restart adds them to
`streamRecoveredReads`; otherwise both it and the App-wide pass refetch them.
The App-wide pass runs on reconnect only, never on the first connection. It skips
settled reads that cannot change (`agent.executionJournal`) and every query outside
tRPC: the website build check and Desktop release check keep their own polling
policies. A browser offline → online transition refetches
nothing (`refetchOnReconnect: false`); the socket reconnect that follows owns
recovery.

### Pushed reads

A read whose every change reaches the App as an event, and whose stream
re-reads it after a gap, never goes stale on a timer: it uses
`queryPolicy.pushedSnapshot` (`staleTime: Infinity`), so a revisit renders the
cache with no request until an event or a recovery invalidates it.
`apps/website/src/lib/pushed-snapshot-coverage.ts` registers each such read
with its covering events and recovery stream, and
`query-policy-contract.test.ts` refuses the preset anywhere else:

| Read | Covering events | Recovery |
| --- | --- | --- |
| `chat.list` | `message.created`, `chat.read`, `thread.follow.updated`, `chat.lifecycle`, `server.updated` (`agent`, `server`) | `chat.onEvent`, `server.onUpdate` |
| `cloudAgentWork.listForChat` | `cloud-agent-work.updated` | `chat.onEvent` |
| `member.list`, `member.get` | `server.updated` (`server`) | `server.onUpdate` |
| `taskLabel.list` | `task.label.updated` | `chat.onEvent` |

Everything else stays on the 30 s `syncedSnapshot` because some write reaches
it without a covering event. Transcripts (`chat.messages`) and `chat.get` embed
live author profiles, Trigger and Reminder marks (`cause.live`), task liveness,
and Thread unread counts that no listener refreshes; Agent reads lose pending
invalidations to lifecycle `setData` and can end a run without `settled`.

A listener whose pushed read is warmed by prefetch cancels in-flight reads of
it before invalidating, as transcripts do for `message.created`: an older
response landing after the invalidation would otherwise mark the snapshot fresh
with no timer left to repair it.

Reconnect flow:

1. Keep rendering cached query data while the socket reconnects.
2. The socket reopens and resumes every pending subscription.
3. Each stream's restart recovers its own reads; the App-wide pass refetches
   active reads no stream covers.
4. Resume applying live notifications.

Hosted Reminders use the same principle with a narrower lane: keep the last
query snapshot rendered, walk `reminder.changes` from the hook's cursor,
invalidate reminder list and run queries, then continue live
`reminder.onEvent` delivery.

History recovery does not depend on the event log retaining full message
payloads. If a client suspects missed events, it refetches the affected
resource.

## Ordering

* Hosted `chat_events.cursor` is monotonic and commit-ordered within one Server.
* Hosted message order is the transactional positive per-Chat sequence.
* A reminder fire appends only `reminder.changed`; the Agent's answer, when it
  comes, is an ordinary later `message.created`.
* Message timeline order is `chat_messages.sequence`, not event cursor.
* Event cursor order records mutation order for inspection.
* Sequence order tells clients how to render chat history.
* Final reconciliation upserts by stable ids.

## App Stream Boundary

Haus App can expose its own websocket or tRPC subscriptions for UI
invalidation. Those subscriptions are app notifications.

Product state still comes from focused Server tRPC reads for Chats, Agents, Computers, reminders,
activity, and execution evidence.

## What Is Intentionally Missing

* WebSocket-only durable state.
* Message history stored only in event payloads.
* Response activity created from app-local UI state.
* Hidden chain-of-thought in realtime events.
* Execution-runtime session sequence as a Server event cursor.

## Related Docs

* [API overview](overview.md)
* [Chats](../../specs/chats.md)
* [Data model](../internals/data-model.md)
