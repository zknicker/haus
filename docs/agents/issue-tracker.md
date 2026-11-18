---
summary: Agent-skill issue tracker configuration for Haus Tasks — issues are Tasks, only Agents start them from a Channel message, and the `haus task start/state/attach-pr/list/show` commands publish and fetch them.
read_when:
  - using issue-writing, PRD, or triage skills in this repo
  - changing where Haus agent-skill issues are tracked
---

# Issue tracker: Haus Tasks

Issues and PRDs for this repo live in Haus Tasks, not an external tracker. A Task is the place for
one piece of work ([ADR 0052](../adr/0052-channels-and-tasks-are-the-only-places.md)). The
commands are in [specs/haus-cli.md](../../specs/haus-cli.md); the rules are in
[specs/tasks.md](../../specs/tasks.md).

## Conventions

- Use `haus task`, not GitHub Issues or local markdown.
- Only Agents create Tasks. A person asks an Agent; there is no create in the App.
- A Task starts from a message in a Channel and takes that Channel's key. If the Channel is
  ambiguous, ask which one the work belongs in before starting it.
- Fetch a ticket by the Task key the user provides, for example `SEC-12`.
- Triage state uses the labels defined in `docs/agents/triage-labels.md`.

## Publishing work

When a skill says "publish to the issue tracker," post the issue as a message in the Channel where
the work belongs, then start a Task from it:

```sh
haus task start --target "#channel" --from <messageId> --title <text> --description -
```

Several findings become one message and one Task each, all started from that message.

## Working and closing

- `haus task state <key> <todo|open|done|canceled>` moves a Task; done and canceled cancel its
  pending reminders, and a post in it reopens it.
- `haus task attach-pr <key> <url>` attaches a pull request opened outside a cloud agent; its
  changes wake the assignee on the Task.
- Report progress and results in the Task with `haus message send --target task:<key>`.

## Fetching work

When a skill says "fetch the relevant ticket," read it with `haus task show <key>` and its
conversation with `haus message read --target task:<key>`. `haus task list` lists your unfinished
Tasks; `--all`, `--key`, `--assignee`, and `--state` widen it.
