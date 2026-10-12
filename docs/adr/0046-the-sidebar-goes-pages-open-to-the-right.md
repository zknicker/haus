---
summary: Approved desktop navigation model with two verbs chosen by the surface clicked; Go (a sidebar row or a command menu result) navigates the left pane's selected tab in place, always, and Open (anything activated inside a page, plus notifications, deep links, and Find) opens a new selected tab in the right pane, creating it, reusing only a right-pane tab already on that page; Command-, middle-, and Shift-click open a new tab right after the clicked-from tab in its pane everywhere; Settings is a window singleton.
read_when:
  - changing what a sidebar row, the command menu, a chip, an in-app link, a web link, a notification, or a deep link does on desktop
  - changing Command-, Shift-, or middle-click, or Command-Return, on any desktop link, row, or button
  - changing which pane or tab a desktop navigation lands in, or when an existing tab is reused
  - changing how Settings opens on desktop or the Settings back button
  - changing Inbox, Search, or Activity row opening on desktop
---

# 0046 The sidebar goes; pages open to the right

## Status

Accepted, 2026-10-12. Supersedes the **Navigation rules**, **Which tab is current**, and **Settings
is a tab** sections of [ADR 0039 Desktop tabs are equal pages](0039-desktop-tabs-are-equal-pages.md).
Everything else in ADR 0039 stands: equal tabs, one pane or two, multi-select, drag, tear-off, the
tab and App menus, shortcuts, the new tab page, unread clearing, mounting, windows, and persistence.

## Context

ADR 0039's open rule grew into five stacked conditions a person cannot see: a window-wide "select
an existing tab on that page" that could jump to a forgotten tab in the other pane, per-kind
exceptions (an Agent profile or Settings opens a new tab, a Thread opens in the right pane), a
web-page exception (a place opens beside a web page instead of replacing it), "with two panes an
in-page link acts on the other pane", and a sidebar bound to whichever pane was last focused. The
same sidebar click sometimes navigated and sometimes selected a tab elsewhere, and the person had
no way to predict which.

## Decision

**Two verbs, chosen by the surface you click.** Where a click lands depends only on what you
clicked and which modifiers you held, never on the kind of destination, which pane was focused
last, or what other tabs happen to be open.

**Go: a sidebar row or a command menu result.** A plain click (or Return) navigates the **left
pane's** selected tab in place, pushing onto its history so Back returns, and focuses the left
pane. It does this whichever pane was focused, whatever the destination (a channel, DM, Inbox,
Tasks, Search, an Agent profile, a Thread), and whatever the tab shows, a web page or the new tab
page included. Go never opens a new tab and never selects an existing tab elsewhere.

**Open: anything activated inside a page.** Threads (reply counts, previews, Reply in thread),
Agent avatars, names, and profile links, reference chips (Agent, chat, Thread), `haus://` resource
links, artifact cards, Files, web links (App links, `target=_blank`, website and pull request
chips), Inbox rows and cards, Search results, Activity rows, a sidebar row's View profile, Files,
and Tasks, a chat tab's menu actions, notifications, deep links, and Command-F's Search page all
Open. Open adds a new selected tab to the **right pane**, creating the right pane in a one-pane
window, and focuses it.

- **Placement** follows Chrome's opener rule in the right pane's row: right after its selected
  tab, and consecutive opens from the same source run after the previous one.
- **From inside the right pane**, Open stacks a new tab in the right pane; it never jumps back to
  the left.
- **Reuse is right-pane only.** When a right-pane tab already shows that page, Open selects it
  (pushing a deeper address, such as a task, onto it) instead of duplicating it. Tabs in the left
  pane or another window are never matched.
- **Web links** follow the same rule. The source is the link's own tab, not the focused one.

So Inbox, Search, and Activity read as master and detail: the list stays on the left, and its rows
open on the right.

**Stays in its tab.** A page's own drill-down, a push to the same page (a Settings section, an
Agent profile card or section, a search filter, a task inside Tasks, an Inbox filter), navigates
its own tab. The new tab page's address field turns that same tab into the web page. A plain link
inside a web page navigates that page.

**Modifiers are universal.** On every link, chip, row, avatar, card, button, sidebar row, command
menu result, and menu item, following Chrome's dispositions:

| Gesture | Result |
| --- | --- |
| Command-click or middle-click | New background tab right after the tab clicked from, in that tab's pane |
| Shift-click or Command-Shift-click | The same new tab, selected, focusing its pane |
| Command-Return on a sidebar row or command menu result | Same as Command-click |

For a sidebar row or command menu result, the tab clicked from is the left pane's selected tab.
A modified click never reuses an existing tab, and a modified click on a Thread opens beside its
source like any page. The intent is captured at click time, so it survives any asynchronous work
before the navigation. Command means Control off macOS. Middle-click never autoscrolls.

**Sidebar row menu.** Open (Go), Open in new tab (a background tab after the left pane's selected
tab), Open on the right (Open), and, where they apply, View profile, Files, and Tasks (Open).

**Settings is a singleton.** Command-comma and the sidebar's Settings button select the window's
Settings tab wherever it is, focusing its pane; with none, Settings opens as a new selected tab in
the left pane, right after its selected tab. Inside Settings, sections stay in the tab. Desktop
hides Settings' back button (the tab and Command-[ cover it); the web keeps it.

**Scope.** Desktop only. The web App keeps one routed page with its chat side pane; iOS is
unchanged.

## Consequences

- The window-wide existing-tab match, the per-kind placements, the web-page exception, the
  "other pane" rule for in-page links, and the sidebar's dependence on the focused pane are gone.
  One sentence per verb describes every plain click.
- A sidebar click can replace a web page or a tab the person meant to keep; Back returns, and
  Command-click keeps it.
- A web link in a one-pane window splits the window, as every Open does.
- Two tabs may show the same page when one pane navigated there with Go and the other with Open,
  or through a modified click. Both stay live off the same synced queries.
- Notifications and deep links land on the right, beside whatever the person had open, rather
  than replacing it.
