---
summary: The Task and Task key tRPC procedures (`task.*`, `taskKey.*`), their inputs, results, refusal codes, and realtime events. Boards, columns, Convert to Task, and the Task Inbox are gone (ADR 0053).
read_when:
  - calling or changing `task.create`, `task.list`, `task.listOpen`, `task.get`, `task.update`, `task.setState`, `task.assign`, or `task.setFollow`
  - calling or changing `taskKey.list`
  - subscribing to `task.onCreated`, `task.onUpdated`, or `task.onFollowUpdated`
---

# Tasks API

Tasks ([ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md),
[ADR 0055](../adr/0055-projects-own-agents-and-tasks.md)) on the App's tRPC surface. Every
procedure runs for an active member of `serverId`; every member reads every Task. Agents start
Tasks from a Message (`POST /api/agent/tasks/start`, [agents.md](agents.md)); people file them
with `task.create`. Inputs and results are the schemas in `packages/haus-api/src/task.ts`,
`task-input.ts`, `task-state.ts`, and `task-key-ledger.ts`. Server code lives in
`apps/server/src/haus-api/{task,task-key}/`, over the domain in `apps/server/src/tasks/`.

`tasks.state` (`todo`, `open`, `done`, `canceled`) is a Task's only state; `completedAt` is set
exactly while it is `done` or `canceled`. A Task is numbered by its key-ledger entry
(`keyId`), which alone counts. `projectId` is the Project's channel Chat id, set when the Task
starts and never changed. `origin` is the Message it started from, in any Channel or a DM, or
null for a filed Task or once that Message is gone; a DM origin reads as null for anyone who
cannot read that DM. A Task with no `chatId` is history from before Tasks were places
(migration 0127): it reads like any Task but refuses every write.

## Tasks

| Procedure | Input | Result |
| --- | --- | --- |
| `task.create` | `taskCreateInputSchema`: `serverId`, `projectId`, `title`, `description?`, `assigneeAgentId` | `{ task }`: `open`, no origin, assigned to that Agent, which gets a `task_assignment` item as a reassignment does; the filer and the Agent follow it, and nothing posts in the Project channel |
| `task.list` (query) | `taskListInputSchema`: `serverId`, `assignee?` (`{ userId }`, `{ agentId }`, `'none'`), `keyId?`, `states?` | `Task[]`, oldest first |
| `task.listOpen` (query) | `taskListOpenInputSchema`: `serverId` | Every `open` Task with a Chat whose Project channel the reader can see |
| `task.get` (query) | `taskGetInputSchema`: `{ serverId, taskId }` or `{ serverId, key }` | `TaskDetail`: the Task plus `mentions`, `reminders`, attached work, pull requests, and the reader's `followed` and `unreadCount` |
| `task.update` | `taskUpdateInputSchema`: `serverId`, `taskId`, `expectedVersion`, `patch { title?, description?, priority?, labelIds?, dueOn? }` | `{ task }` |
| `task.setState` | `taskSetStateInputSchema`: `serverId`, `taskId`, `expectedVersion`, `state` | `{ task }`; closing cancels its pending one-time reminders |
| `task.assign` | `taskAssignInputSchema`: `serverId`, `taskId`, `expectedVersion`, `assignee` (null unassigns) | `{ task }`; the assignee follows the Task, and the assignment posts nothing |
| `task.setFollow` | `taskSetFollowInputSchema`: `serverId`, `taskId`, `followed` | `{ serverId, taskId, followed }` |

## Task keys

| Procedure | Input | Result |
| --- | --- | --- |
| `taskKey.list` (query) | `taskKeyListInputSchema`: `serverId` | Every ledger entry, by key, with `nextNumber` |

A ledger entry is made by creating a Project or changing its key ([Projects API](projects.md)).

## Refusals

| Code | When |
| --- | --- |
| `FORBIDDEN` / `NOT_FOUND` | Not a member of the Server, or the Server is gone |
| `NOT_FOUND` | No Task with that id or key on the Server |
| `CONFLICT` | A stale `expectedVersion`, a key another ledger entry already uses, or filing in an archived Project |
| `BAD_REQUEST` | A broken invariant: an inactive assignee, a foreign label, an unknown Project, or a write to a chatless history Task |

## Events

Mutations publish after commit: `task.created` and `task.updated` for Task writes (a message's
new reference adds one `task.updated` at the same version), and `task.follow.updated` to the
person whose follow changed, assignment included. Subscribe with `task.onCreated`,
`task.onUpdated` (every member), and `task.onFollowUpdated` (that person). Assigning a person
also publishes the Server-internal `task.assigned` that iPhone push reads. See
[specs/realtime-events.md](../../specs/realtime-events.md).
