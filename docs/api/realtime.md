---
summary: Realtime contract — focused per-event tRPC subscriptions as live notifications, React Query reads owning state and recovery, refusal classes, the App's restart and recovery triggers, and the volatile streams (composition, engagement, lifecycle, activity, thoughts).
read_when:
  - changing websocket subscriptions, restart, or reconnect behavior
  - adding or changing a realtime event type or the reads an event invalidates
  - changing the composition stream, presence, engagement, or Agent activity streams
  - changing membership-loss, Chat deletion, or window-focus recovery in the App
---

# Realtime

Events are live notifications; React Query owns recovery.

PostgreSQL is the source of truth. A realtime event says that something changed and names it by
id; the App answers by reading. Nothing replays: there is no event log, cursor, or catch-up walk.
A missed event heals because reads refetch on every stream start (first start, resubscribe after
a socket reconnect, restart after a failure), a window focus after the stale window, and
staleness on mount.
[Focused Realtime Events](../../specs/realtime-events.md) is the normative contract; this page is
the working summary.

## Streams

Every Server-rooted stream is its own tRPC subscription taking `{ serverId }`
(`serverStreamInputSchema`, `packages/haus-api/src/realtime-events.ts`), with its own payload
schema and exactly one App hook under `apps/website/src/hooks/realtime/` that owns its cache
response. There is no union stream, client registry, or `switch` over event types. Payloads carry
ids and small facts, never rows.

| Procedure | App hook | App response |
| --- | --- | --- |
| `chat.onMessageCreated` | `useMessageCreatedStream` | Tail read every cached transcript list of the Chat (a Thread reply also refreshes its parent anchor's entity); invalidate `chat.list`, `chat.search`, `chat.unreadPreviews`; a Thread reply also invalidates `thread.listUnread` |
| `chat.onMessageReactionUpdated` | `useMessageReactionStream` | Invalidate the `chat.message` entity, `chat.search`, `cloudAgentWork.listActive`, `task.list` |
| `chat.onRead` (reader only) | `useChatReadStream` | Invalidate `chat.list` unless the settled list already shows zero; a Thread read refreshes its anchor entity and invalidates `thread.listUnread`; any read that moves a list invalidates `chat.unreadPreviews` |
| `thread.onFollowUpdated` (follower only) | `useThreadFollowStream` | Invalidate the anchor entity, `thread.listUnread`, and `chat.unreadPreviews` |
| `chat.onLifecycle` | `useChatLifecycleStream` | Invalidate `chat.list`, `chat.listArchived`, `chat.get`, `agent.chats`, `thread.listUnread`, `chat.unreadPreviews`; `deleted` runs the Chat-loss purge and invalidates `cloudAgentWork.listActive` and every `cloudAgentWork.listForChat`, since linked work outlives the Chat |
| `task.onChanged` | `useTaskChangeStream` | Invalidate the task Message's entity and `task.list` |
| `taskLabel.onUpdated` | `useTaskLabelStream` | Abort the Server's in-flight tail reads, then refetch its transcript lists and entities carrying the label; invalidate `taskLabel.list`, `task.list` |
| `cloudAgentWork.onUpdated` | `useCloudAgentWorkStream` | One event per linking Message in a live Chat. Invalidate that Message's entity, `cloudAgentWork.listForChat` (Chat and parent), `cloudAgentWork.listActive` |
| `reminder.onUpdated` (Owner/Admin) | `useReminderStream` | Invalidate the owner Agent's `reminder.list`, `reminder.history`, and the reminder's `reminder.runs` |
| `agent.onUpdated` | `useAgentUpdateStream` | The Server detail, the named Agent's reads (or every Agent read), `agent.list`, `chat.list` |
| `computer.onUpdated` | `useComputerUpdateStream` | The Server detail, Computer list and log, Agent activity and delivery, `agent.list`, `stats.live`, `cloudAgentSettings.get` |
| `mcp.onUpdated` | `useMcpUpdateStream` | `mcp.list`, `mcp.amazonProduct`, `mcp.amazonProductDetail` |
| `server.onUpdated` | `useServerUpdateStream` | The Server detail and `server.list`; the membership sentinel |
| `member.onUpdated` | `useMemberUpdateStream` | The named member, `member.list`, `chat.list`, the Server detail (the viewer's role) |
| `invitation.onUpdated` (Owner/Admin) | `useInvitationUpdateStream` | `invitation.list` |
| `cloudAgentSettings.onUpdated` | `useCloudAgentSettingsStream` | `cloudAgentSettings.get` |
| `artifact.onUpdated` | `useArtifactUpdateStream` | `artifact.list` (every folder) and `artifact.creators`, throttled to one refresh now and at most one per 300 ms after; the named file's `artifact.get`, `artifact.versions`, and `artifact.publicLink` (every file's for a null id) at once; revision-keyed reads never refresh |

Every invalidation goes through the coalescer (`lib/targeted-read-coalescer.ts`) with
`refetchType: 'active'`, coalesced per key within one animation frame: a message + read + follow
burst refetches `chat.list` once, and active reads refetch while inactive ones are only marked
stale. A null id in a Server-level notice means "broad": the hook refreshes the whole family.

The Server publishes each event after the mutation commits, built and validated before commit
(`apps/server/src/realtime/`). A publish failure is logged and never fails the mutation; the read
recovers it. Every stream checks Server membership at start and before each delivery, plus its
own audience rule (Chat access, reader-only, Owner/Admin). An inaccessible event is skipped
without ending the stream. Every publish that can revoke membership also publishes
`server.updated`, so the sentinel ends with `membership_lost`.

### Topology and budget

`server.onUpdated` and `member.onUpdated` mount for every accessible Server
(`features/servers/server-event-listeners.tsx`). Every other root stream mounts once per window
for the active Server (`features/servers/server-realtime-listeners.tsx`, one tiny component per
hook); `reminder.onUpdated` and `invitation.onUpdated` mount only for Owners and Admins. The
Server shell hoists the one `agent.onLifecycle` and `agent.onActivity`. Each mounted Chat view
adds `chat.onEngagement`, `chat.onThought`, and `chat.onComposition`. With three Servers and two
mounted Chat views that is 28 streams for a member and 30 for an Admin, pinned by
`features/servers/realtime-budget.test.tsx`.

### Transcript cache

Transcripts are normalized: each `chat.messages` list holds ordered ids, and each message is its
own `chat.message` entity. A new message is a tail read (`chat.messages` after the list's
`scannedThroughSequence`), never a refetch of every loaded page; a changed annotation is a
cancel-then-invalidate of one entity. Entities never refetch on focus or reconnect; they recover
through their lists' bulk refetch. See [React](../internals/react.md) and the spec.

## Refusal classes

| Signal | App action |
| --- | --- |
| `FORBIDDEN` with `hausRefusal: 'membership_lost'` | Run the Server-loss path once: close every stream of that Server, purge its transcript cache, cancel and drop every query scoped to it (`server.bySlug` matched by its cached Server), and invalidate `server.list`. A mounted view's reads reset and fail closed into the unavailable state |
| `NOT_FOUND` with `hausRefusal: 'chat_missing'` (per-Chat streams) | Run the Chat-loss purge for that Chat, which stops its per-Chat streams; never retry |
| `FORBIDDEN` with `hausRefusal: 'role_required'` | Stop that one stream; clear nothing |
| `UNAUTHORIZED` | Refresh the session in place (`session.refresh`), then restart with backoff; final only when Clerk has no session |
| Anything else, `FORBIDDEN` or `NOT_FOUND` without `hausRefusal` included | Restart with backoff |

Only a coded `hausRefusal` (`realtimeRefusalDataKey`) is a refusal; the App never infers one from a
bare tRPC code (`hooks/realtime/realtime-refusal.ts`). The Chat-loss purge (`chat.onLifecycle`
`deleted`, or a `chat_missing` refusal) does the same for one Chat: its lists, entities, pending
rows, kept view, and every other read keyed by the Chat, then invalidates the Chat lists and
Agent Chat rows; both triggers share `applyChatDeletion` (`hooks/realtime/chat-deletion.ts`). The
refusal covers a view that mounts after the deletion, such as a restored desktop tab, which never
hears the lifecycle event; Chat queries keep a plain `NOT_FOUND`.

## Recovery

| Trigger | Action |
| --- | --- |
| Stream start (first start, resubscribe after a socket reconnect, restart after a failure) | That stream reconciles its owned reads through the coalescer (`lib/start-reconciliation.ts`): the message, reaction, read, follow, task, label, and work streams bulk-refetch the Server's cached transcript lists plus their own non-entity reads; the others invalidate their table row. Only reads fetched before the start refetch; `chat.message` never joins. The volatile streams (`agent.onActivity`, `agent.onLifecycle`, `chat.onEngagement`) re-read their projections on every start |
| Stream error or normal completion | That stream alone restarts with capped backoff, 1 s → 30 s (`hooks/realtime/subscription-restart.ts`), and recovers on its next start. An unsubscribe the App made (unmount, a disabled or changed input) is never a completion. A view still showing a deleted Chat stops its per-Chat streams for good (`hooks/realtime/use-chat-lost.ts`) |
| Socket reconnect | No pass of its own: every stream resubscribes on the new socket, and each start reconciles its reads. A read no stream owns hears no event, so a gap cannot stale it beyond its normal staleness |
| Window focus | Browser `visibilitychange`/`focus` and the desktop window's native focus feed `focusManager` (`lib/query-focus.ts`); 500 ms after a return, an active read older than 3 minutes refetches (`refetchesOnFocus`, `lib/query-policy.ts`). The delay lets a wake that also drops the socket reconcile first, so the focus pass finds those reads fresh or joins their fetch. A quick alt-tab is silent |
| Mount | A read older than `queryPolicy.syncedSnapshot` (30 s) refetches, as React Query normally does |

**Recovery is anchored to subscription start, not socket open.** The Server registers a stream's
topic listener before it answers `started`, so a read the App sends after hearing `started` cannot
miss an event that stream would skip; a read sent earlier can. Each start therefore takes a mark
and refetches the stream's owned reads whose data, or whose fetch in flight, began before it
(cancelling such a fetch first), and skips reads fetched after it. Fetch begins come from the
query cache's `fetch` action; any doubt (a hydrated read, a cancel-and-restart) counts as before.
Starts arriving in a burst after a reconnect share one 50 ms settle window (capped at 250 ms), so
each read refetches once against the latest start.

The tRPC `wsClient` keep-alive (15 s ping, 5 s pong timeout) detects a stalled socket. Every
socket operation, `session.refresh` included, goes through the App's one tRPC client
(`lib/haus-connection.ts`, routed by `context: { socket: true }`). Never create a second tRPC
client on the shared socket: the socket keys requests by each client's operation id, so a second
client's call silently replaces and then deletes a live subscription with the same id.

The iPhone uses HTTP (SSE) subscriptions instead of the socket. The Server pings every SSE stream
every 15 s (tRPC `sse.ping`, `apps/server/src/haus-api/trpc.ts`) and advertises a 45 s
`reconnectAfterInactivityMs`; the iPhone's stream session drops a stream after 45 silent seconds
and restarts it. Queries and mutations run on a separate URL session so held streams never starve
them of connections ([iOS](../internals/ios.md)). The socket transport ignores `sse` settings.

Forbidden:
periodic reconnects, refetch timers for event-covered reads, and any client replay. A single frame
dropped on a live, error-free stream in a window that never blurs stays missing until the next
restart, reconnect, focus past the window, or related event; that residual is accepted.

Clerk token rotation does not reconnect: the App hands each rotated token to the open socket
(`session.refresh`, [Auth](auth.md#socket-sessions)). A genuine identity change renders through a
newly keyed QueryClient and provider. A browser offline → online transition refetches nothing
(`refetchOnReconnect: false`); the socket reconnect owns recovery.

The deterministic incident detector is `apps/website/e2e/tests/realtime-server-restart.spec.ts`
(App e2e): a stream error injected into one subscription (a human reply, and an Agent reply with
no lifecycle fallback), a real Server restart whose reconnect reads settle before the changes
commit while every start is held, refused resubscribes, stale HTTP ordering, duplicate and
reordered events, a hidden kept tab, and Chat deletion.

## Notifications

**Message notifications** ([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)) ride the
single `chat.onMessageCreated` and `chat.onRead` subscriptions through the hooks' `onEvent`
callback (`features/notifications/message-notifications.tsx`). The event carries the notification
facts (`authorUserId`, `conversationKind`, `mentionedUserIds`, `replyToAuthorUserId`,
`threadAnchorAuthorUserId`) that `messageNotificationReason` reads. Only live events notify; a
restart's recovery reads never do, and a message whose Chat is read through it stays silent.

**iPhone push** is a Server-side consumer of the in-process `message.created` topic after commit
(`apps/server/src/push/`), with the same rule. Delivery is best-effort; see
[iPhone push](../operations/ios-push.md).

The [Inbox](../features/inbox.md) adds no event: its Unread section and badge are `chat.list` plus
`thread.listUnread` ([ADR 0043](../adr/0043-threads-are-unread-on-their-own.md)). Every change to
an unread Thread already has an event: `chat.onMessageCreated` and `chat.onRead` with a non-null
`parentChatId` (a Thread reply, a Thread read), `thread.onFollowUpdated`, and `chat.onLifecycle`
(a parent archived, deleted, or hidden).
`chat.markRead` returns `advanced`; false means the marker was already there and no `chat.onRead`
follows, so a locally zeroed row refetches the list itself a second later.

## Volatile streams

These carry live projections, are never persisted or replayed, and re-read their durable state on
every start. They restart with the same policy.

* **Composition** (`chat.onComposition`): an in-flight `haus message send` preview, Chat-access
  checked per delivery, component-local in the App, discarded on unmount.
* **Chat engagement** (`chat.onEngagement`, [ADR 0035](../adr/0035-chat-engagement-shows-as-typing.md)):
  `started` after the write that grants a run sight of an unanswered human message, `ended` on a
  `--done` send or terminal turn proof. The App invalidates `chat.engagements` on every start and
  patches it from live events.
* **Agent lifecycle** (`agent.onLifecycle`): `working`, `reading`, `sending` (after the Agent's
  message commits), `settled` (terminal proof), projected to coarse availability. Every run
  publishes it; `chatId` is null only for a dream run, which has no Chat. Settlement
  invalidates Agent list, delivery state, and activity reads. Lifecycle owns activity only: a
  `sending` notice reads no transcript, and a missed Agent message recovers like any other, on
  the message stream's next start.
* **Agent activity** (`agent.onActivity`): semantic activity written before broadcast; the Server
  shell owns the one subscription, patches cached Activity History pages in Server order, and
  every start refreshes the snapshot, history, turns, and usage reads.
* **Agent thoughts** (`chat.onThought`, [ADR 0036](../adr/0036-agent-thoughts-surface-as-condensed-phrases.md)):
  Server-phrased lines from scrubbed Computer frames, announced once per engaged Chat; no read or
  recovery.
* **Turn journal** (`agent.onExecutionJournal`): change notices for an open turn's journal, which
  re-reads itself.

## Ordering

* Message order is the per-Chat `sequence`; a tail read appends by id in sequence order.
* Events carry no ordering contract: a duplicate, late, or reordered event costs at most one read,
  because the read is the truth.
* A reminder or Trigger fire writes no Chat message; the Agent's answer, if any, is an ordinary
  later `chat.onMessageCreated`.

## What Is Intentionally Missing

* An event log, cursor, or client replay (`chat_events` is gone).
* WebSocket-only durable state, or rows in event payloads.
* A union stream or client-side event registry.
* Hidden chain-of-thought in realtime events.

## Related Docs

* [Focused Realtime Events](../../specs/realtime-events.md)
* [React](../internals/react.md)
* [API overview](overview.md)
* [Data model](../internals/data-model.md)
