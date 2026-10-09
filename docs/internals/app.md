---
summary: Haus App ownership, hosted data flow, cache boundaries, and Electron shell responsibilities.
read_when:
  - changing App data flow, routing, caching, settings, or Electron behavior
  - deciding whether behavior belongs in App or Server
---

# Haus App

Haus App is the React client in `apps/website`. It talks to Haus Server through the hosted tRPC
client and renders Server-owned collaboration state. The same App runs in a browser or in Electron;
Electron owns desktop installation, window behavior (the menu bar and its shortcuts, window-state
persistence, focus dimming, history swipes, and the Dock unread badge), and desktop updates, not a
local backend.

Desktop browser pages are App-owned presentation with Electron-owned native page lifecycles. See
[Browser tabs](../features/browser-tabs.md) for navigation, session storage, and access boundaries.

The persistent sidebar footer projects Electron's update state into the App: an available release
is clickable to begin its download, active downloads show determinate progress, and a downloaded
release becomes a restart action. Electron remains the state owner and replays its latest actionable
or in-flight status to every window; the App subscribes through the desktop bridge.

The App owns presentation state, local preferences, React Query cache state, optimistic compose
rows, routing, and transient UI. Server owns durable Chats, Messages, Tasks, members, Agents,
attachments, and Computer reports. Optimistic rows remain App-local until Server acknowledges the
mutation.

The App shell suppresses the browser or WebView's native context menu on non-actionable product
surfaces so browser commands such as Reload and Inspect do not leak into Haus. Product context
menus take precedence. Editable controls and selected text retain native browser edit commands;
the Electron shell replaces those commands with Haus's desktop edit menu.

Computer availability is displayed from Server-reported state. The App does not probe local
processes, construct execution routing ids, connect to Computer, or keep a second canonical
timeline. A Computer being offline degrades execution controls without hiding already-synced Server
data.

## Desktop Bridge Is A Cross-Version Contract

A packaged shell never bundles a renderer: it loads the App the hosted Server is
serving. The two therefore ship on independent channels — the shell through the
S3 release feed, the App through a Server deploy — and any installed shell may be
paired with an older or newer App. The `window` global the preload injects is a
production wire contract between them, not an internal name.

The supported desktop shell exposes `window.hausDesktop`, and the hosted App
reads that single contract. Publish and install the matching desktop release
before promoting a Server that changes this bridge. Older shells must be
replaced; they are not supported against the renamed contract.

Both ends are covered by `apps/website/electron/preload.test.cjs` and
`apps/website/src/lib/desktop-bridge.test.ts`.

Each website build embeds a unique build id and emits the same id in `haus-app-build.json`.
The App polls this same-origin file independently of the published release feed, so it detects
the website actually deployed, including rollbacks. Haus Server serves the marker and every
`index.html` response with `Cache-Control: no-store`. Reload keeps the current URL and loads the
deployed renderer; an existing window continues running its loaded code until the user reloads.

## Desktop Web Views

Web pages in desktop tabs ([ADR 0039](../adr/0039-desktop-tabs-are-equal-pages.md)) are Electron
`WebContentsView`s that the App names and places; Electron keeps only their live pages
(`electron/browser-workspace*.cjs`). The bridge contract:

- **Naming.** A browser `TabLocation` carries a `viewId` the App chose. `browserCommand({ kind:
  'open', url, viewId })` creates that view if it does not exist and otherwise does nothing, so a
  remounted, reopened, or relaunched tab restores by URL. `open` without a `viewId` (App-window
  links) becomes an open request instead. Views carry no selection or order.
- **Layout.** `browserLayout(placements)` lists every view on screen (one per shown pane) with its
  CSS-pixel bounds; unlisted views hide. Each shown `BrowserTabPage` places its own view through
  `hooks/browser/browser-view-layout.ts`, which sends the whole list. `focused` marks the focused
  pane's web page: App-menu page actions (Reload, zoom, Find) act on it.
- **Covers.** Native views paint above DOM, so a product overlay over a page, a pane divider drag
  (`beginDesktopPointerDrag`), or a tab drag for its whole length, tear-off included
  (`features/shell/tab-drag/`), calls `coverBrowserViews()` and hides the view behind a captured
  still (`browserCapture(viewId)`, placed views only).
- **Links and focus.** A page's popup, `target=_blank`, ⌘-click, or Open Link in New Tab sends
  `onBrowserOpenRequest` (`openerId`, `background`); the App opens a new tab from the opener's tab
  by the ADR placement rule (`background` asks for a same-pane new tab). A view taking key focus
  sends `onBrowserFocus(viewId)` and the App focuses that tab's pane. Keys pressed inside a page act
  on that page.
- **Disposal.** `BrowserViewsProvider` closes every view no open tab's history names, so views of
  closed tabs and trimmed entries are destroyed; Server switch resets the workspace.
- **Window commands.** File > New Tab (⌘T, the new tab page) and File > Close (⌘W) arrive as
  `onNewTabRequest` / `onCloseWindowRequest` and act on the focused pane; closing the window's last
  tab calls `closeWindow()`. ⌘⇧T, ⌘1–9, and Control-Tab arrive as `onBrowserShortcut` or the
  renderer's own keydown. `openWindow(route)` seeds a new window's first tab from `route`
  (`electron/window-routing.cjs` allows only Server and known App routes).
- **Tab drag between windows.** `electron/tab-drag-ipc.cjs` and `tab-drag-session.cjs` own the
  cross-window half of a tab drag (`lib/desktop-tab-drag.ts` is the contract). Every window
  reports its band (`tabStripReport`). The pressing window opens the session (`tabDragStart`),
  keeps the pointer for the whole gesture, and alone ends it (`tabDragEnd`). The window a tab
  rides detaches it (`tabDragDetach`) once it is pulled off the band. Electron then follows the
  cursor at ~60Hz with a floating window: a new hidden window that claims the tab synchronously
  (`tabDragClaim`), or the source window itself when the tab was its only one. Over another
  same-Server window's band, Electron sends `attach` and relays the cursor (`onTabDrag`). A moved
  tab's web views go with it (`browser-workspace-ipc.cjs` `transfer`), so pages keep their live
  session and history; the App's later `open` for that view finds it and never reloads. A window
  always hears of the tabs (`attach`, or `restore` to the pressing window on Escape) before their
  views arrive, and the App closes a view only after no tab has named it for a short grace
  (`browser-view-sweep.ts`), so a view in flight is never destroyed. A window at its web view
  limit refuses the tabs; they keep floating. Tabs riding in from another window are a preview
  there, not viewed, until the drop. A
  pressing page that crashes, navigates, or closes, or a closed window the drag involves, ends
  the session without undoing it. If the pointer up never reaches the pressing window, losing
  pointer capture drops the tab where it is.

## Window Cache Handoff

Each desktop window is its own App instance with its own React Query cache. A window opened from
another one (File > New Window from a focused window, `openWindow(route)`, or a tab tear-off)
starts with a copy of its opener's cache, then refreshes normally. There are no spare or prewarmed
windows.

- **Ask.** `createWindow({ opener })` in `electron/main.cjs` calls
  `electron/query-cache-handoff.cjs`, which sends the opener `desktop:query-cache:request`. The
  opener's `HausServerProvider` answers with `packQueryCacheHandoff` (`lib/query-cache-handoff.ts`):
  TanStack `dehydrate` of settled tRPC reads plus the Clerk user id.
- **What is copied.** `isShareableQuery` is the one rule. It copies successful tRPC queries only.
  It skips App-local caches such as update checks, and it skips reads that opt
  out of mount refetch (`queryPolicy.volatileState`), because a live subscription keeps those
  current. It also skips one-time-code and invitation reads, and execution journals. Activity-log execution
outlines live under App-local keys, so a new window reads its own in one request. A cache over 4 MB (JSON estimate) is
  not handed off at all.
- **Carry.** IPC structured clone carries the copy as is, so no transformer is involved (the tRPC
  link has none). Main holds it in memory for the one new window and never writes it to disk. Main
  drops it once claimed, after 10 seconds, when the new window closes, or when the shared Clerk
  session changes or clears (`clerk-session-handoff.cjs` `onSessionChange`).
- **Use.** The new window claims the copy synchronously (`queryCacheClaim`) when its
  `QueryClient` is created, before first render. It hydrates only when the copy's user matches
  this window's Clerk user: the loaded user, or the handed-off session's user before Clerk loads.
  It then invalidates everything without refetching, so the data renders at once and every read
  refetches when it mounts. Realtime subscriptions take over from there.

## Window Layouts

The desktop window layout ([feature](../features/desktop-window-layout.md)) is App-local
presentation state: `lib/shell-variant.ts` and `hooks/shell/use-shell-variant.ts` (`band` or
`canvas`; null on the web), persisted in `localStorage` and followed across windows through storage
events. The renderer stamps `data-shell-variant` on the document root; the "Shell variants" section
of `default-theme.css` owns every visual difference, including the Codex tab values, and
`features/shell/window-band.tsx` is the window band. Both layouts share one band height, so
`electron/main.cjs` seats the traffic lights once at window creation and no IPC carries the layout.
The web keeps its column topbar and full-height sidebar.

## Session Refresh And Reconnect

The App keeps one tRPC client and React provider mounted for the signed-in human. Clerk token
rotation reconnects only that client's websocket; the reconnect reads fresh connection parameters
and resumes pending subscriptions. Credential rotation must not replace the tRPC provider, remount
the Server shell, clear composer drafts, or discard other local presentation state.

A genuine human identity change renders through a newly keyed hosted QueryClient and provider so
the next identity cannot observe the previous identity's cache or local presentation state. After a
websocket reconnect, active durable queries reconcile from Server state while their cached snapshot
continues rendering.

React ownership and event rules live in [React Conventions](react.md).
