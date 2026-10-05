---
summary: Approved decision that every desktop tab is an equal page with its own history (no primary tab), arranged in one pane or two (each with its own tab row; links stay in the tab with one pane and open in the other pane with two); one open rule for every in-app destination (an existing tab on that page is selected, else the current app tab navigates, else a new tab opens beside a web page), Cmd-T opens a browser new tab page, Cmd-, Shift-, and middle-click and web links open new tabs (Chrome's dispositions: Cmd- and middle-click in the background, Shift selected, from the sidebar and command menu too), tabs persist per window, and tabs multi-select and drag Chrome-style (a selection moves together) within a row, between panes, off into a new window, and into another window; the tab menu and the App menu's Tab menu carry Chrome's row commands (duplicate, move to new window, close to the right).
read_when:
  - changing desktop workspace tabs, panes, tab multi-select, tab drag, tear-off, or cross-window drag
  - changing what the sidebar, command menu, a chip, an in-app link, Cmd-, Shift-, or middle-click, or a web link does on desktop
  - changing desktop routing, per-tab history, or how hidden tabs keep their state
  - changing tab persistence, reopening closed tabs, tear-off, or moving tabs between windows
  - changing the tab right-click menu or the App menu's Tab and View items
  - changing how notifications, deep links, or unread clearing interact with desktop tabs
---

# 0039 Desktop tabs are equal pages

## Status

Accepted, 2026-10-03; built. Supersedes
[ADR 0038 Destinations open as tabs](0038-destinations-open-as-tabs.md) for its primary tab, side
pane, layout controls, and Thread preview tab. That ADR's Agent profile hub and the glance-by-hover
rule stand. An earlier draft of this ADR removed split mode; the approved model keeps it as two equal
panes. Amended 2026-10-03: tear-off and cross-window drag, removed with the old tab model, are back
on equal tabs. Amended 2026-10-05: tabs multi-select Chrome-style, per pane, and a selection drags,
closes, and moves as one. Amended 2026-10-03: Command-T and the plus button open the new tab page, not Inbox.
Amended 2026-10-05: the tab menu and the App menu's Tab menu gain Chrome's row commands (New tab to the
right, Duplicate, Move to new window, Close tabs to the right, and more), and View gains Reload Page
and Show/Hide Sidebar.
Amended 2026-10-03: expanded mode and its layout toggle are gone. A window is one pane or two; one
pane holding every tab is what expanded mode was, and links never open the second pane.

## Context

The desktop window has two kinds of tab. The **primary tab** is the routed page: the chat or core
page the sidebar picked. It cannot close, it changes identity as you navigate, and in expanded mode
it is drawn pinned first. Every other tab (browser, artifact, Agent, Thread, Files) is closable and
lives in a side pane (split mode) or after the primary tab (expanded mode).

That split makes browser-like behavior incoherent. You cannot close the channel and keep just a web
page. Command-W needs a rule table to decide what it closes. Where a destination lands depends on
its kind rather than on what the person asked for. Linear's desktop app shows a simpler model that
holds up under daily use: every tab is a page, and the sidebar navigates the tab you are in. Side by
side work is still worth keeping, so the split survives, but as two equal panes rather than a page
and its satellites.

## Decision

**Every tab is an equal page.** A tab can show any destination: a channel, a DM, Inbox, Tasks,
Search, Settings, an Agent profile, a Thread, an artifact, a chat's Files, a web page, or the new
tab page. Each tab
has its own back and forward history and keeps its own state while hidden: scroll position,
composer draft, open Thread, in-page drill-down. No tab is primary, pinned, or unclosable. A tab's
mark and title follow its current page (a channel's icon and color, a DM's Agent avatar, a section
glyph, a favicon). Duplicate tabs are allowed when asked for with Command-click.

**One pane or two.** A window shows one pane or two side by side, each with its own tab row. Any
tab can be in either pane. A new window starts as one pane. The second pane appears only when a tab
moves there: the tab menu's Move to right pane (on any tab of a one-pane window with another tab
left behind), or a drag into the other row once two exist. Move to left pane and Move to right
pane move a tab across a split. There is no layout toggle; one pane is reached by moving tabs into
it.

**Multi-select** follows Chrome's tab strip (`TabStripModel`, `Tab::OnMousePressed`), within one
pane's row. Command-click toggles a tab: an unselected tab joins and becomes the shown tab and the
anchor; a selected one leaves (never the last), and if it was shown or the anchor, the row's first
selected tab takes that role. Shift-click selects the range from the anchor to the tab and shows
it; the anchor stays. Shift-Command-click adds that range. Shift-Left and Shift-Right on a focused
tab extend the selection to its neighbor. A plain press on an unselected tab selects it alone; on a
tab already in a multi-selection it changes nothing, so the selection can drag, and a plain click
there selects that tab alone. Any activation (a click, Command-1…9, Control-Tab, a move) collapses
the selection, as Chrome's `ActivateTabAt` does. Only one pane holds a multi-selection: a
Command- or Shift-click in the other pane's row starts a selection there, seeded with that row's
shown tab, focuses that pane, and collapses this one. Selected tabs that are not shown wear a
quieter fill than the shown tab. The selection is never persisted; a reload shows each pane's
shown tab alone, as Chrome restores only the active tab.

A command on a selected tab acts on the whole selection; on an unselected tab, on that tab alone
(Chrome's `GetIndicesForCommand`), and a right-click never changes the selection. The tab menu
follows Chrome's `TabStripModel` context commands, grouped: the tab and its page: New tab to the
right (the new tab page right after the tab, selected), Duplicate (copies with their history as
one selected block after the last tab; a copy's web pages get fresh views at the same address),
Copy link (one tab: a web page's address, or an App page's absolute App URL; none for the new tab
page), Reload and Open in default browser (web pages); a single chat tab's actions in one Channel
or DM submenu; placement: Move
tab(s) to the other pane, and Move to new window (a tear-off without the pointer: a window offset
from this one claims the tabs and their live views; never a closed tab; disabled for a window's
every tab); then Close tab(s), Close other tabs (the rest of that row), and Close tabs to the right
(disabled with none). Skipped from Chrome: pin, rename, mute, and groups.

**App menu.** A Tab menu between Go and Window, as in Chrome: Select Next and Previous Tab
(Command-Option-Right and Left, the menu's own keys; Control-Tab and Command-Shift-] / [ stay with
the App and pages), Duplicate Tab, Move Tab to New Window, and Move Tab to Other Pane, acting on the
focused pane's current tab or selection. Each window reports which apply (`desktop:menu:state`)
and the menu disables the rest. View gains Reload Page (Command-R: the focused web page reloads;
an App page refetches the window's live queries in place; the App window never reloads) and
Show/Hide Sidebar (Control-Command-S, per window, kept across a reload).

**Drag** works like Chrome's tab strip. Pressing a tab applies the selection rules above; after a few pixels the tab itself
follows the pointer along its row, drawn as the selected tab above its neighbors, and each neighbor
slides into the vacated slot once the dragged tab's center crosses its midpoint. Released, the tab
eases into its slot. The other pane's row works the same: its tabs open a gap at the pointer.
Dragging any selected tab drags the whole selection: the tabs gather side by side, in row order,
around the pressed tab and ride the pointer as one block; within a row, into the other row, off
into a new window, and into another window, and they stay selected where they land, the shown tab
still shown. Escape puts the tabs back. Content follows the tab live, as in Chrome: the moment a
dragged tab lands in the other pane's row, that pane shows its page, and the pane it left shows its
next tab by the ordinary move rule. Crossing back or Escape restores both panes; the drop commits
exactly what was showing. If the move would empty its pane, that pane stays, blank, until the drop
collapses it, so the body never reflows under a band that still shows two rows. A tab previewed
onto the screen mid-drag, including one riding in from another window, does not count as viewed
until the drop. A body edge drop target is gone: Move to right or left pane in the tab's
menu opens or fills the other pane.

**Tear-off and cross-window drag.** Pulled about 25px off the band, a tab (or a dragged selection,
always together) detaches. It leaves its
row and a new window opens under the pointer holding just those tabs, live pages and history intact,
following the pointer until release. Over another window's band on the same Server (the front
window under the pointer only), the floating window disappears and the tab joins that row at the
pointer; pulling it out again detaches it again. If the tab was its window's only one, the window
itself travels with the pointer instead (likewise when every tab of the window is selected). A window emptied by a move closes. Escape returns a
detached tab to where it started. Windows on another Server refuse the tab. A moved tab is not a
closed tab: Reopen Closed Tab does not see it leave. Window order follows Chrome: a window whose
band the tab enters comes to the front without taking focus (the pressing window keeps the
pointer), and the window the tab is dropped into, a tear-off included, ends in front and focused
with the tab selected, taking over from another app that grabbed focus mid-drag. Equal tabs make this coherent: a one-tab
window is an ordinary window, and a tab is the same page wherever it lands.

Closing a pane's last tab closes the pane, leaving one full-width
pane. Command-W closes every selected tab of the focused pane; a tab's close button and middle-click
close just that tab. Each closed tab is its own Reopen Closed Tab entry, as in Chrome's
`TabRestoreService` (only a whole window or tab group closes as one entry), so Command-Shift-T
brings a closed selection back one tab at a time, each where it was. Closing the window's last tab closes the window. The tab row always shows, even with one tab.

**Navigation rules.** One open rule covers every in-app destination (a channel, DM, Inbox, Tasks,
Search, Settings, an Agent profile, a Thread, an artifact, a chat's Files, a task) wherever it is
opened from: the sidebar, the command menu, a chip, an in-message link, a page's own link, a
notification, a deep link, or the native menu's Settings… and Find….

- **Modified clicks follow Chrome's link dispositions** (`ui::DispositionFromClick`):
  Command-click or middle-click opens a new tab in the background (NEW_BACKGROUND_TAB), and
  Command-Shift-click selects it (NEW_FOREGROUND_TAB). Shift-click alone is a selected new tab
  here, not Chrome's new window. This holds for App links and chips in a page (after the current
  tab, same pane), App web links and chips, and links inside web pages (Electron's
  `background-tab` disposition; `foreground-tab` and `new-window` open selected); a web page's
  Open Link in New Tab is a background tab, as in Chrome. The sidebar and command menu follow the
  same dispositions from the focused pane's current tab (a sidebar row, like a bookmark; Command-
  Return on a row is Command-click), and a sidebar row's Open in new tab is a background tab, as
  Chrome's link and bookmark context menus are. Middle-click on a link or chip never autoscrolls.
- **Web links** always open a new browser tab: in the other pane with two panes, beside the source
  with one; a plain click, `target=_blank`, or a page's popup selects it. A chat is never replaced
  by a web page by accident.
- **New tabs follow Chrome's opener rule** (`TabStripModel::DetermineInsertionIndex`): a tab opened
  from a tab lands right after it, and further opens from the same tab land after the previous one,
  so three Command-clicks give opener, A, B, C. In two panes the rule applies in the destination
  pane, after its current tab. Selecting, moving, or closing a tab ends the run.
- **A plain click goes to a place.** If a tab in the window already shows that page, it is
  selected (its pane becomes focused) instead of duplicated; a deeper address on the same page (a
  task, a search filter) pushes onto that tab. Else, if the current tab shows an app page or the
  new tab page, it navigates (Back returns), like Linear's sidebar. Else the current tab shows a
  web page, and the place opens as a new selected tab right after it; the web page is untouched.
- **Which tab is current.** The sidebar, command menu, notifications, and deep links act on the
  focused pane (the one you last interacted with). An in-page link with one pane acts on its own
  tab. With two panes an in-page link acts on the **other** pane, matching existing tabs only
  there (`inPageLinksUseOtherPane` in `desktop-tabs-open.ts`); links never open the second pane. A
  page's own drill-down (a Settings section, an Agent profile card, a search filter) stays in its
  tab.

Web pages are content you are reading, not places: a sidebar click that replaced one would destroy
what you were reading for a destination you could have opened beside it. Linear's sidebar
navigates in place because Linear has no web tabs; Haus keeps that for app pages and steps aside
for web pages.

**The new tab page.** Command-T and a row's plus button open a new tab at the end of the focused pane's row (Chrome's rule; Command-click and links stay after the current tab), on the new tab page: a
pure browser start page with a focused address field (a URL or a web search) and the person's
recently visited sites. It carries nothing chat-related; the sidebar and Command-K cover chats.
Going somewhere turns that same tab into the web page, so Back returns to the start page. It is an
ordinary tab location ("New tab"): it persists, closes, reopens, and works in either pane, and a place replaces it like an app page.

**Shortcuts** act on the focused pane, the one last interacted with:

| Shortcut | Action |
| --- | --- |
| Command-T | New tab on the new tab page, at the end of the focused pane's row |
| Command-W | Close the focused pane's selected tabs (pane and window rules above) |
| Command-Shift-T | Reopen the last closed tab, with its history, in the pane it came from |
| Command-Shift-W | Close the window |
| Command-1 … Command-9 | Select a tab in the focused pane's row (Command-9: its last tab) |
| Control-Tab, Control-Shift-Tab | Cycle tabs in the focused pane |
| Command-Option-Right / Left | Select the next or previous tab (Tab menu) |
| Command-R | Reload the focused web page, or refetch an App page's data |
| Control-Command-S | Show or hide the sidebar |
| Command-[ / Command-] | Back and forward in the current tab's history |
| Command-L | Focus the address field when the current tab is a web page |

The shipped macOS Control rule stands: Control combos other than Control-Tab stay with the page's
text bindings.

**Settings is a tab.** Command-comma follows the open rule: it selects an existing Settings tab,
else opens Settings from the focused pane.

**Unread clearing.** A chat counts as viewed in focus ([ADR 0038 The Inbox Is
Unread](0038-inbox-is-unread-not-attention.md)) only while its tab is **shown** (selected in either
pane) in a focused, visible window. Both panes count: a
split exists so you can read both. A mounted hidden tab never marks read.

**Mounting.** The shown tabs and the most recently used hidden tabs, up to five, stay mounted;
older tabs unmount and rebuild from their saved history and page state when selected. Mounted tabs
render in one layer over the panes, keyed by tab and positioned over their pane's rect, so moving a
tab between panes or a drag preview never remounts it. Web pages are
Electron views with their own process; the limit governs React trees.

**Windows.** File > New Window opens a window with one tab on the App's default route (the Inbox).
A window opened on a route (`openWindow(route)`) starts with one tab there; a window torn off with
tabs, or opened by Move to new window, starts from those tabs. Tabs move between windows only by
dragging or Move to new window; a new window never
inherits another window's tabs.

**Persistence.** Tabs persist per window and per Server in that window's session storage, so a
reload keeps them and closing the window ends them: panes, tab order and selection, each tab's
bounded history, and cheap per-tab page state. Nothing is shared between windows, and a fresh
launch opens one tab on the default route. Web pages restore their address, not their session. Composer drafts
keep their own per-chat store. Older stored shapes are not migrated: they open as one pane with one
Inbox tab. A stored `layout` field from before expanded mode was removed is ignored.

**Scope.** Desktop only. The web App keeps one routed page with its chat side pane for Threads,
Files, and artifacts. iOS is unchanged.

## Consequences

- The Thread preview tab retires; a Thread is an ordinary page.
- One open rule replaces kind-based placement: an existing tab on that page is selected, else the
  current tab navigates unless it shows a web page (then a new tab beside it); the other pane on an
  in-page link with two panes; a new tab on Command-, Shift-, or middle-click or a web link.
- Every destination renders as a standalone page at any pane width; the side pane's 420px minimum
  becomes the pane minimum.
- Two tabs may show the same chat. Both stay live off the same synced queries; the composer draft
  is per chat, so typing in one shows in the other.
- The window URL stops being the source of navigation truth on desktop. Each tab owns its location
  ([React → per-tab routing](../internals/react.md#shell)); the window hash only mirrors the
  focused tab and seeds a window with no stored tabs.
- Command-W, tab cycling, and page shortcuts lose their side-pane and covered-page cases; the side
  pane toggle (Command-Shift-B) is removed.
