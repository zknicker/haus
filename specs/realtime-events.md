---
summary: Normative contract for focused realtime events — one tRPC subscription per event type, id-only notifications, a normalized per-message transcript cache answered by tail reads and entity invalidation, explicit refusal classes, React Query recovery, and the removal of the chat_events log.
read_when:
  - adding, changing, or removing a realtime subscription or event payload
  - changing how the App, iPhone app, or push consumes Server events
  - changing subscription restart, reconnect, membership-loss, or window-focus recovery
  - changing the transcript cache, chat.message entities, list seeding, or tail reads
  - touching chat_events, event cursors, or Agent inbox paging
  - implementing a slice of the realtime events redesign
---

# Focused Realtime Events

Status: normative. Contracts landed in `packages/haus-api`; Server, App, Computer, and iPhone
slices implement against this document and ship together behind App protocol version 9
(`packages/haus-api/src/app-protocol.ts`). Older clients get `PRECONDITION_FAILED` and the
update-required screen; there is no compatibility path.

## Why

After the 9.5.0 deploy reconnected every socket, the App's single Server-wide `chat.onEvent`
subscription failed on re-subscribe. tRPC completes a subscription on its first error and never
resubscribes, and nothing restarted it, so every desktop kept-alive tab stopped hearing Agent
replies, Thread summaries, and Cloud Agent rows. Typing kept working because `chat.onEngagement`
is a separate, per-Chat stream.

The single union stream made one failure take out every Chat read, and the `chat_events` cursor
log, `chat.events` catch-up, and `pushedSnapshot` (`staleTime: Infinity`) policy made correctness
depend on that one stream never silently dying. The redesign removes the single point of failure
rather than hardening it.

## Principles

1. **One focused subscription per event type.** Each has its own tRPC procedure, its own payload
   schema, and exactly one App hook that owns the cache update. No union stream, no client-side
   registry or `switch` over event types.
2. **Events are notifications; reads own state.** Nothing replays. There is no cursor, catch-up
   walk, `chat.events`, or `chat.eventHead`. React Query reads own state; recovery is refetching
   reads.
3. **Events carry ids and small facts, never rows.** The App answers an event by invalidating
   reads. The one exception is new messages: invalidating a loaded transcript list would refetch
   every loaded page, so a new message gets a **tail read** instead. Messages live in a
   normalized cache (one `chat.message` entry per message), so a changed message is a plain
   invalidation of one entry. The read is the truth, so duplicate, late, and reordered events
   converge with no versioning.
4. **A failure ends one stream, never the others.** Server-side, an unexpected error ends only
   the subscription it happened in, and is logged. App-side, every subscription restarts
   independently with backoff.
5. **Refusals are explicit.** Only a coded `membership_lost` refusal clears a Server's caches.

## Subscription table

Every Server-rooted stream takes `serverStreamInputSchema` (`{ serverId }`,
`packages/haus-api/src/realtime-events.ts`). Every stream checks Server membership at start and
again before each delivery; the audience column is the additional rule.

### Chat and Thread streams

| Procedure | Payload schema (file) | Payload fields | Audience | App response |
| --- | --- | --- | --- | --- |
| `chat.onMessageCreated` | `messageCreatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `sequence`, `threadAnchorMessageId` (Thread reply only), notification facts `authorUserId`, `conversationKind`, `mentionedUserIds`, `replyToAuthorUserId`, `threadAnchorAuthorUserId` | Chat access (`findChatAccess`) | **Tail read** every cached transcript list for `chatId` (Thread panel included); for a Thread reply **invalidate** the anchor's `chat.message` entry; **invalidate** `chat.list`, `chat.search` |
| `chat.onMessageReactionUpdated` | `messageReactionUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId` | Chat access | **Invalidate** the `chat.message` entry, `chat.search`, `cloudAgentWork.listActive`, `task.list` |
| `chat.onRead` | `chatReadEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `sequence` | The reader only | **Invalidate** `chat.list`, skipped when the settled list already shows zero unread for the Chat (or a Thread's parent). A Thread read also invalidates the anchor's `chat.message` entry (its summary's unread count) when the App knows the anchor (`thread.context`, cached) |
| `thread.onFollowUpdated` | `threadFollowUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `threadChatId`, `parentChatId`, `anchorMessageId`, `followed` | The follower only | **Invalidate** the anchor's `chat.message` entry, `chat.list` |
| `chat.onLifecycle` | `chatLifecycleEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `action` (`created`, `updated`, `archived`, `unarchived`, `deleted`) | Chat access, except `deleted`, which reaches every Server member (7a873a99e) | **Invalidate** `chat.list`, `chat.listArchived`, `chat.get` (chatId), `agent.chats` |
| `task.onChanged` | `taskChangedEventSchema` (`task.ts`) | `serverId`, `chatId`, `messageId`, `kind` (`created`, `updated`) | Chat access of `chatId` | **Invalidate** the `chat.message` entry, `task.list` |
| `taskLabel.onUpdated` | `taskLabelUpdatedEventSchema` (`task.ts`) | `serverId`, `labelId` | Every member | **Invalidate** `taskLabel.list`, `task.list` |
| `cloudAgentWork.onUpdated` | `cloudAgentWorkUpdatedEventSchema` (`cloud-agent.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `workId` | Chat access | **Invalidate** the work Message's `chat.message` entry, `cloudAgentWork.listForChat` (chat and parent), `cloudAgentWork.listActive` |
| `reminder.onUpdated` | `reminderUpdatedEventSchema` (`reminders.ts`) | `serverId`, `reminderId`, `ownerAgentId`, `action` (`scheduled`, `updated`, `snoozed`, `canceled`, `fired`) | Owner/Admin (`requireReminderOperator`), rechecked per delivery | **Invalidate** `reminder.list` (agentId), `reminder.runs`, `reminder.history` (agentId) |

Every invalidation in this document uses `refetchType: 'active'`: active reads refetch, inactive
reads are only marked stale and refetch when next observed. A future message edit or delete
follows the same rule: an id-only event that invalidates the entry.

### Server-level streams

These replace `server.onUpdate` and its `scope` enum. All payloads live in
`packages/haus-api/src/realtime-events.ts`. A null id means "broad: refresh the whole family".

| Procedure | Payload | Audience | App reads (invalidate) |
| --- | --- | --- | --- |
| `agent.onUpdated` | `{ serverId, agentId \| null }` | Every member | `server.bySlug` (this slug), `agent.get` + `agent.deliveryState` (agentId, else every `agent.get`), `agent.conversationStyle` (agentId, else all), `agent.skillFile`, `agent.workspaceFile`, `agent.workspaceFiles` (agentId, else all), `agent.list`, `chat.list` |
| `computer.onUpdated` | `{ serverId, computerId \| null }` | Every member | `server.bySlug`, `computer.list`, `computer.systemLog` (computerId, else all), `agent.activeActivity`, `agent.deliveryState`, `agent.list`, `stats.live`, `cloudAgentSettings.get` (a report can carry a new model catalog) |
| `mcp.onUpdated` | `{ serverId }` | Every member | `mcp.list`, `mcp.amazonProduct`, `mcp.amazonProductDetail` |
| `server.onUpdated` | `{ serverId }` | Every member | `server.bySlug`, `server.list` |
| `member.onUpdated` | `{ serverId, memberId }` | Every member | `member.get` (memberId), `member.list`, `chat.list` (rows name human authors and participants), `server.bySlug` |
| `invitation.onUpdated` | `{ serverId }` | Owner/Admin, the same authority as `invitation.list` | `invitation.list` |
| `cloudAgentSettings.onUpdated` | `{ serverId }` | Every member | `cloudAgentSettings.get` |

**Server deletion is membership loss.** `server/delete` still publishes `server.updated` after the
tombstone, but deletion revokes every membership first, so the factory's per-delivery recheck
fails and each subscriber's stream ends with `membership_lost` (below). No `deleted` action
exists and the factory has no deletion special case. The App clears that Server's caches,
invalidates `server.list`, and routes away if it was active.

**Member events always name the member.** Every publisher supplies `memberId`: `change-role` (the
target), `departure-signals` (the departed member), `profile-signals`, and `invitation/accept`
(the new member). The departed member's own streams end with `membership_lost` on that same
publish.

### Kept streams (unchanged)

`agent.onLifecycle`, `agent.onActivity`, `chat.onEngagement`, `chat.onThought`,
`chat.onComposition`, `agent.onExecutionJournal`. Their inputs and payloads do not change; they
gain the App restart policy below where they lack it.

### New read: `chat.message`

`chatMessageInputSchema` / `chatMessageReadSchema` (`chat-message-read.ts`):
`{ serverId, chatId, messageId }` returns `{ message, thread } | null`. `message` is projected
exactly as `chat.messages` projects it (reactions, task, Cloud Agent work body, reply context);
`thread` is the viewer's Thread summary when the message anchors one, computed by the same Server
code as `chat.messages` (per-viewer `followed` and `unreadCount`). Same authorization as
`chat.messages` for `chatId`. Null when the id no longer resolves in `chatId`; the row then
renders nothing and the next list read drops its id.

**No batch read.** Entity invalidations are many small `chat.message` calls, and the App's
`httpBatchLink` (`lib/haus-server.tsx`) already folds every query issued in one tick into one
POST, so a burst costs one round trip. A `chat.messagesById` batch would duplicate the entity
cache's single flight with its own fan-out and key bookkeeping, and the realistic burst is small:
reactions, tasks, and work touch one message, and only **active** (rendered) entries refetch.
The Server runs each call as its own indexed lookup. Add a per-request dataloader in the
procedure only if `perf:web` or Server traces show `chat.message` batches dominating; the wire
contract would not change.

### Removed

`chat.onEvent`, `chat.events`, `chat.eventHead`, `server.onUpdate`, `reminder.onEvent`,
`reminder.changes`; contracts `serverdurableeventSchema`/`ServerDurableEvent`,
`serverUpdateScopeSchema`, `chatEventsInputSchema`, `chatEventsSchema`, `chatEventHeadSchema`,
`chatEventSubscriptionInputSchema`, `reminderChangesInputSchema`, `reminderChangesSchema`,
`reminderEventSubscriptionInputSchema`, `reminderChangedEventSchema`, `threadActivitySchema`;
every `eventCursor` field (`chat.send`, `chat.react`, `thread.setFollow`, task and task-label
mutations). `chat.markRead`'s receipt replaces the nullable `eventCursor` with `advanced: boolean`
(false: the marker was already there and no `chat.onRead` follows).

## Server shape

### Topics

One typed in-process topic per event type, under `apps/server/src/realtime/`:

- `createTopic(name, schema)` returns `{ prepare(event), publish(prepared), subscribe(signal) }`.
- **Build and validate before commit.** The mutation calls `prepare` with the event built from
  the rows it is about to commit, inside the transaction or before returning. `prepare` validates
  with the `@haus/api` schema and throws on a malformed event, so a publisher bug fails the
  mutation before anything durable happens.
- **Publish after commit, never throwing.** `publish(prepared)` runs only after commit. It
  catches and logs every failure (`[haus] realtime publish failed`, topic name, error class, no
  payload) and never throws to the mutation caller: a committed write always returns its receipt.
  A lost notification heals through read recovery. A mutation inside a transaction collects
  prepared events and publishes them when the transaction resolves; a rollback publishes nothing.
- Reader-only events (`chat.onRead`, `thread.onFollowUpdated`) publish with an `audienceUserId`
  envelope field that never reaches the wire.
- Topics are in-process (`EventEmitter`), like today's hubs. Multi-process fan-out is out of
  scope.

### Subscription factory

One factory, `realtimeSubscription({ topic, input, authorize, deliver })`, builds every root
stream:

1. **Authorize at start** (middleware): `requireServerMembership`, plus the stream's own role
   authority (`requireReminderOperator`, invitation authority).
2. **Filter per event**: wrong `serverId`, wrong `audienceUserId`, or a failed per-event access
   rule (`findChatAccess` for Chat-scoped events; the `deleted` lifecycle exemption) skips the event
   without ending the stream.
3. **Recheck membership and role per event.**
4. **Refusals are coded.** A failed membership check (start or recheck) ends the stream with a
   tRPC `FORBIDDEN` whose error `data` carries `hausRefusal: 'membership_lost'`
   (`realtimeRefusalSchema`, `realtimeRefusalDataKey`), set by `toMembershipLossError` and exposed
   through the tRPC `errorFormatter`. A failed role check ends the stream with `FORBIDDEN` and
   `hausRefusal: 'role_required'`. Only these two checks produce a `hausRefusal`.
5. **An unexpected error ends only this stream.** It is logged (`[haus] realtime stream failed`,
   path, tRPC code, error class) and surfaces as `INTERNAL_SERVER_ERROR`; the App restarts it.
   Never translate an unknown error into a refusal.

### Logging

`apps/server/src/haus-api/ws.ts` logs every socket procedure error (path, tRPC code, error class)
and every abnormal socket close (code), with no inputs or payloads (landed). The Server slice adds
the authenticated user id when the context has resolved one and an ISO timestamp field, and never
payloads.

### Publish call sites

Chat-family events are published today through `emitDurableChatEvent` from: `agent-api/`
(`reaction-routes`, `channel-routes`, `task-routes`, `agent-routes`, `message-send-route`,
`cloud-agent-routes`), `computers/cloud-agent-reports.ts`, `tasks/close-stale-tasks.ts`,
`triggers/operator-trigger-create.ts`, `agent-delivery/delivery.ts`, `voice/voice-agent-bridge.ts`,
`reminders/` (`operator-reminders`, `scheduler`, `reminders`, `mutations`, `reschedule`), and
`haus-api/` (`chat/` archive, unarchive, update, create, ensure-dm, ensure-agent-dm, delete,
send, react, mark-read; `agent/` create, delete; `task/` assign, promote, create, update;
`thread/set-follow`; `task-label/` create, update, delete; `cloud-agent-work/cancel`). Each
prepares the focused event before commit and publishes it after.

`server.updated` call sites map to the new topics:

| Today (`emitServerUpdated`) | New topic |
| --- | --- |
| `scope:'agent'`: `haus-api/agent/` create, configure, update-profile, update-conversation-style, start, stop, restart, reset, delete; `agent-api/agent-routes` (×3), `agent-api/profile-routes`; `agent-delivery/failure-hold`; `computers/ingest-report` (Cove apply); `haus-api/server/create-cove` | `agent.updated` |
| `haus-api/agent/import-skill` (with `agentId`), and any Computer report that changes one Agent's skills or workspace files | `agent.updated` (with `agentId`) |
| `scope:'computer'`: `computers/socket` (attach, close), `computers/ingest-report` (×2), `haus-api/computer/` remove, refresh-inventory, start-update, check-update | `computer.updated` |
| `scope:'mcp'`: `haus-api/mcp/router`, `server-mcp/oauth-relay` | `mcp.updated` |
| `server/rename` | `server.updated` |
| `server/delete` | `server.updated` (received by nobody; ends every stream with `membership_lost`) |
| `member/change-role`, `member/departure-signals`, `member/profile-signals` | `member.updated` (with `memberId`; `change-role` and `departure-signals` gain it) |
| `invitation/create`, `invitation/revoke` | `invitation.updated` |
| `invitation/accept` | `invitation.updated` and `member.updated` (the new member) |
| `cloud-agent-settings/set-model` | `cloudAgentSettings.updated` |

The "announce only real changes" rule for Computer reports and identity sync stays: an idle App
receives no realtime traffic.

## App shape

### Topology

- `server.onUpdated` and `member.onUpdated` mount for **every accessible Server**, as
  `ServerEventListeners` does today, so renames, departures, and deletions of non-active Servers
  still land.
- Every other root stream mounts for the **active Server only**, once per window.
- Role-gated streams mount only for authorized roles: `reminder.onUpdated` and
  `invitation.onUpdated` mount only when the viewer's role is Owner or Admin, and unmount on a
  role change (`member.onUpdated` for the viewer refreshes the role).
- **Subscription budget**: per window, `2 × accessibleServers + featureStreams(activeServer)`
  root subscriptions, where `featureStreams` is at most 14 for an Owner/Admin and 12 otherwise,
  plus the kept per-Chat streams for open Chats. A unit test mounts the shell with three Servers
  and asserts the exact count, and that a reconnect issues no per-stream start reads beyond the
  reconnect pass.

### Hooks

Each stream has one hook under `apps/website/src/hooks/realtime/` (or beside its noun's hooks)
that owns its subscription and its exact cache response: `useMessageCreatedStream`,
`useMessageReactionStream`, `useChatReadStream`, `useThreadFollowStream`,
`useChatLifecycleStream`, `useTaskChangeStream`, `useTaskLabelStream`, `useCloudAgentWorkStream`,
`useReminderStream`, `useAgentUpdateStream`, `useComputerUpdateStream`, `useMcpUpdateStream`,
`useServerUpdateStream`, `useMemberUpdateStream`, `useInvitationUpdateStream`,
`useCloudAgentSettingsStream`.

Desktop and web message notifications consume `chat.onMessageCreated` and `chat.onRead` through
the same single subscriptions: those hooks take an optional `onEvent` callback that
`MessageNotifications` supplies. Notifications fire on live events only, never on recovery reads.

### Normalized transcript cache

**Shape.** Two kinds of React Query entry:

- **Transcript lists**: every `chat.messages` infinite query (the unfiltered transcript, each
  `replyRootMessageId` chain, the Thread panel `threadMessagesQueryKey`) and any other message
  list (search results). A list keeps, per page, the ordered message ids plus its paging
  (`nextBeforeSequence`, `nextAfterSequence`) and, for each id, the immutable layout facts the
  row model groups by (sequence, author identity, `createdAt`, reply root). The slice confirms
  that set against `features/chats/chat-transcript-row-model.ts` and
  `chat-transcript-item-utils.ts`; nothing mutable (reactions, task, work body, Thread summary)
  stays on the list.
- **Message entities**: `chat.message({ serverId, chatId, messageId })`, one entry per message,
  holding `{ message, thread }`. Rows render by id through `useChatMessage(serverId, chatId, id)`
  (`hooks/servers/use-chat-message.ts`), so a row re-renders only when its own entry changes, the
  same per-row read pattern as 0c90d33b7. Rows outside the render window
  (`transcript-render-window.ts`) are not mounted, so their entries have no observer: an
  invalidation marks them stale and they refetch when the window mounts them.

**Seeding.** Every read that returns messages (page fetch, tail read, Thread, search) seeds the
entities in one batch inside its `queryFn` before returning the id list: one
`queryClient.setQueryData` per message inside a single `notifyManager.batch`, with the message
and its page `threads[]` summary (or null). A 50-message page issues zero entity requests. The
guard, so an older list response never overwrites a newer entity: the list records `startedAt =
Date.now()` before its request, and seeds an entry only when

- the entry has no data, or
- `startedAt >= entry.state.dataUpdatedAt`, and the entry is neither fetching
  (`fetchStatus !== 'fetching'`) nor invalidated (`!state.isInvalidated`).

Seeding passes `updatedAt: startedAt`, so a later comparison uses the time the data was read, not
the time it landed. An invalidated or in-flight entry is left to its own fetch, which is newer
than any list that started before the event. The guard is one function in
`hooks/servers/chat-message-entities.ts` with unit tests for each branch.

**New messages: tail read.** On `chat.onMessageCreated`, for each cached transcript list for
`chatId`:

- If its newest page is not loaded (`nextAfterSequence` is not null) or it has no data: mark it
  stale when inactive, do nothing when active (an active list without its newest page is
  scrolled into history and refetches on return).
- If its cached tail sequence is at or past the event's `sequence`, do nothing.
- Otherwise read `chat.messages({ ...sameFilter, afterSequence: cachedTailSequence })`, seed
  the entities, and append the ids to the newest page, deduplicated by id, in sequence order. If
  the result reports more (`nextAfterSequence` not null), read again until caught up. Each list
  reads with its own filter, so an inline-reply chain only gains its own messages, and a missed
  event's gap is filled by the same read with no contiguity rule.

**Changed messages: invalidate the entity.** Reaction, Thread summary (reply, read, follow), task,
and Cloud Agent work events invalidate the affected `chat.message` entries with `refetchType:
'active'`. Rendered rows refetch (one batched POST per tick); offscreen rows go stale.

**Pending rows retire by nonce.** `features/servers/chat/use-pending-messages.ts` retires an
optimistic row when a seeded entity in that Chat carries its nonce (the tail read seeds the
durable row), exactly as a full refetch did before. Nothing writes optimistic content into the
entities or the id lists.

**Concurrency.** `apps/website/src/lib/targeted-read-coalescer.ts` owns tail reads and every
realtime invalidation:

- Single flight per list key for tail reads: an event arriving during a tail read marks it
  dirty, and exactly one follow-up read runs when it settles. Appends commit in request order;
  a full refetch of the list supersedes pending tail reads for it.
- Entity entries are single-flight by React Query itself (one fetch per key; an invalidation
  during a fetch refetches once after it).
- Invalidations are coalesced per key within one animation frame across all hooks, so a
  message + read + follow burst produces one `chat.list` refetch.
- The coalescer's frame scheduling is registered in the timer/polling allowlist
  (`query-polling-contract.test.ts`).

### Transcript reshaping (App slice)

The slice moves the transcript from page-held rows to id lists plus entities:

- `hooks/servers/use-chat-messages.ts`: `chatMessagesQueryOptions` seeds entities in `queryFn`
  and stores id pages; `mergeChatMessagePages` returns ordered ids and layout facts, not
  messages and `threads`. `useThreadMessages` (`hooks/servers/use-thread-messages.ts`) and
  `use-thread-inline-replies.ts` take the same shape.
- `hooks/servers/use-chat-message.ts` (new): `useChatMessage` reads one entity with
  `queryPolicy.syncedSnapshot`; `chat-message-entities.ts` (new) owns the key, seeding, and the
  guard.
- `hooks/servers/message-page-sharing.ts`: deleted. Its job (keep unchanged messages
  referentially stable across a sliding page window) disappears once pages hold ids and each
  entity is its own query.
- `features/servers/chat/chat-message-projection.ts`: `projectStableChatMessages` stops keying
  rows by message object and builds the row skeleton from ids and layout facts; per-row
  projection (`projectChatMessage`) moves into the row component, fed by `useChatMessage`.
- `features/servers/chat/use-chat-transcript.tsx`: the `messagesById` and `threads` lookup ref
  (attachments, open Thread, select inline reply) reads entities from the query cache by id
  instead of the merged message array.
- `features/chats/chat-transcript-rows.tsx`, `chat-transcript-message.tsx`,
  `chat-transcript-message-block.tsx`, and `chat-transcript-row-slot.tsx`: a message row takes a
  message id and reads its entity; `transcript-render-row-equality.ts` compares ids and layout
  facts only.
- Every former page patcher reads entities instead: `hooks/servers/chat-read-cache.ts`,
  `use-chat-message-reaction.ts` (optimistic reaction writes the entity and rolls it back),
  `hooks/threads/use-thread-anchor.ts`, `features/servers/chat/use-chat-typing-ends.ts`,
  `features/servers/chat/chat-view.tsx`, `features/servers/thread/thread-content.tsx`,
  `routes/app/desktop-tab-pages.tsx`, and `test-support/transcript-render-harness.tsx`.
- `hooks/servers/chat-events/` is deleted with the union stream.

`features/servers/chat/transcript-render-isolation.test.tsx` gains the core render assertion:
invalidating one entity re-renders exactly that row.

## Refusal classes

| Signal | Meaning | App action |
| --- | --- | --- |
| `FORBIDDEN` + `hausRefusal: 'membership_lost'` | The viewer is no longer a member, or the Server was deleted | Final for every stream of that Server. Clear the Server's caches once (below) and fall back to unavailable if it was active; invalidate `server.list`. |
| `FORBIDDEN` + `hausRefusal: 'role_required'` | The viewer lacks the stream's role | Stop that one stream. No cache clear. It remounts if a role change makes it authorized. |
| `UNAUTHORIZED` | The Clerk session token expired or was rejected | Refresh the token and reconnect, then restart with backoff. Final only when Clerk confirms sign-out. |
| `FORBIDDEN` or `NOT_FOUND` with no `hausRefusal`, or anything else | Not a refusal | Restart with backoff like any error. |

**Cache clearing on membership loss** removes every query whose key is Server-scoped to that
`serverId` (a validated predicate over the tRPC query key's `input.serverId`, plus App query keys
that embed the Server id), with an explicit, tested exception list for global data (`server.list`,
account and settings reads). It replaces the family list in
`hooks/servers/membership-caches.ts`. A test seeds one query per Server-scoped family across two
Servers and asserts only the lost Server's are gone.

## Recovery

`staleTime` alone schedules nothing: React Query marks an observed read stale but refetches only
on a trigger. These are the triggers.

| Trigger | Action |
| --- | --- |
| Stream error or completion | Any end that is not a refusal, including a normal completion, restarts that one stream with capped exponential backoff (1 s → 30 s; `hooks/realtime/subscription-restart.ts`). Siblings are untouched. When the restarted stream starts (`restart.started()` returns true) it invalidates only its owned reads (its table row) through the coalescer: `chat.onMessageCreated` tail-reads cached lists; reaction, task, and work streams invalidate the `chat.message` entries of cached transcripts for the active Server. |
| Socket reconnect | The App-wide reconnect pass (`query-reconnect-recovery.ts`) refetches every active Server tRPC read once, which includes rendered `chat.message` entries and active transcript lists. Root streams do not invalidate again on that start. `streamRecoveredReads` shrinks to the volatile streams (`agent.onActivity`, `agent.onLifecycle`, `chat.onEngagement`), whose live projections still re-read on every start. |
| Window focus (browser `visibilitychange`/`focus`, and Electron `BrowserWindow` focus through the desktop bridge into `focusManager`) | Refetch active reads whose data is older than the focus stale window, **3 minutes**. A quick alt-tab is silent. |
| Mount or observe | A read older than `queryPolicy.syncedSnapshot` (30 s) refetches on mount, as React Query normally does. Inactive reads marked stale by an event refetch here. |

**Residual limitation.** A single frame selectively dropped on a live stream that does not error,
in a window that stays focused and never blurs, stays missing until the next focus after the
stale window, a reconnect, a stream restart, or a related event on the same Chat (whose tail read
recovers any gap). There is no per-stream liveness probe; socket PING only detects a dead socket.
This is accepted.

Forbidden: periodic reconnects, periodic refetch timers for realtime-covered reads, remount
refetches beyond React Query's normal stale rules, and any client replay.

### Reverting pushed snapshots

Delete `queryPolicy.pushedSnapshot`, `apps/website/src/lib/pushed-snapshot-coverage.ts`, and
`pushed-snapshot.test.ts` (from e8108e72e and 3e81fecad). `chat.list`,
`cloudAgentWork.listForChat`, `member.list`, `member.get`, and `taskLabel.list` return to
`syncedSnapshot`. Keep from 7a873a99e: lifecycle announcements for channel delete and new Agent
DMs, the `deleted`-reaches-every-member rule, and the member → `chat.list` invalidation. The
`listForChat` cancel-before-invalidate guard is subsumed by the coalescer.

### Perf gates

`e2e/tests/idle-silence.spec.ts`, the render-budget lane, `query-polling-contract.test.ts`, and
`query-policy-contract.test.ts` stay. An idle visible App makes no requests. The hidden → visible
allowance counts the focus refresh: after more than the focus stale window hidden, showing the
window refetches each active read at most once; that allowance is stated per read, never as a
blanket number. `query-policy-contract.test.ts` drops the `pushedSnapshot` registry and asserts no
read uses `staleTime: Infinity` except settled reads that cannot change.

Burst cases join both lanes:

- **Render budget**: a 30-message Agent burst into an open Chat keeps at most one tail read in
  flight plus one follow-up, re-renders only appended rows (existing rows render zero times),
  and a hidden kept tab's transcript does not re-render per message. A reaction burst on one
  message re-renders that row only.
- **Idle silence**: a burst of message + read + follow events produces one `chat.list` request
  per frame; entity invalidations in one tick produce one batched POST; `task.list` /
  `taskLabel.list` events with no mounted task view produce no request.

## Removing `chat_events`

Delete the `chat_events` table (`apps/server/src/postgres/schema/chat-events.ts`),
`servers.last_chat_event_cursor`, `apps/server/src/chats/allocate-event-cursor.ts`,
`read-event-head.ts`, `list-events.ts`, `durable-events.ts`, and the `chat.events` /
`chat.eventHead` / `reminder.changes` procedures, through one checked-in PostgreSQL migration
(drop table, drop column). `bootstrap.ts` drops them too. The migration ships in the same Server
release as the protocol 9 gate, so no protocol 8 client reaches a Server without `chat_events`.

### Feature parity checklist

Every reader of `chat_events` today, and what replaces it. Each slice verifies its rows.

| Feature | Reads `chat_events` today | Replacement | Proof |
| --- | --- | --- | --- |
| App live updates (web, desktop) | `chat.onEvent` + `chat.events`/`eventHead` catch-up | Focused subscriptions; tail reads and entity invalidation; restart + reconnect + focus refetch | App e2e below; `test:app` |
| iPhone live updates | `chat.onEvent` + `HausStoreChatCatchUp.swift` | Focused subscriptions; per-stream restart reloads owned projections | iOS unit tests; Simulator run |
| Agent inbox ordering and paging (`haus inbox check`) | `activity.cursor` = max `chat_events.cursor` of the newest message (`agent-api/inbox-conversations.ts`) | Order by the newest message's `(created_at desc, id desc)`; `activityKey`/`nextBefore`/`before` become an opaque string (base64url of `created_at` ISO + `\u0000` + id); paging selects rows strictly before that tuple | `inbox-conversations` regression tests (below) |
| Idempotent send replay (`chat.send`, Agent send) | `send-message-replay.ts`, `send-agent-message-replay.ts` join the `message.created` row for its cursor | Replay looks the message up by `(serverId, chatId, nonce)`, the same scope as today without the `chat_events` join, and returns the receipt without `eventCursor`; it does not re-publish | Existing replay tests, minus cursor assertions, plus a same-nonce-in-another-Chat case |
| iPhone push | `push/message-push.ts` subscribes to the durable notification stream | Subscribes to the `message.created` topic, in-process and after commit; same `messageNotificationReason` facts. Unchanged best-effort parity: a crash between commit and publish, or a restart with queued sends, loses the push, as today. No durability is claimed. | `push` tests |
| Desktop/web message notifications | live `message.created` + `chat.read` | `chat.onMessageCreated` + `chat.onRead` live events (never on recovery) | `message-notifier` tests |
| Reminder changes | `reminder.changed` rows, `reminder.changes`, `reminder.onEvent` (no current client subscribes) | `reminder.onUpdated` live event; reminder reads recover by refetch | `operator-reminders` tests |
| Task / label events | `task-events.ts`, `task-labels.ts`, `create-task.ts`, `agent-api/task-create.ts` insert rows | Publish `task.changed` / `taskLabel.updated` after commit | `haus-tasks` tests |
| Chat lifecycle | `lifecycle-events.ts` inserts rows (delete survives purge for replay) | Publish `chat.lifecycle` after commit; no replay needed | `haus-chat-durable-events` tests rewritten for topics |
| Cloud Agent work | `cloud-agents/cloud-agent-events.ts` inserts rows | Publish `cloudAgentWork.updated` (ids) after commit | Cloud Agent tests |
| Server delete | `servers/delete-server.ts` deletes the Server's rows | Nothing to delete; streams end with `membership_lost` | `haus-server-delete` test |
| Dev seed | `development/seed-message-events.ts` inserts `message.created` rows so seeded messages page in the inbox | Delete it: inbox ordering reads messages directly | Seeded inbox shows rows in order |

**Inbox cursor tests** (`agent-api/inbox-conversations` regression tests): ordering by newest
message; ties on equal `created_at` broken by id across a page boundary; base64url round-trip of a
key whose id and timestamp survive exactly; a malformed, non-base64url, or over-200-character
`before` rejected as a 400 (never a 500 or an empty page); the newest message of a conversation
deleted between pages (the conversation reorders by its next newest, never duplicates or
vanishes); continuation that walks every page with no duplicate or skipped conversation; muted
channel exclusion.

Agent-visible text does not change. The Agent prompt (`managed-instructions.ts`), Manual
(`agent-manual/src/corpus/cli-families-a.ts`), and `haus inbox check` keep `--before <seq>`: the
`More:` line prints the exact command and the Agent copies it, so the token's shape is invisible.
The Computer CLI (`apps/computer/src/agent-cli/agent-inbox-schemas.ts`, `commands/agent-inbox.ts`
`parseBefore`, `agent-inbox-format.ts`) accepts any non-empty token up to 200 characters and its
tests use string keys. Renaming `<seq>` to `<key>` would be a separate, deliberate prompt change.

## iPhone impact

`apps/ios-swift` ships in the same release. It has its own store and does not mimic React Query;
it adopts the same model in its own shape:

- `HausTransport/AppConfig.swift`: `HausAppProtocol.version` becomes 9.
- **Store shape**: a message entity map keyed by message id (message plus optional Thread
  summary) and, per open transcript (each stack entry, Thread, or inline-reply chain), an ordered
  id list with its paging. Views observe one entity by id. Every list load writes the entities
  it returned, guarded like the App: a load does not overwrite an entity refreshed or marked
  dirty after the load started.
- **Tail read** on `chat.onMessageCreated`: for each open list of that Chat whose newest page is
  loaded, read `chat.messages(afterSequence: tail)` with the list's filter, write entities, and
  append ids; single flight per list with one dirty follow-up.
- **Per-message refresh** on reaction, Thread summary, task, and Cloud Agent events: mark the
  entity dirty and, if a view shows it, read `chat.message`; otherwise refresh it when it next
  appears. Single flight per entity.
- `HausStoreEventStreams.swift`: replace the `chat.onEvent` stream with the focused streams the
  iPhone renders: `chat.onMessageCreated`, `chat.onMessageReactionUpdated`, `chat.onRead`,
  `thread.onFollowUpdated`, `chat.onLifecycle`, `cloudAgentWork.onUpdated`, `task.onChanged`,
  `taskLabel.onUpdated`. **Each stream restarts independently** with the same backoff; one
  ending never restarts the others.
- **On each stream's restart, reload the projections that stream owns and the iPhone has
  loaded**: `chat.onMessageCreated` → tail read of every open stack transcript and the chat
  list; reaction, Thread follow, task, and Cloud Agent streams → mark every loaded entity in
  open transcripts dirty (visible ones refresh), plus parent Thread summaries; `task.onChanged`
  and `taskLabel.onUpdated` → every loaded task lens (`HausStoreMessageLoading.swift`);
  `cloudAgentWork.onUpdated` → active Cloud Agent work; `chat.onLifecycle` and `chat.onRead` →
  the chat list.
- Refusals follow the App's classes: `membership_lost` clears that Server; `role_required` stops
  one stream; `UNAUTHORIZED` refreshes the token and retries.
- Delete `HausStoreChatCatchUp.swift` and the `chat.eventHead` step of
  `HausStoreServerReload.swift`.
- `HausModels`: replace `EventModels.swift`'s union with one `Decodable` per payload (ids only);
  add the `chat.message` model; drop `eventCursor` from `SendReceipt`, `ThreadFollowModels`,
  `TaskModels`, and `ChatReadModels` (gain `advanced`). Update `ChatEventReactionTests`,
  `ChatReadModelsTests`, `ThreadFollowModelsTests`, `TRPCClientTests`,
  `TRPCSubscriptionOutageTests`, and add tests that one stream's failure restarts only that
  stream and reloads only its projections, and that a stale list load does not overwrite a
  newer entity.

## Test plan

The requirement is a test that would have caught the 9.5.0 incident and will catch this class
again. The detector is a deterministic App e2e with a real Server restart (below), running in
`test:app` with no model. The live tracer gains a restart step as a smoke check. There is no
`test:agents` realtime kit: a model-backed observer would add cost and flakiness without
covering anything the e2e does not.

### Deterministic

- `packages/haus-api`: schema tests for every payload, the refusal enum, and `chat.message`
  (landed with the contracts).
- Server: `prepare` rejects a malformed event and the mutation fails before commit; a post-commit
  `publish` failure is logged and the mutation still returns its receipt; the factory skips an
  inaccessible Chat event without ending; a membership loss ends with `hausRefusal:
  'membership_lost'`; Server deletion ends every subscriber's stream with `membership_lost`; a
  role loss on `reminder.onUpdated` ends only that stream with `role_required`; an unexpected
  error ends only that stream and is logged; `deleted` lifecycle reaches a non-member of the Chat;
  reader-only events never reach another member; a rolled-back transaction publishes nothing;
  every member publisher supplies `memberId`; `chat.message` returns the same projection and
  Thread summary as `chat.messages` for the same viewer, returns null for a foreign id, and
  enforces Chat access. One integration test drives a real topic through the factory over a
  WebSocket. Inbox cursor tests above.
- Protocol gate (`apps/server/test/haus-app-protocol.test.ts`): a protocol 8 client gets
  `PRECONDITION_FAILED` on HTTP and on socket subscribe, and the App shows update-required.
- App unit: each stream hook's response; the coalescer (tail single flight, dirty follow-up,
  ordered appends, frame-coalesced invalidations); the seeding guard (each branch); tail-read
  append per list (an inline-reply chain gains only its chain; a gap is filled; duplicates
  dedupe; nonce retirement); one-entity invalidation re-renders one row; refusal classes (role
  refusal clears nothing, membership loss clears only Server-scoped keys of that Server,
  `UNAUTHORIZED` retries); restart policy (`subscription-restart.test.ts`) including restart on
  normal completion; focus refetch honoring the 3-minute window; the subscription budget.

### App e2e: the incident detector

`apps/website/e2e/tests/realtime-server-restart.spec.ts` (new; replaces
`chat-event-recovery.spec.ts`), in `test:app`.

**Harness.** `e2e/start-haus-server.ts` today imports `haus-server.ts` in-process beside its
PostgreSQL cluster and Clerk issuer. It changes to run the Server as a child process (same env,
same port) and to restart only that child on `SIGUSR2`, writing its own pid to
`.context/e2e/<runId>-server.json`. `e2e/support/server.ts` gains `restartHausServer()`: signal,
wait for the old child to exit and the port to answer the Server's health route. PostgreSQL,
Clerk, and the browser session survive, as in a deploy.

**Setup.** A desktop window with kept tabs (`installDesktopBrowserStub`, `openDesktopWindow`):
tab A shows `#all`, tab B (kept, hidden) shows `#product` with a Thread anchor and a Cloud Agent
work Message. A fake Agent sender with no model (`createChannelAgent`,
`createAgentThreadSender`, `e2e/support/agent-cloud-agent.ts`) writes through the Agent API.
`page.routeWebSocket` (as in `e2e/support/agent-thread-recovery.ts`) proxies the socket, and
`recordAppTraffic` records requests and frames.

**Variants**, each ending with the same assertions:

1. **Server restart.** `restartHausServer()` mid-session. While the Server is down or restarting,
   nothing is sent; after it is healthy, the fake Agent posts a reply in `#all`, a reply in
   `#product`'s Thread, and a Cloud Agent work update in `#product`.
2. **Forced subscription error.** No restart. The proxy answers the next
   `chat.onMessageCreated` subscription frame with a tRPC `INTERNAL_SERVER_ERROR` error frame,
   then the fake Agent posts the same three changes.
3. **Refused resubscribe.** `restartHausServer()`, and the proxy answers the first post-restart
   start of `chat.onMessageCreated` with a transient refusal, an `UNAUTHORIZED` error frame and
   then a `FORBIDDEN` frame with no `hausRefusal` (the shape a transiently failing membership
   check took), before letting the next start through.

**Assertions**: tab A shows the reply with no reload; revealing tab B shows the Thread summary
(reply count and preview) and the updated Cloud Agent row with no reload, and opening the Thread
shows the reply; only the failed stream resubscribed in variants 2 and 3 (sibling subscription
ids never stopped; no `ws-open` in variant 2); only owned reads were requested (tail read,
`chat.message` entries, `chat.list`, `chat.search`; no `task.list`, member, or Computer read);
the Server's caches were not cleared in variant 3; no `chat.onEvent`, `chat.events`,
`chat.eventHead`, or `server.onUpdate` appears in traffic. Two convergence cases run on the
variant 1 page: a `chat.onMessageCreated` frame replayed twice, and two reaction frames delivered
in reverse order, end with one copy of the message and the Server's final reactions. An open
inline-reply chain shows its new reply and no unrelated messages.

**Why it fails on origin/main.** On `origin/main` the App's only Chat stream is `chat.onEvent`,
mounted in `hooks/servers/chat-events/use-chat-event-stream.tsx` with
`hausTrpc.chat.onEvent.useSubscription` and only `onData` and `onStarted` handlers: no `onError`,
no restart. tRPC's `useSubscription` moves to its error state on the first error frame and never
resubscribes. Variants 2 and 3 deliver exactly that error frame, so the stream is dead and the
`chat.events` catch-up in `onStarted` never runs again. Nothing else heals the views:
`chat.list`, `cloudAgentWork.listForChat`, and the other covered reads use `pushedSnapshot`
(`staleTime: Infinity`, e8108e72e), and a kept tab neither refocuses nor remounts, so tab A
never shows the reply and tab B's Thread summary and Cloud Agent row stay stale. Variant 3 is
the deploy shape: the socket reconnects after the restart and the resubscribe is refused once.
Variant 1 alone may pass on `origin/main` when the first resubscribe succeeds (its catch-up walk
recovers); it guards the new code's restart path, while variants 2 and 3 are the incident
detectors. The slice proves this by running the spec, ported to `chat.onEvent`, against an
`origin/main` checkout and recording the failure.

`idle-silence.spec.ts` keeps passing with no allowance for removed procedures.

### Live tracer (smoke)

`bun run test:tracer` (`apps/website/agent-e2e/tests/live-tracer.spec.ts`) gains a restart step
using the dev stack restart control: `scripts/run-dev-stack.mjs` restarts its Server child on
`SIGUSR2` and records its pid in `.context/dev-stack/<worktree>.json`. A mention to a fixture
Agent from a kept desktop tab, the Server restarted mid-turn, and the reply landing in that tab
with no reload. It is a smoke check of the real deploy path, not the detector.

Docs: `docs/operations/testing.md` names the restart control and the incident detector spec;
`docs/api/realtime.md` is rewritten to point here.

## Slice file map

| Slice | Owns |
| --- | --- |
| API (done) | `packages/haus-api/src/{realtime-events,chat-events,chat-message-read,chat,chat-read,chat-message-receipts,chat-message-reactions,task,cloud-agent,reminders,agent-inbox-conversations,app-protocol,index}.ts`, `openapi.yaml`, `src/generated/openapi.d.ts` |
| Server | `apps/server/src/realtime/` (new), every publish call site above, `haus-api/*/on-*.ts` procedures and routers, `chat.message` procedure, `server/membership-loss.ts` + tRPC `errorFormatter`, `chats/` event files, `push/`, `agent-api/inbox-conversations.ts`, send replay, schema + migration, `development/seed-message-events.ts`, `apps/server/test/*` |
| App | `apps/website/src/hooks/realtime/`, `lib/targeted-read-coalescer.ts`, the transcript reshaping files above, `hooks/servers/chat-events/` (deleted), `use-server-events.ts` (split), `hooks/servers/membership-*`, notifications, `lib/query-*`, `lib/pushed-snapshot*`, server shell, desktop focus bridge |
| App e2e | `apps/website/e2e/start-haus-server.ts`, `e2e/support/server.ts`, `e2e/tests/realtime-server-restart.spec.ts`, `e2e/tests/chat-event-recovery.spec.ts` (deleted) |
| Computer | `apps/computer/src/agent-cli/{agent-inbox-schemas,agent-inbox-format}.ts`, `commands/agent-inbox.ts` and tests |
| iPhone | `apps/ios-swift` files listed above |
| Live tracer | `scripts/run-dev-stack.mjs`, `apps/website/agent-e2e/` |

## Review log

Codex adversarial review of the first draft (2026-10-09), and dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Role refusals and `UNAUTHORIZED` conflated with membership loss | Adopted: `hausRefusal` classes (`membership_lost`, `role_required`); `UNAUTHORIZED` refreshes and retries; role-gated streams mount only for authorized roles. |
| 2 | Cross-stream ordering races on patched projections; version mutable projections | Adapted: resolved by the normalized transcript cache. Events carry ids only; each message is its own `chat.message` entry, invalidated on change, so the Server read is the truth and no versioning is needed. List seeding cannot overwrite a newer entity (`startedAt` guard). |
| 3 | Thread unread patching not idempotent or gap-safe | Adapted: resolved by the normalized cache. The Thread summary lives on the anchor's entity and is invalidated, then reread with the Server's per-viewer rule. |
| 4 | Gap rule invalid for filtered transcript queries | Adapted: resolved by the normalized cache. Each list tail-reads with its own filter; a gap is filled by the same read, with no contiguity rule. |
| 5 | iOS recovery omits owned reads, restarts the whole unit | Adopted: independent per-stream restart, owned-projection reload, `taskLabel.onUpdated` added, entity map plus id lists. |
| 6 | `publish` can fail after commit | Adopted: `prepare` validates before commit; `publish` never throws to the caller. |
| 7 | No protocol-version gate | Adopted: App protocol 9; protocol 8 clients get `PRECONDITION_FAILED`, tested. |
| 8 | `staleTime` schedules nothing | Adopted: triggers stated explicitly, restart on normal completion, residual limitation documented. |
| 9 | Server-wide topology unspecified | Adopted: `server`/`member` streams for every Server, feature streams for the active Server, subscription budget test. |
| 10 | Membership-loss cache clearing incomplete | Adopted: Server-scoped key predicate with tested exceptions. |
| 11 | Lost batching, inactive task refetches | Adopted: shared coalescer, `refetchType: 'active'`, entity invalidations batched by `httpBatchLink`, burst cases in render-budget and idle-silence. |
| 12 | Wrong mappings: skill import, member ids, Server deletion | Adopted: skills/workspace → `agent.onUpdated`; `memberId` required; deletion is membership loss (no `deleted` action, no factory special case). |
| 13 | Push durability overstated | Adopted: documented as unchanged best-effort parity. |
| 14 | Tests do not isolate guarantees; model-backed realtime kit disproportionate | Adopted: a deterministic e2e with a real Server restart, a forced subscription error, and a refused resubscribe replaces the live realtime kit; it states why it fails on `origin/main`. One factory integration test kept; the live tracer keeps only a restart smoke step. |
| 15 | Inbox cursor boundary tests; preserve nonce lookup scope | Adopted: boundary tests listed; replay keeps `(serverId, chatId, nonce)`. |
