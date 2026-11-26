---
status: accepted
summary: The Haus App and iPhone app call an Agent a Captain, a channel a Project, and a Computer a Device. Only user-visible copy changes; the backend, API fields, routes, wire names, package names, env vars, Agent-facing text, and contract docs keep their nouns. Accepted 2026-11-19. Amended 2026-11-23: a Captain's default Device is its Machine, the UI never says "home" for a Device, and the Device page says "Captains using this device by default". Amended 2026-11-26 by ADR 0062: the UI says Task, Issue and Captain chat, and Worker leaves the UI.
read_when:
  - writing or reviewing user-visible copy in the Haus App or iPhone app
  - naming a UI label, heading, button, empty state, toast, or aria-label that mentions an Agent, channel, or Computer
  - deciding whether a doc or spec should use the UI name or the backend noun
  - labeling a Captain's Machine, or Device page copy about which Captains use or may use a Device
  - labeling Tasks, Issues, the Captain chat, crew, or Task activity in the UI
---

# ADR 0058: The UI Uses Capy Names

## Status

Accepted 2026-11-19. Amended 2026-11-23 with
[the Machine names](#amendment-2026-11-23-machine), after
[ADR 0057's Machine amendment](0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer).
Amended 2026-11-26 with [Task, Issue and the Captain chat](#amendment-2026-11-26-task-issue-and-the-captain-chat).

## Decision

Haus adopts Capy's product names in the UI. The desktop and web App (`apps/website/src`) and the
iPhone app (`apps/ios-swift`) show these names in labels, headings, buttons, menus, empty states,
tooltips, toasts, placeholders, aria-labels, and breadcrumbs:

| UI name | Backend noun |
| --- | --- |
| Captain | Agent |
| Project | channel |
| Device | Computer |

Captain is capitalized everywhere, like Agent was. Project and device follow sentence case: "New
project", "Projects", "Remove device", "Captains on this device". "DM" stays "DM".

Everything else keeps its name: the backend, API fields, routes, wire names, package names, env
vars, and every `haus`, `agent`, `channel`, and `computer` identifier, file, component, hook, and
type. Agent-facing text keeps the backend nouns too: the Agent system prompt, the Manual, CLI
receipts, inbox notices, and anything under the prompt contract.

Some UI strings keep their words because they name something else:

- "Haus Computer" is the installed service that connects a Device to Haus, and `haus-computer` is
  its CLI.
- "Cloud Agents" and "cloud agent" name provider-run agents such as Cursor Cloud Agents and Claude
  cloud sessions.
- "sub-agent" and the transcript's worker intent ("Working with agents") describe a runtime's own
  delegated agents.
- "Computer Use" is a tool name, and Factory's "agent credential" is Factory's term.

## Amendment 2026-11-23: Machine

A Captain's **Machine** is the Device its tools run on by default and where its Drive folder
syncs. It is a field of the Captain, like its model, and Capy's name for the same field. Device
stays the name of the paired computer. The contracts keep `computerId` for the Machine until the
implementation renames it.

The UI never says "home" for a Device. A Captain belongs only to its Project.

| Where | Label |
| --- | --- |
| New Captain, the Captain's settings and its DM | **Machine**, replacing the create form's "Device" (`apps/website/src/features/members/agent-creation-form.tsx:160`) |
| The action that changes it | **Change machine** |
| Device page, the Captains whose Machine it is | **Captains using this device by default**, replacing "Home Captains" (`apps/website/src/features/computers/computer-agents.tsx:42`) |
| Device page, Agent access | **Captain access**: **Selected Captains** or **All Captains on this Server** |
| Device page, computer use | One switch with no Captains select. "All Captains" (`apps/website/src/features/computers/computer-use-captains-row.tsx:71-72`) goes |

"Continue on" is reserved for a later transfer that carries a Captain's branch and uncommitted
work.

## Amendment 2026-11-26: Task, Issue and the Captain chat

From [ADR 0062](0062-tasks-are-agent-sessions-issues-are-the-backlog.md). These names match the
backend nouns, so they are names, not translations:

| UI name | Backend noun | Notes |
| --- | --- | --- |
| Task | task | Capy calls it a thread. A Task is one agent session; the UI never says "thread" |
| Issue | issue | The backlog card, with its code (GEN-12) |
| Captain chat | `captain` chat | Replaces "your DM" with a Captain. "DM" stays for person-to-person DMs |
| Machine | `computerId` | Also a Task's field: "Runs on MacBook" |

- "Worker" leaves the UI with Workers. "Crew" names a Captain's Tasks.
- Activity reads Working, Waiting, Idle, Failed, and Needs you, as in Capy.
- The Tasks list tabs are **My tasks**, **All tasks**, and **Archived**.

## Consequences

- Docs and specs keep the backend nouns wherever they describe contracts, storage, APIs, or Agent
  behavior. A doc uses the UI name only when it quotes a UI label.
- [CONTEXT.md](../../CONTEXT.md) maps each UI name to its backend noun.
- Tests and App e2e selectors assert the UI names; test names and fixtures keep the backend nouns.
