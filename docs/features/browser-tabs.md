---
summary: Desktop workspace tabs (primary, browser, artifact, Agent, and Thread tabs), the split, preview tabs, in-app browsing, and the boundary between the Haus browser and the user's personal browser.
read_when:
  - changing desktop browser tabs, external-link opening, or browser session storage
  - changing desktop artifact tabs or where artifacts open on desktop
  - changing desktop Agent profile tabs, the split, or where new tabs land
  - changing desktop Thread tabs, preview tabs, or where Threads open on desktop
  - changing the shell topbar or browser access by Agents
  - changing workspace tab identity, favicons, or tab strip overflow
  - changing browser shortcuts, find in page, page zoom, reopening closed tabs, or the page context menu
---

# Workspace tabs

The desktop App has a tab strip above the content area, on the page background with no band of its
own. The sidebar keeps its existing layout and controls. Browser navigation belongs to the browser
toolbar below the tabs. There is one primary tab that follows sidebar navigation. Visiting another
channel selects the primary tab without creating another Chat tab. The mounted Chat stays intact while
a browser or artifact tab is selected, including its composer draft. Artifacts open as their own
tabs (see [Artifact tabs](#artifact-tabs)); the Artifact Panel and its toggle do not appear in desktop
tabs.

Every tab shares one anatomy: a compact rounded tab holding a leading mark and a title that ends in
an ellipsis when cut off. The whole tab selects it. The primary tab borrows
the identity the sidebar shows: a channel's own icon and color, a DM's Agent avatar, or the section's
glyph (Inbox, Tasks, Search, Settings, and so on). It holds the same width basis as every other tab, so switching between
chats with long and short names never moves the strip; when the strip is crowded it shrinks with the rest. In a Chat, the channel or DM actions menu is
an icon-only "…" button at the band's top-right corner, not part of the tab. Because the tab names the page, band content beside it drops what repeats
that identity (a section's breadcrumb or glyph, a title matching the tab) and keeps only actions or a more
specific title. A browser tab's mark is the page's favicon, a spinner while the page
loads, or a globe when the page has no usable icon. An artifact tab's mark is the Artifact Panel's
file glyph. A browser or artifact tab's trailing close button shows on the selected tab and on hover
or keyboard focus; otherwise the title reclaims that room. The selected tab keeps its
size and shape.

HTTP(S) links open additional browser tabs. Opening an already-open address selects its tab. A plus
button opens a blank tab with a focused address field. Each page has Back, Forward, Reload, an address
field with local history suggestions, and Open in default browser. The address field accepts
web addresses and search terms. Search terms open Google Search. A new tab's page shows up to eight
recently visited sites as tiles a third of the way down: one tile per origin, most recent first,
each the site's favicon on a neutral chip (a globe when it has none or it fails to load) over its
latest page title (the host when untitled); pressing a tile opens that page in the current tab.
With no history the page is blank; the focused address field is the prompt. Successful visits
retain up to 50 addresses, titles, and favicon URLs in App-local storage; no personal browser
history is imported. Every tab — the primary tab, browser tabs, and artifact tabs — sits in one evenly
spaced strip with one order, and any tab can be reordered across kinds by dragging its title or using
Space, arrow keys, and Space on a focused tab. The primary tab is not pinned: it starts first, can move
anywhere, and other tabs can drop before it; it never closes. A dragged tab moves only along the
strip and stays inside it, the other tabs slide aside to preview the new order, the order commits on
drop, and Escape cancels. Closing the selected tab selects the last remaining tab in the strip, which
is the primary tab when it sits last or no other tab remains.
Command-W closes a selected browser or artifact tab; Command-T opens a blank browser tab unless the
visible Artifact Panel owns that command.
Command-L focuses and selects the address; Command-R reloads the website. Control-Tab and
Control-Shift-Tab cycle through every tab in strip order; Command-1 through Command-9 select
tabs directly, with 9 selecting the last tab. These shortcuts also work inside isolated websites.
Middle-click closes a browser or artifact tab. The strip never scrolls: every tab, the primary
one included, shares the width evenly and shrinks down to mark-only tabs, the selected tab keeps its close button, and the plus button stays
pinned after the last tab. Reload becomes Stop while a page loads; a thin accent-colored loading line fades away without moving
the page. Toolbar buttons and tab titles have tooltips.
The page toolbar is one compact row above a hairline: Back, Forward, and Reload on the left, the
address filling the space between (its resting label centered), and Open in default browser on the right. At rest the address shows a condensed
label (host and path, without scheme, `www.`, query, or trailing slash; IDN hosts stay in punycode).
Focusing it shows the full URL, fully selected, over a list of up to eight recent pages (most recent
first, without the open page; none on a blank tab, whose new-tab page already lists them). Typing
replaces the list: the first row, highlighted, is Go to the typed address or Search Google for the
typed text, then history matches ranked by address start, then word start in the title or address,
then anywhere, newest first, with the typed text bolded. Rows show the favicon, title, and muted
condensed URL on one line. Arrow keys move the highlight, Enter or a click commits it, Tab only
moves focus, and Shift-Delete (Fn-Shift-Delete on a Mac keyboard) forgets a highlighted history
page. Escape restores the URL and closes the list; navigating returns the field to rest. The address
does not complete inline.
Toolbar tooltips name the Back (Command-[), Forward (Command-]), and Reload (Command-R) shortcuts.
The Go menu and desktop history gestures follow the selected tab's history.

Browser tabs are window-local and clear when switching Servers, leaving the Server shell, or closing
the window. They are not restored after restarting Haus. Website-only clients and older desktop shells
continue to open links in the system browser. Authentication flows explicitly requesting the system
browser keep using it. Non-web schemes are never loaded inside browser tabs.

## Shortcuts, find, zoom, and page menus

Shortcuts behave the same whether the App chrome or a website has focus. A focused website receives
keys first, so Electron maps them before the page sees them (`electron/browser-shortcuts.cjs`); with
the App focused, the App menu owns New Tab, Close, Reopen Closed Tab, Find, and Zoom, and the App
maps the rest from the same table (`hooks/browser/browser-shortcut-keys.ts`, parity-tested).

| Keys | Action |
| --- | --- |
| Command-T | New blank browser tab |
| Command-W | Close the focused group's selected browser, artifact, Agent, or Thread tab (the window when none) |
| Command-Shift-T | Reopen the most recently closed tab |
| Command-L | Focus and select the address |
| Command-R / Command-Shift-R | Reload / reload bypassing the cache (browser tab only) |
| Escape | Stop a loading page, outside text fields |
| Command-F | Find in page (browser tab); Search otherwise |
| Command-G / Command-Shift-G | Next / previous match |
| Command-= (or +), Command--, Command-0 | Zoom the page in, out, and back to 100% |
| Command-1 … Command-9 | Select a tab by strip position, primary tab included; 9 selects the last |
| Control-Tab / Control-Shift-Tab, Command-Shift-] / [ | Next / previous tab |

Command-R never reloads the Haus App: with the primary or an artifact tab selected it does nothing.
Zoom acts on the selected page only, in Chrome's steps (25% to 500%), and like Chrome it applies to
every tab of the same site; with no browser tab selected, the zoom items zoom the App as before. While
a page is not at 100%, the toolbar shows its zoom level; pressing it resets.

Reopen Closed Tab keeps up to 20 closed tabs for the window's session, in memory. A browser tab
reopens its last address (not its back/forward history); an artifact, Agent, or Thread tab reopens it. Either
returns to its old position in the strip and is selected. Blank new tabs are not remembered.

Find in page opens a compact row under the toolbar, right-aligned, with a field, a match count
("2 of 7" or "No results"), and Previous, Next, and Close. The page region shrinks by the row's height
rather than being covered, so the live page stays visible. Enter and Shift-Enter step through matches;
Escape closes the row and clears highlights. The row belongs to one tab and closes when another tab is
selected; the last search text returns when it reopens.

Links inside a page stay in Haus: `target=_blank`, `window.open`, and Shift-Command-click open a
selected browser tab; Command-click and middle-click open one in the background. `mailto:` links open
in the system mail app; other non-web schemes are blocked.

Right-clicking a page opens a native menu. A link offers Open Link in New Tab (background), Open Link
in Default Browser, and Copy Link Address; an image offers Open Image in New Tab and Copy Image; a
selection offers Copy and Search Google; an editable field offers Cut, Copy, Paste, and Select All. A
bare page offers Back, Forward, and Reload. Development builds add Inspect Element.

## Artifact tabs

On desktop, opening an artifact from a message (an artifact card or a `haus://` workspace link) opens
it as a workspace tab and selects it. Opening an artifact that already has a tab selects that tab;
identity is the Agent plus the workspace path. The tab title is the artifact's authored title, or its
file name. The tooltip adds the chat it was opened from and its path. The website keeps opening
artifacts in the chat's Artifact Panel (ADR 0004).

A selected artifact tab covers the mounted Chat with the Artifact Panel's own renderers: a file shows
its preview under a compact row with its path and the panel's actions (copy contents, Markdown raw
toggle, copy link, copy path); a workspace folder shows the workspace browser. An artifact whose file
was moved or deleted, or whose workspace is offline, shows "Artifact unavailable" in the tab body.

Artifact tabs are App-local presentation state, not Server records. They are scoped per Server and
kept in App-local storage with the primary tab's place, so they survive reloads and restarts;
selection is not restored, and the primary tab is selected after a reload. Browser tabs are not
restored, so after a restart artifact tabs and the primary tab keep their order among themselves (a
saved order from before the primary tab could move restores it first).

## Agent tabs

On desktop, opening an Agent's profile (clicking an Agent avatar or chip, a profile link, the DM
menu's View agent profile, or the command menu's Agent Profile) opens an Agent tab through
`useOpenAgentProfile`; the website navigates to the profile route instead (ADR 0038). Identity is the
Agent id: opening an Agent that already has a tab selects that tab where it is. The tab shows the
Agent's avatar and display name, blank while the Agent loads. Its body is the profile hub; drilling
into a section (Runs on, Skills, Workspace, and so on) stays inside the tab, which remembers its
section. Opening with a section moves the open tab to that section. Deleting the Agent, or an Agent
the Server no longer has, closes its tab. Agent tabs persist per Server with artifact tabs, section
included.

## Thread tabs

On desktop every Thread opener — a reply count or Thread card in the transcript, Reply in thread,
an Inbox or notification link, and a `?thread=` or `?task=` chat link — opens the Thread as a tab
through `useOpenThread`; the website keeps the chat side pane (ADR 0038, threads are companions).
A deep link opens the tab and then drops its parameter from the URL with a replace, which leaves
the routed page where it is. Identity is the chat plus the Thread's anchor message: reopening an
open Thread selects its tab where it is. The tab shows the anchor message's first line beside its
chat's mark (the channel's icon or the DM's Agent avatar), blank while either loads; the tooltip
adds the chat (`#name`, or `DM`). Its body is the same Thread surface the chat side pane hosts, in a centered reading
column, so it reads at split width and in the main strip. The tab's own close button closes it, so
the Thread header has none; View in chat opens the chat scrolled to the anchor, flashing it. A
Thread whose chat or anchor is gone closes its tab without being remembered for Reopen Closed Tab.

Threads are **companions**: a new Thread tab always opens in the split, opening the split if it is
closed, and leaves the main strip as it is; Cmd-click opens it in the main strip instead. It opens
as the split's **preview tab**, its title in italics. The split holds at most one preview tab:
opening another Thread replaces it in the same strip position instead of adding a tab. A preview
tab pins, keeping its place and dropping the italics, when you send a reply in it, double-click
its tab, or move it to the other group (Move to main, or closing the split). Cmd-clicked Threads
and reopened Threads open pinned. Pinned Thread tabs persist with artifact and Agent tabs; the
preview tab does not.

## Split

The window can show a **split**: a second tab group docked right of the content area, on every
route, with its own small tab strip and a resizable leading edge (420px minimum, session-only width).
Destinations have a placement class. Pages (artifact and Agent tabs) follow one routing rule:
while the split is open they open in it, otherwise in the main strip. Companions (Thread tabs)
always open in the split, opening it. An opener that asks for the main strip (Cmd-click) always
gets it. A tab that is already open is selected where it is. Browser tabs stay in the main strip, because their
native views are positioned in the main column.

The band's split button (between the page's actions and Settings) toggles the split:

- Opening it moves the main strip's selected artifact, Agent, or Thread tab into the split; the main strip
  selects the last remaining tab, as if the moved tab had closed. With a browser or the primary tab
  selected, nothing moves: the split opens empty and draws no column, and the next opened tab lands
  there and shows it.
- Closing it folds every split tab into the main strip right after the selected tab, keeping the
  main selection.
- Closing or moving out the split's last tab closes the split.

Right-clicking an artifact, Agent, or Thread tab offers Move to split view (or Move to main) and
Close tab.
Tabs reorder by dragging within their own strip; dragging between strips is not supported yet.
Split tabs never cover the routed page; only the main strip's selected tab does. Command-W closes
the selected tab of the focused group: the group last clicked, focused, selected, or opened into.
Strip shortcuts (Control-Tab, Command-1 … 9, Reopen Closed Tab) act on the main strip; a reopened tab
returns to the main strip. The split is per window and not restored: after a reload its tabs are at
the end of the main strip and the split is closed.

## Desktop ownership

Electron owns native pages, their navigation history, their favicons, and their lifecycle. Favicons
reach the App as the URL the page announces, limited to HTTP(S) and inline image URLs, cleared on each
new document, and rendered without a referrer. The App subscribes to a
validated snapshot through the optional browser desktop bridge and reports the browser content region.
Native views paint above DOM content, so while a product menu, dialog, listbox, or tooltip overlaps the
page, the App asks Electron to capture the page (an inline JPEG, validated before rendering), paints it
in the page region, and only then hides the native view; closing the overlay shows the native view
before the still is released. The overlay appears to float over a frozen page instead of a blank one.
Stale captures (after a tab switch, navigation, or a newer request) are discarded, and blank, failed, or
crashed pages fall back to the plain page background. Hidden chat controls are inert while a main-strip browser, artifact, Agent, or Thread tab is selected, and messages behind one
do not receive new read receipts until the primary tab is selected. The App owns artifact and Agent tabs, the
split, and the main strip order across every kind, primary tab included; it references Electron's browser tabs by id and mirrors their
relative order back to Electron. A main-strip artifact, Agent, or Thread tab is selected only while Electron
has no browser tab selected, so no native page shows above it.

Pages run in sandboxed WebContentsViews without Node integration or the App preload. Only the App's
main frame can issue browser IPC commands, even when a browser page visits the Haus origin. Popups
become tabs. Tabs share a persistent `haus-browser` partition separate from the App's Clerk session.
Sign in directly in Haus once per website; those website sessions survive App restarts. The browser
profile belongs to the local desktop installation. Changing Haus Servers does not clear website logins.

This first version does not import personal-browser cookies, passwords, or browsing history, and does
not grant Agents browser access. Downloads and website permission requests are disabled. Sites that
require unsupported permissions or reject embedded browsers can be opened in the default browser.
Chrome profile import and Agent browser access require separate product contracts and explicit access
controls before implementation.
