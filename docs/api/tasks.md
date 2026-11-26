---
summary: The Task and Task key tRPC procedures (`task.*`, `taskKey.*`), their inputs, results, refusal codes, and realtime events. A Task has a short id and an archive time and no backlog fields (ADR 0062 step 2).
read_when:
  - calling or changing `task.create`, `task.list`, `task.listActive`, `task.get`, `task.update`, `task.archive`, `task.unarchive`, or `task.setFollow`
  - calling or changing `taskKey.list`
  - subscribing to `task.onCreated`, `task.onUpdated`, or `task.onFollowUpdated`
---

# Tasks API

Tasks ([ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md),
[specs/tasks.md](../../specs/tasks.md)) on the App's tRPC surface. Every procedure runs for an
active member of `serverId`; every member reads every Task. Agents start Tasks from a Message
(`POST /api/agent/tasks/start`, [agents.md](agents.md)); people file them with `task.create`.
Inputs and results are the schemas in `packages/haus-api/src/task.ts`, `task-input.ts`,
`task-short-id.ts`, and `task-key-ledger.ts`. Server code lives in
`apps/server/src/haus-api/{task,task-key}/`, over the domain in `apps/server/src/tasks/`.

A Task has no state, priority, due date, labels, assignee, key or number; those are an Issue's.
It is active or archived, recorded only in `archivedAt`. `shortId` is 8 lowercase Crockford
base32 characters, unique per Server, and names the Task in URLs (`/tasks/<shortId>`), Agent
targets (`task:<shortId>`), and the CLI. `projectId` is the Project's channel Chat id, set when
the Task starts and never changed. `origin` is the Message it started from, in any Channel or a
DM, or null for a filed Task or once that Message is gone; a DM origin reads as null for anyone
who cannot read that DM. A Task with no `chatId` is history from before Tasks were places
(migration 0127): it reads like any Task but refuses every write.

## Tasks

| Procedure | Input | Result |
| --- | --- | --- |
| `task.create` | `taskCreateInputSchema`: `serverId`, `projectId`, `title`, `description?` | `{ task }`: active, no origin; the filer follows it, it wakes nobody, and nothing posts in the Project channel |
| `task.list` (query) | `taskListInputSchema`: `serverId`, `archived?`, `projectId?` | Active `Task[]`, or archived ones with `archived: true`, oldest first |
| `task.listActive` (query) | `taskListActiveInputSchema`: `serverId` | Every active Task with a Chat whose Project channel the reader can see |
| `task.get` (query) | `taskGetInputSchema`: `{ serverId, taskId }` or `{ serverId, shortId }` | `TaskDetail`: the Task plus `mentions`, `reminders`, attached work, pull requests, and the reader's `followed` and `unreadCount` |
| `task.update` | `taskUpdateInputSchema`: `serverId`, `taskId`, `expectedVersion`, `patch { title?, description? }` | `{ task }` |
| `task.archive` | `taskArchiveInputSchema`: `serverId`, `taskId`, `expectedVersion` | `{ task }`; sets `archivedAt`, cancels pending one-time reminders, and closes the Task's Workers. Archiving an archived Task changes nothing |
| `task.unarchive` | `taskArchiveInputSchema` | `{ task }`; clears `archivedAt` and starts no turn. Canceled reminders stay canceled |
| `task.setFollow` | `taskSetFollowInputSchema`: `serverId`, `taskId`, `followed` | `{ serverId, taskId, followed }` |

A post in an archived Task leaves it archived; unarchive on message is step 5.

## Task keys

| Procedure | Input | Result |
| --- | --- | --- |
| `taskKey.list` (query) | `taskKeyListInputSchema`: `serverId` | Every ledger entry, by key, with `nextNumber` |

A ledger entry is made by creating a Project or changing its key ([Projects API](projects.md)).
Tasks take no numbers; the ledger numbers Issues ([specs/issues.md](../../specs/issues.md#codes)).

## Refusals

| Code | When |
| --- | --- |
| `FORBIDDEN` / `NOT_FOUND` | Not a member of the Server, or the Server is gone |
| `NOT_FOUND` | No Task with that id or short id on the Server |
| `CONFLICT` | A stale `expectedVersion`, or filing in an archived Project |
| `BAD_REQUEST` | A broken invariant: an unknown Project, or a write to a chatless history Task |

## Events

Mutations publish after commit: `task.created` and `task.updated` for Task writes (a message's
new reference adds one `task.updated` at the same version), and `task.follow.updated` to the
person whose follow changed. Subscribe with `task.onCreated`, `task.onUpdated` (every member),
and `task.onFollowUpdated` (that person). See
[specs/realtime-events.md](../../specs/realtime-events.md).
