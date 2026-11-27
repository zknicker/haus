---
summary: The agent panel — a resizable right panel beside an agent conversation, toggled per chat, whose tabs come from the chat's kind. The Captain panel (Overview, Issues, AGENTS.md, and Setup drill-ins) replaces the standalone Captain profile page; `agents/:agentId/:section` redirects into it. Covers what each section reads today and after ADR 0062 lands, the defaults for the mock's open questions, and what is deferred.
read_when:
  - changing the agent panel shell, its toggle, width, persistence, or ⌘.
  - changing the Captain panel's Overview, Issues, AGENTS.md, or Setup drill-ins
  - changing how the App opens a Captain (strip, @mention, search, View Captain profile)
  - changing the old Captain profile route or its redirect
  - building the Task page's chat + side panel (ADR 0062 step 6)
---

# Agent panel

Every agent conversation is a chat with a right panel. The panel replaces the Captain profile page
([ADR 0038](../docs/adr/0038-destinations-open-as-tabs.md)'s hub) and becomes the Task page's side
panel in [ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) step 6.
Visual spec: the Captain panel mocks (2026-11-26).

## Shell

- **Subject.** A chat has a panel when it has a panel subject. Today the only subject is a
  Captain: a DM whose peer is a Captain. The panel is keyed off "this chat's Captain", never off
  DM fields, so the shared Captain chat (ADR 0062 step 5) only changes which chat carries the
  subject. Channels and human DMs have no panel.
- **Tabs come from the subject kind.** Captain: Overview, Issues, AGENTS.md. Task (step 6): its own
  set. A chat kind with no tabs has no panel and no toggle.
- **Placement.** The panel sits beside the transcript inside the chat surface, on the web and in a
  desktop tab. It starts at 400px, resizes from its left edge between 320px and 640px, and the
  width is one App-wide preference saved on this device. It never takes more than half the chat
  surface, so a narrow desktop pane keeps a readable transcript, and in a window under 768px it
  covers the transcript until it is closed.
- **No band over the chat.** On desktop the transcript runs full height. The web keeps its chat
  identity row (docs/internals/react.md, "page band"), and the panel toggle sits at its far end in place of the
  workspace toggle (the Workspace drill-in browses the same files).
- **Toggle.** While the panel is open, its toggle is the last control in the panel header. While it
  is closed, the toggle sits at the right end of the window tab row of the pane showing the chat
  (desktop) or the chat's identity row (web). ⌘. toggles the panel of the chat in the focused tab.
- **Persistence.** Open or closed, the selected tab, and the open drill-in are saved per subject on
  this device. A subject owns exactly one chat, so this is per chat. A Captain chat opens with
  the panel open on Overview the first time.

## Opening a Captain

- The Captain strip, an @mention, a transcript avatar, search, the command menu, and the
  "View Captain profile" menu item all open the Captain's chat with the panel open on Overview
  (or on the drill-in they name).
- One function maps a Captain to the chat it opens (`captainChatRoute`). Today it returns the
  Captain's DM with the viewer: the existing DM, else the implicit DM page. After ADR 0062 step 5
  it returns the shared Captain chat; nothing else changes.
- `agents/:agentId/:section` redirects to that chat with the matching view: `home` → Overview,
  `runtime` → Runs on, and `model`, `settings`, `automations`, `skills`, `connections`,
  `permissions`, `workspace`, `profile` and `activity` → that drill-in. A link that names a drill-in
  (the automation cause line) keeps this address as its href, so copy-link keeps the drill-in. Retired tabs (`overview`, `setup`, `instructions`) and
  unknown sections map as they did; a Member's `permissions` lands on Overview.

## Captain panel

### Overview

A compact header — avatar, name, `@handle`, and ••• — then these sections, in order. An empty
section hides. Rows are one line: glyph, title, then muted right columns ending in the age.

| Section | Reads today | After ADR 0062 |
| --- | --- | --- |
| Alert | The Captain's runtime, model-connection, or wake-pause issue (`AgentRuntimeIssue`). | Same. |
| Needs you | Open Issues this Captain created that are assigned to a person (`issue.list` by creator), then claims assigned to the Captain with no reply (dropped claims, ••• → Release). | Same, plus Task needs-you once Tasks report it. |
| Crew | Unfinished Tasks this Captain created (`task.list`, filtered by `createdBy`). Title, then age. A Task linked from an Issue (`issue.taskIds`) reads "GEN-12 · title". No state, priority, or key. | Active Tasks by `created_by_agent_id`, with the model when the record carries it. |
| Setup | Runs on, Model, and All settings with counts (reminders, skills). | Same. |
| Drive | AGENTS.md, WORKER.md and MEMORY.md with their age, and All files. | Same. |

### Issues

Issues assigned to this Captain (`issue.list` with `assignee: captain`), grouped by state: In
progress, Todo, Backlog, then Done and Canceled collapsed. Row: state glyph, code, title, the
assignee's chip when it is a crew Task, and age. The tab shows the open count. Reads and caches
follow [Realtime Events](realtime-events.md): `issue.onCreated` and `issue.onUpdated` each
invalidate the Issue lists.

### AGENTS.md

The Captain's `agents/<handle>/AGENTS.md`, rendered, with who last edited it and when. Edit
switches it to the Drive editor in place (the same text session, Save and Discard); Done returns
to the rendered file. A missing file shows one quiet line.

### Setup drill-ins

Runs on, Model, All settings, and from All settings: Automations, Skills, Connections,
Permissions (Owner or Admin), Workspace, and Profile. Each opens inside the panel under a back
arrow and reuses the Captain profile's section components. Activity opens the same way.

## Defaults for the open questions

- **Permissions** sits behind All settings, not in •••.
- **•••** holds Edit profile and the lifecycle verbs (Stop, Restart, Start fresh session, Full
  reset, Delete Captain). The avatar is changed by pressing the header's avatar, which opens the
  same photo menu as before.
- **Old DM history** is the Captain chat for now: the DM is the chat the panel sits beside.
- **Issues tab scope**: Issues assigned to the Captain only.
- **Needs you vs the alert**: connection problems are the alert; dropped claims stay rows.

## Deferred

- Expand (the panel full-width) and `+` to pin other Drive files as tabs.
- The Task panel (ADR 0062 step 6) reuses this shell with its own tabs.
- The model column on Crew rows, until the Task record carries a model.
- The machine column on Crew rows, until a Task's Machine can differ from its Captain's.
- Opening an Issue from a row: the App has no Issue page yet, so Issue rows open nothing.
- A Crew filter on the Server: `task.list` has no creator filter, so Crew selects the Captain's
  Tasks from the Server's unfinished ones.
