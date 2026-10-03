---
summary: Proposed decision that the desktop App drops the routed primary tab, split mode, and the side pane for one strip of equal tabs (Linear's model), each a full page with its own history; the sidebar and in-app links navigate the current tab, Cmd-click and web links open new tabs, tabs persist per window, and tear-off and cross-window drag are removed.
read_when:
  - changing desktop workspace tabs, the primary tab, split or expanded mode, or the side pane
  - changing what the sidebar, an in-app link, Cmd-click, or a web link does on desktop
  - changing desktop routing, per-tab history, or how hidden tabs keep their state
  - changing tab persistence, reopening closed tabs, tear-off, or moving tabs between windows
  - changing how notifications, deep links, or unread clearing interact with desktop tabs
---

# 0039 Desktop tabs are equal pages

## Status

Proposed, 2026-10-03. Supersedes [ADR 0038 Destinations open as tabs](0038-destinations-open-as-tabs.md)
once built: its split and expanded modes, side pane, primary tab, and Thread preview tab. That ADR's
Agent profile hub and the glance-by-hover rule stand, re-read against one strip.

## Context

The desktop window has two kinds of tab. The **primary tab** is the routed page: the chat or core
page the sidebar picked. It cannot close, it changes identity as you navigate, and in expanded mode
it is drawn pinned first. Every other tab (browser, artifact, Agent, Thread, Files) is closable and
lives in a side pane (split mode) or after the primary tab (expanded mode).

That split makes browser-like behavior incoherent. You cannot close the channel and keep just a web
page. Tearing a tab off into a window has no honest meaning, because the new window still needs a
primary tab and has to invent one. Command-W needs a rule table to decide what it closes. Opening a
web link from a chat must avoid the routed page, so where a destination lands depends on its kind
rather than on what the person asked for. Two layout modes, a side pane toggle, a hidden-pane badge,
and pane-width storage exist only to arrange the two kinds side by side.

Linear's desktop app shows a simpler model that holds up under daily use: every tab is a page, and
the sidebar navigates whichever tab you are in.

## Decision

**One strip of equal tabs.** A desktop window holds an ordered list of tabs, and every tab is a full
page with its own back and forward history. A tab can show any destination: a channel, a DM, Inbox,
Tasks, Search, Members, an Agent profile, a Thread, an artifact, a chat's Files, or a web page. No
tab is primary, pinned, or unclosable. A tab's mark and title follow its current page (a channel's
icon and color, a DM's Agent avatar, a section glyph, a favicon), the way the primary tab does today.

**The sidebar is window chrome that navigates the current tab**, like an address bar. Clicking a
channel replaces the current tab's page and pushes onto its history; Back returns. That holds when
the current tab shows a web page too: the page is replaced, and Back brings it back. In-app links
(a channel mention, an Agent chip, a Thread, an artifact) navigate the current tab as well.

**New tabs come from intent, not from kind.** Command-click or middle-click on a sidebar row or an
in-app link opens it in a new tab after the current one. Web links always open a new tab, so a chat
is never replaced by a web page by accident. A destination opened in a new tab while another tab
already shows it still opens a new tab; the person asked for one. Tabs may be reordered by drag
only.

**Shortcuts.** Command-T opens a new tab on Inbox. Command-W closes the current tab; closing the
last tab closes the window. Command-Shift-T reopens the most recently closed tab, chats included,
with its history. Command-1 through Command-9, Control-Tab, and Command-Shift-] / [ select tabs as
today. Command-L focuses the address field when the current tab is a web page. Command-[ and
Command-] go back and forward in the current tab's history, whatever it shows.

**No layout modes.** Split mode, expanded mode, the side pane, its toggle, the expand button, and
the hidden-pane badge are removed. The selected tab takes the whole content width.

**One window, its own tabs.** There is no tear-off and no cross-window drag. File > New Window stays
and opens a window with one Inbox tab. A "Move to New Window" tab menu item may come later; it would
carry the tab's history.

**Each tab keeps its state.** Switching tabs preserves scroll position, composer draft, open Thread,
and in-page drill-down (an Agent profile section, a Settings sub-page). The most recent N tabs stay
mounted and hidden; older tabs unmount and rebuild from saved per-tab state when selected. Composer
drafts already persist per chat, so an unmounted chat tab loses nothing but its exact scroll offset,
which saved state restores.

**Persistence.** Tabs persist per window: order, selection, each tab's history stack and position,
and each tab's restorable page state. A restarted Haus restores each window's tabs; web pages
restore their address, not their session. Switching Servers swaps the window's tab set; each Server
keeps its own.

**Scope.** Desktop only. The web App keeps one routed page with its chat side pane for Threads,
Files, and artifacts. iOS is unchanged.

## Open questions

Each has a recommended answer; the first build should adopt it unless use proves otherwise.

- **Settings: tab or modal?** Recommend a tab. It is a page with drill-down and a breadcrumb today,
  and a modal would reintroduce a second kind of surface. Command-comma selects an existing Settings
  tab if one is open, otherwise opens one after the current tab.
- **Does a single-tab window hide the strip?** Recommend always showing it. The band needs a home
  for the page title and actions anyway, and a strip that appears on the second tab moves the page.
  Linear's "Always show navigation tabs" option can follow if people ask.
- **Notification and deep-link clicks.** Recommend selecting an existing tab already showing that
  chat (or Thread), else navigating the current tab. Opening a new tab per notification litters the
  strip; replacing the current tab when the chat is already open elsewhere duplicates it.
- **Unread clearing in background tabs.** Recommend that only the selected tab in a focused, visible
  window counts as viewing in focus ([ADR 0038 The Inbox Is Unread](0038-inbox-is-unread-not-attention.md)).
  A mounted hidden chat tab must not mark read.
- **How many tabs stay mounted?** Recommend five, as a constant beside the model. Web pages are
  Electron views and keep their own process regardless; the limit governs React trees.
- **Sidebar click on a web-page tab.** Recommend replacing the page, as decided above, with Back
  returning to it. The alternative, a new tab, would make the sidebar's meaning depend on what the
  tab shows, which is the incoherence this ADR removes.

## Consequences

- One rule replaces placement logic: the current tab, unless the person asked for a new one or the
  link leaves Haus. `useOpenAgentProfile` and the tab openers collapse into "navigate current tab"
  and "open in new tab".
- Command-W, tab cycling, and page shortcuts lose their side-pane and covered-page cases.
- Tear-off and cross-window drag were tried and removed, Electron bridge included, and stay out;
  they are not reinterpreted for equal tabs.
- Every destination must render well at full content width as a standalone page; the 420px side
  pane minimum from ADR 0038 (Destinations open as tabs) no longer applies.
- Two tabs may show the same chat. Both stay live off the same synced queries; the composer draft is
  per chat, so typing in one shows in the other.
- The window URL stops being the single source of navigation truth on desktop; see routing below.

## Migration sketch

**Routing ownership.** Today `app-router.tsx` builds one `createHashRouter` on desktop, and
`routes/app/server-layout.tsx` with `server-route-state.ts` derives the section and sidebar from
that one location. Recommend per-tab locations: the window router keeps the Server shell
(`/s/:slug`, sidebar, band), and each mounted tab renders the Server's child route table under its
own memory router (`createMemoryRouter`), so `useNavigate` and `useParams` inside a page act on its
tab. Extract the child routes into a shared factory used by both the web browser router and the
per-tab routers. The selected tab mirrors its location into the window hash for reload and
debugging. Sidebar clicks and `server-route-state.ts` read and navigate the selected tab's router,
not the window's. The rejected alternative, one router whose location is swapped on tab select,
cannot keep hidden tabs mounted at their own location.

**Workspace tabs model.** `hooks/workspace-tabs/workspace-tabs-model.ts` drops `WorkspaceMode`,
`primaryTabRef`, `primarySelected`, `sidePaneVisible`, and the per-kind arrays. A tab becomes
`{ id, history: TabLocation[], index, pageState }`, where `TabLocation` is a narrow union: an app
path within the Server, or a browser view id with its address. Agent, artifact, Thread, and Files
tabs become ordinary app paths (the Agent profile and Files need desktop routes; artifacts and
Threads need one too). The preview Thread rule from ADR 0038 (Destinations open as tabs)
becomes: a Thread opened from a chat
navigates the current tab, so the preview concept can retire. Browser tabs stay Electron-owned
views, now keyed to a tab's history entry rather than being a tab.

**Removals.** Split and expanded modes and the side pane: `workspace-side-pane.tsx`,
`workspace-layout-controls.tsx`, `use-workspace-layout.ts`, `use-side-pane-width.ts`,
`primary-workspace-tab.tsx`, `primary-tab-identity.ts` (its identity logic moves to the generic tab
mark), and `routed-page-reveal.ts`.
`browser-shortcuts.cjs` loses the side-pane toggle (Command-Shift-B) and gains Back and Forward for
app pages.

**Persistence.** `workspace-tabs-storage.ts` and `workspace-tabs-window-storage.ts` change shape:
per-window session storage holds the tab list with histories and page state; `haus.workspaceMode`
and the pane width keys are deleted. Electron's window state restores each window's tab set on
relaunch. Old stored shapes parse to one Inbox tab; no migration of split-mode state.
`closed-tabs.ts` stores whole tabs with history, chats included.

**Tests.** Model and reducer tests replace mode and placement cases with navigate-current,
open-new, close-last-closes-window, reopen-with-history, and mount-limit eviction. Electron
`*.test.cjs` suites add window-close-on-last-tab. App e2e
covers: sidebar navigates the current tab and Back returns; Command-click opens a new tab; a web
link opens a new tab; a hidden chat tab keeps its draft and scroll; a background chat tab does not
mark read; reload restores tabs. `e2e/electron-window-smoke.mjs` and `electron-browser-smoke.mjs`
update for the single strip.

**Docs.** Rewrite `docs/features/browser-tabs.md` (modes, side pane, shortcut table) and
`docs/features/desktop-window-layout.md` (band contents, hairlines); update `docs/internals/react.md`
(workspace tabs ownership, per-tab routing) and `docs/internals/app.md` (drop the side-pane bridge);
mark the layout sections of ADR 0038 (Destinations open as tabs) superseded; add **Tab** to
`CONTEXT.md` if the glossary needs it.
