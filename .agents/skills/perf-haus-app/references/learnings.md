# Learnings: Haus App interaction performance

From the October 2026 pass (channel switch 180 → 59 ms warm, prod CPU×1). Paths are relative to
`apps/website/src/`.

## Render, not data

The Server answered every batch in 5–17 ms and hover prefetch already had chat data warm before
the press. The switch cost was React rendering ~2,500 DOM mutations and the old view staying on
screen while it happened. Check the harness `trpc` timings first; when they are small, stop
looking at the data layer.

## Navigation and Suspense

- **React Router 7 wraps navigations in `startTransition`** unless the navigate call is inside
  `flushSync`. A transition keeps the old view painted until the new tree is ready, so a slow
  render reads as "the click did nothing". `hooks/shell/use-press-navigation.ts` navigates on
  `pointerdown` under `flushSync`, sortable sidebar rows included (Chrome tab-strip behavior).
  Their dnd-kit sensor listens in the capture phase so it arms before that synchronous render.
- **`React.lazy` suspends on first render even when its module is already loaded**, which commits
  the fallback and engages React's ~300 ms Suspense reveal throttle. Render a loaded module
  directly and fall back to lazy only on a genuinely cold chunk:
  `features/servers/chat/chat-view-module.ts` (`useChatViewModule`). Never nest a lazy boundary
  inside a route chunk that is already split; the profile hub paid ~300 ms for exactly that.

## Keep views alive

`features/servers/chat/kept-chat-views.tsx` keeps the five most recent chat views mounted, so a
revisit is a reveal, not a rebuild. A hidden kept view must:

- never mark the chat read, take focus, or show presence;
- hide its band/topbar scope in the same commit it hides (`KeptTopbarScope`,
  `features/shell/shell-topbar.tsx`), or the old header flashes over the new chat;
- sync its thread pane to the current URL on reveal.

Hidden views leave duplicate DOM: probes and e2e locators must scope to the displayed surface.

**`<Activity>` vs effect-alive CSS hiding.** `<Activity mode="hidden">` tears a hidden view's
effects down and re-runs them on reveal: a new ProseMirror editor plus focus, scroller observers
and rect reads, every streaming-text row's effects, and a second scheduler render pass, ~30–40 ms
of a warm switch. Kept views are now effect-alive instead: stacked in one grid cell (no resize
work on reveal), hidden with `content-visibility: hidden` + `visibility: hidden` + `inert` +
`aria-hidden`. `visibility: hidden` alone still styles and lays out the subtree and measured
worse. Electron prod, warm, CPU×1: visible 46 → 36 ms, presented 79 → 57 ms, LoAF blocking 1 → 0,
DOM mutations 135 → 0; CPU×4: visible 177 → 149, presented 249 → 177, blocking 145 → 72. Cold is
unchanged. The price is that nothing rides remount any more:

- Every mount-time effect in the subtree must gate on presence or re-run on reveal. Render
  differences read `useTabPresence().shown` in a leaf; imperative work reads `useViewShown()`
  (`hooks/desktop-tabs/view-shown.ts`): listeners and rAF loops check `isShown()` when they fire,
  reveal work runs from `useViewShownChange`. Each gate has a test in
  `kept-chat-view-invariants.test.tsx`; audit the subtree for new effects when adding one.
- A hidden view must not read the shown chat's route: `HeldRoute` holds the location and route
  match it last saw (a hidden view saw `?thread=` and opened Threads for the wrong chat). A hidden
  `<Navigate>` would navigate the shown tab; `ChatPageView` renders it only while active.
- A hidden view's queries stay observed, so it re-renders on every change it subscribes to, at
  sync priority. Agent availability flips every turn and was in the transcript's row context, so
  each send re-rendered every row of all five kept transcripts (~450 ms script per send). Rows now
  read availability per avatar (`useAgentAvailability`) and the row agent list is keyed on rendered
  fields: per-send long frames back to zero. Measure the per-event cost
  (`.perf/electron/event-cost.mjs`-style: send in the shown chat with five views kept) whenever a
  kept view gains a subscription.
- Per-chat streams (engagement, thought) pause while hidden; a reveal resubscribes and re-reads.
- Reconnect (`invalidateQueries({ refetchType: 'active' })`) now refetches every kept chat's
  record and transcript pages, not only the shown one.

## Render less per row

- **Mount heavy per-message components on intent.** A closed emoji `Select` mounted per message
  built its whole collection while closed; mounting the picker on hover/press
  (`features/chats/thread/message-reactions.tsx`) was the largest single win.
- **`content-visibility: auto`** with `overflow-clip-margin` so hover islands (action menus,
  reaction pickers) are not clipped: `features/chats/chat-transcript.tsx`,
  `components/chats/message-scroller.tsx`. Verify anchoring with `scroll-anchor-check.mjs`.
- **One scroll-restore owner**, in a layout effect (`features/chats/chat-scroll-position-memory.tsx`).
  Two owners fight and produce a visible jump after paint.

## Window the transcript

A cold switch paid ~0.7 ms per mounted row, and every row of the loaded page mounted. The
transcript now renders a window (`features/chats/transcript-render-window.ts`): rows that fill the
opening viewport, then rows as they near it. Prod, CPU×1, cold paint 112 → 48 ms, warm 50 → 31;
Electron cold visible 102 → 40, presented 130 → 72 (results-2026-10.md).

- Keep the scroller's DOM contract. Every row keeps its scroller item; a row outside the window is
  an empty placeholder at its estimated height. The `@shadcn/react` scroller detects prepends,
  restores scroll, and tracks visibility on in-flow direct children, and native scroll anchoring
  needs in-flow boxes. An absolutely positioned virtualizer replaces all of that (the June 2026
  TanStack version needed ~900 lines of scroll control).
- A placeholder has no `messageId`: read tracking counts only rendered rows, and the scroller
  never anchors or restores to one. It also carries `overflow-anchor: none`, so the browser
  anchors to a rendered row while the placeholder takes its real height.
- Rows join and never leave: no remembered heights, no focus or open-popover loss on scroll, and
  hidden kept views pay nothing. A long session that scrolls all history mounts it all, as before.
- Measure anchoring by what the reader sees. `scroll-anchor-check.mjs` used to compare row motion
  against scroll-offset change, which is blind to an anchoring failure; it now expects the
  reference row to move exactly by the wheel. That exposed a pre-existing ~7,000 px jump when an
  older page loaded near the top: the day divider stayed first, so the scroller saw no prepend,
  and native anchoring does nothing at scroll offset 0. Dividers no longer anchor, and the
  scroller restores its anchor on every non-following content change (dependency patch).
- Rows that render a frame after a programmatic scroll restore are not corrected by native
  anchoring. An older page reaching a rendered top therefore renders its last viewport of rows in
  the same commit, so the restore measures real heights.
- A patched dependency is cached by Vite's optimizer (`apps/website/node_modules/.vite`), whose
  hash ignores `node_modules` contents. Delete it after regenerating a patch, or the dev stack and
  App e2e keep running the previous patch.

## Shared state across kept views

A context value that changes on every dispatch re-renders every kept tab. Use an external store
with selectors and stable command functions: `hooks/desktop-tabs/desktop-tabs-store.ts`.

## Desktop is its own render profile

A warm desktop channel switch rendered ~24,600 components against ~2,800 on the web, invisible to
the web harness. Each desktop tab runs under a declarative `<Router>` (`IsolatedTabRouter`), and
stock React Router hands out a new `navigate` (so a new `setSearchParams`) there on every location
change; the web's data router does not. Every callback built on them (reference activation,
thread open) changed per switch, rebuilt the transcript's row context, and re-rendered every row
in every kept view, revealed and hidden. `patches/react-router@7.13.1.patch` makes declarative
`useNavigate` stable (`features/shell/tab-router-stability.test.tsx`): warm renders 24.8k → 2.6k,
warm visible 95 → 51 ms, LoAF blocking 53 → 10 ms (prod, CPU×1).

- Count renders in real Electron, not just Chrome: `scripts/perf/render-audit.mjs` against a
  `HAUS_PERF_RENDER_AUDIT=1` bundle (a build-time `renderWithHooks` hook; node_modules stays
  untouched). A total far above the web's names the cascade.
- Tab presence flips on every tab and kept-view show/hide. Id-only readers use `useTabId()`; a
  large view keeps its presence read in a leaf (`ChatReadState`).
- Never read layout in a layout effect or rAF on the switch path: each read forced a full style
  and layout (~10 ms over ~1,440 elements). Measure in a ResizeObserver callback
  (`WorkspaceTabLabel`) or after paint (the message scroller's visibility snapshot, in the
  `@shadcn/react` patch).

## Render storms: one event, every kept view

The October 2026 render audit found one message anywhere on the Server re-rendering 10–30k
components (every rendered row of all five kept transcripts) and a quiet channel re-rendering
3–15k per idle minute. Each cause was a kept view subscribed to something that churns, and each
fix narrows the subscription; `features/servers/chat/transcript-render-isolation.test.tsx`
pins them with a render census (`test-support/render-census.tsx`), and the audit's cascade
roots (components re-rendering with unchanged props) name new ones.

- **Index-wise structural sharing breaks on a sliding page.** A new message shifts the newest
  page by one, so React Query's default sharing handed back a new object for every loaded
  message, and the transcript (which uses message identity as its change signal) re-rendered
  every row. Share by id: `hooks/servers/message-page-sharing.ts`.
- **Order-sensitive keys churn on reorder.** The chat list is ordered by activity, so a key
  joined in list order changed on every message anywhere. Sort the key, and read through
  `select` (`useChatAppearances`, `useListedChat`, `useChatListSelection`) so readers re-render
  only for the fields they use. Same for `agent.list`: availability flips every turn
  (`useAgentAppearances`, `useAgentAvailability`).
- **A spread query result tracks every field.** `{ ...query }` touches every getter, so React
  Query re-rendered each kept `ChatView` on every fetch-status and stale flip. Return named
  fields.
- **Layout-level reads cascade.** `ServerLayout` and `ServerShell` read the chat list; every
  message re-rendered the shell, which re-created route context and re-rendered the shown chat
  view. Push such reads into a leaf (`ChatListEffects`) or a select.
- **Stable functions in a churning context re-render their readers.** The activity listener
  subscription lived beside the activity snapshot; it has its own context now.
- **Router hooks per row.** `useOpenAgentProfile` read `useParams` in every avatar. The opener is
  route-stable and handed down through the transcript render context; `useStableNavigate` keeps
  HeroUI's router and sidebar providers from changing with the focused tab.
- **Activity hide/reveal re-ran image loading.** Radix Avatar reset its status in effect
  cleanup, so every avatar re-rendered on each desktop tab hide and reveal. Patched
  (`patches/@radix-ui%2Freact-avatar@1.2.6.patch`); `EntityAvatar` keys its root by `src`.
- **Live Agents add noise.** Automations and Agent wakes land mid-run; read medians of `--reps`.

Remaining (render audit, after): the sidebar's chat navigation re-renders whole (~60% of a
message's renders) on every chat-list update; every live avatar re-renders its presence badge
on each availability flip; desktop tab reveal re-runs transcript reply-text and composer
effects; idle renders follow socket session refresh and connection-state flips.

## Prefetch and warming

Prefetch on hover, focus, and press (`hooks/servers/use-preload-chat.ts`), plus idle warming of
likely next chats (`hooks/servers/use-idle-chat-warming.ts`) at ≤2 concurrent requests. Wider
fan-out wedges the Bun dev Server's SQL pool.

## Reveal as one unit

The Agent profile revealed region by region (identity, cards, lists) as each query landed. It now
reveals as one unit after first paint: `hooks/members/use-agent-hub-reveal.ts`. Pop-in is a
perceived-performance bug even when total time is fine; the harness `regions` timeline shows it.

## Idle must be quiet: Server-originated noise

An idle App should send no tRPC requests and receive no `server.updated` events. Count both:
log every `/trpc/` request per procedure and every websocket `result.type === 'data'` frame per
subscription path, for three minutes idle on a channel, Inbox, and an Agent profile, plus window
focus/blur cycles (dispatch `visibilitychange` on `window`; React Query's focus manager listens
there) and a second tab watching while the first reloads. Three sources of idle noise were
Server-shaped, not render-shaped (October 2026):

- **Probes on focus.** `computer.checkPresence` pinged every Computer on every focus and every
  reconnect. Server-side transport liveness (ping 10 s, reap after 30 s of silence,
  `computers/socket-liveness.ts`) plus the disconnect event replaced it; the one action that
  needs certainty (`computer.update`) probes Server-side. Prefer a Server timeout plus an event
  over a client probe.
- **Announcing non-changes.** `member.syncIdentity` runs on every App load and announced a
  profile change to every member each time; Computer reports re-sent after every turn announced
  `scope:'computer'` (seven reads per viewer) each time. Writes now return whether a row changed
  (`is distinct from` with `jsonb` params via `sql.param`, never `JSON.stringify`, which Bun SQL
  encodes as a JSON string) and only a real change announces. Server tests assert both directions:
  no event when unchanged, one when changed (`haus-quiet-*.test.ts`).
- **Polling where an event belongs.** The live turn journal polled the Computer every second
  because reasoning had no event. The Computer now sends a throttled
  `agent-execution-journal-changed` notice (no evidence) relayed on `agent.onExecutionJournal`.

Token-rotation reconnects (each reconnect refetches every active query) are the remaining idle
cost and belong to the App's session/reconnect owner, not these Server paths.

## Realtime cache patching pitfalls (found in adversarial review)

Each of these shipped green in unit tests and failed a realtime scenario:

- Do not trim grown infinite-query pages when patching: older pages carry the cursors the user
  already loaded.
- An event that arrives during a first fetch must trigger a reread after the fetch lands. A plain
  `invalidate` mid-fetch is cleared by that fetch's success.
- Streams do not replay. Re-sync when a stream (re)starts.
- A run new to a page needs a reread for Server-only fields such as trigger titles; the event
  does not carry them.
- Optimistic unread must not zero counts that include thread replies.
- Cancel in-flight list fetches before an optimistic patch, or the stale response overwrites it.
- One recovery owner per read on reconnect. A global "invalidate everything active" on top of
  each stream's restart catch-up refetched agent, activity, and engagement reads twice per
  reconnect; the App-wide pass now skips `streamRecoveredReads` (`lib/query-reconnect-recovery.ts`).
- `utils.x.fetch()` honors the client's default `staleTime` (30 s). A catch-up read keyed by cursor
  must pass `staleTime: 0`, or a second gap at the same cursor gets the first gap's cached answer.
- Idle reconnects usually mean credentials: Clerk rotation must refresh the socket in place
  (`session.refresh`), never reopen it.
