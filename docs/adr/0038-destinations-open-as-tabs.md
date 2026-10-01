---
summary: Decision that desktop destinations open as workspace tabs, the window follows Codex's split and expanded modes (a side pane beside the routed page, or one strip), and the Agent profile is one hub page with drill-down sections instead of titlebar tabs.
read_when:
  - changing where an Agent profile opens, or adding a new tab-able destination
  - changing the desktop side pane, the expand or side pane controls, or where new tabs land
  - changing the Agent profile hub, its cards, or its drill-down sections
---

# 0038 Destinations open as tabs

## Status

Accepted, 2026-10-01. Revised the same day: the two-group split and its routing rule were replaced
by Codex's split and expanded modes after the split toggle proved confusing in use.

## Context

Clicking an Agent in a chat opened a chat-scoped Profile side pane, while the full profile replaced
the primary tab and injected five section tabs (Overview, Setup, Automations, Activity, Workspace)
into the window titlebar. Once desktop gained workspace tabs, both became wrong: the side pane was a
second, weaker way to show a destination, and the titlebar is reserved for tabs.

## Decision

**Every desktop destination is a tab; the window's mode decides where it shows.** The layout
follows Codex: a mode, not two tab groups. There is one ordered list of closable tabs (browser
pages, artifacts, Agent profiles, Threads) beside the primary tab, which is the routed page.

- **Split mode** (the default): the routed page fills the left column under a plain title, with no
  tab strip over it. Every closable tab lives in a **side pane** docked on the right, whose strip
  sits in the window band starting at the pane's edge, with its own new-tab button. A side pane
  toggle hides and shows the pane; while hidden it badges the count of open tabs and lists them on
  hover. Opening any tab while the pane is hidden reveals it. With no closable tab open, a New tab
  button replaces both layout controls.
- **Expanded mode**: one strip, the primary tab first, then every closable tab; the selected tab
  takes the whole content width.

An **expand** button switches to expanded mode (selecting the side pane's tab if it was showing);
pressed, it collapses back, every closable tab returning to the side pane with the same tab
selected; in expanded mode the side pane toggle stays visible and collapses back the same way.
After Codex, the controls sit after a divider from the page's actions. The mode is remembered per
device. Opening a destination that is already open selects its
existing tab instead of duplicating it. There is no placement choice: no Cmd-click routing, no
moving tabs between groups.

Agent profiles are the first destination kind (`agent` tabs, identity = Agent id); artifact tabs,
Thread tabs, and browser tabs follow the same model. Browser tabs work in the side pane: a page's
native view is placed over its DOM host wherever the layout renders it.

**Glance by hover, open by click.** Hovering an Agent avatar or chip shows the existing hover card.
Clicking opens the Agent's profile tab. The chat-scoped Profile side pane is removed.

**The Agent profile is a hub.** The profile's home page holds identity, a grid of six summary cards
(Runs on, Profile, Automations, Skills, Connections, Workspace), the Agent's chats, recent
activity with repeated failures collapsed, and compact usage. Each card states its fact rather than
defining itself (`Atlas, BidBeacon +2`, not `MCP servers this Agent may call`). Clicking a card
drills into that section **inside the same tab**, with a breadcrumb back to the hub. Nothing is
injected into the titlebar. Every tab-able page must work at side pane width (420px and up).

**Web** has no workspace tabs, so the profile stays a routed page (`agents/:agentId/:section`) with
the same hub and drill-down. The chat side pane keeps artifacts, files, and threads.

## Consequences

- One command, `useOpenAgentProfile`, replaces every direct profile navigation and pane opener; it
  routes to a tab on desktop and to the profile route on web.
- The chat side pane no longer hosts profiles; ADR 0004 still governs the web Artifact Panel.
- A selected browser page that is not on screen (a hidden pane, the primary tab over it) stays
  selected in Electron with no bounds; Electron then hides its view and page shortcuts do nothing.

## Amendment, 2026-10-01: threads are tabs with a preview

Threads open like any other tab: in split mode in the side pane beside their chat, which is the
common case; in expanded mode as the selected tab. (An earlier version of this amendment gave
threads a "companion" placement class that always opened the split; the mode model makes that
unnecessary, since split mode already keeps the chat beside every tab.)

Threads open as a **preview tab**: there is at most one preview tab, and opening another thread
replaces it in place instead of stacking. Replying in the thread or double-clicking its tab pins
it, and a pinned tab stays until closed; a reopened thread opens pinned. Thread tab identity is
chat id plus thread root, so reopening an open thread selects it. Only pinned tabs persist.

On desktop the chat side pane no longer hosts threads, so the workspace side pane is the window's
single side surface. Thread links and deep links (inbox, notifications, `?thread=`) open the thread tab. Web has
no tabs and keeps the chat side pane for threads, files, and artifacts unchanged.

