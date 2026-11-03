---
summary: Normative contract for focused realtime events — one tRPC subscription per event type, id-only notifications, a normalized per-message transcript cache answered by tail reads and entity invalidation, bulk list recovery, explicit refusal classes, React Query recovery, and the removal of the chat_events log.
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
migration), the web/desktop App, and the iPhone app ship in the same release. App and iPhone
protocol versions must both be 9. Older clients get `PRECONDITION_FAILED` and the
update-required screen; there is no compatibility path. Haus 10.0.0 intentionally removes the
old event schema in this cutover with operator approval. Server 8.4.0 cannot be restored by
application rollback after migration 0072; recovery uses a forward fix on the new schema.

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
   normalized cache (one `chat.message` entry per message), so a changed annotation is a plain
   invalidation of one entry. The read is the truth, so duplicate, late, and reordered events
   converge with no versioning.
4. **Messages are append-only.** Haus has no message edit or delete. The only mutable parts of
   an existing message are its annotations: reactions, the Thread summary, the Cloud Agent work
   it links (`message.cloudAgentWork`, projected per linking message), and the task card. Only whole Chats and Servers are deleted.
5. **A failure ends one stream, never the others.** Server-side, an unexpected error ends only
   the subscription it happened in, and is logged. App-side, every subscription restarts
   independently with backoff.
6. **Refusals are explicit.** Only a coded `membership_lost` refusal clears a Server's caches.

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
| `chat.onLifecycle` | `chatLifecycleEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `action` (`created`, `updated`, `archived`, `unarchived`, `deleted`) | Chat access, except `deleted`, which reaches every Server member (7a873a99e) | **Invalidate** `chat.list`, `chat.listArchived`, `chat.get` (chatId), `agent.chats`; `deleted` also runs the Chat-loss purge (Refusal classes) |
| `task.onChanged` | `taskChangedEventSchema` (`task.ts`) | `serverId`, `chatId`, `messageId`, `kind` (`created`, `updated`) | Chat access of `chatId` | **Invalidate** the `chat.message` entry, `task.list` |
| `taskLabel.onUpdated` | `taskLabelUpdatedEventSchema` (`task.ts`) | `serverId`, `labelId` | Every member | **Abort** the Server's tail reads, **cancel and invalidate** its transcript lists; **invalidate** `taskLabel.list`, `task.list`, and every cached `chat.message` entry whose `message.task.labels` contains `labelId` (labels are embedded rows) |
| `cloudAgentWork.onUpdated` | `cloudAgentWorkUpdatedEventSchema` (`cloud-agent.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `workId`; one event per linking message in a live Chat, naming that message | Chat access | **Invalidate** the linking message's `chat.message` entry, `cloudAgentWork.listForChat` (chat and parent), `cloudAgentWork.listActive` |
| `imageGeneration.onUpdated` | `imageGenerationUpdatedEventSchema` (`image-generation.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `generationId`; one event per linking message in a live Chat, naming that message | Chat access | **Invalidate** the linking message's `chat.message` entry |
| `reminder.onUpdated` | `reminderUpdatedEventSchema` (`reminders.ts`) | `serverId`, `reminderId`, `ownerAgentId`, `action` (`scheduled`, `updated`, `snoozed`, `canceled`, `fired`) | Owner/Admin (`requireReminderOperator`), rechecked per delivery | **Invalidate** `reminder.list` (agentId), `reminder.runs`, `reminder.history` (agentId) |

Every invalidation in this document uses `refetchType: 'active'`: active reads refetch, inactive
reads are only marked stale and refetch when next observed.

**Derived dependencies.** An entity embeds projections of other rows, so a change invalidates
every cached entry that embeds it. The cache scan runs over cached `chat.message` data of the
event's Server. Because messages are append-only, reply-context quotes never change.

| Change | Also invalidate |
| --- | --- |
| Task label renamed, recolored, or deleted | Entities whose `message.task.labels` contains the label |
| Thread reply created | The anchor entity in the parent Chat (summary count and preview) |
| Thread read or follow | The anchor entity (per-viewer `unreadCount`, `followed`) |

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
| `artifact.onUpdated` | `{ serverId, artifactId \| null }` | Every member | `artifact.list` (every folder), `artifact.creators`, `artifact.get` + `artifact.versions` + `artifact.publicLink` (artifactId, else all). Published after a Files publish, move (null for a folder move), delete, version delete, public link enable or disable, batched move or delete (null, once per batch), and retention prune (null, once per affected Server per sweep). The App throttles the list and creators invalidation per Server (leading, then trailing at most every 300 ms); per-file reads stay immediate |

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
exactly as `chat.messages` projects it (reactions, task, linked Cloud Agent work, reply context);
`thread` is the viewer's Thread summary when the message anchors one, computed by the same Server
code as `chat.messages` (per-viewer `followed` and `unreadCount`). Same authorization as
`chat.messages` for `chatId`. Null when the id no longer resolves in `chatId`; the row then
renders nothing and the next list read drops its id.

**No batch read.** Entity invalidations are many small `chat.message` calls, and the App's
`httpBatchLink` (`lib/haus-server.tsx`) already folds every query issued in one tick into one
POST, so a burst costs one round trip. A `chat.messagesById` batch would duplicate the entity
cache's single flight with its own fan-out and key bookkeeping, and the realistic burst is small:
reactions, tasks, and work touch one message, and only entries observed by mounted rows of shown
views refetch. Recovery never fans out per entity: it refetches list pages (below).
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
   through the tRPC `errorFormatter`; `serverProcedure` passes a refusal through before its
   cause-class remap, so the code survives the middleware. A failed role check ends the stream with
   `FORBIDDEN` and `hausRefusal: 'role_required'`. Only these two checks produce a `hausRefusal`.
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
| `artifacts/` publish, move, delete, retention | `artifact.updated` (new; never part of `server.onUpdate`) |

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
  | Active Server, every role | `agent`, `computer`, `mcp`, `cloudAgentSettings`, `artifact` `.onUpdated`; `chat.onMessageCreated`, `chat.onMessageReactionUpdated`, `chat.onRead`, `thread.onFollowUpdated`, `chat.onLifecycle`, `task.onChanged`, `taskLabel.onUpdated`, `cloudAgentWork.onUpdated`, `imageGeneration.onUpdated`, `linear.onUpdated`, `linear.onIssueChanged` | 16 |
  | Active Server, Owner/Admin only | `reminder.onUpdated`, `invitation.onUpdated` | 2 |
  | Active Server, kept Server-rooted | `agent.onLifecycle`, `agent.onActivity` (one mount each per window; the slice hoists duplicates) | 2 |
  | Per mounted Chat view (shown or kept, at most 5 kept) | `chat.onEngagement`, `chat.onThought`, `chat.onComposition` | 3 × mounted Chat views |
  | Per open turn journal | `agent.onExecutionJournal` | 1 each |

  Query observers are not budgeted the same way. Each shown view has one observer per mounted
  transcript list and one `chat.message` observer per mounted row; mounted rows grow with scroll
  history (the render window never unmounts a row), so they are not bounded. Hidden kept views
  hold zero active entity observers (`subscribed: false`, below).

  A unit test mounts the shell with three Servers, one shown and one kept Chat view, as a member
  and as an Admin, and asserts the exact stream count (6 + 18 + 6 = 30 as a member; 32 as an
  Admin), that the hidden kept view holds zero active `chat.message` observers, and that a
  reconnect's starts reconcile owned reads through the coalescer only (no `chat.message`, no
  direct reads beyond the volatile projections).

### Hooks

Each stream has one hook under `apps/website/src/hooks/realtime/` (or beside its noun's hooks)
that owns its subscription and its exact cache response: `useMessageCreatedStream`,
`useMessageReactionStream`, `useChatReadStream`, `useThreadFollowStream`,
`useChatLifecycleStream`, `useTaskChangeStream`, `useTaskLabelStream`, `useCloudAgentWorkStream`,
`useReminderStream`, `useAgentUpdateStream`, `useComputerUpdateStream`, `useMcpUpdateStream`,
`useServerUpdateStream`, `useMemberUpdateStream`, `useInvitationUpdateStream`,
`useCloudAgentSettingsStream`, `useArtifactUpdateStream`.

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
only; no stream start names the family among its owned reads, and
`query-policy-contract.test.ts` names it as the one `staleTime: Infinity` exception for a
changing read. An entity refetches only when invalidated while observed, or when an observing
row finds it missing (never seeded, or garbage-collected while its list stayed cached): the row
then fetches it with `chat.message` like any query without data.

**Loaded pages stay loaded.** Transcript lists keep every page the viewer loaded: no `maxPages`,
no page rollover. `transcript-render-window.ts` keeps its contract that rendered rows join and
never leave (scroll anchoring and measured heights depend on it). Both prior arts (Review log) do
the same. The tradeoff is stated, not hidden: memory, mounted rows, entity observers, and the
cost of a list recovery all grow with how far the viewer scrolled in that list. If long
transcripts become a measured problem, real row virtualization replaces the render window as a
separate project.

**Observation.** A mounted row observes its entity (`useQuery`). A hidden kept view
(`kept-chat-views.tsx`, up to 5) passes `subscribed: false` to its rows' entity queries, so it
holds no active observers and an invalidation only marks its entries stale; on reveal the rows
subscribe again and fetch only invalidated or missing entries. That is the one retained-view gate.

**Seeding.** Only canonical projections seed: `chat.messages` pages and tail reads (their
`{message, threads[]}` from `chats/list-messages.ts`) and `chat.message` itself. A list seeds its
entities in one batch inside its `queryFn` before returning ids: one `queryClient.setQueryData`
per message inside a single `notifyManager.batch`, with the message and its Thread summary (or
null). A 50-message page issues zero entity requests. Every list and tail read consumes its
`AbortSignal` and checks it before seeding, so a cancelled read never writes entities.

**New messages: tail read.** On `chat.onMessageCreated`, set one `tailNeeded` bit on each
transcript list key for `chatId` that is loaded or has a read in flight. List operations
(initial, full, next page, tail) are serialized per key, so after the current read settles one
tail read drains the bit. For each list with data:

- If its newest page is not loaded (`nextAfterSequence` is not null): mark it stale when
  inactive, do nothing when active (a list scrolled into history refetches on return).
- If its `scannedThroughSequence` is at or past the highest event `sequence` that set the bit, do
  nothing.
- Otherwise read `chat.messages({ ...sameFilter, afterSequence: scannedThroughSequence })`, seed
  the entities, append the ids to the newest page deduplicated by id in sequence order, and store
  the result's `scannedThroughSequence`. If it reports more, read again until caught up. A
  filtered list (an inline-reply chain) resumes after what its last scan examined, never after
  its last match, so it does not rescan; it gains only its own messages; a missed event's gap is
  filled by the same read with no contiguity rule. A tail read is idempotent, so a duplicate or
  late event costs at most one empty read.

**Changed annotations: cancel, then invalidate the entity.** Reaction, Thread summary (reply,
read, follow), task, and Cloud Agent work events, for each affected message id:

1. Add the id to that Chat's **dirty set**.
2. `cancelQueries` on the exact `chat.message` key, so an older in-flight fetch (including an
   initial fetch with no data, which a plain invalidation would reuse) cannot win.
3. `invalidateQueries` on the exact key with `refetchType: 'active'`. Mounted rows of shown views
   refetch (one batched POST per tick); the rest go stale.

A list read that started before the event can still seed an older copy of that entity. So every
list read settlement for the Chat (after it seeds) invalidates the current dirty ids the same
way, and the set clears only when that Chat's in-flight list read count reaches zero.
Overlapping pre-event reads each re-invalidate, and the last one to settle clears it.

**Label updates.** A label event carries no message ids, so the dirty set cannot cover it.
`taskLabel.onUpdated` first aborts the Server's tail reads (`TranscriptListReads.abort`, the
Server-scoped read controller; React Query cannot cancel a direct tail request), then cancels
and invalidates its transcript lists (no seeding read in flight survives with an old label), then
predicate-invalidates cached entities carrying the label. The bulk refetch re-reads anything an
aborted tail would have appended. Labels change rarely, so the list refetch is acceptable. Its
start reconciliation includes the transcript lists, since a missed rename may sit on any loaded
message.

**Pending rows retire by nonce.** `features/servers/chat/use-pending-messages.ts` retires an
optimistic row when a seeded entity in that Chat carries its nonce (the tail read seeds the
durable row), exactly as a full refetch did before. Nothing writes optimistic content into the
entities or the id lists. **Optimistic reactions** keep today's app-local overlay in
`use-chat-message-reaction.ts`: the overlay renders over the entity and clears when the mutation
settles; there is no entity write and no snapshot rollback, so a realtime refresh or a concurrent
toggle is never overwritten by a stale snapshot.

**Concurrency.** `apps/website/src/lib/targeted-read-coalescer.ts` owns tail reads, list
recovery, the `tailNeeded` bits, the per-Chat dirty sets and in-flight list counts, and every
realtime invalidation:

- List operations are serialized per list key; appends commit in request order. A set
  `tailNeeded` bit runs one tail read after the current operation settles, however many events
  set it.
- Entity reads are single flight by React Query; `cancelQueries` before each annotation
  invalidation keeps an older response from landing over a newer one.
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
  defaults above and takes the view's shown state as `subscribed`; `chat-message-entities.ts`
  (new) owns the key, `setQueryDefaults` registration, seeding, and the derived-dependency scans.
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
- Every former page patcher reads entities instead: `use-chat-message-reaction.ts` (keeps its local overlay; reads the entity underneath),
  `hooks/threads/use-thread-anchor.ts`, `features/servers/chat/use-chat-typing-ends.ts`,
  `features/servers/chat/chat-view.tsx`, `features/servers/thread/thread-content.tsx`,
  `routes/app/desktop-tab-pages.tsx`, and `test-support/transcript-render-harness.tsx`.
- `hooks/servers/chat-events/` is deleted with the union stream.

`features/servers/chat/transcript-render-isolation.test.tsx` gains the core render assertion:
invalidating one entity re-renders exactly that row.

## Refusal classes

| Signal | Meaning | App action |
| --- | --- | --- |
| `FORBIDDEN` + `hausRefusal: 'membership_lost'` | The viewer is no longer a member, or the Server was deleted | Final for every stream of that Server. Run the Server-loss path once (below), fall back to unavailable if it was active, and invalidate `server.list`. |
| `NOT_FOUND` + `hausRefusal: 'chat_missing'` | A per-Chat stream names a Chat this Server does not have (deleted, possibly before the view mounted) | Run the Chat-loss purge (below) for that Chat; its per-Chat streams stop and never retry. Chat queries keep a plain `NOT_FOUND`. |
| `FORBIDDEN` + `hausRefusal: 'role_required'` | The viewer lacks the stream's role | Stop that one stream. No cache clear. It remounts if a role change makes it authorized. |
| `UNAUTHORIZED` | The Haus access token expired or was rejected | Refresh the token and reconnect, then restart with backoff. Final when the local session is revoked or sign-in is required. |
| `FORBIDDEN` or `NOT_FOUND` with no `hausRefusal`, or anything else | Not a refusal | Restart with backoff like any error. |

**Server-loss path** (`membership_lost`), idempotent per Server, in order:

1. Close every stream of that Server client-side (the sentinel topology above).
2. Abort the coalescer's tail reads and recoveries for that Server.
3. `cancelQueries`, then `removeQueries`, for every query Server-scoped to `serverId`: a validated
   predicate over the tRPC query key's `input.serverId`, App query keys that embed the Server id,
   and `server.bySlug`, whose key holds only `{ slug }` (`hooks/servers/use-server.ts`), matched
   by cached result identity (`data.id === serverId`). An explicit, tested exception list keeps
   global data (`server.list`, account and settings reads). This replaces the family list in
   `hooks/servers/membership-caches.ts`.

Aborted readers never seed, because every list and tail read checks its `AbortSignal` before
seeding (Seeding, above). No Server generation is needed.

**Chat-loss purge** (`chat.onLifecycle` `deleted`) runs the same steps scoped to one Chat: close
that Chat's per-view streams, abort its tails, cancel and remove its transcript lists and
`chat.message` entities, drop its pending rows, and evict its retained kept view. A view that
still shows the deleted Chat (a desktop tab) stops its per-Chat streams (`chat.onEngagement`,
`chat.onThought`, `chat.onComposition`) through `useChatLost`; they never retry against a Chat the
Server no longer has. A view mounted after the deletion (a restored desktop tab) never hears the
lifecycle event; its first per-Chat stream start is refused with `chat_missing`, which runs the
whole lifecycle `deleted` path through one shared function: the purge plus the Chat list,
archived list, `chat.get`, and Agent Chat invalidations (`hooks/realtime/chat-deletion.ts`; on
iPhone, `ChatRealtimeEvent.chatMissing` through `applyChatEvents`).

Cloud Agent work outlives a deleted Chat that linked it (ADR 0044), so Chat loss also refreshes
work reads. The deletion path invalidates the Server's `cloudAgentWork.listActive` and every
`cloudAgentWork.listForChat`, because a card or Happening now row may move to a surviving link or
leave the viewer's lists. iPhone reloads active work alongside its Chat-loss purge (`ChatRealtimeEffects.swift`). On
the Server side, Channel deletion prepares `cloudAgentWork.updated` for every surviving link of
any work the deleted Channel linked, inside the deletion transaction, so other Chats showing that
work refresh too.

Tests: one query per Server-scoped family across two Servers, only the lost Server's removed,
`server.bySlug` included; a list read in flight across the loss lands and seeds nothing; a
deleted Chat leaves no list, entity, pending row, or kept view behind.

## Recovery

`staleTime` alone schedules nothing: React Query marks an observed read stale but refetches only
on a trigger. These are the triggers.

| Trigger | Action |
| --- | --- |
| Stream start (first start, resubscribe after a socket reconnect, restart after a failure) | The stream reconciles only its owned reads through the coalescer (`coalescer.reconcileStart`, `lib/start-reconciliation.ts`), refetching those fetched before this start: the message, reaction, read, follow, task, label, and work streams **bulk-refetch the active Server's cached transcript lists** (below) plus their own non-entity reads (`chat.list`, `chat.search`, `task.list`, `taskLabel.list`, Cloud Agent lists per their table rows); Server-level streams invalidate their table row. The volatile streams (`agent.onActivity`, `agent.onLifecycle`, `chat.onEngagement`) re-read their live projections on every start. |
| Stream error or completion | Any end that is not a refusal, including a normal completion, restarts that one stream with capped exponential backoff (1 s → 30 s; `hooks/realtime/subscription-restart.ts`). Siblings are untouched. The restart recovers on its start, above. An unsubscribe the App made (unmount, a disabled or changed input, such as a tab switch hiding a chat view) is not a completion: tRPC reports it as one, and `useSubscriptionRestart` ignores it. |
| Socket reconnect | No pass of its own. Every stream resubscribes on the new socket and its start reconciles its reads. A read no stream owns hears no event, so a socket gap cannot stale it beyond its normal staleness. |
| Window focus (browser `visibilitychange`/`focus`, and Electron `BrowserWindow` focus through the desktop bridge into `focusManager`) | Refetch active reads whose data is older than the focus stale window, **3 minutes**; `chat.message` never refetches on focus, transcript lists refetch in bulk. A quick alt-tab is silent. The pass runs 500 ms after the return (`lib/query-focus.ts`): a wake that also drops the socket reconnects first, and the focus pass then finds the reads its start reconciliation refreshed fresh, or joins their fetch in flight, so one wake reads each read once. |
| Mount or observe | A read older than `queryPolicy.syncedSnapshot` (30 s) refetches on mount, as React Query normally does. Inactive reads marked stale by an event refetch here. An entity refetches on observe only when invalidated or missing. |

**Start-anchored recovery.** Recovery is anchored to subscription start, never socket open. The
Server registers a stream's topic listener before tRPC answers `started`, so a read the App sends
after hearing `started` cannot miss an event that stream would deliver, while a read sent before
it can (it may snapshot before a commit whose event published before the listener existed). Each
start takes a mark; reads whose data, or whose fetch in flight, began before the mark are
cancelled if in flight and refetched, and reads fetched after it are skipped, which keeps a first
launch to at most one extra read per owned read that loaded before its stream started. Fetch
begins come from the query cache's `fetch` action; a hydrated read, a cancel-and-restart, or a
read fetched before the marks were installed counts as before. A burst of starts after a
reconnect shares one 50 ms settle window (capped at 250 ms), judged against the latest start.
Agent lifecycle streams own activity only: an Agent's missed message recovers like a human's.

**Bulk list recovery.** Entities are never recovered one by one, and entity queries never join
a bulk pass. Recovery refetches each transcript list's loaded pages through the canonical
projector; each page reseeds its entities (dirty ids re-invalidated on settle), which also
refreshes parent Thread anchors after a missed Thread reply or a cross-device read. Active lists
refetch now; inactive lists are marked stale. Cost is one page read per loaded page and zero
`chat.message` requests, so it grows with how far the viewer scrolled (Loaded pages stay
loaded, above).

**Liveness.** The tRPC `wsClient` `keepAlive` ping/pong (15 s interval, 5 s pong timeout) detects
a stalled socket and reconnects it. Error and normal completion restart only the affected
subscription with backoff. Every operation on the socket, `session.refresh` included, goes
through the App's one tRPC client (`lib/haus-connection.ts`): the socket keys requests by the
client's operation id, so a second client on the same socket reuses ids, and its call silently
replaces and then deletes a live subscription with the same id. That subscription then drops
every frame and is never resent on reconnect, with no error to restart it. A tail step (waiting
for the list's own fetch, then the tail read) that has not settled within 20 s is logged and
releases its list (`lib/transcript-list-reads.ts`), so one wedged read never blocks later events.
The iPhone's HTTP (SSE) streams get Server pings every 15 s (tRPC `sse.ping`, advertised
`reconnectAfterInactivityMs` 45 s), so its stream session holds a 45 s idle timeout instead of
300 s, and its queries run on their own URL session apart from held streams. Haus does **not** adopt Raft's heartbeat carrying the Server's latest
sequence: it is a global cursor in disguise, cannot say which Chat is stale (so it would trigger
a noisy global refetch without replay), and conflicts with the no-cursor principle.

**Residual limitation.** A single frame selectively dropped on a live stream that does not error,
in a window that stays focused and never blurs, stays missing until the next focus after the
stale window, a reconnect, a stream restart, or a related event on the same Chat (whose tail read
recovers any gap). Ping/pong only detects a dead socket. This is accepted.

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

Cache budgets (render-budget lane):

| Case | Budget |
| --- | --- |
| 5 kept views, one shown | Hidden views hold zero active entity observers; an invalidation of a message in a hidden view issues no request until reveal |
| Focus after the stale window, 5 kept views | Requests are only transcript page reads (one per loaded page of active lists) and the other active reads, each once; zero `chat.message` requests |

Memory and observer counts for long scrolls are deliberately not budgeted (Loaded pages stay
loaded).

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

Agent behavior does not change. The Agent prompt (`managed-instructions.ts`), Manual
(`agent-manual/src/corpus/cli-families-a.ts`), and `haus inbox check` help name the token
`--before <key>`: the `More:` line prints the exact command and the Agent copies it, so the
token's shape is invisible. The Computer CLI (`apps/computer/src/agent-cli/agent-inbox-schemas.ts`,
`commands/agent-inbox.ts` `parseBefore`, `agent-inbox-format.ts`) accepts any non-empty token up
to 200 characters and its tests use string keys.

## iPhone impact

`apps/ios-swift` ships in the same release. It has its own store and does not mimic React Query;
it adopts the same model in its own shape:

- `HausTransport/AppConfig.swift`: `HausAppProtocol.version` becomes 9 (today 8; the release
  gate above).
- **Store shape**: a message entity map keyed by message id (message plus optional Thread
  summary) and, per open transcript (each stack entry, Thread, or inline-reply chain), an ordered
  id list with its paging and `scannedThroughSequence`. Views observe one entity by id. Only
  canonical `chat.messages` / `chat.message` projections write entities; search results stay
  separate. Loaded pages stay loaded, as on the App.
- **Tail read** on `chat.onMessageCreated`: set `tailNeeded` on the Chat's lists (including one
  whose load is in flight); loads are serialized per list, and after the current one settles one
  tail read `chat.messages(afterSequence: scannedThroughSequence)` with the list's filter writes
  entities and appends ids. A Thread reply also refreshes its `threadAnchorMessageId` entity.
- **Per-message refresh** on reaction, Thread summary (reply, read via `threadAnchorMessageId`,
  follow), task, and Cloud Agent events: add the id to the Chat's dirty set, cancel any
  in-flight `chat.message` load for it, and, if a view shows it, read it again; otherwise refresh
  it when it next appears. Each list load that settles re-refreshes the dirty ids; the set clears
  when the Chat has no list load in flight. A label event reloads the Server's open lists and
  refreshes entities carrying the label.
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
- Refusals follow the App's classes: `membership_lost` stops that Server's streams, cancels its
  loads (a cancelled load writes nothing), and clears it; a deleted Chat is purged the same way; `role_required` stops one stream; `UNAUTHORIZED` refreshes the
  token and retries. A `chat_missing` refusal on a per-Chat stream (`chat.onEngagement`,
  `chat.onThought`) applies a lifecycle `deleted` event through `applyChatEvents` (purge, then a
  Chat list read) and stops both of that Chat's streams (`HausStoreEngagement.swift`).
- Delete `HausStoreChatCatchUp.swift` and the `chat.eventHead` step of
  `HausStoreServerReload.swift`.
- `HausModels`: replace `EventModels.swift`'s union with one `Decodable` per payload (ids only);
  add the `chat.message` model; drop `eventCursor` from `SendReceipt`, `ThreadFollowModels`,
  `TaskModels`, and `ChatReadModels` (gain `advanced`). Update `ChatEventReactionTests`,
  `ChatReadModelsTests`, `ThreadFollowModelsTests`, `TRPCClientTests`,
  `TRPCSubscriptionOutageTests`, and add tests that one stream's failure restarts only that
  stream and reloads only its projections, that a list load started before a reaction does not
  leave a stale entity (absent-entity case included), and that a missed Thread reply refreshes
  the parent anchor after restart.

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
- App unit: each stream hook's response; the coalescer (per-key serialization, ordered appends,
  frame-coalesced invalidations, one bulk refetch per list when several streams restart);
  tail-read append per list (an inline-reply chain gains only its chain and resumes from
  `scannedThroughSequence`; a gap is filled; duplicates dedupe; nonce retirement); one-entity
  invalidation re-renders one row; refusal classes (role refusal clears nothing; membership loss
  closes siblings, aborts tails, and cancels and removes only that Server's keys including
  `server.bySlug`; `UNAUTHORIZED` retries); restart policy (`subscription-restart.test.ts`)
  including restart on normal completion; focus refetch honoring the 3-minute window and
  skipping `chat.message`; the subscription budget.
- Race cases (coalescer tests):
  - **Held initial read**: a list's initial read is held; `chat.onMessageCreated` arrives (twice);
    the initial result commits and exactly one tail read follows and appends the message.
  - **Absent entity**: a reaction arrives for a message with no cache entry while a list read is
    in flight; the list lands and seeds, then the dirty id is invalidated and the row shows the
    new reaction.
  - **Overlapping list reads**: two pre-event reads of one Chat settle in either order; the
    dirty set survives the first and clears only after the second, and the entity ends current.
  - **Held direct entity fetch**: an initial `chat.message` fetch is held; a reaction event
    cancels it and the refetch wins.
  - **Label race**: a list read in flight across a label rename is cancelled and refetched; no
    entity keeps the old label. A tail read held across the rename is aborted and seeds nothing.
  - **Start reconciliation**: a first start and a resubscribe each refetch reads fetched before
    them, a read in flight across a start is cancelled and refetched, a read fetched after the
    start is skipped, and a burst of starts refetches each read once.
  - **Aborted seed**: a list read in flight across Server or Chat loss lands and seeds nothing.
- Projections and dependencies: a search result never seeds (task-anchor and Thread-anchor
  poisoning cases: a later search leaves `task` and `thread` intact); a label update invalidates
  exactly the cached entities carrying it; a Thread read with no cached Thread context refreshes
  the anchor; a missed Thread reply heals the anchor through bulk list recovery; optimistic
  reaction overlay survives a concurrent realtime refresh without rollback.
- Entity policy: `setQueryDefaults` applies `gcTime`, `staleTime`, and no focus/reconnect refetch
  to a seeded-only entry; a GC'd entity whose id is still listed fetches on observe; a hidden
  kept view holds no active entity observers.

### App e2e: the incident detector

`apps/website/e2e/tests/realtime-server-restart.spec.ts` (new; replaces
`chat-event-recovery.spec.ts`), in `test:app`.

**Harness.** `e2e/start-haus-server.ts` today imports `haus-server.ts` in-process beside its
PostgreSQL cluster and AppSession fixtures. It changes to run the Server as a child process (same env,
same port) and to restart only that child on `SIGUSR2`, writing its own pid to
`.context/e2e/<runId>-server.json`. `e2e/support/server.ts` gains `restartHausServer()`: signal,
wait for the old child to exit and the port to answer the Server's health route. PostgreSQL,
AppSession storage, and the browser session survive, as in a deploy.

**Setup.** A desktop window with kept tabs (`installDesktopBrowserStub`, `openDesktopWindow`):
tab A shows `#all`, tab B (kept, hidden) shows `#product` with a Thread anchor and a Cloud Agent
work Message. A fake Agent sender with no model (`createChannelAgent`,
`createAgentThreadSender`, `e2e/support/agent-cloud-agent.ts`) writes through the Agent API.
`page.routeWebSocket` (`e2e/support/realtime-proxy.ts`) proxies the socket, and
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

1. `restartHausServer()` mid-session, with every new start held at the proxy. Whatever the App
   reads on reconnect settles first; only then are the three changes committed, and no read
   follows them before the release. The App's reads therefore predate the changes, so only start
   reconciliation can converge them (with it disabled, the spec fails at the first convergence
   assertion).
2. The proxy answers the first post-restart `chat.onMessageCreated` start with `UNAUTHORIZED`,
   the second with `FORBIDDEN` and no `hausRefusal`, and lets the third through: two consecutive
   refused attempts.

Assert: the convergence assertions; the session token refreshed once and the App did not sign
out; the Server's caches were not cleared; every root stream resubscribed exactly once on the new
socket (siblings are interrupted by the socket, not by the refusal); start reconciliation issued
no `chat.message` request.

**A2. Agent reply** (as A, with `#product` shown): the message stream is failed and its restart
held while the Agent posts into `#product` through the Agent API. Assert the lifecycle stream
delivered `sending` and no transcript was read before the release, recovery read only the
message stream's owned reads, and the shown kept tab converges with no reveal or reload.

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
| App | `apps/website/src/hooks/realtime/`, `lib/targeted-read-coalescer.ts`, `features/servers/chat/kept-chat-views.tsx`, `lib/start-reconciliation.ts`, the transcript reshaping files above, `hooks/servers/chat-events/` (deleted), `use-server-events.ts` (split), `hooks/servers/membership-*`, notifications, `lib/query-*`, `lib/pushed-snapshot*`, server shell, desktop focus bridge |
| App e2e | `apps/website/e2e/start-haus-server.ts`, `e2e/support/server.ts`, `e2e/tests/realtime-server-restart.spec.ts`, `e2e/tests/chat-event-recovery.spec.ts` (deleted) |
| Computer | `apps/computer/src/agent-cli/{agent-inbox-schemas,agent-inbox-format}.ts`, `commands/agent-inbox.ts` and tests |
| iPhone | `apps/ios-swift` files listed above |
| Live tracer | `scripts/run-dev-stack.mjs`, `apps/website/agent-e2e/` |

## Review log

Codex adversarial review of the first draft (2026-10-09), and dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Role refusals and `UNAUTHORIZED` conflated with membership loss | Adopted: `hausRefusal` classes (`membership_lost`, `role_required`); `UNAUTHORIZED` refreshes and retries; role-gated streams mount only for authorized roles. |
| 2 | Cross-stream ordering races on patched projections; version mutable projections | Adapted: resolved by the normalized transcript cache. Events carry ids only; each message is its own `chat.message` entry, invalidated on change, so the Server read is the truth and no versioning is needed. List seeding cannot overwrite a newer entity (the `startedAt` guard, replaced by read generations in round 2, then by cancellation and the dirty set in round 3). |
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

Codex adversarial review, round 2 (2026-10-09), and dispositions (read generations, the
observed band, `maxPages`, and edit/delete rules were superseded in round 3):

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

Codex adversarial review, round 3 (2026-10-09), of the owner's simplification. New owner facts:
messages are append-only (no edit or delete); only whole Chats and Servers are deleted; use the
standard React Query answer with no invented machinery. Dispositions:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Dirty-set lifetime underspecified for overlapping list reads | Adopted: every list settlement invalidates the current dirty ids; the set clears only when the Chat's in-flight list count reaches zero. |
| 2 | Dirty set misses a direct `chat.message` initial fetch (invalidation reuses the in-flight promise) | Adopted: annotation events `cancelQueries` then `invalidateQueries` on the exact entity. |
| 3 | Label events carry no message ids | Adopted: cancel and invalidate the Server's transcript lists, then predicate-invalidate carrying entities. No label generations. |
| 4 | Cache clearing needs cancellation, not a Server generation | Adopted: close streams, abort tails, `cancelQueries`, `removeQueries`; list and tail reads check their `AbortSignal` before seeding; whole-Chat deletion purges lists, entities, pending rows, and the kept view. |
| 5 | Simplification gives up round 2's bounded memory and observers | Accepted as a product tradeoff: loaded pages stay loaded; the bounds claims, `maxPages`, rollover, observed band, read generations, long-scroll and heap budgets are removed. Real row virtualization is a separate future project if long transcripts become a measured problem. One retained-view gate kept: hidden kept views pass `subscribed: false`. |
| 6 | Do not adopt Raft's latest-sequence heartbeat | Adopted: ping/pong plus per-stream restart; the heartbeat is a global cursor that cannot name the stale Chat. |
| 7 | Round-2 dispositions | #1 by tail-after-settle, entity cancellation, and the dirty set; #2 and #3 unchanged; #4 deliberately relaxed (row 5); #5 reduced to real annotations, edit/delete machinery deleted, whole-Chat purge added; #6 by abort/cancel/remove plus the sentinel; #7–#10 unchanged; #11 rewritten for this topology. |

Codex final review (2026-10-09), web App and Server dispositions (iOS rows belong to the iPhone
slice):

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Read-before-subscribe window on first connect and reconnect: recovery began at socket open, and first and ordinary resubscribe starts recovered nothing | Final review: adopted. Recovery is anchored to subscription start (Start-anchored recovery, above): every start reconciles its owned reads fetched before it; the App-wide `onOpen` pass (`query-reconnect-recovery.ts`) is deleted. Variant B now settles reconnect reads before committing while starts are held, and fails with reconciliation disabled. |
| 2 | Label restart recovery skipped transcript lists; a held tail read could seed a former label | Final review: adopted. Label start recovery includes transcript lists; label handling aborts the Server's tail reads before carrier recovery; held-tail regression test. |
| 3 | Agent-lifecycle transcript recovery masked a dead message stream and stormed refetches | Final review: adopted. Deleted; lifecycle streams own activity only. Variant A2 proves an Agent reply recovers through the message stream alone. |

Confirmation drive (2026-10-10), Electron + Chrome + iPhone against one dev stack:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Live subscriptions on the desktop silently stopped delivering over a long session (the realtime wedge) | Root cause: `session.refresh` ran through a second tRPC client on the shared socket, whose operation ids collided with live subscriptions. Fixed: every socket call goes through the App's one client (`context: { socket: true }`); never create a second client on the socket. |
| 2 | iPhone queries and sends timed out behind held streams over HTTP/1.1 | Fixed: separate URL sessions for requests and SSE streams (`TRPCSessions`). |
| 3 | A dead iPhone stream took up to 5 minutes to notice | Fixed: Server SSE ping every 15 s; iPhone stream idle timeout 45 s; the SSE reader drops `ping` frames. |
| 4 | Per-Chat streams of a restored desktop tab retried forever against a Chat deleted while the App was away | Fixed: coded `chat_missing` refusal on per-Chat streams runs the Chat-loss purge. |
| 5 | `Encountered two children with the same key` on reaction arrivals and window wake | Root cause: a stamped reaction sticker keyed its burst and glyph siblings by the same stamp token. Fixed with distinct key prefixes (`reaction-sticker.tsx`). Not a transcript list issue. |

**Prior art.**

- Raft: per-event socket.io listeners, every loaded row stays mounted with no page cap and no
  virtualization; jump to latest is a fresh tail load.
- Grok Bot: one SSE stream, reconnect refetches current state with no cursor replay, tail loads
  with on-demand older pages and no page cap.

Neither tracks an observed band or caps loaded pages.
