---
summary: Feature docs index for Haus product capabilities.
read_when:
  - looking for Haus's user-facing product capabilities
  - adding, renaming, or reorganizing feature docs
---

# Features

Feature docs describe what Haus exposes as a product. Architecture,
implementation ownership, and runtime details live under
[internals](../internals/).

| Feature | Doc |
| --- | --- |
| Chat | [Chat](chat.md) |
| Inbox | [Inbox](inbox.md) |
| Agents | [Agents](agents.md) |
| Context management | [Context management](context-management.md) |
| Rich references | [Rich references](rich-references.md) |
| Clarifications | [Clarifications](clarifications.md) |
| Tasks | [Tasks](tasks.md) |
| Activity | [Activity](activity.md) |
| Reminders | [Reminders](reminders.md) |
| Triggers | [Triggers](triggers.md) |
| Skills and Tools | [Skills and Tools](skills.md) |
| Connections | [Connections](connections.md) |
| Usage | [Usage](usage.md) |
| Pets and rewards | [Pets and rewards](pets.md) |

Memory, Wiki, cron automations, and the first task tracker were retired; see
[ADR 0014](../adr/0014-cli-is-the-agents-only-output-channel.md). Agents
speak only by sending messages (see [Agent Inbox](../../specs/inbox.md)).
Chat-first [Tasks](tasks.md) and [Reminders](reminders.md) are their
successors.
