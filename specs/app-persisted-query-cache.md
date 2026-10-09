---
summary: Proposed disk-persisted Haus App query cache — an explicit allowlist of Server reads saved per user in IndexedDB so a cold launch paints the last known Chats and transcripts at once, then reconciles as a reconnect from a persisted chat event cursor; covers keys, bounds, wipe on sign-out, multi-window writers, schema drops, unread safety, and the test plan.
read_when:
  - changing how the App restores, persists, or wipes its React Query cache across launches
  - changing cold-launch paint, the sign-in gate's first render, or IndexedDB use in the App
  - changing query policies (`queryPolicy`, `pushedSnapshot`), reconnect recovery, or the chat event cursor
  - changing sign-out, user switch, or what App data stays on a device after a session ends
  - changing the Electron window cache handoff or what a new window starts with
---

# App Persisted Query Cache

**Status: Proposed (2026-10-09).** Nothing here is built. Decision record:
[ADR 0042](../docs/adr/0042-app-cache-persists-to-disk-per-user.md).

A cold launch of Haus App renders nothing until its first Server fetch returns
(`.agents/skills/perf-haus-app/references/results-2026-10.md`, "No disk-persisted query cache").
Every window after the first already starts warm from its opener
([Window Cache Handoff](../docs/internals/app.md#window-cache-handoff)). This spec extends the
same idea across launches: the App saves an allowlisted slice of its Server reads to disk per
user, paints them on the next launch the moment the session gate opens, and then reconciles
exactly as it does after a websocket reconnect.

The persisted copy is cache in the sense of [Data model](../docs/internals/data-model.md): never
authoritative, never written back, never a second timeline. Chat history stays canonical Server
state. A persisted entry is only ever "the last Server answer this device saw, and the cursor it
was current to."

## Contract

1. **One rule for launch: a restored cache is a reconnect.** The App hydrates persisted entries
   before the first render of the Server shell, then runs the existing reconnect recovery
   ([Realtime](../docs/api/realtime.md#reconnect-recovery)) on its *first* connection, with the
   Chat event stream seeded from the persisted cursor instead of the event head. No new recovery
   path exists; launch reuses the one every reconnect already proves.
2. **Persist an allowlist, never a filter over everything.** Only procedures named in
   `lib/persisted-reads.ts` reach disk (see [What is persisted](#what-is-persisted)). A new read is
   not persisted until someone adds it there with its recovery class.
3. **Per user, wiped on sign-out.** Each Clerk user has its own IndexedDB database. Signing out,
   a different user signing in, or Clerk loading signed out deletes it. Nothing persisted for a
   user survives that user's session on this device.
4. **Restored data never announces.** Notifications, the Dock badge, optimistic mark-read zeroing,
   and idle warming's "already cached" check treat restored data as unconfirmed until the launch
   reconciliation settles it.
5. **A mismatch drops, never migrates.** A persisted entry whose data fails the procedure's current
   zod output schema, whose format version differs, or whose App protocol version differs is
   deleted unread.

## What is persisted

`lib/persisted-reads.ts` maps tRPC procedure paths to a recovery class. The classes mirror
`streamRecoveredReads` in `lib/query-reconnect-recovery.ts`:

| Class | Meaning at launch | Procedures (initial) |
| --- | --- | --- |
| `cursor` | Every source that can change it is a `chat_events` event. Trusted after a clean catch-up walk from its entry's cursor; refetched only if the walk touches it. | `chat.messages` (newest page only), `chat.get`, `cloudAgentWork.listForChat`, `taskLabel.list` |
| `refetch` | Has a source with no catch-up (`server.onUpdate`, `agent.onLifecycle` restart, or none). Painted, then invalidated on restore so its mount refetches. | `server.list`, `server.bySlug`, `member.list`, `member.get` (self), `agent.list`, `chat.list` |

`chat.list` is `refetch`, not `cursor`, because `server.updated{scope:'agent'}` also invalidates
it ([Realtime](../docs/api/realtime.md)). The classification is an executable contract: a test
cross-checks every `cursor` procedure against the listener hooks in `hooks/servers/chat-events/`
and `use-server-events.ts`, and fails when a non-cursor listener invalidates it. Adding a
listener that touches a `cursor` read demotes it, deliberately.

Never persisted:

- **Volatile state.** Any read using `queryPolicy.volatileState` (the same exclusion
  `isShareableQuery` makes), presence, engagements, typing, thoughts, `agent.activeActivity`,
  delivery state, Computer reports.
- **Auth and secrets.** `computer.login`, `invitation.*`, anything carrying a one-time code,
  bearer token, MCP header, or Trigger secret. Clerk tokens never enter the App cache at all
  ([Auth](../docs/api/auth.md)).
- **Execution evidence.** `agent.executionJournal`, execution outlines, workspace files, skill
  files.
- **Attachment bytes and blob URLs.** Transcripts persist attachment metadata only; bytes are
  re-fetched with a live token (`hooks/servers/attachment-bytes.ts`).
- **Optimistic and App-local state.** Pending compose rows, optimistic unread zeroing, and any
  non-tRPC query key. Only data from a fetch success is written (see [Writes](#writes)).
- **Older transcript pages.** An infinite `chat.messages` entry persists `pages[0]` and
  `pageParams[0]` only; older history reloads on scroll as it does today.

The `agent.list` entry paints names and avatars; its `availability` field is rendered as restored
data until `agent.onLifecycle`'s restart recovery replaces it, which happens in the launch batch.
Presence surfaces read live presence, not this field, so no stale busy dot appears.

### Which transcripts

Per Server, the newest page of the **20 most recently shown Chats**, by `lastShownAt` (stamped when
a Chat view becomes shown, which includes the five kept chat views). Thread transcripts count as
Chats. Older entries are evicted first.

## Where it lives

- **Store: IndexedDB on the App origin.** The packaged desktop App loads `https://haus.chat` in
  Electron's default session (`electron/main.cjs`), so its IndexedDB sits in the macOS user's
  `~/Library/Application Support/Haus/` profile and survives shell updates and Server deploys.
  Desktop web pages use the separate `persist:haus-browser` partition
  ([Browser tabs](../docs/features/browser-tabs.md)) and cannot reach it. A dev stack's
  `localhost:<port>` origin gets its own store, so worktrees never share caches.
- **One database per user:** `haus-query-cache:<clerkUserId>`, object stores:
  - `meta` — one record: `{ generation, formatVersion, appProtocolVersion, lastServerId, cursorByServer }`.
  - `entries` — key `queryHash`; value
    `{ procedure, serverId, chatId?, queryKey, data, dataUpdatedAt, cursor, savedAt, lastShownAt, bytes }`;
    indexes on `serverId` and `lastShownAt`.
- **Boot pointer:** `localStorage['haus:query-cache:last-user']` holds the last user id (not a
  secret, never any data) so the boot path can start reading before Clerk loads.
- **Library:** `idb` (8.0.4, Jake Archibald's ~1 KB promise wrapper over IndexedDB, actively
  maintained). We need two stores, indexes, and transactions that read `meta` and write `entries`
  atomically, which `idb-keyval` cannot express. Hydration uses `hydrate` from the already-installed
  `@tanstack/react-query`.

### Why not TanStack's persisters

- `PersistQueryClientProvider` / `persistQueryClient` store the whole client as one blob and
  rewrite it (throttled to 1/s) on every change. A busy Chat would re-serialize megabytes of
  transcripts each second. It has one `buster` and one `maxAge` for the blob, so it cannot carry a
  cursor per entry, validate per procedure, or wipe one Server. Its `isRestoring` gate also
  overlaps our handoff hydrate.
- `experimental_createQueryPersister` is per query, but restores inside `queryFn`, so the first
  render is pending and paints a frame later; it does not persist `setQueryData`, and it is still
  experimental. Both packages require `@tanstack/react-query` ≥ 5.104 (we pin 5.90.21).

We take TanStack's semantics where they fit — `buster` becomes `formatVersion` +
`appProtocolVersion`, `maxAge` stays, `dehydrate` filters stay — in a small owned module,
`lib/persisted-query-cache/`.

## Keys and busting

- **Database:** user id. **Entry:** query hash, which already includes `serverId` and `chatId` in
  tRPC input.
- **Whole-store bust:** `meta.appProtocolVersion !== appProtocolVersion` or
  `meta.formatVersion !== persistedCacheFormatVersion` deletes the database. The App protocol
  version is the existing exact-equality App ↔ Server contract (`packages/haus-api/src/app-protocol.ts`).
- **Not the build id.** Server deploys ship new App builds often; busting on build id would empty
  the cache on most launches. Per-entry schema validation covers additive changes inside one
  protocol version.
- **Per-entry validation:** on restore, `safeParse` each entry's `data` against the procedure's zod
  output schema from `packages/haus-api` (the same schema the Server's `.output()` enforces). A
  failure deletes the entry and counts toward telemetry. For the infinite transcript entry, each
  page parses against `chatMessagePageSchema`.
- **maxAge:** 7 days by `savedAt`. Older entries are deleted on restore.

## Lifecycle

### Boot and hydrate

1. Module load reads the boot pointer and, if present, starts the IndexedDB read for that user's
   launch Server (`meta.lastServerId`) in parallel with Clerk loading. The read includes schema
   validation, so it finishes off the critical path.
2. The session gate opens as today ([sign-in-gate.tsx](../apps/website/src/features/auth/sign-in-gate.tsx)).
   `HausServerProvider` constructs its `QueryClient`. A window that claimed an opener handoff
   hydrates that and skips disk entirely (the handoff is newer). Otherwise, if the restored read
   belongs to the gate's `userId`, it hydrates synchronously, like `hydrateClaimedQueryCache`.
3. If the read has not finished when the client is constructed, the shell waits for it up to
   **100 ms**, rendering nothing (the no-flash rule: blank while loading, no skeleton), then
   proceeds cold and discards a late result.
4. A mismatched user in the pointer deletes that user's database (see [Sign-out](#sign-out-user-switch-and-revocation)).

This phase paints only after Clerk confirms the session. Painting before Clerk loads is an open
question below; it is also what an offline launch would need.

### Reconcile

On hydrate, every `refetch`-class entry is invalidated without refetching, exactly like the
handoff, so its mount refetches. `cursor`-class entries stay valid, and the Chat event transport
(`use-chat-event-stream.tsx`) is seeded with the **minimum** `cursor` across the restored entries
of that Server, instead of `cursor: '0'`. Its first subscription then walks `chat.events` from that
cursor (the existing `walkEventCatchUp`, dispatching as `catch-up`), so listeners invalidate only
what changed while the App was closed. The App-wide reconnect pass runs once on this first
connection when the cache was restored from disk.

The walk falls back to today's cold path (event head plus full Chat snapshot refetch) when:

- it would exceed **20 pages** (2,000 events),
- it fails,
- the Server's event head is behind the seed cursor (a restored or reset Server database), which
  also deletes that Server's entries, or
- an entry's `cursor` is null (it was fetched before the stream had a cursor); that entry is
  treated as `refetch`.

Membership revalidation rides the first batch: `server.list` and `server.bySlug` are `refetch`
class and are the first reads the shell mounts. Restored data paints for at most that one round
trip before a refusal purges it, and the human already received that data legitimately.

### Purge on access loss

- `FORBIDDEN` / `NOT_FOUND` from `server.onUpdate` (the existing `isMembershipLoss` path in
  `use-server-events.ts`) also deletes every entry with that `serverId`.
- A refetched `server.list` that no longer lists a persisted Server deletes its entries.
- `FORBIDDEN` / `NOT_FOUND` from `chat.get` or `chat.messages` removes that Chat's queries from
  memory and its entries from disk.
- A `chat.lifecycle` event (deleted or archived) and a refetched `chat.list` that no longer lists a
  Chat delete that Chat's transcript entries. Channels are open by design, so this is the path for
  deleted channels and lost DM or Thread access.

### Writes

- A `QueryCache` subscription records, per allowlisted query, the transport's **dispatched
  cursor** (the highest cursor whose events have run through the listeners, not the receive
  cursor, which leads it by the 150 ms burst window) when a fetch *starts*. That conservative cursor
  becomes the entry's `cursor` when the fetch succeeds.
- Only a non-manual `success` (a fetch result) marks an entry dirty. `setQueryData` patches —
  optimistic zeroing, event patches such as Activity History pages — are not written; the next
  fetch success is. An event patch is still safe because the entry's older cursor replays that
  event at launch.
- An entry that is invalidated or fetching is not written.
- Dirty entries flush in one transaction at most every **2 seconds**, scheduled with
  `requestIdleCallback` only while something is dirty. An idle App schedules nothing, so
  `idle-silence.spec.ts` is unaffected (writes are local, never on the wire).
- `pagehide` and an Electron `before-quit` flush (main asks each window, 500 ms budget) write what
  is dirty; a missed flush only costs freshness, since the entry's cursor still covers it.
- Each write transaction reads `meta.generation` and aborts if it is missing or differs from the
  generation this window hydrated with. This is what makes a wipe stick against other windows.

### Multiple windows

Every desktop window is its own App instance and may write. Entries are per query, so windows
merge naturally. For the same query, a write applies only when its `dataUpdatedAt` is newer than
the stored one. `lastShownAt` takes the max. Cursors are per entry, so mixing entries from
different windows stays correct: the launch walk starts from the oldest of them.
A new window keeps the in-memory handoff (it is fresher than disk). A wipe from any window
reaches the others through the database itself: `deleteDatabase` fires `versionchange` on their
open connections, they close, and their next write finds no matching `meta.generation` and stops
persisting for the life of that client.

### Sign-out, user switch, and revocation

- `useSignOut` deletes the current user's database, and `localStorage` pointer, before calling
  `clerk.signOut`.
- Whenever the session gate resolves `signed-out`, or a `userId` other than the pointer's, the App
  deletes every `haus-query-cache:*` database except the current user's (`indexedDB.databases()`).
  This covers a sign-out in another window or device, a session revoked elsewhere (Clerk loads
  signed out, or the socket closes with 4401 and Clerk follows), and account switch.
- A Clerk load *failure* (`status: 'error'`, network) is not a sign-out and wipes nothing.
- The per-user `QueryClient` key ([App](../docs/internals/app.md#session-refresh-and-reconnect))
  already prevents the next identity from seeing the previous one's memory cache.

### Server switch

Keys carry `serverId`, so Servers never mix. A launch restores `meta.lastServerId` plus the
user-wide `server.list`. Other Servers' entries stay on disk (bounded below) and are restored on a
later launch that starts there; an in-session Server switch loads from the network as today.

## Bounds and failures

- **Budget per user:** 10 MB of JSON-estimated `bytes` across all Servers. A single entry over
  1 MB is not written. Eviction deletes by oldest `lastShownAt` until under budget, transcripts
  first.
- **Quota:** a `QuotaExceededError` evicts the oldest half and retries once, then disables
  persistence for this client.
- **Corrupt or unopenable store, failed upgrade, `blocked`:** delete the database once and run
  without persistence for this launch. Persistence never blocks rendering past the 100 ms ceiling
  and never throws into React.
- Every failure logs one `console.warn('[Haus] Persisted cache: …')` with a reason code.

## Unread, reads, and notifications

Restored `chat.list` unread counts are the last Server answer, shown as such until the launch
`chat.list` refetch replaces them (one round trip). To keep stale state from leaking outward:

- **Notifications** already fire on `live` passes only, never `catch-up`
  ([Realtime](../docs/api/realtime.md)); restore adds no live events.
- **Dock badge and window title counts** read `chat.list` only once it has a fetch success this
  session.
- **Optimistic mark-read zeroing** in `chat-read-cache.ts` requires the transcript to be
  *confirmed*: fetched this session, or restored with a clean cursor walk. A restored transcript
  awaiting its walk cannot claim to hold the whole Chat.
- **`chat.markRead`** sequences from restored rows are lower than or equal to the truth, and the
  Server read marker only moves forward, so a read sent early never regresses anything.

## Kept views and idle warming

Kept chat views keep their queries observed, so their transcripts are always fresh and are the
first candidates for disk. `hasCachedChatReads` (`use-preload-chat.ts`) counts a query as cached
only when it has data **and** is not invalidated; restored-and-invalidated entries are warmed like
uncached ones, at the same concurrency of 2. Restored `cursor` entries confirmed by the walk count
as cached and are not re-warmed, so restore reduces launch requests.

## Composition with `pushedSnapshot`

A parallel change moves event-covered reads to `staleTime: Infinity` (`queryPolicy.pushedSnapshot`).
The two meet at one point: React Query's `isStale()` returns true for an invalidated query regardless
of `staleTime`, so

- a restored `refetch`-class entry is invalidated on hydrate and refetches on mount under any
  policy;
- a restored `cursor`-class entry under `pushedSnapshot` stays fresh until a catch-up event
  invalidates it — no time-based refetch of a days-old `dataUpdatedAt`. Under today's 30 s
  `syncedSnapshot` it would refetch on mount anyway (still painting first).

The policy must stay a numeric `Infinity`, never `staleTime: 'static'`, which ignores
invalidation. The `cursor` class and `pushedSnapshot` should end up describing the same set of
reads; the classification test above is the place to assert that once both exist.

## Debug and telemetry

- **Dev tools** (`features/dev-tools/`): a "Persisted cache" row showing entry count, bytes,
  restore time, walk length, and drop counts, with **Clear** (deletes the database and reloads).
- **Kill switch:** `localStorage['haus:query-cache:disabled'] = '1'` disables reads and writes;
  read at boot.
- **Desktop Help › Troubleshooting › Clear Cache and Reload** in production, the same Clear.
- **Performance marks:** `haus:cache:restore-start/end`, `haus:cache:hydrated`,
  `haus:cache:walk-end`, so `scripts/perf` can read them.

## Test plan

App unit (`bun run test:app-unit`):

- Allowlist: only listed procedures dehydrate; volatile, auth, journal, and App-local keys never do;
  an infinite transcript persists `pages[0]` only.
- Classification contract: every `cursor` procedure is invalidated only by chat-event listeners.
- Cursor capture: an entry's cursor is the dispatched cursor at fetch start; a burst-window event
  received but not dispatched is not counted.
- Manual `setQueryData` and invalidated or fetching queries are not written.
- Restore drops entries on schema failure, format or protocol mismatch, and age over 7 days.
- Seed cursor is the minimum across restored entries; walk over 20 pages, a failed walk, and a head
  behind the seed each fall back to the snapshot path.
- Generation check: a write after `deleteDatabase` aborts and disables the writer.
- Eviction honors the 10 MB budget by `lastShownAt`; quota error evicts and retries once.
- Handoff precedence: a claimed handoff skips the disk restore.

App e2e (`bun run test:app`, new `persisted-cache.spec.ts` unless noted):

- **Cold start paints before network:** seed by visiting a Chat, reload with the Server's tRPC
  POSTs held, and assert the Chat list and transcript rows render while the batch is pending.
- **Reconcile:** a message sent from a second client while the first is closed appears after
  reload via catch-up, without a full snapshot refetch (assert the requests).
- **Sign-out wipe:** sign out, assert the `haus-query-cache:*` database is gone, sign back in and
  assert the first paint waits for the network.
- **User switch:** a second user never paints the first user's data.
- **Revoked access purge:** remove the human from the Server (or delete a Channel) while closed;
  after reload the data clears on refusal and its entries are gone from disk.
- **Schema mismatch drop:** tamper a stored entry to break the schema; it is dropped and the read
  loads from the network.
- **No false announcements:** an unread Chat restored from disk raises no notification and no Dock
  badge before the `chat.list` refetch settles.
- **`idle-silence.spec.ts`** stays green with persistence on (extend its run to start from a
  restored cache).

Desktop shell tests (`apps/website/electron`): the `before-quit` flush request and its budget.

## Success criteria

Measured with a new launch pass in `scripts/perf` (prod bundle, CPU×1 and CPU×4, 5 reps, a fixed
150 ms added Server RTT to mimic hosted `haus.chat`), empty store vs. seeded store:

- **Cold launch → first Channel paint with data** (navigation start to the first transcript row
  of the landing Channel visible): with the cache, within one frame of the session gate opening;
  at least one Server RTT faster than without, at median and p90.
- **Launch requests** with a restored cache are no more than today's cold launch (transcripts of
  cursor-clean Chats are not refetched).
- **Restore cost:** read, validate, and hydrate of a full 10 MB store ≤ 30 ms main-thread at
  CPU×1; any single flush ≤ 4 ms.
- **Correctness:** zero stale-data findings in the App e2e cases above; `idle-silence` and
  `render-budget` unchanged.

## Open questions for the operator

1. **Paint before Clerk loads?** This spec paints only after the session gate opens. Painting from
   the boot pointer before Clerk confirms the session would make cold launches (and offline
   launches) much faster, but would briefly show a signed-out or revoked user's last data until
   Clerk answers. Ship phase 1 first and decide on measurements, or go straight to it on desktop?
2. **Web as well as desktop?** The design works in browsers, where shared machines are more
   likely. Enable on both, or desktop only at first?
3. **Encryption at rest:** this spec relies on the macOS user account and FileVault, like
   Chromium's own caches. Is that acceptable, or should desktop wrap entries with a key held in
   Electron `safeStorage` (no meaningful equivalent on the web)?
4. **Restored unread dots:** show the last known counts until the first `chat.list` refetch
   (proposed), or hide unread indicators until then?
5. **Bounds:** 20 transcripts per Server, 10 MB per user, 7 days — right numbers?
6. **Production Clear Cache and Reload** in the desktop Help menu: wanted, or dev tools only?
