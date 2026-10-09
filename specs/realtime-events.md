---
summary: Normative contract for focused realtime events — one tRPC subscription per event type, id-only notifications, a normalized per-message transcript cache answered by tail reads, entity invalidation, read generations, and bulk list recovery, explicit refusal classes, React Query recovery, and the removal of the chat_events log.
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
slices implement against this document. **One release gate**: protocol 9
(`packages/haus-api/src/app-protocol.ts`), the Server cutover (topics, procedures, `chat_events`
migration), the web/desktop App, and the iPhone app ship in the same release. Until then the
split (`@haus/api` at 9, `apps/ios-swift/Sources/HausTransport/AppConfig.swift` at 8) is a
branch state that must not ship. Older clients get `PRECONDITION_FAILED` and the
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
| `chat.onMessageCreated` | `messageCreatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `sequence`, `threadAnchorMessageId` (Thread reply only), notification facts `authorUserId`, `conversationKind`, `mentionedUserIds`, `replyToAuthorUserId`, `threadAnchorAuthorUserId` | Chat access (`findChatAccess`) | **Tail read** every cached transcript list for `chatId` (Thread panel included); for a Thread reply **invalidate** the `threadAnchorMessageId` entry in `parentChatId` (its summary); **invalidate** `chat.list`, `chat.search` |
| `chat.onMessageReactionUpdated` | `messageReactionUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId` | Chat access | **Invalidate** the `chat.message` entry, `chat.search`, `cloudAgentWork.listActive`, `task.list` |
| `chat.onRead` | `chatReadEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `sequence`, `threadAnchorMessageId` (Thread read only, paired with `parentChatId`) | The reader only | **Invalidate** `chat.list`, skipped when the settled list already shows zero unread for the Chat (or a Thread's parent). A Thread read also invalidates the `threadAnchorMessageId` entry (its summary's unread count); no cached Thread context needed |
| `thread.onFollowUpdated` | `threadFollowUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `threadChatId`, `parentChatId`, `anchorMessageId`, `followed` | The follower only | **Invalidate** the anchor's `chat.message` entry, `chat.list` |
| `chat.onLifecycle` | `chatLifecycleEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `action` (`created`, `updated`, `archived`, `unarchived`, `deleted`) | Chat access, except `deleted`, which reaches every Server member (7a873a99e) | **Invalidate** `chat.list`, `chat.listArchived`, `chat.get` (chatId), `agent.chats` |
| `task.onChanged` | `taskChangedEventSchema` (`task.ts`) | `serverId`, `chatId`, `messageId`, `kind` (`created`, `updated`) | Chat access of `chatId` | **Invalidate** the `chat.message` entry, `task.list` |
| `taskLabel.onUpdated` | `taskLabelUpdatedEventSchema` (`task.ts`) | `serverId`, `labelId` | Every member | **Invalidate** `taskLabel.list`, `task.list`, and every cached `chat.message` entry whose `message.task.labels` contains `labelId` (labels are embedded rows) |
| `cloudAgentWork.onUpdated` | `cloudAgentWorkUpdatedEventSchema` (`cloud-agent.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `workId` | Chat access | **Invalidate** the work Message's `chat.message` entry, `cloudAgentWork.listForChat` (chat and parent), `cloudAgentWork.listActive` |
| `reminder.onUpdated` | `reminderUpdatedEventSchema` (`reminders.ts`) | `serverId`, `reminderId`, `ownerAgentId`, `action` (`scheduled`, `updated`, `snoozed`, `canceled`, `fired`) | Owner/Admin (`requireReminderOperator`), rechecked per delivery | **Invalidate** `reminder.list` (agentId), `reminder.runs`, `reminder.history` (agentId) |

Every invalidation in this document uses `refetchType: 'active'`: active reads refetch, inactive
reads are only marked stale and refetch when next observed.

**Derived dependencies.** An entity embeds projections of other rows, so a change invalidates
every cached entry that embeds it. The cache scan runs over cached `chat.message` data of the
event's Server. Message edit and delete do not exist yet; when added they are id-only events
bound by these rows.

| Change | Also invalidate or prune |
| --- | --- |
| Task label renamed, recolored, or deleted | Entities whose `message.task.labels` contains the label |
| Thread reply created, edited, or deleted | The anchor entity in the parent Chat (summary count and preview) |
| Thread read or follow | The anchor entity (per-viewer `unreadCount`, `followed`) |
| Message edited (future) | Its entity; entities whose reply context quotes it; its anchor if it is a Thread reply; `chat.search` |
| Message deleted (future) | Remove its entity; prune its id from every cached list variant of its Chat (transcript, each `replyRootMessageId` chain, Thread panel); entities quoting it; its anchor if a Thread reply; `chat.list`, `chat.search`. A prune bumps each list's generation (below) |

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

**`server.onUpdated` is the membership sentinel.** A stream rechecks membership only when its own
topic delivers, so streams do not end independently on a membership loss. Every publish that can
revoke membership also publishes `server.updated`: `server/delete` (after revoking every
membership and writing the tombstone) and `member/departure-signals`. The sentinel's
per-delivery recheck fails and that one stream ends with `membership_lost`. Its App handler runs
the Server-wide membership-loss path (below): it closes every sibling stream of that Server
client-side, clears the Server's caches, invalidates `server.list`, and routes away if the Server
was active. A sibling that happens to end with `membership_lost` first (its own delivery or
restart) runs the same idempotent path. No `deleted` action exists and the factory has no
deletion special case.

**Member events always name the member.** Every publisher supplies `memberId`: `change-role` (the
target), `departure-signals` (the departed member), `profile-signals`, and `invitation/accept`
(the new member).

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
reactions, tasks, and work touch one message, and only entries observed in the visible band
refetch. Recovery never fans out per entity: it refetches list pages (below).
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
| `server/delete` | `server.updated` (delivered to nobody; ends each `server.onUpdated` with `membership_lost`) |
| `member/change-role`, `member/profile-signals` | `member.updated` (with `memberId`; `change-role` gains it) |
| `member/departure-signals` | `member.updated` (with the departed `memberId`) and `server.updated` (the sentinel ends the departed member's `server.onUpdated`) |
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
- **Subscription budget** per window, counted from the tables above:

  | Group | Streams | Count |
  | --- | --- | --- |
  | Every accessible Server | `server.onUpdated`, `member.onUpdated` | 2 × accessible Servers |
  | Active Server, every role | `agent`, `computer`, `mcp`, `cloudAgentSettings` `.onUpdated`; `chat.onMessageCreated`, `chat.onMessageReactionUpdated`, `chat.onRead`, `thread.onFollowUpdated`, `chat.onLifecycle`, `task.onChanged`, `taskLabel.onUpdated`, `cloudAgentWork.onUpdated` | 12 |
  | Active Server, Owner/Admin only | `reminder.onUpdated`, `invitation.onUpdated` | 2 |
  | Active Server, kept Server-rooted | `agent.onLifecycle`, `agent.onActivity` (one mount each per window; the slice hoists duplicates) | 2 |
  | Per mounted Chat view (shown or kept, at most 5 kept) | `chat.onEngagement`, `chat.onThought`, `chat.onComposition` | 3 × mounted Chat views |
  | Per open turn journal | `agent.onExecutionJournal` | 1 each |

  A unit test mounts the shell with three Servers, one shown and one kept Chat view, as a member
  and as an Admin, and asserts the exact count (6 + 14 + 6 = 26 as a member; 28 as an Admin),
  and that a reconnect issues no per-stream start reads beyond the reconnect pass.

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
  `replyRootMessageId` chain, the Thread panel `threadMessagesQueryKey`). A list keeps, per page,
  the ordered message ids plus its paging (`nextBeforeSequence`, `nextAfterSequence`,
  `scannedThroughSequence`) and, for each id, the immutable layout facts the row model groups by
  (sequence, author identity, `createdAt`, reply root). The slice confirms that set against
  `features/chats/chat-transcript-row-model.ts` and `chat-transcript-item-utils.ts`; nothing
  mutable (reactions, task, work body, Thread summary) stays on the list.
- **Message entities**: `chat.message({ serverId, chatId, messageId })`, one entry per message,
  holding `{ message, thread }`. Rows render by id through `useChatMessage(serverId, chatId, id)`
  (`hooks/servers/use-chat-message.ts`), so a row re-renders only when its own entry changes, the
  same per-row read pattern as 0c90d33b7.
- **Search results are not transcript lists.** `chat.search` rows come from a projector that
  reads neither tasks nor Thread summaries (`chats/search-messages.ts`), so they stay their own
  rows in the search query and **never seed** `chat.message`. Search is invalidated, never
  patched.

**Entity query policy.** `queryClient.setQueryDefaults` on the `chat.message` key family (not the
hook's options: `setQueryData` builds a query from the client defaults, never from a hook) sets
`staleTime: Infinity`, `gcTime: 30 min`, `refetchOnWindowFocus: false`, and
`refetchOnReconnect: false`. Entities are kept fresh by targeted invalidation and list reseeding
only; the reconnect pass (`query-reconnect-recovery.ts`) excludes the family by key predicate, and
`query-policy-contract.test.ts` names it as the one `staleTime: Infinity` exception for a
changing read. An entity refetches only when invalidated while observed, or when an observing
row finds it missing (never seeded, or garbage-collected while its list stayed cached): the row
then fetches it with `chat.message` like any query without data.

**Observation follows the visible band.** `transcript-render-window.ts` keeps its contract that
rendered rows join and never leave (scroll anchoring and measured heights depend on it), and gains
a second, separate set: the **observed band**, the rows within one viewport of the visible range
(the same `overscanMargin`), tracked by an `IntersectionObserver` that reports both entering and
leaving. A rendered row observes its entity (`useQuery` `subscribed: true`) only while in the
band; outside it the row keeps rendering its last entity snapshot with `subscribed: false`, so it
is not an active observer and an invalidation only marks the entry stale. Re-entering the band
subscribes and fetches once if the entry is invalidated or missing. A hidden kept view
(`kept-chat-views.tsx`, up to 5) calls the window's `disconnect()`, which empties its band, so
hidden views observe no entities; `connect()` on reveal re-derives the band. Active entity
observers per window are therefore bounded by the band rows of the shown views, independent of
scroll distance and kept-view count.

**Seeding.** Only canonical projections seed: `chat.messages` pages and tail reads (their
`{message, threads[]}` from `chats/list-messages.ts`) and `chat.message` itself. A list seeds its
entities in one batch inside its `queryFn` before returning ids: one `queryClient.setQueryData`
per message inside a single `notifyManager.batch`, with the message and its Thread summary (or
null). A 50-message page issues zero entity requests. Whether a given entity is seeded is decided
by read generations.

**Read generations.** `apps/website/src/lib/read-generations.ts` replaces timestamp comparison
(no `Date.now()` ordering; two operations in one millisecond still order). It is one monotonic
counter plus a dirty mark per key:

| Operation | Effect |
| --- | --- |
| `bump(key)` | Sets the key's mark to the next counter value. Keys are list keys, entity keys (including entities with no cache entry yet), and one key per Server. |
| `begin()` | Returns the current counter as the read's token. Called before every initial, full, next-page, tail, and entity read. |
| `isDirtySince(key, token)` | True when the key was bumped after the token. |
| Pruning | A mark older than every in-flight read's token is dropped, so absent-entity marks do not accumulate. |

Who bumps and how each read commits:

| Read | Bumped by | On result, if its key is unchanged | If dirty since its token |
| --- | --- | --- | --- |
| Entity (`chat.message`) | Every invalidation of that entity (reaction, task, work, Thread summary, label, edit) | Commit | Discard and re-read once inside the same `queryFn`, then commit |
| List initial / full / next page | `chat.onMessageCreated` for that list's Chat, a tail append to it, a prune | Commit ids | Commit ids, then schedule exactly one tail read (one full refetch instead if the dirt includes a prune) |
| List tail | Same as above | Append ids | Append ids, then exactly one follow-up tail read |
| Any list's per-entity seed | That entity's key | Seed | Skip that entity; if observed, invalidate it so it fetches |
| Any commit or seed | That Server's key (membership loss) | — | Drop everything (below) |

So a `chat.onMessageCreated` that arrives while a list's initial read is in flight bumps the
list, and the initial result is followed by a tail read; a reaction on a message not yet cached
bumps an absent key, and an older list response cannot seed stale reactions over it.

**New messages: tail read.** On `chat.onMessageCreated`, bump each cached transcript list for
`chatId` (and lists with an in-flight initial read), then for each list with data:

- If its newest page is not loaded (`nextAfterSequence` is not null): mark it stale when
  inactive, do nothing when active (a list scrolled into history refetches on return).
- If its `scannedThroughSequence` is at or past the event's `sequence`, do nothing.
- Otherwise read `chat.messages({ ...sameFilter, afterSequence: scannedThroughSequence })`, seed
  the entities, append the ids to the newest page deduplicated by id in sequence order, and store
  the result's `scannedThroughSequence`. If it reports more, read again until caught up. A
  filtered list (an inline-reply chain) resumes after what its last scan examined, never after
  its last match, so it does not rescan; it gains only its own messages; a missed event's gap is
  filled by the same read with no contiguity rule.
- **Page rollover**: when the newest page reaches the page limit (50 ids), the next append opens
  a new page whose page param is `{ afterSequence: <previous page's scannedThroughSequence> }`, so
  a full refetch re-reads every page at page size and no page grows past the limit. Transcript
  lists set `maxPages: 8`; scrolling past drops the far end, which refetches when scrolled back.

**Changed messages: invalidate the entity.** Reaction, Thread summary (reply, read, follow), task,
label, and Cloud Agent work events bump and invalidate the affected `chat.message` entries with
`refetchType: 'active'`. Rows in the observed band refetch (one batched POST per tick); the rest
go stale.

**Pending rows retire by nonce.** `features/servers/chat/use-pending-messages.ts` retires an
optimistic row when a seeded entity in that Chat carries its nonce (the tail read seeds the
durable row), exactly as a full refetch did before. Nothing writes optimistic content into the
entities or the id lists. **Optimistic reactions** keep today's app-local overlay in
`use-chat-message-reaction.ts`: the overlay renders over the entity and clears when the mutation
settles; there is no entity write and no snapshot rollback, so a realtime refresh or a concurrent
toggle is never overwritten by a stale snapshot.

**Concurrency.** `apps/website/src/lib/targeted-read-coalescer.ts` owns tail reads, list
recovery, and every realtime invalidation, and consults read generations:

- Single flight per list key for tail reads and recovery refetches; a dirty result schedules
  exactly one follow-up (table above). Appends commit in request order; a full refetch of the
  list supersedes pending tail reads for it.
- Entity reads are single flight by React Query; the generation check covers an older HTTP
  response that lands after a newer invalidation (a cancelled request whose batched response
  still arrives).
- Invalidations are coalesced per key within one animation frame across all hooks, so a
  message + read + follow burst produces one `chat.list` refetch, and several streams restarting
  together refetch each transcript list once.
- The coalescer's frame scheduling is registered in the timer/polling allowlist
  (`query-polling-contract.test.ts`).

### Transcript reshaping (App slice)

The slice moves the transcript from page-held rows to id lists plus entities:

- `hooks/servers/use-chat-messages.ts`: `chatMessagesQueryOptions` seeds entities in `queryFn`
  and stores id pages; `mergeChatMessagePages` returns ordered ids and layout facts, not
  messages and `threads`. `useThreadMessages` (`hooks/servers/use-thread-messages.ts`) and
  `use-thread-inline-replies.ts` take the same shape.
- `hooks/servers/use-chat-message.ts` (new): `useChatMessage` reads one entity under the family
  defaults above and takes the row's band state as `subscribed`; `chat-message-entities.ts` (new)
  owns the key, `setQueryDefaults` registration, seeding, and the derived-dependency scans;
  `lib/read-generations.ts` (new) owns generations.
- `features/chats/transcript-render-window.ts`: gains the observed band (enter and leave) beside
  the rendered set; `disconnect()` empties the band.
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
  `use-chat-message-reaction.ts` (keeps its local overlay; reads the entity underneath),
  `hooks/threads/use-thread-anchor.ts`, `features/servers/chat/use-chat-typing-ends.ts`,
  `features/servers/chat/chat-view.tsx`, `features/servers/thread/thread-content.tsx`,
  `routes/app/desktop-tab-pages.tsx`, and `test-support/transcript-render-harness.tsx`.
- `hooks/servers/chat-events/` is deleted with the union stream.

`features/servers/chat/transcript-render-isolation.test.tsx` gains the core render assertion:
invalidating one entity re-renders exactly that row.

## Refusal classes

| Signal | Meaning | App action |
| --- | --- | --- |
| `FORBIDDEN` + `hausRefusal: 'membership_lost'` | The viewer is no longer a member, or the Server was deleted | Final for every stream of that Server. Run the membership-loss path once (below): close sibling streams, clear the Server's caches, fall back to unavailable if it was active; invalidate `server.list`. |
| `FORBIDDEN` + `hausRefusal: 'role_required'` | The viewer lacks the stream's role | Stop that one stream. No cache clear. It remounts if a role change makes it authorized. |
| `UNAUTHORIZED` | The Clerk session token expired or was rejected | Refresh the token and reconnect, then restart with backoff. Final only when Clerk confirms sign-out. |
| `FORBIDDEN` or `NOT_FOUND` with no `hausRefusal`, or anything else | Not a refusal | Restart with backoff like any error. |

**Membership-loss path**, idempotent per Server, in order:

1. `bump(server key)` in read generations, so every list, tail, and entity read already in flight
   for that Server drops its commit and seeds when it lands.
2. Close every sibling stream of that Server client-side (the sentinel topology above).
3. Remove every query Server-scoped to `serverId`: a validated predicate over the tRPC query key's
   `input.serverId`, App query keys that embed the Server id, and `server.bySlug`, whose key holds
   only `{ slug }` (`hooks/servers/use-server.ts`), matched by cached result identity
   (`data.id === serverId`). An explicit, tested exception list keeps global data
   (`server.list`, account and settings reads). This replaces the family list in
   `hooks/servers/membership-caches.ts`.

Tests: one query per Server-scoped family across two Servers, only the lost Server's removed,
`server.bySlug` included; a list read in flight across the loss lands and seeds nothing.

## Recovery

`staleTime` alone schedules nothing: React Query marks an observed read stale but refetches only
on a trigger. These are the triggers.

| Trigger | Action |
| --- | --- |
| Stream error or completion | Any end that is not a refusal, including a normal completion, restarts that one stream with capped exponential backoff (1 s → 30 s; `hooks/realtime/subscription-restart.ts`). Siblings are untouched. When the restarted stream starts (`restart.started()` returns true) it recovers only its owned reads through the coalescer: the message, reaction, read, follow, task, and work streams **bulk-refetch the active Server's cached transcript lists** (below) plus their own non-entity reads (`chat.list`, `chat.search`, `task.list`, Cloud Agent lists per their table rows); `taskLabel.onUpdated` refetches `taskLabel.list` and `task.list`; Server-level streams invalidate their table row. |
| Socket reconnect | The App-wide reconnect pass (`query-reconnect-recovery.ts`) refetches every active Server tRPC read once **except the `chat.message` family**; active transcript lists refetch in bulk. Root streams do not recover again on that start. `streamRecoveredReads` shrinks to the volatile streams (`agent.onActivity`, `agent.onLifecycle`, `chat.onEngagement`), whose live projections still re-read on every start. |
| Window focus (browser `visibilitychange`/`focus`, and Electron `BrowserWindow` focus through the desktop bridge into `focusManager`) | Refetch active reads whose data is older than the focus stale window, **3 minutes**; `chat.message` never refetches on focus, transcript lists refetch in bulk. A quick alt-tab is silent. |
| Mount or observe | A read older than `queryPolicy.syncedSnapshot` (30 s) refetches on mount, as React Query normally does. Inactive reads marked stale by an event refetch here. An entity refetches on observe only when invalidated or missing. |

**Bulk list recovery.** Entities are never recovered one by one. Recovery refetches each
transcript list's loaded pages (at most `maxPages`, each at page size by the rollover rule)
through the canonical projector; each page reseeds its entities under the generation rules,
which also refreshes parent Thread anchors after a missed Thread reply or a cross-device read.
Active lists refetch now; inactive lists are marked stale. Cost is bounded by
`lists × maxPages` page reads and zero `chat.message` requests.

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

Cache budgets (render-budget lane, numbers asserted exactly where the design fixes them):

| Case | Budget |
| --- | --- |
| Long scroll: 2,000-message transcript scrolled end to start and back | Active `chat.message` observers never exceed the observed band's rows; transcript list holds at most 8 pages; a reaction burst on scrolled-past messages issues zero requests |
| 5 kept views, one shown | Hidden views observe zero entities; an invalidation of a message in a hidden view issues no request until reveal |
| Focus after the stale window, 5 kept views scrolled deep | Requests are only transcript page reads (at most `views × maxPages`) and the other active reads, each once; zero `chat.message` requests |
| Heap | After the long scroll and kept-view eviction, advancing past `gcTime` returns the `chat.message` entry count to the shown views' cached ids, and the CDP heap delta stays under the lane's recorded baseline plus margin |

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
| Server delete | `servers/delete-server.ts` deletes the Server's rows | Nothing to delete; `server.onUpdated` ends with `membership_lost` and the App closes the siblings | `haus-server-delete` test |
| Dev seed | `development/seed-message-events.ts` inserts `message.created` rows so seeded messages page in the inbox | Delete it: inbox ordering reads messages directly | Seeded inbox shows rows in order |

**Inbox cursor tests** (`agent-api/inbox-conversations` regression tests): ordering by newest
message; ties on equal `created_at` broken by id across a page boundary; base64url round-trip of a
key whose id and timestamp survive exactly; a malformed, non-base64url, or over-200-character
`before` rejected as a 400 (never a 500 or an empty page); continuation over **stable data**
walks every page with no duplicate or skipped conversation; muted channel exclusion. The cursor
is stateless, so no-duplicate/no-skip is guaranteed only for stable data: when a conversation's
newest message is deleted or a new one arrives between pages, the conversation legitimately
reorders and may appear again or move above the cursor. That is accepted; one test pins it (a
deletion between pages reorders the conversation by its next newest message without an error).

Agent-visible text does not change. The Agent prompt (`managed-instructions.ts`), Manual
(`agent-manual/src/corpus/cli-families-a.ts`), and `haus inbox check` keep `--before <seq>`: the
`More:` line prints the exact command and the Agent copies it, so the token's shape is invisible.
The Computer CLI (`apps/computer/src/agent-cli/agent-inbox-schemas.ts`, `commands/agent-inbox.ts`
`parseBefore`, `agent-inbox-format.ts`) accepts any non-empty token up to 200 characters and its
tests use string keys. Renaming `<seq>` to `<key>` would be a separate, deliberate prompt change.

## iPhone impact

`apps/ios-swift` ships in the same release. It has its own store and does not mimic React Query;
it adopts the same model in its own shape:

- `HausTransport/AppConfig.swift`: `HausAppProtocol.version` becomes 9 (today 8; the release
  gate above).
- **Store shape**: a message entity map keyed by message id (message plus optional Thread
  summary) and, per open transcript (each stack entry, Thread, or inline-reply chain), an ordered
  id list with its paging and `scannedThroughSequence`. Views observe one entity by id. Only
  canonical `chat.messages` / `chat.message` projections write entities; search results stay
  separate. Writes follow the App's read-generation rules: a monotonic counter with marks per
  list, per entity (absent ones included), and per Server; a load commits or writes an entity
  only when its key is unchanged since the load began, otherwise it runs one follow-up read.
- **Tail read** on `chat.onMessageCreated`: bump the Chat's lists (including one whose initial
  load is in flight), then for each open list whose newest page is loaded, read
  `chat.messages(afterSequence: scannedThroughSequence)` with the list's filter, write entities,
  and append ids; single flight per list with one dirty follow-up. A Thread reply also refreshes
  its `threadAnchorMessageId` entity.
- **Per-message refresh** on reaction, Thread summary (reply, read via `threadAnchorMessageId`,
  follow), task, label (entities whose task carries the label), and Cloud Agent events: bump the
  entity and, if a view shows it, read `chat.message`; otherwise refresh it when it next
  appears. Single flight per entity.
- `HausStoreEventStreams.swift`: replace the `chat.onEvent` stream with the focused streams the
  iPhone renders: `chat.onMessageCreated`, `chat.onMessageReactionUpdated`, `chat.onRead`,
  `thread.onFollowUpdated`, `chat.onLifecycle`, `cloudAgentWork.onUpdated`, `task.onChanged`,
  `taskLabel.onUpdated`. **Each stream restarts independently** with the same backoff; one
  ending never restarts the others.
- **On each stream's restart, reload the projections that stream owns and the iPhone has
  loaded**: message, reaction, read, Thread follow, task, and Cloud Agent streams → reload every
  open transcript list's loaded pages (bulk, which rewrites entities and parent Thread anchors;
  never per-entity) and the chat list; `task.onChanged`
  and `taskLabel.onUpdated` → every loaded task lens (`HausStoreMessageLoading.swift`);
  `cloudAgentWork.onUpdated` → active Cloud Agent work; `chat.onLifecycle` and `chat.onRead` →
  the chat list.
- Refusals follow the App's classes: `membership_lost` bumps the Server generation, stops that
  Server's streams, and clears it; `role_required` stops one stream; `UNAUTHORIZED` refreshes the
  token and retries.
- Delete `HausStoreChatCatchUp.swift` and the `chat.eventHead` step of
  `HausStoreServerReload.swift`.
- `HausModels`: replace `EventModels.swift`'s union with one `Decodable` per payload (ids only);
  add the `chat.message` model; drop `eventCursor` from `SendReceipt`, `ThreadFollowModels`,
  `TaskModels`, and `ChatReadModels` (gain `advanced`). Update `ChatEventReactionTests`,
  `ChatReadModelsTests`, `ThreadFollowModelsTests`, `TRPCClientTests`,
  `TRPCSubscriptionOutageTests`, and add tests that one stream's failure restarts only that
  stream and reloads only its projections, that a stale list load does not overwrite a newer
  entity (absent-entity case included), and that a missed Thread reply refreshes the parent
  anchor after restart.

## Test plan

The requirement is a test that would have caught the 9.5.0 incident and will catch this class
again. The detector is a deterministic App e2e with a real Server restart (below), running in
`test:app` with no model. The live tracer gains a restart step as a smoke check. There is no
`test:agents` realtime kit: a model-backed observer would add cost and flakiness without
covering anything the e2e does not.

### Deterministic

- `packages/haus-api`: schema tests for every payload, the refusal enum, `chat.message`, the
  Thread read anchor pairing, and `scannedThroughSequence` (landed with the contracts).
- Server: `prepare` rejects a malformed event and the mutation fails before commit; a post-commit
  `publish` failure is logged and the mutation still returns its receipt; the factory skips an
  inaccessible Chat event without ending; a membership loss ends with `hausRefusal:
  'membership_lost'`; Server deletion and member departure each publish `server.updated`, which
  ends the affected `server.onUpdated` with `membership_lost` (other topics end only on their own
  next delivery); a role loss on `reminder.onUpdated` ends only that stream with
  `role_required`; an unexpected error ends only that stream and is logged; `deleted` lifecycle
  reaches a non-member of the Chat; reader-only events never reach another member; a Thread
  read carries its anchor; a rolled-back transaction publishes nothing; every member publisher
  supplies `memberId`; `chat.message` returns the same projection and Thread summary as
  `chat.messages` for the same viewer, returns null for a foreign id, and enforces Chat access;
  a filtered `chat.messages` tail read reports `scannedThroughSequence` past its last match. One
  integration test drives a real topic through the factory over a WebSocket. Inbox cursor tests
  above.
- Protocol gate (`apps/server/test/haus-app-protocol.test.ts`): a protocol 8 client gets
  `PRECONDITION_FAILED` on HTTP and on socket subscribe, and the App shows update-required.
- App unit: each stream hook's response; the coalescer (tail single flight, dirty follow-up,
  ordered appends, frame-coalesced invalidations, one bulk refetch per list when several streams
  restart); tail-read append per list (an inline-reply chain gains only its chain and resumes
  from `scannedThroughSequence`; a gap is filled; duplicates dedupe; page rollover at 50; nonce
  retirement); one-entity invalidation re-renders one row; refusal classes (role refusal clears
  nothing; membership loss bumps the Server generation, closes siblings, and clears only that
  Server's keys including `server.bySlug`; `UNAUTHORIZED` retries); restart policy
  (`subscription-restart.test.ts`) including restart on normal completion; focus refetch
  honoring the 3-minute window and skipping `chat.message`; the subscription budget.
- Read generations (`read-generations.test.ts` and the coalescer tests):
  - **Held initial read**: a list's initial read is held; `chat.onMessageCreated` arrives; the
    initial result commits and exactly one tail read follows and appends the message.
  - **Absent entity**: a reaction event bumps a message with no cache entry; an older list read
    lands and does not seed it; the row fetches it on observe.
  - **Stale full read after tail append**: a full refetch starts, a tail read appends, the full
    result lands; the appended ids survive through the one follow-up tail read.
  - **Equal timestamps**: with `Date.now` frozen, a bump and a read begun in the same
    millisecond still order by counter.
  - **Entity re-read**: an entity read lands after a newer bump; it is discarded and re-read once.
  - **Pruning**: marks older than every in-flight token are dropped.
- Projections and dependencies: a search result never seeds (task-anchor and Thread-anchor
  poisoning cases: a later search leaves `task` and `thread` intact); a label update invalidates
  exactly the cached entities carrying it; a Thread read with no cached Thread context refreshes
  the anchor; a missed Thread reply heals the anchor through bulk list recovery; optimistic
  reaction overlay survives a concurrent realtime refresh without rollback.
- Entity policy: `setQueryDefaults` applies `gcTime`, `staleTime`, and no focus/reconnect refetch
  to a seeded-only entry; a GC'd entity whose id is still listed fetches on observe; leaving the
  observed band unsubscribes; a hidden kept view observes nothing.

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

The **three changes** are: a reply in `#all`, a reply in `#product`'s Thread (no new
parent-Chat message), and a Cloud Agent work update in `#product`. The **convergence
assertions** are: tab A shows the reply with no reload; revealing tab B shows the Thread summary
(reply count and preview) and the updated Cloud Agent row with no reload; opening the Thread
shows the reply; no `chat.onEvent`, `chat.events`, `chat.eventHead`, or `server.onUpdate`
appears in traffic.

**A. Procedure isolation** (no Server restart; the socket stays open):

1. Capture the active `chat.onMessageCreated` subscription id from the proxied frames.
2. Inject a tRPC `INTERNAL_SERVER_ERROR` error frame for **that id**, and hold every new
   `chat.onMessageCreated` start at the proxy.
3. While it is held, the fake Agent commits the three changes and the proxy records them
   committed (Agent API receipts).
4. Release the held start.

Assert: the convergence assertions; no `ws-open`; every sibling subscription id kept its id and
delivered while the stream was down (the Cloud Agent work update arrives through
`cloudAgentWork.onUpdated` before the release); between the release and revealing tab B only
owned reads were requested (`chat.messages` pages of the active Server's cached transcript
lists, `chat.list`, `chat.search`; no `chat.message`, `task.list`, member, or Computer read;
tab B's invalidated work entity fetches only on reveal); the parent Thread
summary recovered through the bulk list refetch, not a live event.

**B. Socket reconnect** (the deploy shape):

1. `restartHausServer()` mid-session; the fake Agent commits the three changes while the Server
   is healthy again but before the App's streams have resubscribed (held at the proxy).
2. The proxy answers the first post-restart `chat.onMessageCreated` start with `UNAUTHORIZED`,
   the second with `FORBIDDEN` and no `hausRefusal`, and lets the third through: two consecutive
   refused attempts.

Assert: the convergence assertions; the session token refreshed once and the App did not sign
out; the Server's caches were not cleared; every root stream resubscribed exactly once on the new
socket (siblings are interrupted by the socket, not by the refusal); the reconnect pass issued no
`chat.message` request.

**C. Stale HTTP ordering** (on the B page after recovery): hold the HTTP response of a
`chat.message` read for message M; react to M from another member, which invalidates M and
completes a newer read; release the old response. Assert the row shows the Server's final
reactions. Separately, a `chat.onMessageCreated` frame replayed twice ends with one copy, and two
reaction frames in reverse order converge (event convergence, not HTTP ordering). An open
inline-reply chain shows its new reply and no unrelated messages.

**Why it fails on origin/main.** On `origin/main` the App's only Chat stream is `chat.onEvent`,
mounted in `hooks/servers/chat-events/use-chat-event-stream.tsx` with
`hausTrpc.chat.onEvent.useSubscription` and only `onData` and `onStarted` handlers: no `onError`,
no restart. tRPC's `useSubscription` moves to its error state on the first error frame and never
resubscribes, so the `chat.events` catch-up in `onStarted` never runs again. Nothing else heals
the views: `chat.list`, `cloudAgentWork.listForChat`, and the other covered reads use
`pushedSnapshot` (`staleTime: Infinity`, e8108e72e), and a kept tab neither refocuses nor
remounts. Ported to `chat.onEvent` (inject into its id in A, refuse its starts in B), A and B
leave tab A without the reply and tab B's summary and Cloud Agent row stale.

**Recorded runs are required.** The slice records two runs and links them in the PR: the ported
spec failing on an `origin/main` checkout (A and B), and the final spec passing on the final
branch. A design or harness change that alters either outcome re-records both.

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
| App | `apps/website/src/hooks/realtime/`, `lib/targeted-read-coalescer.ts`, `lib/read-generations.ts`, `features/chats/transcript-render-window.ts`, `features/servers/chat/kept-chat-views.tsx`, `lib/query-reconnect-recovery.ts`, the transcript reshaping files above, `hooks/servers/chat-events/` (deleted), `use-server-events.ts` (split), `hooks/servers/membership-*`, notifications, `lib/query-*`, `lib/pushed-snapshot*`, server shell, desktop focus bridge |
| App e2e | `apps/website/e2e/start-haus-server.ts`, `e2e/support/server.ts`, `e2e/tests/realtime-server-restart.spec.ts`, `e2e/tests/chat-event-recovery.spec.ts` (deleted) |
| Computer | `apps/computer/src/agent-cli/{agent-inbox-schemas,agent-inbox-format}.ts`, `commands/agent-inbox.ts` and tests |
| iPhone | `apps/ios-swift` files listed above |
| Live tracer | `scripts/run-dev-stack.mjs`, `apps/website/agent-e2e/` |

## Review log

Codex adversarial review of the first draft (2026-10-09), and dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Role refusals and `UNAUTHORIZED` conflated with membership loss | Adopted: `hausRefusal` classes (`membership_lost`, `role_required`); `UNAUTHORIZED` refreshes and retries; role-gated streams mount only for authorized roles. |
| 2 | Cross-stream ordering races on patched projections; version mutable projections | Adapted: resolved by the normalized transcript cache. Events carry ids only; each message is its own `chat.message` entry, invalidated on change, so the Server read is the truth and no versioning is needed. List seeding cannot overwrite a newer entity (the `startedAt` guard, replaced by read generations in round 2). |
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

Codex adversarial review, round 2 (2026-10-09), and dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Seeding guard misses absent entities and in-flight initial reads; `Date.now()` cannot order | Adopted: `lib/read-generations.ts`, one monotonic counter with marks per list, entity (absent included), and Server; every read captures a token and commits only if clean, else one follow-up read. Replaces timestamps. Tests for held initial reads, absent entities, stale full reads after tail appends, equal timestamps. |
| 2 | Search seeds incomplete projections | Adopted: only canonical `chat.messages` / `chat.message` projections seed; search rows stay separate and never seed. Poisoning tests. |
| 3 | Thread summary recovery incomplete | Adopted: Thread-reply `message.created` invalidates its anchor; `chat.onRead` carries `threadAnchorMessageId` (contract change); recovery refetches lists, which reseed anchors. |
| 4 | Entity observation and recovery cost unbounded; seed-only entries miss GC policy | Adopted: bulk list recovery, never per-entity; `chat.message` excluded from focus and reconnect refetch via `setQueryDefaults` (`gcTime` 30 min, `staleTime: Infinity`); observation follows a new observed band in the render window (rendered rows still never leave); hidden kept views observe nothing; missing entities fetch on observe; `scannedThroughSequence` (contract change), page rollover, `maxPages: 8`; long-scroll, kept-view, focus, and heap budgets. |
| 5 | Derived data lacks invalidation ownership | Adopted: derived-dependency table; label updates invalidate carrying entities; edit/delete rules for anchors, quotes, list pruning, and search. |
| 6 | Membership cleanup misses `server.bySlug` and late writes; deletion topology claim wrong | Adopted: `server.bySlug` matched by result identity; Server generation bumped before clearing; `server.onUpdated` is the sentinel (departure also publishes `server.updated`) and its handler closes siblings. |
| 7 | e2e not executable as specified | Adopted: split into procedure isolation (error injected into the captured id, mutations committed while held, siblings keep delivering, parent summary recovers), socket reconnect (`UNAUTHORIZED` then uncoded `FORBIDDEN` as consecutive attempts), and stale HTTP ordering; recorded origin/main-fail and final-pass runs required. |
| 8 | Optimistic reaction rollback overwrites newer state | Adopted: keep today's local overlay; no entity write, no snapshot rollback. |
| 9 | Inbox no-duplicate paging impossible under mutation | Adopted: guaranteed for stable data only; reordering under concurrent mutation accepted and tested. |
| 10 | Protocol 9 split across clients | Adopted: one release gate for protocol 9, the Server cutover, App, and iPhone. |
| 11 | Budget numbers and deletion wording wrong | Adopted: budget table counted from the stream tables (26 member / 28 Admin in the test fixture); deletion wording matches the sentinel topology. |
