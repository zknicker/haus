---
summary: Agent profile — what each of a Captain's settings editors holds (Runs on, Model, Profile, Automations, Skills, Connections, Permissions, Workspace, Activity). They open as drill-ins in the Captain panel (specs/agent-panel.md); there is no standalone profile page.
read_when:
  - changing a Captain settings editor (Runs on, Model, Profile, Automations, Skills, Connections, Permissions, Workspace, Activity)
  - changing per-agent settings surfaces, Server APIs, or Computer-backed workspace access
---

# Agent Profile

A Captain's settings are editors that open inside the Captain panel beside its chat, under a back
arrow. The panel's shell, Overview, tabs, opening, and the redirect from the old
`agents/:agentId/:section` address live in [Agent panel](agent-panel.md). There is no separate
per-agent page and no second-pane tab.

## Editors

Overview's Setup rows open Runs on and Model; All settings lists the rest. The header's `···`
holds Edit profile, Profile, and the lifecycle verbs for Owners and Admins; a Member's menu holds
only Profile.

- **Runs on** (`runs-on`). The Captain's Machine, with a change flow.
- **Model** (`model`). The desired runtime, model, and effort beside what the Computer reports,
  with the Computer's health.
- **Profile** (`profile`). Server-owned identity facts: name, handle, description, who created
  the Agent and when, and its home Project. Editing lives in the Edit profile popover — name,
  description (counted against 280), the private conversation style (counted against 2000), and
  the signature emoji. The style and emoji are readable and writable only by Owners, Admins, and
  the Agent itself; other Agents never see them. The Agent edits its own only when an Owner or
  Admin asks, never at another Agent's or a member's request, and the style governs voice and
  banter only, never rules, permissions, or how it works.
- **Automations** (`automations`). Reminders and Triggers. Reminder creation is conversational.
- **Skills** (`skills`). Agent-owned skills reported by the Computer, shown by display name.
- **Connections** (`connections`). Server-managed MCP connections granted at connection level.
  Haus does not expose per-tool grants or local/stdin MCP configuration.
- **Permissions** (`permissions`). What the Agent may manage for other Agents, one switch row per
  power. An Owner or Admin turns on **Manage connections** to make the Agent a connection admin.
  Only Owners and Admins see it in All settings; a Member's link to it lands on Overview.
- **Workspace** (`workspace`). Read-only file tree and viewer over the agent's real Computer
  workspace through an authorized live Server↔Computer relay. The Server does not replicate
  workspace files. Hidden files are excluded by default and appear only while the user enables
  the hidden-files toggle. Sensitive files and skipped heavy directories remain unavailable in
  both modes.
- **Activity** (`activity`). Timestamped semantic lifecycle and tool-category history from
  durable Server records ([agent-activity](agent-activity.md)) with Copy Diagnostic Info. Raw tool
  evidence is not part of this history.

Clicking an agent's **name** in a transcript header inserts an @mention into the composer; its
avatar opens the Captain. Humans are records under Settings > Members.

## Ownership

- The Server owns Agent identity, membership, configuration intent, Chats, semantic activity
  history, reminders, MCP connections, and access grants.
- The Computer owns execution, writes the detailed execution journal (and syncs a redacted copy to
  the Server), and owns workspace files, credentials, and effective runtime state.
- The browser talks only to the Server through typed tRPC procedures. It never invokes a Computer
  directly.
- Reads never start, resume, rotate, or otherwise mutate Agent execution.
