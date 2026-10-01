---
summary: Decision that desktop destinations open as workspace tabs, a window split decides where a new tab lands, and the Agent profile is one hub page with drill-down sections instead of titlebar tabs.
read_when:
  - changing where an Agent profile opens, or adding a new tab-able destination
  - changing the desktop split pane, its toggle, or where new tabs land
  - changing the Agent profile hub, its cards, or its drill-down sections
---

# 0038 Destinations open as tabs

## Status

Accepted, 2026-10-01.

## Context

Clicking an Agent in a chat opened a chat-scoped Profile side pane, while the full profile replaced
the primary tab and injected five section tabs (Overview, Setup, Automations, Activity, Workspace)
into the window titlebar. Once desktop gained workspace tabs, both became wrong: the side pane was a
second, weaker way to show a destination, and the titlebar is reserved for tabs.

## Decision

**Every desktop destination is a tab; the layout decides where it lands.** The window has a main
tab strip and an optional **split**: a second tab group docked on the right with its own strip. One
routing rule places new tabs: if the split is open, a new tab opens there; otherwise it opens in the
main strip. Cmd-click always opens in the main strip. Tabs drag between groups. A band button
toggles the split; closing it folds its tabs into the main strip, and opening it moves the active
closable tab across. Split state is per window. Opening a destination that is already open selects
its existing tab instead of duplicating it.

Agent profiles are the first destination kind under this rule (`agent` tabs, identity = Agent id).
Artifact tabs follow the same rule. Browser tabs stay main-strip only for now because their
Electron views are positioned natively.

**Glance by hover, open by click.** Hovering an Agent avatar or chip shows the existing hover card.
Clicking opens the Agent's profile tab. The chat-scoped Profile side pane is removed.

**The Agent profile is a hub.** The profile's home page holds identity, a grid of six summary cards
(Runs on, Profile, Automations, Skills, Connections, Workspace), the Agent's chats, recent
activity with repeated failures collapsed, and compact usage. Each card states its fact rather than
defining itself (`Atlas, BidBeacon +2`, not `MCP servers this Agent may call`). Clicking a card
drills into that section **inside the same tab**, with a breadcrumb back to the hub. Nothing is
injected into the titlebar. Every tab-able page must work at split width (420px and up).

**Web** has no workspace tabs, so the profile stays a routed page (`agents/:agentId/:section`) with
the same hub and drill-down. The chat side pane keeps artifacts, files, and threads.

## Consequences

- One command, `useOpenAgentProfile`, replaces every direct profile navigation and pane opener; it
  routes to a tab on desktop and to the profile route on web.
- The chat side pane no longer hosts profiles; ADR 0004 still governs the web Artifact Panel.
- Follow-up: browser tabs in the split, once Electron view bounds can follow the split column.

## Amendment, 2026-10-01: threads are companions

Destinations have one of two placement classes. **Pages** (Agent profiles, artifacts) follow the
routing rule above. **Companions** (threads) always open in the split, opening it if it is closed;
Cmd-click still forces the main strip. A thread read next to its chat is the common case, and a
companion opened as a main tab would cover the conversation it belongs to.

Companions open as a **preview tab**: the split holds at most one preview tab, and opening another
companion replaces it instead of stacking. Replying in the thread, double-clicking its tab, or
moving it pins the tab, and a pinned tab stays until closed. Thread tab identity is chat id plus
thread root, so reopening an open thread selects it. Only pinned tabs persist.

On desktop the chat side pane no longer hosts threads, so the split is the window's single side
surface. Thread links and deep links (inbox, notifications, `?thread=`) open the thread tab. Web has
no tabs and keeps the chat side pane for threads, files, and artifacts unchanged.

