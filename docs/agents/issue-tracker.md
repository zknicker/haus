---
summary: Agent-skill issue tracker configuration for Haus Tasks.
read_when:
  - using issue-writing, PRD, or triage skills in this repo
  - changing where Haus agent-skill issues are tracked
---

# Issue tracker: Haus Tasks

Issues and PRDs for this repo live in Haus Tasks, not an external tracker. Use `haus task` and
`haus board` (`specs/haus-cli.md`).

## Conventions

- Use `haus task` / `haus board` for issue operations, not GitHub Issues or local markdown.
- If a skill needs to create an issue and the target board is ambiguous, ask for the board key
  before creating it.
- If a skill needs to fetch a ticket, use the Task key the user provides (for example `SEC-12`).
- Triage state uses the labels defined in `docs/agents/triage-labels.md`.

## Publishing work

When a skill says "publish to the issue tracker," create a Task with `haus task create --board
<key> --title <text>` on the board the user names.

## Fetching work

When a skill says "fetch the relevant ticket," read the referenced Task with `haus task show
<key>`.
