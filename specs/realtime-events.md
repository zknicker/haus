---
summary: Normative contract for focused realtime events — one tRPC subscription per event type, live-only delivery, React Query recovery, and the removal of the chat_events log.
read_when:
  - adding, changing, or removing a realtime subscription or event payload
  - changing how the App, iPhone app, or push consumes Server events
  - changing subscription restart, reconnect, or window-focus recovery
  - touching chat_events, event cursors, or Agent inbox paging
  - implementing a slice of the realtime events redesign
---

# Focused Realtime Events

Status: normative. Contracts landed in `packages/haus-api`; Server, App, Computer, and iPhone
slices implement against this document and ship together, with no compatibility for older
clients.

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
2. **Events are live notifications.** Nothing replays. There is no cursor, catch-up walk,
   `chat.events`, or `chat.eventHead`. React Query reads own state; recovery is refetching reads.
3. **Patch where invalidation is expensive, invalidate where it is cheap.** Transcript events
   carry the authorized row and patch the cached infinite query in place; cheap list reads
   (`chat.list`, `task.list`, members, labels) invalidate.
4. **A failure ends one stream, never the others.** Server-side, an unexpected error ends only
   the subscription it happened in, and is logged. App-side, every subscription restarts with
   backoff.

## Subscription table

Every Server-rooted stream takes `serverStreamInputSchema` (`{ serverId }`,
`packages/haus-api/src/realtime-events.ts`). Every stream checks Server membership at start and
again before each delivery; the audience column is the additional rule.

### Chat and Thread streams

| Procedure | Payload schema (file) | Payload fields | Audience | App reads | Update |
| --- | --- | --- | --- | --- | --- |
| `chat.onMessageCreated` | `messageCreatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `message` (full `ChatMessage`, `nonce` included), `thread` (`ThreadActivity` of the parent's summary after a Thread reply, else null), notification facts `authorUserId`, `conversationKind`, `mentionedUserIds`, `replyToAuthorUserId`, `threadAnchorAuthorUserId` | Chat access (`findChatAccess`) | `chat.messages` (chatId), Thread panel query (`threadMessagesQueryKey(serverId, chatId)`), parent `chat.messages` `threads[]` summary; `chat.list`, `chat.search` | **Patch** transcript + Thread panel + parent summary; **invalidate** `chat.list`, `chat.search` |
| `chat.onMessageReactionUpdated` | `messageReactionUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `messageId`, `reactions` (the message's whole reaction set after the change) | Chat access | `chat.messages` (chat and parent), Thread panel query; `chat.search`, `cloudAgentWork.listActive`, `task.list` | **Patch** `reactions` on the cached row; **invalidate** the three lists |
| `chat.onRead` | `chatReadEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `parentChatId`, `sequence` | The reader only | `chat.list` | **Invalidate** `chat.list`, skipped when the settled list already shows zero unread for the Chat (or a Thread's parent) |
| `thread.onFollowUpdated` | `threadFollowUpdatedEventSchema` (`chat-events.ts`) | `serverId`, `threadChatId`, `parentChatId`, `followed` | The follower only | parent `chat.messages` `threads[]`; `chat.list` | **Patch** `followed` on the cached summary; **invalidate** `chat.list` |
| `chat.onLifecycle` | `chatLifecycleEventSchema` (`chat-events.ts`) | `serverId`, `chatId`, `action` (`created`, `updated`, `archived`, `unarchived`, `deleted`) | Chat access, except `deleted`, which reaches every Server member (7a873a99e) | `chat.list`, `chat.listArchived`, `chat.get` (chatId), `agent.chats` | **Invalidate** |
| `task.onChanged` | `taskChangedEventSchema` (`task.ts`) | `serverId`, `chatId`, `messageId`, `kind` (`created`, `updated`), `task` (`MessageTask`) | Chat access of `chatId` | `task.list` (`refetchType: 'all'`); `message.task` in cached `chat.messages` and Thread panel | **Patch** `message.task`; **invalidate** `task.list` |
| `taskLabel.onUpdated` | `taskLabelUpdatedEventSchema` (`task.ts`) | `serverId`, `labelId` | Every member | `taskLabel.list`, `task.list` (both `refetchType: 'all'`) | **Invalidate** |
| `cloudAgentWork.onUpdated` | `cloudAgentWorkUpdatedEventSchema` (`cloud-agent.ts`) | `serverId`, `chatId`, `parentChatId`, `message` (the work Message re-projected after the change), `work` (`CloudAgentWork`) | Chat access | `chat.messages` (chat and parent), Thread panel query, `cloudAgentWork.listForChat` (chat and parent), `cloudAgentWork.listActive` | **Patch** the Message row and any cached `listForChat` entry with `work.id`; **invalidate** `listActive`, and `listForChat` when no cached entry matched (cancel in-flight `listForChat` first, as today) |
| `reminder.onUpdated` | `reminderUpdatedEventSchema` (`reminders.ts`) | `serverId`, `reminderId`, `ownerAgentId`, `action` (`scheduled`, `updated`, `snoozed`, `canceled`, `fired`) | Owner/Admin (`requireReminderOperator`), rechecked per delivery | `reminder.list` (agentId), `reminder.runs`, `reminder.history` (agentId) | **Invalidate** |

### Server-level streams

These replace `server.onUpdate` and its `scope` enum. All payloads live in
`packages/haus-api/src/realtime-events.ts`. A null id means "broad: refresh the whole family".

| Procedure | Payload | Audience | App reads (invalidate) |
| --- | --- | --- | --- |
| `agent.onUpdated` | `{ serverId, agentId \| null }` | Every member | `server.bySlug` (this slug), `agent.get` + `agent.deliveryState` (agentId, else every `agent.get`), `agent.conversationStyle` (agentId, else all), `agent.list`, `chat.list` |
| `computer.onUpdated` | `{ serverId, computerId \| null, agentId \| null }` | Every member | `server.bySlug`, `computer.list`, `computer.systemLog` (computerId, else all), `agent.activeActivity`, `agent.get`/`agent.deliveryState` (agentId, else all), `agent.list`, `agent.skillFile`, `agent.workspaceFile`, `agent.workspaceFiles`, `stats.live`, `cloudAgentSettings.get` (a report can carry a new model catalog) |
| `mcp.onUpdated` | `{ serverId }` | Every member | `mcp.list`, `mcp.amazonProduct`, `mcp.amazonProductDetail` |
| `server.onUpdated` | `{ serverId, action: 'updated' \| 'deleted' }` | Every member | `server.bySlug`, `server.list` |
| `member.onUpdated` | `{ serverId, memberId \| null }` | Every member | `member.get` (memberId, else all), `member.list`, `chat.list` (rows name human authors and participants), `server.bySlug` |
| `invitation.onUpdated` | `{ serverId }` | Same authority as `invitation.list` | `invitation.list` |
| `cloudAgentSettings.onUpdated` | `{ serverId }` | Every member | `cloudAgentSettings.get` |

### Kept streams (unchanged)

`agent.onLifecycle`, `agent.onActivity`, `chat.onEngagement`, `chat.onThought`,
`chat.onComposition`, `agent.onExecutionJournal`. Their inputs and payloads do not change; they
gain the App restart policy below where they lack it.

### Removed

`chat.onEvent`, `chat.events`, `chat.eventHead`, `server.onUpdate`, `reminder.onEvent`,
`reminder.changes`; contracts `serverdurableeventSchema`/`ServerDurableEvent`,
`serverUpdateScopeSchema`, `chatEventsInputSchema`, `chatEventsSchema`, `chatEventHeadSchema`,
`chatEventSubscriptionInputSchema`, `reminderChangesInputSchema`, `reminderChangesSchema`,
`reminderEventSubscriptionInputSchema`, `reminderChangedEventSchema`; every `eventCursor` field
(`chat.send`, `chat.react`, `thread.setFollow`, task and task-label mutations). `chat.markRead`'s
receipt replaces the nullable `eventCursor` with `advanced: boolean` (false: the marker was already
there and no `chat.onRead` follows).

## Server shape

### Topics

One typed in-process topic per event type, under `apps/server/src/realtime/`:

- `createTopic(name, schema)` returns `{ publish(event), subscribe(signal) }`. `publish` validates
  with the event's `@haus/api` schema once and throws on a malformed event (a bug in the
  publisher, surfaced at the write, not at every subscriber).
- Publishers call `publish` only **after commit**. A mutation that publishes inside a transaction
  collects events and publishes them when the transaction resolves (the existing
  `emitDurableChatEvent`-after-commit call sites become `topic.publish` at the same place).
- Reader-only events (`chat.onRead`, `thread.onFollowUpdated`) publish with an `audienceUserId`
  envelope field that never reaches the wire.
- Topics are in-process (`EventEmitter`), like today's hubs. Multi-process fan-out is out of
  scope.

### Subscription factory

One factory, `realtimeSubscription({ topic, input, authorize, deliver })`, builds every root
stream:

1. **Authorize at start** (middleware): `requireServerMembership`, plus the stream's own
   authority (`requireReminderOperator`, invitation authority). A refusal is a coded `FORBIDDEN`
   or `NOT_FOUND` through `toMembershipLossError` before the stream opens.
2. **Filter per event**: wrong `serverId`, wrong `audienceUserId`, or a failed per-event access
   rule (`findChatAccess` for Chat-scoped events; the `deleted` lifecycle exemption) skips the event
   without ending the stream.
3. **Recheck membership per event.** Lost membership ends the stream with the coded membership
   refusal, which the App treats as final.
4. **An unexpected error ends only this stream.** It is logged (`[haus] realtime stream failed`,
   path, tRPC code, error class) and surfaces as `INTERNAL_SERVER_ERROR`; the App restarts it.
   Never translate an unknown error into a membership refusal.

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
publishes the focused topic instead, building the payload from the committed row (for
`message.created` and `cloud-agent-work.updated`, the same projection `chat.messages` returns).

`server.updated` call sites map to the new topics:

| Today (`emitServerUpdated`) | New topic |
| --- | --- |
| `scope:'agent'`: `haus-api/agent/` create, configure, update-profile, update-conversation-style, start, stop, restart, reset, delete; `agent-api/agent-routes` (×3), `agent-api/profile-routes`; `agent-delivery/failure-hold`; `computers/ingest-report` (Cove apply); `haus-api/server/create-cove` | `agent.updated` |
| `scope:'computer'`: `computers/socket` (attach, close), `computers/ingest-report` (×2), `haus-api/computer/` remove, refresh-inventory, start-update, check-update; `haus-api/agent/import-skill` (with `agentId`) | `computer.updated` |
| `scope:'mcp'`: `haus-api/mcp/router`, `server-mcp/oauth-relay` | `mcp.updated` |
| `server/rename` | `server.updated` (`updated`) |
| `server/delete` | `server.updated` (`deleted`) |
| `member/change-role`, `member/departure-signals`, `member/profile-signals` (with `memberId`) | `member.updated` |
| `invitation/create`, `invitation/revoke` | `invitation.updated` |
| `invitation/accept` | `invitation.updated` and `member.updated` |
| `cloud-agent-settings/set-model` | `cloudAgentSettings.updated` |

The "announce only real changes" rule for Computer reports and identity sync stays: an idle App
receives no realtime traffic.

## App shape

### Hooks

Each stream has one hook under `apps/website/src/hooks/realtime/` (or beside its noun's hooks)
that owns its subscription and its exact cache update, mounted once by the Server shell:
`useMessageCreatedStream`, `useMessageReactionStream`, `useChatReadStream`,
`useThreadFollowStream`, `useChatLifecycleStream`, `useTaskChangeStream`,
`useTaskLabelStream`, `useCloudAgentWorkStream`, `useReminderStream`, `useAgentUpdateStream`,
`useComputerUpdateStream`, `useMcpUpdateStream`, `useServerUpdateStream`,
`useMemberUpdateStream`, `useInvitationUpdateStream`, `useCloudAgentSettingsStream`.

Desktop and web message notifications consume `chat.onMessageCreated` and `chat.onRead` through
the same single subscriptions: those hooks take an optional `onEvent` callback that
`MessageNotifications` supplies. The shell mounts each subscription exactly once.

The live burst window (150 ms coalescing) stays for invalidations: a hook may batch its
invalidations over the window; patches apply immediately.

### Patching rules

- **Transcript insert** (`chat.onMessageCreated`): upsert by message id into the cached
  `chat.messages` infinite query for `chatId` only when the newest page is loaded (its
  `nextAfterSequence` is null) and the message's `sequence` is exactly the cached tail sequence
  plus one, or already present. Otherwise (gap, or the tail is not loaded) invalidate that one
  query instead. Per-Chat sequences are contiguous, so a gap is proof something was missed. The
  same rule applies to the Thread panel query for a Thread `chatId`.
- **Pending rows retire by nonce.** The patched row carries `nonce`; `use-pending-messages.ts`
  retires the optimistic row whose nonce matches, exactly as when a refetch delivered it.
- **Thread summary**: for a Thread reply, replace `anchorMessageId`, `threadChatId`,
  `replyCount`, `latestReplyAt`, and `recentReplies` of the summary in the parent's cached
  `threads[]` from `thread`; keep the cached `followed`; recompute `unreadCount` with the Server's
  Thread unread rule (a reply by someone other than the viewer adds one; the slice confirms the
  rule against the `chat.messages` threads projection). When the parent's summary is not cached,
  do nothing.
- **Reactions / task / Cloud Agent Message**: replace the field (or row) on every cached copy of
  the message id in that Chat's and its parent's transcript queries and the Thread panel query.
- Cancel in-flight reads of a query before patching or invalidating it, so an older response
  cannot land afterwards and overwrite the patch.
- Nothing patches durable chat history with optimistic content; patches use Server rows only.

## Recovery

| Trigger | Action |
| --- | --- |
| Subscription error | Restart with capped exponential backoff (1 s → 30 s; `hooks/realtime/subscription-restart.ts`). A membership refusal or `UNAUTHORIZED` is final. When the restarted stream starts (`restart.started()` returns true) it invalidates only its owned reads (the "App reads" column). |
| Membership refusal | Final for that stream. Any Server-rooted stream's refusal clears the Server's caches once (`cachesClearedOnMembershipLoss`) and the route falls back to unavailable; `useServerUpdateStream` owns the handler, other streams report the refusal to it through the restart helper. |
| Socket reconnect | The App-wide reconnect pass (`query-reconnect-recovery.ts`) refetches every active Server tRPC read once. Root streams do not invalidate again on that start. `streamRecoveredReads` shrinks to the volatile streams (`agent.onActivity`, `agent.onLifecycle`, `chat.onEngagement`), whose live projections still re-read on every start. |
| Window focus (browser `visibilitychange`/`focus`, and Electron `BrowserWindow` focus through the desktop bridge into `focusManager`) | Refetch active reads whose data is older than the focus stale window, **3 minutes**. Not every focus: a quick alt-tab is silent. |
| Staleness | The ordinary `queryPolicy.syncedSnapshot` (30 s) applies to every read, including the ones `pushedSnapshot` covered. Stale reads refetch on mount/observe as React Query normally does. |

Forbidden: periodic reconnects, periodic refetch timers for realtime-covered reads, remount
refetches beyond React Query's normal stale rules, and any client replay.

### Reverting pushed snapshots

Delete `queryPolicy.pushedSnapshot`, `apps/website/src/lib/pushed-snapshot-coverage.ts`, and
`pushed-snapshot.test.ts` (from e8108e72e and 3e81fecad). `chat.list`,
`cloudAgentWork.listForChat`, `member.list`, `member.get`, and `taskLabel.list` return to
`syncedSnapshot`. Keep from 7a873a99e: lifecycle announcements for channel delete and new Agent
DMs, the `deleted`-reaches-every-member rule, the member → `chat.list` invalidation, and the
`listForChat` cancel-before-invalidate guard.

### Perf gates

`e2e/tests/idle-silence.spec.ts`, the render-budget lane, `query-polling-contract.test.ts`, and
`query-policy-contract.test.ts` stay. An idle visible App makes no requests. The hidden → visible
allowance counts the focus refresh: after more than the focus stale window hidden, showing the
window refetches each active read at most once; that allowance is stated per read, never as a
blanket number. `query-policy-contract.test.ts` drops the `pushedSnapshot` registry and asserts no
read uses `staleTime: Infinity` except settled reads that cannot change.

## Removing `chat_events`

Delete the `chat_events` table (`apps/server/src/postgres/schema/chat-events.ts`),
`servers.last_chat_event_cursor`, `apps/server/src/chats/allocate-event-cursor.ts`,
`read-event-head.ts`, `list-events.ts`, `durable-events.ts`, and the `chat.events` /
`chat.eventHead` / `reminder.changes` procedures, through one checked-in PostgreSQL migration
(drop table, drop column). `bootstrap.ts` drops them too.

### Feature parity checklist

Every reader of `chat_events` today, and what replaces it. Each slice verifies its rows.

| Feature | Reads `chat_events` today | Replacement | Proof |
| --- | --- | --- | --- |
| App live updates (web, desktop) | `chat.onEvent` + `chat.events`/`eventHead` catch-up | Focused subscriptions; restart + reconnect + focus refetch | App e2e below; `test:app` |
| iPhone live updates | `chat.onEvent` + `HausStoreChatCatchUp.swift` | Focused subscriptions; snapshot reload on connect | iOS unit tests; Simulator run |
| Agent inbox ordering and paging (`haus inbox check`) | `activity.cursor` = max `chat_events.cursor` of the newest message (`agent-api/inbox-conversations.ts`) | Order by the newest message's `(created_at desc, id desc)`; `activityKey`/`nextBefore`/`before` become an opaque string (base64url of `created_at` ISO + `\u0000` + id); paging selects rows strictly before that tuple | `inbox-conversations` regression tests (ordering, ties on equal `created_at`, paging past a page boundary, muted channel) |
| Idempotent send replay (`chat.send`, Agent send) | `send-message-replay.ts`, `send-agent-message-replay.ts` join the `message.created` row for its cursor | Replay looks the message up by nonce alone and returns the receipt without `eventCursor`; it does not re-publish | Existing replay tests, minus cursor assertions |
| iPhone push | `push/message-push.ts` subscribes to the durable notification stream | Subscribes to the `message.created` topic (in-process, after commit); same `messageNotificationReason` facts | `push` tests |
| Desktop/web message notifications | live `message.created` + `chat.read` | `chat.onMessageCreated` + `chat.onRead` live events (never on recovery) | `message-notifier` tests |
| Reminder changes | `reminder.changed` rows, `reminder.changes`, `reminder.onEvent` (no current client subscribes) | `reminder.onUpdated` live event; reminder reads recover by refetch | `operator-reminders` tests |
| Task / label events | `task-events.ts`, `task-labels.ts`, `create-task.ts`, `agent-api/task-create.ts` insert rows | Publish `task.changed` / `taskLabel.updated` after commit | `haus-tasks` tests |
| Chat lifecycle | `lifecycle-events.ts` inserts rows (delete survives purge for replay) | Publish `chat.lifecycle` after commit; no replay needed | `haus-chat-durable-events` tests rewritten for topics |
| Cloud Agent work | `cloud-agents/cloud-agent-events.ts` inserts rows | Publish `cloudAgentWork.updated` with re-projected Message and work | Cloud Agent tests |
| Server delete | `servers/delete-server.ts` deletes the Server's rows | Nothing to delete | `haus-server-delete` test |
| Dev seed | `development/seed-message-events.ts` inserts `message.created` rows so seeded messages page in the inbox | Delete it: inbox ordering reads messages directly | Seeded inbox shows rows in order |

Agent-visible text does not change. The Agent prompt (`managed-instructions.ts`), Manual
(`agent-manual/src/corpus/cli-families-a.ts`), and `haus inbox check` keep `--before <seq>`: the
`More:` line prints the exact command and the Agent copies it, so the token's shape is invisible.
The Computer CLI (`apps/computer/src/agent-cli/agent-inbox-schemas.ts`, `commands/agent-inbox.ts`
`parseBefore`, `agent-inbox-format.ts`) accepts any non-empty token up to 200 characters and its
tests use string keys. Renaming `<seq>` to `<key>` would be a separate, deliberate prompt change.

## iPhone impact

`apps/ios-swift` ships in the same release:

- `HausStoreEventStreams.swift`: replace the `chat.onEvent` stream with the focused Chat streams
  the iPhone renders (`chat.onMessageCreated`, `chat.onMessageReactionUpdated`, `chat.onRead`,
  `thread.onFollowUpdated`, `chat.onLifecycle`, `cloudAgentWork.onUpdated`, `task.onChanged`).
  Keep the unit restart: one stream ending restarts the unit with backoff, as today.
- Delete `HausStoreChatCatchUp.swift` and the `chat.eventHead` step of
  `HausStoreServerReload.swift`; a connect reloads the active snapshot (chat list, open
  transcript) instead.
- `HausModels`: replace `EventModels.swift`'s union with one `Decodable` per payload; drop
  `eventCursor` from `SendReceipt`, `ThreadFollowModels`, `TaskModels`, and `ChatReadModels`
  (gain `advanced`). Update `ChatEventReactionTests`, `ChatReadModelsTests`,
  `ThreadFollowModelsTests`, `TRPCClientTests`, `TRPCSubscriptionOutageTests`.
- Patch the open transcript from `message` rows with the same tail-and-gap rule as the App.

## Test plan

### Deterministic

- `packages/haus-api`: schema tests for every payload (landed with the contracts).
- Server: topic validation rejects a malformed publish; the factory skips an inaccessible Chat
  event without ending; a membership loss ends with the coded refusal; an unexpected error ends
  only that stream and is logged; `deleted` lifecycle reaches a non-member of the Chat;
  reader-only events never reach another member; each publish call site publishes after commit
  (a rolled-back transaction publishes nothing). Inbox paging tests above.
- App unit: each stream hook's cache update (patch, gap fallback to invalidate, nonce retirement,
  Thread summary merge preserving `followed`), restart policy (`subscription-restart.test.ts`),
  focus refetch honoring the 3-minute window.
- App e2e (`apps/website/e2e/tests/chat-event-recovery.spec.ts`, rewritten): a desktop window with
  kept tabs (`installDesktopBrowserStub`, `openDesktopWindow`) and an Agent sender
  (`createChannelAgent`). Using `page.routeWebSocket` as in `e2e/support/agent-thread-recovery.ts`:
  1. **Injected error**: answer the next `chat.onMessageCreated` subscription message with a tRPC
     error frame. The stream restarts without a socket reconnect (no `ws-open` in
     `recordAppTraffic`), a reply sent during the outage appears in the kept tab, and a later
     reply arrives live.
  2. **Silent drop**: swallow `chat.onMessageCreated` frames for one reply; the transcript
     recovers on window focus after the stale window (clock advanced) or via the gap rule on the
     next reply, with no full transcript refetch of older pages.
  3. A Thread reply updates the parent's Thread summary and a Cloud Agent work update replaces
     its Message row, both in a background kept tab, revealed with no reload.
  `idle-silence.spec.ts` keeps passing with no allowance for removed procedures.

### Live tracer

`bun run test:tracer` (`apps/website/agent-e2e/tests/live-tracer.spec.ts`) gains a scenario: a
mention to a fixture Agent from a kept desktop tab, the Server restarted mid-run through the dev
stack restart control (below), and the Agent's reply landing in that tab, plus a Thread reply
and a Cloud Agent work row updating without reload.

### Live Agent tests (`test:agents`)

Today's scenarios (`scripts/agent-tests/`) assert Server state over tRPC HTTP and the Agent API
and never subscribe, so they cannot see a dead stream. Add:

1. **Kit capability** — `scripts/agent-tests/realtime-client.mjs`, exposed on the kit as
   `kit.realtime`: opens the focused subscriptions as a client over the tRPC WebSocket
   (`@trpc/client` `createWSClient` + `wsLink`, `connectionParams` carrying the dev Clerk token
   from `scripts/eval-harness.mjs`'s `createDevClerkAuth`), with the same restart-with-backoff
   semantics as the App (port `subscription-restart.ts`'s rule: 1 s doubling to 30 s, refusals
   final). It records every event per stream and offers `awaitEvent(stream, predicate,
   timeoutMs)` and `events(stream)`. `scripts/eval-harness.mjs` exposes the socket URL beside
   `serverUrl`. Unit coverage in `realtime-client.test.mjs` against a fake socket.
2. **Restart control** — `scripts/run-dev-stack.mjs` restarts its Server child on `SIGUSR2` and
   records its pid in `.context/dev-stack/<worktree>.json`; the kit's `restartServer()` signals
   it and waits for the Server `/healthz` route. A fresh process is the only faithful reproduction
   of a deploy.
3. **New scenario** `scripts/agent-tests/scenarios/reply-survives-server-restart.mjs`: a human
   @mentions a worker Agent in a channel with `kit.realtime` subscribed; once the turn is
   working (`agent.deliveryState`), `restartServer()`; the client's streams must restart and
   receive the reply's `chat.onMessageCreated` event (assert one restart per stream, not a
   reconnect loop); a fresh `chat.messages` read contains the same message id, nonce, and
   sequence as the event row.
4. **Existing reply scenarios assert live delivery**: `mention-wakes-only-addressed.mjs`,
   `thread-reply-stays-in-thread.mjs` (event's `parentChatId` and `thread` activity match the
   parent read), and `cloud-conversation-handoff.mjs` (a `cloudAgentWork.onUpdated` event whose
   `work.id` matches the read) subscribe through `kit.realtime` and assert the Agent's reply
   arrived as an event before the scenario's HTTP read confirms it.

Docs: `docs/operations/testing.md` (`test:agents` kit section) names `kit.realtime` and the
restart control; `docs/api/realtime.md` is rewritten to point here.

## Slice file map

| Slice | Owns |
| --- | --- |
| API (done) | `packages/haus-api/src/{realtime-events,chat-events,chat,chat-read,chat-message-receipts,chat-message-reactions,task,cloud-agent,reminders,agent-inbox-conversations,index}.ts`, `openapi.yaml`, `src/generated/openapi.d.ts` |
| Server | `apps/server/src/realtime/` (new), every publish call site above, `haus-api/*/on-*.ts` procedures and routers, `chats/` event files, `push/`, `agent-api/inbox-conversations.ts`, send replay, schema + migration, `development/seed-message-events.ts`, `apps/server/test/*` |
| App | `apps/website/src/hooks/realtime/`, `hooks/servers/chat-events/` (deleted), `use-server-events.ts` (split), notifications, `lib/query-*`, `lib/pushed-snapshot*`, server shell, desktop focus bridge, e2e specs |
| Computer | `apps/computer/src/agent-cli/{agent-inbox-schemas,agent-inbox-format}.ts`, `commands/agent-inbox.ts` and tests |
| iPhone | `apps/ios-swift` files listed above |
| Live tests | `scripts/agent-tests/`, `scripts/eval-harness.mjs`, `scripts/run-dev-stack.mjs`, `apps/website/agent-e2e/` |
