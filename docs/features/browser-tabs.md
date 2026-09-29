---
summary: Desktop workspace tabs, in-app browsing, and the boundary between the Haus browser and the user's personal browser.
read_when:
  - changing desktop browser tabs, external-link opening, or browser session storage
  - changing the shell topbar or browser access by Agents
---

# Browser tabs

The desktop App has a tab strip above the content area. The sidebar keeps its existing layout and
controls. Browser navigation belongs to the browser toolbar below the tabs. There is one primary tab that follows sidebar navigation. In a Chat, that tab keeps the
channel or DM action menu in a trailing ellipsis button. The tab's compact icon, padding, and shape
stay consistent when selected; the legacy artifact-panel toggle does not appear in desktop tabs. Visiting another channel selects the primary tab without creating another
Chat tab. The mounted Chat stays intact while a browser tab is selected, including its composer draft
and chat-scoped Artifact Panel. Artifacts continue to use that panel, per ADR 0004.

HTTP(S) links open additional browser tabs. Opening an already-open address selects its tab. A plus
button opens a blank tab with a focused address field. Each page has Back, Forward, Reload, an address
field with local history suggestions, Close, and Open in default browser. The address field accepts
web addresses and search terms. Search terms open Google Search. New tabs suggest recently visited
pages. Successful visits retain up to 50 addresses and titles in App-local storage; no personal
browser history is imported. Browser tabs can be reordered by dragging their titles or using
Space, arrow keys, and Space on a focused tab. The primary Chat tab stays first. Closing the selected browser tab selects the last remaining
browser tab, or the primary tab when none remain. Command-W closes a selected browser tab; Command-T
opens a blank browser tab unless the visible Artifact Panel owns that command.
Command-L focuses and selects the address; Command-R reloads the website. Control-Tab and
Control-Shift-Tab cycle through the primary tab and browser tabs; Command-1 through Command-9 select
tabs directly, with 9 selecting the last tab. These shortcuts also work inside isolated websites.
Middle-click closes a browser tab. The plus button stays visible during tab overflow, and selecting a
tab scrolls it into view. Reload becomes Stop while a page loads; a thin accent-colored loading line fades away without moving
the page. Toolbar buttons and tab titles have tooltips.
The Go menu and desktop history gestures follow the selected tab's history.

Browser tabs are window-local and clear when switching Servers, leaving the Server shell, or closing
the window. They are not restored after restarting Haus. Website-only clients and older desktop shells
continue to open links in the system browser. Authentication flows explicitly requesting the system
browser keep using it. Non-web schemes are never loaded inside browser tabs.

## Desktop ownership

Electron owns native pages, their navigation history, and their lifecycle. The App subscribes to a
validated snapshot through the optional browser desktop bridge and reports the browser content region.
It hides native pages while product menus or dialogs are open because native views paint above DOM
content. Hidden chat controls are inert while a browser page is selected.
Messages behind a browser page do not receive new read receipts until the primary tab is selected.

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
