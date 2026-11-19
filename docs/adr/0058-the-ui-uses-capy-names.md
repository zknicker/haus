---
status: accepted
summary: The Haus App and iPhone app call an Agent a Captain, a channel a Project, and a Computer a Device. Only user-visible copy changes; the backend, API fields, routes, wire names, package names, env vars, Agent-facing text, and contract docs keep their nouns. Accepted 2026-11-19.
read_when:
  - writing or reviewing user-visible copy in the Haus App or iPhone app
  - naming a UI label, heading, button, empty state, toast, or aria-label that mentions an Agent, channel, or Computer
  - deciding whether a doc or spec should use the UI name or the backend noun
---

# ADR 0058: The UI Uses Capy Names

## Status

Accepted 2026-11-19.

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

## Consequences

- Docs and specs keep the backend nouns wherever they describe contracts, storage, APIs, or Agent
  behavior. A doc uses the UI name only when it quotes a UI label.
- [CONTEXT.md](../../CONTEXT.md) maps each UI name to its backend noun.
- Tests and App e2e selectors assert the UI names; test names and fixtures keep the backend nouns.
