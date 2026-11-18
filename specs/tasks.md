---
summary: The Tasks contract — a Task is a `task` Chat started by an Agent from a Channel Message, with a state, a key from the per-Server ledger, followers, attached cloud agents and pull requests, one-time reminders, and the Server rules for each.
read_when:
  - changing Task fields, states, keys, the key ledger, or Channel key configuration
  - changing how an Agent starts a Task, the origin Message, or the `task:KEY-n` target
  - changing Task followers, Task unread, the sidebar's open Tasks, the Tasks page, or Channel Task previews
  - changing attached cloud agents, attached pull requests, or what wakes an Agent on a Task
  - changing Task references (`task://` links, bare keys), Mentioned in, or reminders on a Task
  - changing the `/api/agent/tasks` routes or Task assignment delivery
---

# Tasks

[ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md) is the product contract:
Haus has two kinds of place, Channels (and DMs) for conversation and Tasks for work. A **Task** is
a Channel for one piece of work. A **claim** is still the Agent-only lock on a Message
([claims.md](claims.md)); a Task does not mark ownership. Wire shapes live in
`packages/haus-api/src/{task,task-input,task-state,task-key,task-key-ledger,task-preview,agent-task-refusals}.ts`.
The tRPC surface is [docs/api/tasks.md](../docs/api/tasks.md); the Agent routes are in
[docs/api/agents.md](../docs/api/agents.md#task-routes).

## A Task is a place

- A Task is a `tasks` row plus its own Chat of kind `task`. The Chat hangs under the origin
  Channel (`parent_chat_id`, `parent_chat_kind = 'channel'`) and the origin Message
  (`anchor_message_id`). It has messages, mentions, unread, notifications, and a composer like a
  Channel. `tasks.chat_id` links the two, one Chat per Task.
- Fields: key and number, `title` (1–200), markdown `description` (≤ 20,000), `state`, at most one
  assignee (an active member or a non-retired Agent), priority, labels from the task label catalog,
  display-only `dueOn`, exactly one creator, `origin` (`{ chatId, messageId }`), timestamps, and
  `version`.
- `state` is `todo`, `open`, `done`, or `canceled` (`task-state.ts`). `completedAt` is set exactly
  while the Task is `done` or `canceled`. A merged pull request never closes a Task; an Agent or a
  human sets the state. Posting in a closed Task reopens it.
- Every mutation takes `expectedVersion` and fails closed with a conflict. There is no deletion.
- A Task with no Chat and no origin is history from before Tasks were places (migration 0127). It
  reads like any Task and refuses every write.

## Starting a Task

- Only Agents start Tasks (`tasks/task-start.ts`). Humans ask an Agent; there is no human create
  and no Convert to Task. Reminders and Triggers never start a Task themselves: they wake an Agent,
  which decides.
- A Task starts from a Message in a Channel, never a DM (`TASK_ORIGIN_DM`). One Message can carry
  several Tasks; Tasks have no parents or children. When no suitable Message exists, the Agent
  posts an origin Message in the Channel where the work belongs, mentions whoever asked, and
  starts the Task from it. A request made in a DM gets a reply carrying the Task chip.
- An Agent starts a Task when its reply will not finish the work: more steps, more time, or a
  cloud agent. A reply that is the whole of the work stays a reply. The Agent prompt's Tasks
  section teaches this ([ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md)
  decision 5).
- `task:KEY-n` is a Task's target. `haus message send --target task:SEC-12` posts in it,
  `haus message read --target task:SEC-12` reads it, and an Agent reaches it only when it has
  joined the origin Channel (`agent-api/resolve-task-target.ts`).

## Keys

- The Server keeps a ledger of keys (`task_keys`): `key` matches `^[A-Z][A-Z0-9]{1,4}$`, is unique
  per Server, and carries its own `next_number`. Numbers are allocated under the entry's row lock,
  after the Server row lock (`tasks/task-key-ledger.ts`). A Task's key is `<key>-<number>`.
- Every Server has the General entry, `GEN`, made with the Server. Each Channel is configured with
  one entry (`chats.task_key_id`); Channels can share one, and a Channel without one takes General.
  A DM has none. A Task takes the key of its origin Channel when it starts and keeps it.
- `taskKey.create` adds an entry. Migration 0124 turned every board into a ledger entry with the
  same id, key, and counter, so existing keys and numbers carried over.

## Followers and unread

- A Task is unread only for its **followers** (`tasks/task-follows.ts`): the origin Message's
  author, anyone mentioned in it, the assignee, and anyone who posts in the Task. Anyone can follow
  or unfollow by hand (`task.setFollow`); a hand unfollow sticks until they follow again.
  Follows ride `thread_follows` and `agent_thread_follows` with `thread_chat_kind = 'task'`.
- An unread Task appears in a follower's Inbox the way an unread Channel does. For everyone else it
  is a quiet row with its state and never reaches their Inbox. There is no attention tier
  ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).

## Where Tasks show

- **Sidebar:** every `open` Task on the Server that the reader can see (`task.listOpen`). Todo
  Tasks are not listed, and a Task leaves as soon as it is done or canceled.
- **Tasks page:** one flat list of todo, open, done, and canceled Tasks, with no boards and no
  columns. Humans change state and reassign there; they cannot create.
- **Channel previews:** under its origin Message, each Task shows its key, title, state, message
  count, the viewer's unread, and its newest messages (`TaskPreview`, at most three), riding
  `chat.messages` pages as `tasks`.
- **Task page:** the conversation on the left, with a "started from" element pointing at the
  origin Message, and the attached-work panel on the right: one card per cloud agent with its
  newest Run's summary, each attached pull request no card already names, and pending reminders.
- **iPhone** opens a Task as a chat with a small attached-work header and renders Channel
  previews. It has no Tasks page.

## Attached work and wakes

- Cloud agents attach to a Task (`cloud_agent_work.task_id`). `haus cloud-agent start` requires
  `--task`, and the Server refuses a launch without one (`CLOUD_AGENT_TASK_REQUIRED`). The launch
  Message posts in the Task. See [cloud-agents.md](cloud-agents.md).
- Pull requests attach in `task_pull_requests` (repository and number). A pull request a cloud
  agent opens for the Task attaches on its own; `haus task attach-pr` attaches one opened another
  way. The Task page reads the Server's stored pull request readings.
- Run notices, pull request changes, and reminders set on a Task wake the Agent on that Task, and
  a plain send in that turn goes to the Task. A pull request becoming ready for review or its
  checks finishing after the Run settled is a new wake: a `pull_request` notice carrying
  `pullRequestChange` (`github/pull-request-wake.ts`), once per change and head commit. A pull
  request attached to a todo or open Task with no cloud work wakes the Task's assignee Agent the
  same way, with no Run behind the notice (`github/pull-request-task-wakes.ts`).

## Reminders on a Task

A Task holds one-time reminders only (`--target task:KEY-n`); a recurring one is refused with
`TASK_RECURRING_REMINDER` and belongs on a Channel. A reminder on a Task wakes the Agent there and
shows on the Task page. Closing a Task cancels its pending reminders
(`tasks/task-close-reminders.ts`), and reopening does not restore them. See
[reminders.md](reminders.md).

## References

- A message or reminder description references a Task by a `task://<taskId>` link or a **bare
  key** (`SEC-12`): case-sensitive, word-bounded, and ignored inside inline code, fences, Markdown
  links, and plain URLs (`tasks/task-reference-scan.ts`). It must match a Task on the Server.
  Content is never rewritten.
- Messages resolve at write time inside the insert transaction (`chats/message-links.ts`) and
  record `task_message_links`, the Task's **Mentioned in**. Every `ChatMessage` carries
  `taskLinks: [{ taskId, key, text }]`; the Agent message view carries `task_links`. A new link
  publishes `task.updated` at the Task's current version.
- A Task description resolves when read (`tasks/task-description-references.ts`): `task.get`
  returns `descriptionContent` with `@handle` and `#channel` tokens rewritten into references, and
  `descriptionTaskLinks`.
- Mentioned in and a Task's reminders list only what the reader can read (`actorVisibleChats`),
  so a DM never leaks through a Task. Each mention names its place (`taskMessagePlaceSchema`).

## Assignment

`applyTaskAssignmentChange` (`tasks/task-assignment.ts`) runs inside every transaction that
changes an assignee: a start with an assignee, `task.assign`, and a departure (deleting an Agent or
removing a member unassigns every Task they hold, in the same transaction).

- The assignee follows the Task. An assignment posts nothing in it.
- **Person:** assigning someone other than yourself publishes the Server-internal `task.assigned`,
  and iPhone push tells the assignee after the read grace. `taskAssignmentNotifiedUserId` in
  `@haus/api` is the one rule.
- **Agent:** assigning another Agent queues a `task_assignment` inbox item and a wake;
  reassigning away retires one still queued ([inbox.md](inbox.md#item-kinds-and-lifecycle)). An
  Agent assigning itself queues nothing. An assignment from another Agent spends the automation
  chain; a person's resets it.

## Agent routes

`agent-api/task-routes.ts`, `task-place-routes.ts`, and `pull-request-attach-route.ts` serve
`haus task` (`list`, `show`, `start`, `state`, `update`, `assign`, `attach-pr`). They address
Tasks by key, assignees by `me` or handle, and labels by name. `expectedVersion` is optional:
without it the last write wins after bounded retries (`withImplicitVersion`); a named version
fails closed.
