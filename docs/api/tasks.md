---
summary: The board, Task, and Task Inbox tRPC procedures (`board.*`, `task.*`, `taskInbox.*`), their inputs, results, refusal codes, and realtime events.
read_when:
  - calling or changing `board.list`, `board.create`, `board.update`, or `board.setColumns`
  - calling or changing `task.list`, `task.get`, `task.create`, `task.update`, `task.move`, or `task.assign`
  - calling or changing `taskInbox.list`, `taskInbox.clear`, or `taskInbox.restore`
  - subscribing to `board.onUpdated`, `task.onCreated`, `task.onUpdated`, or `taskInbox.onChanged`
---

# Tasks API

Boards and Tasks ([specs/tasks.md](../../specs/tasks.md), ADR 0051) on the App's tRPC surface.
Every procedure runs for an active member of `serverId`; every member reads and writes every board
and Task. Inputs and results are the schemas in `packages/haus-api/src/board.ts`, `task.ts`,
`task-input.ts`, and `task-inbox.ts`. Server code lives in
`apps/server/src/haus-api/{board,task,task-inbox}/`, over the domain in
`apps/server/src/{boards,tasks}/`.

## Boards

| Procedure | Input | Result |
| --- | --- | --- |
| `board.list` (query) | `boardListInputSchema`: `serverId`, `includeArchived` (default false) | `Board[]` in creation order, each with ordered `columns` and `openTaskCount` |
| `board.create` | `boardCreateInputSchema`: `serverId`, `key`, `name` | `{ board }` with the default columns |
| `board.update` | `boardUpdateInputSchema`: `serverId`, `boardId`, `expectedVersion`, `patch { name?, key?, archived? }` | `{ board }` |
| `board.setColumns` | `boardSetColumnsInputSchema`: `serverId`, `boardId`, `expectedVersion`, `columns [{ id?, name, category }]`, `moveTasks?` | `{ board }` |

## Tasks

| Procedure | Input | Result |
| --- | --- | --- |
| `task.list` (query) | `taskListInputSchema`: `serverId`, `boardId?`, `assignee?` (`{ userId }`, `{ agentId }`, `'none'`), `categories?` | `Task[]`, oldest first; without `boardId`, archived boards are left out |
| `task.get` (query) | `taskGetInputSchema`: `{ serverId, taskId }` or `{ serverId, key }` | `TaskDetail`: the Task plus `mentions` (newest first, readable Chats only, each with its `place`: the Channel or DM id, kind, and name, and the Thread anchor for a Thread reply) and `reminders` |
| `task.create` | `taskCreateInputSchema`: `serverId`, `boardId`, `title`, `description?`, `columnId?` (default: first `todo`), `assignee?`, `priority?`, `labelIds?`, `dueOn?`, `sourceMessageId?` | `{ task }` |
| `task.update` | `taskUpdateInputSchema`: `serverId`, `taskId`, `expectedVersion`, `patch { title?, description?, priority?, labelIds?, dueOn? }` | `{ task }` |
| `task.move` | `taskMoveInputSchema`: `serverId`, `taskId`, `expectedVersion`, `columnId` (same board) | `{ task }` |
| `task.assign` | `taskAssignInputSchema`: `serverId`, `taskId`, `expectedVersion`, `assignee` (null unassigns) | `{ task }` |

## Task Inbox

The reader's own Task items, the `Inbox` feed's assignment rows.

| Procedure | Input | Result |
| --- | --- | --- |
| `taskInbox.list` (query) | `taskInboxListInputSchema`: `serverId` | `{ items }`, newest assignment first: `task`, `boardName`, `assignedBy { id, kind, label }`, `assignedAt`, `contextMessage` (the newest referencing message the reader can read, or null), `contextPlace` (where it lives, null exactly when it is) |
| `taskInbox.clear` | `taskInboxClearInputSchema`: `serverId`, `taskId` | `{ changed }`, false when it was already clear or is gone |
| `taskInbox.restore` | `taskInboxRestoreInputSchema`: `serverId`, `taskId` | `{ changed }`, the App's Undo |

## Refusals

| Code | When |
| --- | --- |
| `FORBIDDEN` / `NOT_FOUND` | Not a member of the Server, or the Server is gone |
| `NOT_FOUND` | No board or Task with that id or key on the Server |
| `CONFLICT` | A stale `expectedVersion`, or a board key another board already uses (archived included) |
| `BAD_REQUEST` | A broken invariant: column list rules, an archived board, a column from another board, an inactive assignee, a foreign label, an unreadable source message, or changing the General board's key or archiving it |

## Events

Mutations publish after commit: `board.updated` for every board write, `task.created` and
`task.updated` for Task writes (`board.setColumns` adds one `task.updated` per Task it moved or
re-categorized, and a message's new reference adds one at the same version), and
`taskInbox.changed` to the affected person when their Task Inbox item is created, withdrawn,
cleared, or restored. Subscribe with `board.onUpdated`, `task.onCreated`, `task.onUpdated` (every
member), and `taskInbox.onChanged` (that person). See
[specs/realtime-events.md](../../specs/realtime-events.md).
