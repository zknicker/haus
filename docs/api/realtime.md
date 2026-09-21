---
summary: Realtime contract for durable hosted chat/reminder events, tRPC invalidation, composition, and reconnect recovery.
read_when:
  - changing websocket subscriptions or reconnect behavior
  - adding a durable event type or a new tRPC invalidation event
  - changing the composition stream, presence, or realtime recovery semantics
---

# Realtime

Realtime is notification plus recovery.

PostgreSQL is the source of truth for Server collaboration. WebSocket delivery is allowed to drop;
clients recover through durable reads.

## Components

| Component | Owner | Role |
| --- | --- | --- |
| Hosted `chat_events` | Haus Server | PostgreSQL cursor log for messages, reactions, reads, follows, Chat lifecycle, Ask changes, Cloud Agent work changes, and reminder changes |
| Hosted durable subscription | Haus Server | Live notification after commit; membership rechecked at delivery |
| Hosted composition hub | Haus Server | In-memory, membership-checked, no persistence or replay |
| Hosted Agent activity journal | Haus Server | Durable semantic execution metadata plus live current-state projection |
| Hosted Agent lifecycle hub | Haus Server | Volatile working/reading/sending/settled projection for presence and committed-send recovery |
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

App websocket events are not the durable event source. Missed App notifications
recover through focused Haus Server reads.

The event list does not own a second event log. App notifications are derived
from durable `chat_events`.

## Hosted Server Realtime

`chat.send`, `chat.react`, an advancing `chat.markRead`, `thread.setFollow`, Chat lifecycle
mutations, Ask creation and settlement, task mutations, and reminder
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
are one lane and register together.

Each event invalidates only the reads it changes. `chat.list` renders Chat
ordering, unread counts, and Thread attention, so only `message.created`,
`chat.read`, `thread.follow.updated`, and `chat.lifecycle` target it.
`message.created` invalidates the exact message query and Thread transcript,
its parent summary when present, the Chat list, and Server search. `chat.read`
invalidates the Chat list alone. `thread.follow.updated` invalidates the parent
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
`chat.updateChannel` emits `updated` when the save changes the name or the Agent
participant set, `chat.ensureDm` emits `created` for a DM's first resolution and
nothing for an idempotent reopen, and archive, unarchive, and delete emit their
own action. Audience is the Chat's own membership rather than an explicit
recipient: lifecycle events are announced Server-wide and narrowed by the
per-delivery Chat access check, which reaches both DM members and no one else.
Replay applies the same rule — a member walks a lifecycle event while the Chat
is still visible to them, or once the Chat row is gone because a delete purged
it.

Creating an Agent from an Agent (ADR 0028) emits no dedicated event. The
announcement Message's `message.created` refreshes the transcript, and
`server.updated{scope:'agent'}` refreshes the Agent list, Agent detail, Server
detail, and Chat list. The `agent-created` body is terminal, so reconnect
replay of that one `message.created` recovers the whole state.

`chat.markRead` does not invalidate anything from its mutation result. Its
durable `chat.read` event reaches the reader's own subscription and owns the
Chat list refresh.

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
phase, run id, per-run sequence, timestamp, and optional canonical safe tool reference. They never
carry reasoning, drafts, commands, paths, inputs, or outputs. Reconnect reads durable Activity
History plus the current unsettled-Agent snapshot before applying later live updates. Hosted tRPC
uses one Server-scoped `agent.onActivity` subscription; `agent.activityHistory` and
`agent.activeActivity` are the durable history and reconnect snapshot reads. Activity positions
are assigned under the Server row lock and are never derived from producer timestamps.
A Server `sending_message:completed` activity is committed with the Agent message and presents the
run as `Finishing up…`. Terminal lifecycle proof owns both sidebar-row removal and the Agent's
working-to-idle transition, keeping those surfaces synchronized. Trailing completion events preserve
the finishing state; a later started operation replaces it.

`ask.updated` is a participant-gated durable event carrying the Ask id, its Message id, the Chat id,
the anchor Message's Chat sequence, and the cursor. Creating an Ask emits `message.created` and then
`ask.updated` in one transaction; the first reply in the Ask's Thread emits its own
`message.created` and the settling `ask.updated` in the reply's transaction. The payload never
carries the question, summary, or options: clients refetch the affected Message — whose
`body` projects the current Ask — and the viewer's open-Ask list. Reconnect recovery therefore walks
the same events and cannot lose a settlement whose notification was dropped.

`cloud-agent-work.updated` is the same participant-gated shape for Cloud Agent work: the work id,
its Message id, the Chat id, the Message's Chat sequence, and the cursor. Creating the work emits
`message.created` and then `cloud-agent-work.updated` in one transaction; every applied Computer
observation and every recorded cancel request emits another. The payload carries no provider state:
clients refetch the affected Message — whose `body` projects the current work and its recent Runs —
and, for the Inbox, `cloudAgentWork.listActive`. A duplicate or stale observation applies nothing
and therefore emits nothing, so reconnect replay of these events is idempotent.

Hosted durable event kinds are `message.created`, `message.reaction.updated`, `ask.updated`, `cloud-agent-work.updated`,
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
* short-lived hover/debug state
* app-only invalidation hints

## Reconnect Recovery

Clients do not rebuild state from missed websocket events. They refetch durable
resources and let React Query reconcile active views.

The Haus App keeps one tRPC client and React provider mounted for the signed-in
human. Clerk token rotation reconnects only that client's websocket; the reconnect
reads fresh connection parameters and resumes its pending subscriptions. Credential
rotation must not replace the tRPC provider, remount the Server shell, clear composer
drafts, or discard other local presentation state. A genuine human identity change
renders through a newly keyed hosted QueryClient/provider, so the next identity never
observes the previous identity's cache or local presentation state.

Reconnect flow:

1. Keep rendering cached query data while the socket reconnects.
2. When the websocket reconnects, invalidate active Server-backed queries.
3. Refetch Chat history, Agents, activity, Computers, reminders, and other visible resources
   through their normal API reads.
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
