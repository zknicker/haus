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

- Count renders in real Electron, not just Chrome: instrument `renderWithHooks` in
  `react-dom-client.production.js` (call a global counter), build a prod bundle, restore the file,
  and diff per-switch totals before and after. A total far above the web's names the cascade.
- Tab presence flips on every tab and kept-view show/hide. Id-only readers use `useTabId()`; a
  large view keeps its presence read in a leaf (`ChatReadState`).
- Never read layout in a layout effect or rAF on the switch path: each read forced a full style
  and layout (~10 ms over ~1,440 elements). Measure in a ResizeObserver callback
  (`WorkspaceTabLabel`) or after paint (the message scroller's visibility snapshot, in the
  `@shadcn/react` patch).

## Prefetch and warming

Prefetch on hover, focus, and press (`hooks/servers/use-preload-chat.ts`), plus idle warming of
likely next chats (`hooks/servers/use-idle-chat-warming.ts`) at ≤2 concurrent requests. Wider
fan-out wedges the Bun dev Server's SQL pool.

## Reveal as one unit

The Agent profile revealed region by region (identity, cards, lists) as each query landed. It now
reveals as one unit after first paint: `hooks/members/use-agent-hub-reveal.ts`. Pop-in is a
perceived-performance bug even when total time is fine; the harness `regions` timeline shows it.

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
