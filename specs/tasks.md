---
summary: The board Tasks contract — boards with keys, columns mapped to fixed categories, Task numbering and versions, references from messages and Reminders, what an assignment does to a person and an Agent, the Agent routes, and where each rule lives in the Server.
read_when:
  - changing boards, columns, column categories, or `board.setColumns`
  - changing Task fields, numbering, keys, moves, `completedAt`, or assignment
  - changing Task references (`task://` links, bare keys), Mentioned in, or Task Reminders
  - changing the person Task Inbox, Task assignment delivery to an Agent, or the assignment push
  - changing the `/api/agent/tasks` or `/api/agent/boards` routes
---

# Tasks

[ADR 0051](../docs/adr/0051-tasks-are-boards-and-claims-are-the-lock.md) is the product contract:
a **Task** is a standalone Server record on a **board**; a **claim** is the Agent-only lock on a
message ([claims.md](claims.md)). This file pins the rules the Server enforces. Wire shapes live in
`packages/haus-api/src/{board,task,task-input,task-key,task-inbox}.ts`; the tRPC surface is
[docs/api/tasks.md](../docs/api/tasks.md).

## Boards and columns

- A board has a `key` (`^[A-Z][A-Z0-9]{1,4}$`, unique per Server even while archived, editable), a
  `name` (1–60), an optional `archivedAt`, and a `version`. Archived boards leave default lists and
  refuse new Tasks.
- Every Server has the **General** board, key `GEN`, created in the transaction that creates the
  Server (`insertGeneralBoard`, also the dev seed); migration 0116 backfilled existing Servers. It
  keeps its key and is never archived; it can be renamed.
- Each column has a `name` (1–40, unique per board case-insensitively), a `position`, and a fixed
  `category`: `backlog | todo | active | done | canceled`. A board keeps at least one `todo`,
  `active`, and `done` column. New boards start with Backlog, Todo, In progress, Done, Canceled.
- `board.setColumns` replaces the whole ordered list in one transaction (`boards/column-plan.ts`
  checks every invariant first). Kept ids are updated in place, drafts without an id are created,
  and a removed column that holds Tasks needs `moveTasks[removedId] = keptId`. Moved Tasks, and Tasks
  whose kept column changed between open and closed categories, gain or lose `completedAt` and bump
  their version, each with a `task.updated`.

## Tasks

- Fields: board, per-board `number`, `title` (1–200), markdown `description` (≤ 20,000), column
  and derived `category`, at most one assignee (an active member or a non-retired Agent), priority,
  labels from the task label catalog, display-only `dueOn`, exactly one creator, timestamps, and
  `version`.
- The key is `<board.key>-<number>`, derived when read: re-keying a board re-keys its Tasks.
- Numbers come from `boards.next_number` under the board row lock, after the Server row lock.
- `completedAt` is set exactly while the Task is in a `done` or `canceled` column: entering one
  sets it, leaving clears it, closed to closed keeps it.
- Every mutation takes `expectedVersion` and fails closed with a conflict. Moving to the current
  column or assigning the current assignee changes nothing. There is no deletion and no
  cross-board move.
- Every human member and Agent reads and writes every board and Task (`requireTaskActor`).

## References

- A message or Reminder description references a Task by an explicit `task://<taskId>` link or a
  **bare key** (`SEC-12`): case-sensitive, word-bounded, and ignored inside inline code, fences,
  Markdown links, and plain URLs (`tasks/task-reference-scan.ts`). It must match a Task on the
  Server; anything else stays plain text. Content is never rewritten.
- Messages resolve at write time inside the insert transaction (`chats/message-links.ts`) and
  record `task_message_links`, the Task's **Mentioned in**. Every mapped `ChatMessage` carries
  `taskLinks: [{ taskId, key, text }]` in content order, `text` being the exact matched substring;
  the Agent message view carries the same as `task_links`. A new link publishes `task.updated` at
  the Task's current version, so an open Task refetches Mentioned in.
- Convert to Task (`task.create` with `sourceMessageId`) works on any message the actor can read,
  defaults the description to its content, and records it with the key as link text.
- Mentioned in lists only messages in Chats the reader can read (`actorVisibleChats`), and the
  Task's Reminders list only those anchored in such a Chat, so a DM never leaks through a Task.
- A mention and an Inbox context message name their **place** (`taskMessagePlaceSchema`): the
  Channel or DM id, kind, and name (null for a DM), and the Thread anchor for a Thread reply. It is
  read in the same batched query as the message (`tasks/task-message-place.ts`), so a client labels
  `#security · Thread`, opens, and replies with no read of its own.
- Reminder create and description update re-record `task_reminder_links`, the Task's
  **Reminders**; a snooze keeps them. Every Reminder change that moves that list (schedule, edit,
  snooze, cancel, fire, a deleted anchor Channel or owner Agent, the retention sweep) publishes
  `task.updated` at the Task's current version for the Tasks it linked or unlinked.

## Assignment

`applyTaskAssignmentChange` (`tasks/task-assignment.ts`) runs inside every transaction that
changes an assignee (`task.create` with an assignee, `task.assign`, and a departure: deleting an
Agent or removing a member unassigns every Task they hold, closed ones too, in that same
transaction through `tasks/clear-task-assignments.ts`). It is the one seam for assignment effects:

- **Person:** assigning someone other than yourself upserts their `task_inbox_items` row (fresh,
  uncleared, stamped with the new version and assigner); reassigning away deletes it. The assignee
  moving the Task clears it, and so do `taskInbox.clear` and opening the Task; `taskInbox.restore`
  is the App's Undo. Each change publishes `taskInbox.changed` to that person only.
- **Push:** the same assignment publishes the Server-internal `task.assigned`, and iPhone push
  sends the assignee `<assigner> assigned you SEC-12` after the read grace, unless the item was
  cleared or withdrawn by then. `taskAssignmentNotifiedUserId` in `@haus/api` is the one rule for
  both: a person, assigned by someone else.
- **Bursts:** the first assignment opens a per-person window of one read grace; it never extends.
  What is still news when it closes is one push: a single assignment stays as above, and several
  are one `task_assignment_burst` push (`Zero assigned you 6 tasks`, or `6 tasks assigned to you`
  from several assigners) that opens the Inbox. The desktop notifier collapses the same way over
  the assignments one `taskInbox.list` read brings. The Inbox stays one item per Task.
- **Agent:** assigning another Agent queues a chatless `task_assignment` item and a wake;
  reassigning away retires one still queued ([inbox.md](inbox.md#item-kinds-and-lifecycle)). An
  Agent assigning itself queues nothing. An assignment from another Agent spends the automation
  chain; a person's resets it.

The Task Inbox list (`tasks/task-inbox.ts`) returns each uncleared item with its Task, board name,
assigner, and context message: the newest `task_message_links` message the reader can read,
through `actorVisibleChats`, projected like a transcript message, beside its `contextPlace`.
`chat.unreadChatCount` adds
uncleared items, so the badge counts them and the App refreshes it on `taskInbox.onChanged`.

## Agent routes

`agent-api/task-routes.ts` and `board-routes.ts` serve `haus task` and `haus board` (the
`/api/agent/tasks` and `/api/agent/boards` paths in `openapi.yaml`, inputs in
`packages/haus-api/src/agent-task.ts`). They address Tasks by key, boards by key, assignees by
`me` or handle, labels by name, and columns by name or id. `expectedVersion` is optional: without
it the last write wins, so a write that lost the race to the version it read reads again and
retries, a bounded number of times (`withImplicitVersion`). A named version fails closed.
`POST /api/agent/tasks/move` answers with `queue: { todo, active }`, the caller's open Tasks.

The Server has no blocked state. A Task an Agent is waiting on a person for sits in `todo` with no
field to mark it, and the receipt's `queue` still counts it. Agent behavior reads past it: the
Agent's @mention, listed under Mentioned in, is the only record (ADR 0051 decisions 6 and 7).

A heartbeat run reads Tasks and boards and writes neither (`403 REGULAR_TURN_REQUIRED`): its
throwaway session changes nothing other people see, and it reports what it found instead.
