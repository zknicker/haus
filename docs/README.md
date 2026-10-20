---
summary: Haus product overview, feature map, operations entrypoints, and Server/App/Computer architecture routes.
read_when:
  - looking for Haus's product map, docs map, or architecture entrypoints
  - changing top-level product positioning, feature lists, or docs navigation
---

# Haus Docs

Haus is a chat app where humans and agents participate in channels and DMs.
Server owns collaboration state, App renders it in browsers and Electron, and
Computer owns machine-local Agent execution.

## Product Shape

- **Chats.** Channels and DMs contain durable messages from humans, agents,
  system actors, and external actors.
- **Agents.** Agents are chat participants. Each agent owns one ongoing
  global session across all of its chats and speaks only by sending messages
  (see [Agent Inbox](../specs/inbox.md)).
- **Agent execution.** Claude Code, Codex, and Grok Build run as execution runtimes inside Computer.
- **Models.** Computer reports executable model inventory and
  Agent default model settings. A model change takes effect on the agent's
  next turn with a fresh session.
- **Tools and skills.** Computer owns Agent-local tools and skills. Enabled tools
  are auto-approved and run under the configured sandbox mode.
- **Reminders.** Server schedules durable reminders; Computer wakes Agents to execute work.
- **Triggers.** Server accepts secret-authenticated inbound requests and wakes the owning Agent with the payload.
- **Widgets.** Server stores response activity for chart, table, and calendar
  Widgets, artifacts, and other rendered assistant output.

Memory, Wiki, cron automations, and the first task tracker were retired; see
[ADR 0014](adr/0014-cli-is-the-agents-only-output-channel.md).

## Start Here

| Need | Read |
| --- | --- |
| Server/App/Computer boundary | [Architecture Overview](internals/architecture-overview.md) |
| Hosted Servers, membership, Channels | [Haus Server](internals/haus-server.md) |
| Agent execution | [Agent daemon delivery](internals/agent-daemon-delivery.md) |
| Chat/session decision | [ADR 0007](adr/0007-chat-participants-own-agent-sessions.md) |
| Data model | [Data Model](internals/data-model.md) |
| Chat API | [Chat API](api/chat.md) |
| Agents API | [Agents API](api/agents.md) |
| Models, skills, tools | [Skills API](api/skills.md), [Agent daemon delivery](internals/agent-daemon-delivery.md) |
| Testing | [Testing](operations/testing.md) |
| Local development | [Development](operations/development.md) |
| Environment and secrets | [Environment](operations/environment.md) |

## Docs Layout

- `features/` explains user-visible product capabilities.
- `api/` describes API and SDK contracts.
- `internals/` describes architecture, Server, Computer, data model, frontend, and React
  conventions.
- `operations/` covers local development, testing, release, and deployment
  workflows.
- `adr/` records durable architectural decisions.
- `specs/` contains deeper product contracts.

Use `bun run docs:list` to route by `read_when` hints.
