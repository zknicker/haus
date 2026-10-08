---
summary: Desktop tabs as equal pages (chats, sections, Agents, Threads, Files, artifacts, web pages, the new tab page) with per-tab history, one or two panes, where links and the sidebar open things (Agent profiles and Settings in new tabs, Threads in the right pane), shortcuts, per-window persistence, in-app browsing, and the boundary between the Haus browser and the user's personal browser.
read_when:
  - changing desktop tabs, panes, tab multi-select, tab drag, tear-off, cross-window drag, or where new tabs land
  - changing what the sidebar, command menu, a chip, an in-app link, Command-, Shift-, or middle-click (background versus selected new tabs), a notification, or a web link does on desktop
  - changing desktop Thread, Files, artifact, or Agent pages, or the chat side panel versus desktop pages
  - changing desktop browser tabs, the new tab page, external-link opening, or browser session storage
  - changing tab identity, favicons, or tab row overflow
  - changing tab shortcuts, find in page, page zoom, reopening closed tabs, or the page context menu
  - changing the tab right-click menu, the App menu's Tab menu, Reload Page, or Show/Hide Sidebar
  - changing tab persistence per window or the shell topbar on desktop
---

# Desktop tabs

The desktop App shows tabs in the window band ([ADR 0039](../adr/0039-desktop-tabs-are-equal-pages.md)).
Every tab is an equal page with its own back and forward history: a channel, a DM, Inbox, Tasks,
Search, Settings, an Agent profile, a Thread, an artifact, a chat's Files, a web page, or the new
tab page. No tab is
primary, pinned, or unclosable, and a hidden tab keeps its state: scroll position, composer draft,
open drill-down. The web App has no tabs: it keeps one routed page with the chat side panel for
Threads, Files, and artifacts.

## Tabs and rows

Every tab shares one anatomy: a compact rounded tab holding a leading mark, a title that ends in a
fade when cut off, and a close button that shows on the selected tab and on hover or keyboard
focus. The whole tab selects it. A tab's mark and title follow its current page and borrow what the
sidebar shows: a channel's icon and color, a DM's or Agent's avatar, a section's glyph, a Thread's
or Files page's chat mark (the tooltip adds `#name › thread`, or `DM › files`), the Artifact Panel's
file glyph, or a web page's favicon (a spinner while it loads, a globe when it has none). A tab whose
record is still loading keeps an empty mark slot and title.

Each pane's row sits in the band directly over its pane and always shows, even with one tab. A row
never scrolls: every tab holds one width basis and shrinks evenly down to mark-only tabs, the
selected tab keeps its close button, and the row's plus button stays pinned after the last tab. Each
page keeps its own band at the top of its pane, under the rows; because the tab names the page, band
content drops what repeats that identity and keeps only controls or a more specific title. A band
its page leaves empty collapses, so the page starts at the top of its pane: a Chat, DM, Inbox,
Agent profile hub, Thread, Files, or artifact page shows no band. An Agent profile section keeps
its trail and actions in the band, except Workspace: its bar (breadcrumb, file controls, and "…"
menu) sits over the content column in band chrome so the file rail reaches the top of the pane,
and the band collapses. A Chat's actions live in its tab's
context menu and in its sidebar row's context menu. A sidebar chat or DM row's menu offers Open in
new tab right after Open: the same background tab as Command-clicking the row, as Chrome's link
and bookmark menus open one.

## Tab menu

A tab's right-click menu follows Chrome's and Codex's, in groups: first the tab and its page: New
tab to the right (the new tab page, right after the tab), Duplicate (a copy with its history; a web
page reopens at the same address in a fresh view), Copy link (a web page's address, or an App
page's shareable Haus link, the absolute App URL that opens that page; none for the new tab page),
and Reload and Open in default browser (web pages only); then, for a single chat tab, one Channel
or DM submenu holding that chat's own actions (the sidebar row's list, minus Open); then
where the tab lives: Move to the other pane and Move to new window (a tear-off without the pointer:
a new window offset from this one holds the tabs, live pages and history intact; disabled when they
are the window's every tab, and never a Reopen Closed Tab entry); then Close tab, Close other tabs,
and Close tabs to the right (disabled with none). On a selected tab every command acts on the
whole selection; Copy link needs one tab.

## App menu

The native menu bar adds a **Tab** menu between Go and Window, as in Chrome: Select Next Tab and
Select Previous Tab (Command-Option-Right and Left; Control-Tab and Command-Shift-] / [ still work),
Duplicate Tab, Move Tab to New Window, and Move Tab to Other Pane. They act on the focused pane's
current tab or selection, and the window reports which apply so the rest are disabled. **View**
adds Reload Page (Command-R) and Show/Hide Sidebar (Control-Command-S). Reload Page reloads the
focused pane's web page; on an App page it refetches the window's live data in place (scroll,
drafts, and history stay), never reloading the App window. Hiding the sidebar is per window and
survives a reload; the band's lead then keeps just the traffic lights' room.

## One pane or two

A window shows one pane (a new window's start) or two side by side, each with its own row. The
second pane appears when a Thread opens (see [Where things open](#where-things-open)) or a tab
moves there: right-click a tab and choose Move to right pane
(offered on every tab of a one-pane window that has another tab to leave behind), or drag a tab
into the other row once two exist. It closes with its last tab, leaving one full-width pane. A
resizable divider sits between two panes, each at least 420px; the rows follow the divider. There
is no layout toggle: to see every tab in one row, move them into one pane.

Pressing or
focusing inside a pane or its row, or a web page taking key focus, makes it the **focused pane**,
which the sidebar and tab shortcuts act on.

Tabs multi-select like Chrome's, within one pane's row (ADR 0039 has the exact rules).
Command-click adds or removes a tab, Shift-click selects the range from the anchor (the last
Command-clicked or plainly clicked tab), Shift-Command-click adds that range, and Shift-Left or
Shift-Right on a focused tab extends to its neighbor. The clicked tab is the one shown. Selected
tabs that are not shown wear a quieter fill than the shown tab. A plain click, Command-1…9, or
Control-Tab collapses the selection, and a Command- or Shift-click in the other pane's row starts a
selection there instead. Command-W closes every selected tab of the focused pane, each its own
Reopen Closed Tab entry, so Command-Shift-T brings them back one at a time, each where it was. The
tab menu on a selected tab acts on the whole selection (Close tabs, Close other tabs, Move tabs to
the other pane, and the rest of [the tab menu](#tab-menu)); on an unselected tab it acts on that
tab alone. Selection is not persisted.

Tabs drag like Chrome's. Pressing a tab selects it (or keeps a multi-selection, which then drags as
one: its tabs gather side by side around the pressed tab and move, stay selected, and tear off
together); after a few pixels the tab itself follows the
pointer along its row, raised above its neighbors, and each neighbor slides into the vacated slot
as the dragged tab's center crosses its midpoint. Released, it eases into its slot; Escape puts it
back. Dragged over the other pane's row, that row opens a gap at the pointer. A crowded row keeps
its scroll while a tab drags in it; held near either end, it scrolls toward its hidden tabs, faster
the further the pointer pushes, so the tab reaches every slot. A focused tab also
moves by keyboard: Space picks it up, Left and Right move it, Space or Enter puts it down, and
Escape puts it back. New tabs grow in. All of this motion stops under reduced motion.

Pulled about 25px above or below the band (or off either side of the window), a tab tears off: it
leaves its row and a new window opens under the pointer with just that tab, page and history
live, following the pointer until release. Over another window's band on the same Server (the
front window under the pointer), the floating window disappears and the tab joins that row at the
pointer; pull it out again to detach it again, or drop it back on its own window. A window's only
tab takes its whole window along instead, and a window emptied by a move closes. Escape returns a
detached tab to where it started. Windows on another Server refuse the tab, and a moved tab never
shows up in Reopen Closed Tab. While a tab or the pane divider drags, every web page swaps to a
still snapshot so its native view cannot swallow the drag. Right-clicking a
tab offers Close tab, Close other tabs, and Move to right pane (left-pane tabs) or Move to left
pane (right-pane tabs). Middle-click or the close button closes just that tab; closing a pane's last tab closes the pane, and closing the window's last tab closes the
window.

## Where things open

One rule covers every in-app destination (a channel, DM, Inbox, Tasks, Search, Settings, an Agent
profile, a Thread, an artifact, a chat's Files, a task), whether it opens from the sidebar, the
command menu, a chip, a link in a message or page, a notification, a deep link, or the native
menu's Settings (Command-comma) and Find (Command-F).

- **Modified clicks follow Chrome's link dispositions** (see the table below): Command-click or
  middle-click opens a new tab in the background, and adding Shift opens it selected. Shift-click
  alone is a selected new tab, not Chrome's new window. The sidebar and command menu follow the
  same dispositions, after the focused pane's current tab.
- **Web links** always open a new web tab: in the other pane with two panes, beside the current
  tab with one.
- **Several opens from one tab keep their order**, as in Chrome: three Command-clicks give the
  current tab, then A, B, C. Selecting another tab starts over right after the current tab.
- **A plain click** selects a tab already showing that page anywhere in the window (its pane
  becomes focused; a deeper address on that page, such as a task, opens in it). Otherwise an Agent
  profile or Settings opens as a new selected tab after the current tab, and a Thread opens as a
  new selected tab in the right pane, which opens if the window has one pane and becomes focused.
  This holds from either pane, the sidebar, the command menu, Command-comma, and notifications.
  Otherwise the current tab navigates when it shows an app page or the new tab page, and Back returns. When the
  current tab shows a web page, the destination opens as a new selected tab right after it, and the
  web page stays as it was.
- **The current tab** is the focused pane's for the sidebar, command menu, notifications, and deep
  links, and the link's own tab for a link inside a page with one pane. With two panes a link
  inside a page acts on the **other** pane instead (an open tab there is selected); Agent
  profiles, Settings, and Threads keep their own placement above. A page's own drill-down (a Settings section, an Agent profile section, a search
  filter) stays in its tab.

| Gesture | App link or chip in a page | Sidebar row or command menu result | Web link (App page, chip, or web page) |
| --- | --- | --- | --- |
| Click (or Return) | The place rule above | The place rule above | New selected tab (web page: `target=_blank` or a popup; else it navigates in the tab) |
| Command-click or middle-click | New background tab after its tab | New background tab after the focused pane's current tab | New background tab |
| Command-Shift-click or Shift-click | New selected tab after its tab | New selected tab after the focused pane's current tab | New selected tab |
| Context menu: Open in new tab / Open Link in New Tab | — | New background tab (sidebar row) | New background tab |

New tabs land by the opener rule; a web link with two panes lands in the other pane, and a Thread
always lands in the right pane (Command- or middle-click: in the background there). Command
means Control off macOS. A sidebar row takes the same modifiers from the keyboard (Command-Return
is a background tab). Command menu results take them from the mouse only; Return runs the plain
open. Middle-click on a link or chip never autoscrolls.

Web pages are things you are reading, and a sidebar click should not throw one away. Linear's
sidebar can navigate in place because Linear has no web tabs; Haus keeps that behavior for app
pages only.

A **Thread** page shows the same Thread surface the web's side panel hosts, full width like a chat;
View in chat opens the chat scrolled to the anchor, flashing it. A `?thread=` or `?task=`
chat link strips its parameter, then opens the Thread page. A chat's **Files** page lists the
attachments in its loaded messages. An **artifact** page shows the Artifact Panel's renderers (a file
preview with copy, raw, and link actions, or the workspace browser); a target no Agent workspace
holds shows "Artifact unavailable". An **Agent** page is the profile hub; its sections stay inside
the tab ([ADR 0038](../adr/0038-destinations-open-as-tabs.md)).

## Persistence and mounting

Tabs persist per window and per Server: panes, order, each pane's shown tab (not a
multi-selection), each tab's history (up to
50 entries), and cheap page state such as scroll position. A window's own tabs live in session
storage and survive its reloads; they end with the window. A new window, including the first after
launch, opens one tab on its route (the Inbox for File > New Window); no window inherits another's
tabs. Web pages restore their
address, not their session. Composer drafts keep their own per-chat store. Older stored shapes are
not migrated: they open as one Inbox tab. A window torn off with a tab starts from that tab.

Shown tabs and the most recently used hidden tabs, up to five, stay mounted. A hidden tab keeps its
DOM and state but runs no effects, so it holds no subscriptions, takes no keys, and never marks a
chat read. A chat counts as viewed only while its tab is shown (in either pane) in a focused window.
Older tabs unmount and rebuild from their history and page state when selected.

## Shortcuts

Shortcuts act on the focused pane and behave the same whether the App chrome or a website has
focus. A focused website receives keys first, so Electron maps them before the page sees them
(`electron/browser-shortcuts.cjs`); with the App focused, the App menu owns New Tab, Close, Reopen
Closed Tab, Find, Reload, Zoom, and Command-Option-arrows, and the App maps the rest from the same table
(`hooks/browser/browser-shortcut-keys.ts`, parity-tested). Command means Command on macOS and Control
elsewhere; on macOS other Control combos stay with the page's text bindings.

| Keys | Action |
| --- | --- |
| Command-T | New tab page at the end of the focused pane's row |
| Command-W | Close the focused pane's selected tabs (pane and window rules above) |
| Command-Shift-T | Reopen the last closed tab, with its history, where it was |
| Command-Shift-W | Close the window |
| Command-1 … Command-9 | Select a tab in the focused pane's row; 9 selects its last |
| Control-Tab / Control-Shift-Tab, Command-Shift-] / [, Command-Option-Right / Left | Next / previous tab in the focused pane |
| Command-[ / Command-], swipe between pages, mouse back / forward buttons | Back / forward in the focused pane: a web page's own history first, then the tab's (mouse buttons act only over App pages) |
| Command-L | Focus and select a web page's address |
| Command-R | Reload the web page; refetch an App page's data |
| Command-Shift-R | Reload bypassing the cache (web page only) |
| Control-Command-S | Show or hide the sidebar |
| Escape | Stop a loading page, outside text fields |
| Command-F | Find in page on a web page; Search otherwise |
| Command-G / Command-Shift-G | Next / previous match |
| Command-= (or +), Command--, Command-0 | Zoom the page in, out, and back to 100% |

Command-R never reloads the Haus App. Reopen Closed Tab keeps up to 20 closed tabs per window
session. Zoom acts on the focused web page in Chrome's steps (25% to 500%) and applies to every tab
of the same site; with no web page focused the zoom items zoom the App. While a page is not at 100%,
the toolbar shows its zoom level; pressing it resets.

## New tab page

Command-T and a row's plus button open a new tab at the end of the focused pane's row (Chrome's rule; links and Command-click stay after the current tab), on the
new tab page ("New tab", a globe mark): a pure browser start page. Its toolbar holds Back, Forward,
and the address field, which takes focus whenever the page is shown in the focused pane; up to
eight recently visited sites (one tile per site, reopening its latest page) sit a third of the way
down. Enter commits the field by the address rules below; Escape clears it; leaving it rests it.
Choosing an address or a site turns that same tab into the web page, so Back (Command-[ or the
toolbar arrow) returns to the start page. The page shows nothing chat-related: the sidebar and
Command-K cover chats, and navigate a new tab page in place like any other tab. It persists,
closes, and reopens like any tab.

## Web pages

Each web page has one compact toolbar row: Back, Forward (the page's own history, then the tab's), Reload (Stop while loading, with a thin
fading loading line), an address field, and Open in default browser. At rest the address shows a
condensed label (host and path, without scheme, `www.`, query, or trailing slash; IDN hosts stay in
punycode). Focusing it shows the full URL, selected, over up to eight recent pages. Typing replaces
the list: the first row, highlighted, is Go to the typed address or Search Google for the typed text,
then history matches ranked by address start, word start, then anywhere, newest first. Arrow keys
move the highlight, Enter or a click commits it, Shift-Delete forgets a highlighted history page, and
Escape restores the URL. The address does not complete inline. Successful visits retain up to 50
addresses, titles, and favicon URLs in App-local storage; no personal browser history is imported.

The new tab page, an artifact page, and an Agent's Workspace share this toolbar's shape: one row,
icon-only actions with tooltips, and a bottom hairline as its only edge.

Find in page opens a compact row under the toolbar with a field, a match count, and Previous, Next,
and Close; the page shrinks by the row's height rather than being covered. Enter and Shift-Enter step
through matches; Escape closes the row.

Links inside a page stay in Haus: `target=_blank`, `window.open`, and Shift-Command-click open a new
tab by the web link rule; Command-click and middle-click open one in the background. `mailto:` links
open the system mail app; other non-web schemes are blocked. Right-clicking a page opens a native
menu: Open Link in New Tab, Open Link in Default Browser, and Copy Link Address on a link; Open Image
in New Tab and Copy Image on an image; Copy and Search Google on a selection; editing items in a
field; Back, Forward, and Reload on a bare page. Development builds add Inspect Element.

Website-only clients open links in the system browser, as do authentication flows that ask for it.

## Desktop ownership

The App owns tabs, panes, and history (`hooks/desktop-tabs/`); Electron owns only live web pages
(see [Haus App → Desktop Web Views](../internals/app.md#desktop-web-views)). A web tab's history
entry names its view; Electron creates the view on first open, restores it by URL when a reopened or
relaunched tab asks again, and destroys it once no open tab's history names it. The App reports every
web page on screen (at most one per pane) with its bounds; unlisted views hide, and hiding, showing,
or moving a page never reloads it. Native views paint above DOM content, so while a menu, dialog,
listbox, or tooltip overlaps a page, or a tab drags, the App shows a captured still of the page in its
place and hides the view, releasing the still only after the view shows again. Stale, blank, or failed
captures fall back to the plain page background.

Pages run in sandboxed WebContentsViews without Node integration or the App preload. Only the App's
main frame can issue browser IPC commands, even when a page visits the Haus origin. Pages share a
persistent `haus-browser` partition separate from the App's Clerk session, so website logins survive
restarts and Server switches. Downloads and website permission requests are disabled. Personal
browser cookies, passwords, and history are not imported, and Agents have no browser access; both
need separate product contracts and access controls.

## Native page layout observation

The App measures a native page's host when it resizes, the window resizes, the shell layout changes,
or an overlay is inserted, removed, or changes its contents. Ordinary DOM changes elsewhere, including
conversation updates, must not schedule native page measurements. Overlay detection checks both
changed subtrees and mutations inside an existing overlay, so menus and dialogs still cover the
native view when their content changes.
