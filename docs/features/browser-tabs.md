---
summary: Desktop workspace tabs (primary, browser, artifact, Agent, Thread, and Files tabs), split and expanded modes and the side pane, preview tabs, per-window tab persistence, in-app browsing, and the boundary between the Haus browser and the user's personal browser.
read_when:
  - changing desktop browser tabs, external-link opening, or browser session storage
  - changing desktop artifact tabs or where artifacts open on desktop
  - changing desktop Agent profile tabs, the side pane, split or expanded mode, or where new tabs land
  - changing desktop Thread tabs, preview tabs, or where Threads open on desktop
  - changing chat Files, or the chat side panel versus the desktop side pane
  - changing the shell topbar or browser access by Agents
  - changing workspace tab identity, favicons, or tab strip overflow
  - changing browser shortcuts, find in page, page zoom, reopening closed tabs, or the page context menu
  - changing tab persistence per window or tab drag
---

# Workspace tabs

The desktop App shows tabs in the window band, in one of two modes (see
[Split and expanded modes](#split-and-expanded-modes)). In split mode, the default, the routed page
fills the left column under a plain title and every other tab lives in a side pane on the right; in
expanded mode one strip holds every tab. The sidebar keeps its existing layout and controls. Browser
navigation belongs to the browser toolbar inside the page. There is one primary tab, the routed
page, that follows sidebar navigation. Visiting another channel never creates another Chat tab. The
mounted Chat stays intact while another tab is selected, including its composer draft. Artifacts open as their own
tabs (see [Artifact tabs](#artifact-tabs)); the Artifact Panel and its toggle do not appear in desktop
tabs. Desktop has one right-hand pane: the chat renders no side panel of its own, and the chat's
Files, artifacts, and Threads open as workspace tabs instead. The sidebar decides the main pane;
anything opened from content (a link, a profile, a Thread, Files) is a tab.

Every tab shares one anatomy: a compact rounded tab holding a leading mark and a title that ends in
an ellipsis when cut off. The whole tab selects it. The primary tab borrows
the identity the sidebar shows: a channel's own icon and color, a DM's Agent avatar, or the section's
glyph (Inbox, Tasks, Search, Settings, and so on). In split mode that identity is the routed page's
plain title instead of a tab. In expanded mode the primary tab holds the same width basis as every
other tab, so switching between chats with long and short names never moves the strip; when the
strip is crowded it shrinks with the rest. In a Chat, the channel or DM actions menu is an icon-only
"…" button in the band at the routed page's top-right corner, not part of the tab; in expanded mode
it shows only while the primary tab is selected, since another selected tab covers the page. Because the tab names the page, band content beside it drops what repeats
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
history is imported. Every closable tab — browser, artifact, Agent, and Thread — sits in one evenly
spaced strip with one order, and any tab can be reordered across kinds by dragging its title or using
Space, arrow keys, and Space on a focused tab. In expanded mode the primary tab leads the strip; it
never moves or closes. A dragged tab moves only along the strip and stays inside it, the other tabs
slide aside to preview the new order, the order commits on drop, and Escape cancels. Closing the
selected tab selects the last remaining tab in its strip: in expanded mode the primary tab when no
other tab remains; in split mode the side pane closes with its last tab.
Command-W closes the closable tab on screen, wherever keyboard focus is (see the shortcut table);
Command-T opens a blank browser tab.
Command-L focuses and selects the address; Command-R reloads the website. Control-Tab and
Control-Shift-Tab cycle through the visible strip's tabs in order (the side pane's in split mode,
revealing a hidden pane); Command-1 through Command-9 select tabs directly, with 9 selecting the
last tab. These shortcuts also work inside isolated websites.
Middle-click closes a browser or artifact tab. The strip never scrolls: every tab, the primary
one included, holds one width basis (Codex's 240px, the side pane's strip too), shares the width evenly and shrinks down to mark-only tabs, the selected tab keeps its close button, and the plus button stays
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
Command means Command on macOS and Control elsewhere; Control is the command key only off macOS,
so Control-Tab stays tab cycling there.

| Keys | Action |
| --- | --- |
| Command-T | New blank browser tab |
| Command-W | Close the closable tab on screen (the side pane's, or the covering expanded tab), wherever focus is. With tabs open but none on screen, nothing. Closes the window only when no closable tab is open |
| Command-Shift-W | Close the window |
| Command-Shift-T | Reopen the most recently closed tab |
| Command-L | Focus and select the address |
| Command-R / Command-Shift-R | Reload / reload bypassing the cache (browser tab only) |
| Escape | Stop a loading page, outside text fields |
| Command-F | Find in page (browser tab); Search otherwise |
| Command-G / Command-Shift-G | Next / previous match |
| Command-= (or +), Command--, Command-0 | Zoom the page in, out, and back to 100% |
| Command-1 … Command-9 | Select a tab by position in the visible strip (expanded: primary tab first); 9 selects the last |
| Control-Tab / Control-Shift-Tab, Command-Shift-] / [ | Next / previous tab |
| Command-Shift-B | Hide or show the side pane's tabs (expanded: collapse back to the pane); only while a closable tab is open |

Command-R never reloads the Haus App: with no browser page on screen it does nothing. Page
shortcuts act only on a page that is on screen, never on one hidden behind the primary tab or a
hidden side pane.
Zoom acts on the selected page only, in Chrome's steps (25% to 500%), and like Chrome it applies to
every tab of the same site; with no browser tab selected, the zoom items zoom the App as before. While
a page is not at 100%, the toolbar shows its zoom level; pressing it resets.

Reopen Closed Tab keeps up to 20 closed tabs for the window's session, in memory. A browser tab
reopens its last address (not its back/forward history); an artifact, Agent, or Thread tab reopens it
(a Thread pinned). Either returns to its old position among the closable tabs and is selected,
revealing a hidden side pane. Blank new tabs are not remembered.

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
file name. The tooltip adds the chat it was opened from and its path. A target no Agent workspace
holds shows an "Artifact unavailable" notice on desktop, which has no chat Artifact Panel. The website keeps opening
artifacts in the chat's Artifact Panel (ADR 0004).

A selected artifact tab shows the Artifact Panel's own renderers (in the side pane, or covering the
mounted Chat in expanded mode): a file shows
its preview under a compact row with its path and the panel's actions (copy contents, Markdown raw
toggle, copy link, copy path); a workspace folder shows the workspace browser. An artifact whose file
was moved or deleted, or whose workspace is offline, shows "Artifact unavailable" in the tab body.

Artifact tabs are App-local presentation state, not Server records. They are scoped per Server and
kept in App-local storage with their order, so they survive reloads and restarts; selection is not
restored, so after a reload the side pane starts hidden, its badge counting the restored tabs, and
expanded mode selects the primary tab. Browser tabs are not restored, so after a restart App-local
tabs keep their order among themselves. A primary-tab position saved by earlier versions is dropped.

## Agent tabs

On desktop, opening an Agent's profile (clicking an Agent avatar or chip, a profile link, the DM
menu's View agent profile, or the command menu's Agent Profile) opens an Agent tab through
`useOpenAgentProfile`; the website navigates to the profile route instead (ADR 0038). In split
mode it opens in the side pane beside the routed page. An Agent address arriving on desktop (a deep
link, an old bookmark, a new window, including the retired members and Settings addresses) opens
the Agent's tab and hands the main pane back to the page it showed, or to the Server's default page
when there was none. Identity is the
Agent id: opening an Agent that already has a tab selects that tab where it is. The tab shows the
Agent's avatar and display name, blank while the Agent loads. Its body is the profile hub; drilling
into a section (Runs on, Skills, Workspace, and so on) stays inside the tab, which remembers its
section. Opening with a section moves the open tab to that section. Deleting the Agent, or an Agent
the Server no longer has, closes its tab. Agent tabs persist per Server with artifact tabs, section
included.

## Thread tabs

On desktop every Thread opener — a reply count or Thread card in the transcript, Reply in thread,
an Inbox or notification link, and a `?thread=` or `?task=` chat link — opens the Thread as a tab
through `useOpenThread`; the website keeps the chat side pane (ADR 0038, threads amendment).
A deep link opens the tab and then drops its parameter from the URL with a replace, which leaves
the routed page where it is. Identity is the chat plus the Thread's anchor message: reopening an
open Thread selects its tab where it is. The tab shows the anchor message's first line beside its
chat's mark (the channel's icon or the DM's Agent avatar), blank while either loads; the tooltip
adds the chat (`#name`, or `DM`). Its body is the same Thread surface the chat side pane hosts, in a centered reading
column, so it reads at side pane width and full width. The tab's own close button closes it, so
the Thread header has none; View in chat opens the chat scrolled to the anchor, flashing it. A
Thread whose chat or anchor is gone closes its tab without being remembered for Reopen Closed Tab.

A Thread opens like any other tab: in split mode in the side pane beside its chat, in expanded mode
as the selected tab. It opens as the **preview tab**, its title in italics. There is at most one
preview tab: opening another Thread replaces it in the same strip position instead of adding a
tab. A preview tab pins, keeping its place and dropping the italics, when you send a reply in it
or double-click its tab. Reopened Threads open pinned. Pinned Thread tabs persist with artifact and
Agent tabs; the preview tab does not.

## Files tabs

On desktop the chat actions menu's Files opens the chat's Files tab through `useChatFilesPane`; the
website keeps Files in the chat side panel. Identity is the chat: reopening selects the open tab.
The tab reads "Files" beside its chat's mark; the tooltip adds the chat (`#name`, or `DM`). Its body
lists the attachments in the chat's loaded messages, in a centered reading column. A Files tab whose
chat is gone closes without being remembered for Reopen Closed Tab. Files tabs persist with
artifact, Agent, and pinned Thread tabs.

## Tabs per window

Each window keeps its own App-local tabs per Server: they survive its reloads and close with it. A
new window (or the first after launch) starts from the most recently saved window's tabs. Browser
tabs are never restored.

Dragging a tab only reorders it: it moves along its own strip, locked horizontal and clamped to the
strip. Tabs never move between windows.

## Split and expanded modes

The window follows Codex's layout: a mode, not two tab groups. The mode is remembered per device
and starts in split mode.

- **Split mode**: the routed page fills the left column under its plain title (mark and name), with
  its band content and actions at its top-right. Every closable tab lives in the **side pane**,
  docked right of the routed page on every route, resizable from its leading edge (420px minimum
  while the routed page keeps 360px; session-only width). The resize handle sits just outside the
  pane's edge, so a browser page's native view never covers it. Its strip and new-tab button sit in the
  window band starting over the pane's edge. Routed navigation never hides the side pane.
- **Expanded mode**: one strip in the band, the primary tab first, then every closable tab; the
  selected tab takes the whole content width, covering the routed page. Routed navigation selects
  the primary tab.

The band ends with the page's actions, then the layout controls
(Settings lives in the sidebar footer; see [Desktop window layout](desktop-window-layout.md)). With no closable tab open, in either mode, a single New tab button (plus in a
square) replaces the expand button and the side pane toggle:

| Control | Split mode | Expanded mode |
| --- | --- | --- |
| Expand (outward diagonal arrows) | Switches to expanded mode, selecting the side pane's tab if it was showing, else the primary tab | Pressed, as collapse (inward arrows): back to split mode, every closable tab in the side pane, the same tab selected and the pane showing |
| Side pane toggle (right panel; named "Side pane tabs", its tooltip Hide tabs / Show tabs, Command-Shift-B) | Pressed while the pane shows; hides or shows it. While hidden it badges the number of open tabs, and hovering lists them in place of its tooltip; pressing one reveals the pane on it | Unpressed: collapses back to split mode with the pane showing the selected tab |
| New tab (no closable tabs) | Opens a blank browser tab in the side pane | Opens a blank browser tab, selected |
| Strip new-tab button | Opens a blank browser tab in the side pane | Opens a blank browser tab, selected |

Opening any tab (a link, a profile, a Thread, a new browser tab) while the side pane is hidden
reveals it. A shown pane always shows a tab: when its selected tab goes away it shows its last tab.
Right-clicking an artifact, Agent, or Thread tab offers Close tab.

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
crashed pages fall back to the plain page background. In expanded mode, hidden chat controls are inert while a closable tab covers the Chat, and messages
behind one do not receive new read receipts until the primary tab is selected; the side pane never
covers the Chat. The App owns artifact, Agent, and Thread tabs, the mode, the side pane, and the
closable strip order across every kind; it references Electron's browser tabs by id and mirrors
their relative order back to Electron. An App-local tab is the selected closable tab only while
Electron has no browser tab selected, so no native page shows above it. A browser page's native view
follows its DOM host wherever the layout renders it — the side pane or the full content width — so
resizing the pane, the sidebar, or the window moves it. A selected page that is not on screen (the
side pane hidden, or the primary tab selected in expanded mode) reports no bounds: Electron hides its
view and treats it as not shown, so page shortcuts and menu actions do nothing to it. Hiding,
showing, or moving a page only changes its view's bounds and visibility; the page keeps running and
never reloads.

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

## Native page layout observation

The App measures the native page host when it resizes, the window resizes, the shell layout
changes, or an overlay is inserted, removed, or changes its contents. Ordinary DOM changes
elsewhere, including conversation updates, must not schedule native page measurements.
Overlay detection checks both changed subtrees and mutations inside an existing overlay, so
menus and dialogs still cover the native view when their content changes.
