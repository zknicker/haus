---
summary: Agent profile — the single Server-backed surface for an agent's identity, configuration, activity, chats, automations, skills, workspace, and MCP connections.
read_when:
  - changing the agent profile hub or sections, where a profile opens, or agent avatar click targets
  - changing per-agent settings surfaces, Server APIs, or Computer-backed workspace access
---

# Agent Profile

One component family renders every per-agent surface: a hub page (`home`)
with drill-down sections, under a persistent header (face, name, live
presence, and Message / Stop / Restart actions). There is no separate
per-agent settings surface. The hub holds identity, summary cards that state
their fact, the Agent's chats, recent activity, and usage; clicking a card
drills into its section with a breadcrumb back to the hub
([ADR 0038](../docs/adr/0038-destinations-open-as-tabs.md)).

## Hosting

- **Desktop**: an Agent profile is a workspace tab (`agent` tab, identity =
  Agent id). It opens in the side pane in split mode, or as the selected tab
  in expanded mode (ADR 0038). Drill-down stays
  inside the tab as its section. Opening an open profile selects its tab. A
  deleted Agent's tab closes itself.
- **Web**: the profile is a routed page at
  `/s/:serverSlug/agents/:agentId/:section` (`agents/:agentId` redirects to
  `home`). Old `members/agents/:agentId` links redirect here.
- `useOpenAgentProfile` is the one opener on both platforms. Clicking an
  Agent's avatar or reference chip in a chat opens its profile; hovering
  shows the hover card. The chat side pane never hosts profiles.
- Clicking an agent's **name** in a transcript header inserts an @mention
  into the composer instead; the DM topbar name is inert. Humans are records
  under Settings > Members, not Agent profiles.

## Sections

The hub (`home`) links every section through a card; each section is a
drill-down under a breadcrumb back to the hub, with the lifecycle menu at the
breadcrumb's end for Owners and Admins.

- **Runs on** (`runtime`). The assigned Computer and its health; the desired
  runtime, model, and effort, beside what the Computer reports.
- **Profile** (`profile`). Server-owned identity facts: name, handle,
  description, and who created the Agent and when. Editing lives on the hub
  header; a factory Agent's identity is fixed.
- **Automations** (`automations`). Reminders and Triggers. Reminder creation
  is conversational.
- **Skills** (`skills`). Agent-owned skills reported by the Computer, shown by
  display name.
- **Connections** (`connections`). Server-managed MCP connections granted at
  connection level. Haus does not expose per-tool grants or local/stdin MCP
  configuration.
- **Workspace** (`workspace`). Read-only file tree and viewer over the
  agent's real Computer workspace through an authorized live
  Server↔Computer relay. The Server does not replicate workspace files.
  Hidden files are excluded by default and appear only while the user enables
  the hidden-files toggle. Sensitive files and skipped heavy directories
  remain unavailable in both modes.
- **Activity** (`activity`). Timestamped semantic lifecycle and tool-category
  history from durable Server records ([agent-activity](agent-activity.md))
  with Copy Diagnostic Info. Raw tool evidence is not part of this history.

The hub itself also lists the Chats the Agent participates in, recent
activity, and compact usage.

## Ownership

- The Server owns Agent identity, membership, configuration intent, Chats, semantic activity
  history, reminders, MCP connections, and access grants.
- The Computer owns execution, the detailed execution journal, workspace files, credentials, and
  effective runtime state.
- The browser talks only to the Server through typed tRPC procedures. It
  never invokes a Computer directly.
- Reads never start, resume, rotate, or otherwise mutate Agent execution.
