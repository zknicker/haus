---
summary: The Tasks contract — a Task is a `task` Chat in exactly one Project, started by an Agent from a Message or filed by a person for an Agent, with a state, its Project's key, followers, attached cloud agents and pull requests, one-time reminders, and the Server rules for each.
read_when:
  - changing Task fields, states, keys, the key ledger, or a Task's Project
  - changing how an Agent starts a Task, how a person files one, the origin Message, or the `task:KEY-n` target
  - changing Task followers, Task unread, the sidebar's open Tasks, the Tasks page, or Channel Task previews
  - changing attached cloud agents, attached pull requests, or what wakes an Agent on a Task
  - changing Task references (`task://` links, bare keys), Mentioned in, or reminders on a Task
  - changing the `/api/agent/tasks` routes or Task assignment delivery
---

# Tasks

[ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md) is the product contract:
Haus has two kinds of place, Channels (and DMs) for conversation and Tasks for work. A **Task** is
a Channel for one piece of work. [ADR 0055](../docs/adr/0055-projects-own-agents-and-tasks.md)
amends it: every Task belongs to one [Project](projects.md) explicitly, takes that Project's key,
and may be filed by a person. A **claim** is still the Agent-only lock on a Message
([claims.md](claims.md)); a Task does not mark ownership. Wire shapes live in
`packages/haus-api/src/{task,task-input,task-state,task-key,task-key-ledger,task-preview,agent-task-refusals}.ts`.
The tRPC surface is [docs/api/tasks.md](../docs/api/tasks.md); the Agent routes are in
[docs/api/agents.md](../docs/api/agents.md#task-routes).

## A Task is a place

- A Task is a `tasks` row plus its own Chat of kind `task`. The Chat hangs under its Project's
  channel (`parent_chat_id`, `parent_chat_kind = 'channel'`), whatever the origin. It has
  messages, mentions, unread, notifications, and a composer like a Channel. `tasks.chat_id` links
  the two, one Chat per Task.
- Fields: `projectId` (the Project's channel Chat id, not null), key and number, `title` (1–200),
  markdown `description` (≤ 20,000), `state`, at most one assignee (an active member or a
  non-retired Agent), priority, labels from the task label catalog, display-only `dueOn`, exactly
  one creator (an Agent or a person), `origin` (`{ chatId, messageId }` or null), timestamps, and
  `version`.
- A Task's Project is set when it starts and never changes. The origin is only where the request
  came from: a Channel Message, a DM Message, or nothing for a Task a person filed. An origin in a
  Channel need not be in the Task's Project. When the origin's Chat is deleted, `origin` becomes
  null and the Task stays.
- `state` is `todo`, `open`, `done`, or `canceled` (`task-state.ts`). `completedAt` is set exactly
  while the Task is `done` or `canceled`. A merged pull request never closes a Task; an Agent or a
  human sets the state. Posting in a closed Task reopens it.
- Every mutation takes `expectedVersion` and fails closed with a conflict. There is no deletion.
- A Task with no Chat is history from before Tasks were places (migration 0127). It reads like any
  Task and refuses every write. A filed Task also has no origin, but it has a Chat.

## Starting a Task

Agents start Tasks, and people file them. Reminders and Triggers never start a Task themselves:
they wake an Agent, which decides. There is no Convert to Task.

### An Agent starts a Task

- An Agent starts a Task from the Message that asked for it, in a Channel or a DM
  (`tasks/task-start.ts`). One Message can carry several Tasks; Tasks have no parents or children.
  When no asking Message exists (a reminder or Trigger fire, or the Agent's own finding), the
  Agent posts an origin Message in the Task's Project channel, mentions whoever asked, and starts
  the Task from it. A request made in a DM gets a reply there carrying the Task chip.
  `TASK_ORIGIN_DM` is deleted.
- `haus task start --project <key>` names the Project. Without it the Project is the one the
  origin Message is in, or the Agent's Project when the origin is a DM or `#all`, which is
  no Project.
- An Agent starts Tasks only in its Project; any other Project is refused with
  `TASK_PROJECT_NOT_HOME`, which says to @mention that Project's Agent in its channel.
  Generalists, who were exempt, are retired ([projects.md](projects.md#generalists)).
- An Agent starts a Task when its reply will not finish the work: more steps, more time, or a
  cloud agent. A reply that is the whole of the work stays a reply. The Agent prompt's Tasks
  section teaches this ([ADR 0053](../docs/adr/0053-channels-and-tasks-are-the-only-places.md)
  decision 5). Placement and handoff text changes go through the guarded prompt contract.

### A person files a Task

- "New task" asks for a Project, a title, an optional description, and an Agent, and files the
  Task with no origin (`task.create`). The person is its creator.
- The Agent defaults to the Project's Agent when it has exactly one home Agent. With several or
  none, the person picks. Any non-retired Agent on the Server may be picked.
- A filed Task starts `open` and assigned to that Agent. The assignment queues a
  `task_assignment` item exactly as a reassignment does ([Assignment](#assignment)), so the Agent
  picks it up like any assignment. Nothing posts in the Project channel.
- Every Task starts with an Agent working it. After that, people may reassign it to a person or
  unassign it, like any Task, and deleting the assigned Agent unassigns it. The Project's home
  Agents still hear it through the home rule ([inbox.md](inbox.md#hearing)).

### The Task target

`task:KEY-n` is a Task's target. `haus message send --target task:SEC-12` posts in it, and
`haus message read --target task:SEC-12` reads it. Any Agent on the Server reaches any Task, as
Projects are open (`agent-api/resolve-task-target.ts`). A Task whose origin is a DM shows its
origin only to readers of that DM: other people read `origin` as null, and an Agent mentioned in
the Task gets no join context quoting it.

## Keys

- The Server keeps a ledger of keys (`task_keys`): `key` matches `^[A-Z][A-Z0-9]{1,4}$`, is unique
  per Server, and carries its own `next_number`. Numbers are allocated under the entry's row lock,
  after the Server row lock (`tasks/task-key-ledger.ts`). A Task's key is `<key>-<number>`.
- Each Project has exactly one entry (`projects.task_key_id`, unique), and no two Projects share
  one ([projects.md](projects.md#key)). A DM has none. A Task takes its Project's key when it
  starts and keeps it.
- Every Server has the General entry, `GEN`, made with the Server, which the Haus project holds
  unless `#all` was configured with another.
- A Task never changes its key. When the channels-to-Projects migration gives a Project a new key
  because its old one was shared, the Project's existing Tasks keep the shared key and their
  numbers ([migration](projects.md#migration-from-channels)). So a Project's Tasks can carry an
  older key, but each new Task takes the Project's one key.
- People make an entry by creating a Project or setting its key. `taskKey.create` is deleted.
  Migration 0124 turned every board into a ledger entry with the same id, key, and counter, so
  existing keys and numbers carried over.

## Followers and unread

- A Task is unread only for its **followers** (`tasks/task-follows.ts`): the origin Message's
  author, anyone mentioned in it, the person who filed it, the assignee, and anyone who posts in
  the Task. Anyone can follow
  or unfollow by hand (`task.setFollow`); a hand unfollow sticks until they follow again.
  Follows ride `thread_follows` and `agent_thread_follows` with `thread_chat_kind = 'task'`.
- An unread Task appears in a follower's Inbox the way an unread Channel does. For everyone else it
  is a quiet row with its state and never reaches their Inbox. There is no attention tier
  ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).
- Following is human unread. What reaches an Agent is [inbox.md](inbox.md#hearing): an Agent hears
  every Task of its Project and every Task it follows anywhere.

## Where Tasks show

- **Sidebar:** every `open` Task on the Server that the reader can see (`task.listOpen`). Todo
  Tasks are not listed, and a Task leaves as soon as it is done or canceled.
- **Tasks page:** one list of todo, open, done, and canceled Tasks, grouped by state (open first)
  under a label and count, with no boards and no columns, filterable by Project. People change state, reassign, and file Tasks there.
- **Channel and DM previews:** under its origin Message, each Task shows its key, title, state,
  message count, the viewer's unread, and its newest messages (`TaskPreview`, at most three),
  riding `chat.messages` pages as `tasks`. A filed Task has no origin and no preview.
- **Task page:** the conversation on the left, with a "started from" element pointing at the
  origin Message for a reader who can read it, or "Filed by" its creator for a filed Task, and the
  attached-work panel on the right: one card per cloud agent with its
  newest Run's summary, each attached pull request no card already names, and pending reminders.
- **iPhone** opens a Task as a chat with a small attached-work header and renders Channel
  previews. It has no Tasks page.

## Attached work and wakes

- Workers attach to a Task (`cloud_agent_work.task_id` until W2 renames it). `haus worker start`
  requires `--task`, and the Server refuses a start without one. Starting a Worker posts no
  Message. Each written report posts one Message in the Task. See [Workers](workers.md).
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
`TASK_RECURRING_REMINDER` and belongs on a Channel. A reminder anchors on the Task's newest
message and never outside the Task's own Chat: the origin can be a DM or another Project, and
every reader of the Task would see the anchor through the fire. A Task with no messages yet,
started or filed, refuses a reminder until someone posts there. The fire context shows an anchor's
excerpt only to a reader who can read the anchor's own Chat. A reminder on a Task wakes the Agent
there and shows on the Task page. Closing a Task cancels its
pending reminders (`tasks/task-close-reminders.ts`), and reopening does not restore them. See
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
changes an assignee: a start with an assignee, a person filing a Task, `task.assign`, and a
departure (deleting an Agent or removing a member unassigns every Task they hold, in the same
transaction).

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
Tasks by key, Projects by key (`start --project`, `list --project`), assignees by `me` or handle,
and labels by name. `expectedVersion` is optional:
without it the last write wins after bounded retries (`withImplicitVersion`); a named version
fails closed.
