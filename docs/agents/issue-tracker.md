---
summary: Agent-skill issue tracker configuration for Haus Tasks — an Agent starts a Task from a Channel message for each issue, and `haus task start/list/show/archive/attach-pr` publish and fetch them by short id until `haus issue` lands.
read_when:
  - using issue-writing, PRD, or triage skills in this repo
  - changing where Haus agent-skill issues are tracked
---

# Issue tracker: Haus Tasks

Issues and PRDs for this repo live in Haus, not an external tracker. Until `haus issue`
([specs/issues.md](../../specs/issues.md)) ships, each one is a Task: the place for one piece of
work ([ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md)). The commands
are in [specs/haus-cli.md](../../specs/haus-cli.md); the rules are in
[specs/tasks.md](../../specs/tasks.md).

## Conventions

- Use `haus task`, not GitHub Issues or local markdown.
- A Task starts from a message and belongs to a Project. If the Project is ambiguous, ask which
  one the work belongs in before starting it.
- A Task is named by its short id, for example `k3mq7xta`. A code like `GEN-12` names an Issue.
- A Task has no state, priority, or labels; it is active or archived. Triage labels
  (`docs/agents/triage-labels.md`) apply to Issues.

## Publishing work

When a skill says "publish to the issue tracker," post the issue as a message in the Channel where
the work belongs, then start a Task from it:

```sh
haus task start --target "#channel" --from <messageId> --title <text> --description -
```

Several findings become one message and one Task each, all started from that message.

## Working and closing

- `haus task archive <shortId>` archives a finished or unneeded Task; it cancels its pending
  reminders.
- `haus task attach-pr <shortId> <url>` attaches a pull request the Task did not open itself.
- Report progress and results in the Task with `haus message send --target task:<shortId>`.

## Fetching work

When a skill says "fetch the relevant ticket," read it with `haus task show <shortId>` and its
conversation with `haus message read --target task:<shortId>`. `haus task list` lists the active
Tasks you started; `--all`, `--project`, and `--archived` widen it.
