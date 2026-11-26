---
summary: Default triage label vocabulary for agent-skill work in Haus Tasks.
read_when:
  - using the triage skill in this repo
  - configuring Haus Tasks labels for agent-skill workflows
---

# Triage labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the label
strings used on Haus Tasks.

| Label in mattpocock/skills | Label in Haus Tasks | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Tasks carry no labels ([ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md));
labels belong to Issues ([specs/issues.md](../../specs/issues.md)). Until `haus issue` ships, say
the role in the Task instead, for example "Triage: ready-for-agent".
