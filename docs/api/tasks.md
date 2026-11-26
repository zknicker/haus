---
summary: The Task and Task key tRPC procedures (`task.*`, `taskKey.*`), their inputs, results, refusal codes, and realtime events. A Task has a short id, an archive time, its hidden agent, a Machine, a model and a derived activity, and no backlog fields (ADR 0062 steps 2 and 5).
read_when:
  - calling or changing `task.start`, `task.create`, `task.list`, `task.listActive`, `task.get`, `task.update`, `task.archive`, `task.unarchive`, or `task.setFollow`
  - reading a Task's `agentId`, `captainId`, `computerId`, `model`, `titleCustom`, `activity` or `needsYou`
  - calling or changing `taskKey.list`
  - subscribing to `task.onCreated`, `task.onUpdated`, or `task.onFollowUpdated`
---

# Tasks API

Tasks ([ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md),
[specs/tasks.md](../../specs/tasks.md)) on the App's tRPC surface. Every procedure runs for an
active member of `serverId`; every member reads every Task. A person starts one with
`task.start`; a Captain starts crew with `POST /api/agent/tasks/start` ([agents.md](agents.md)).
`task.create` still files a Task with no agent until step 6 replaces it with the Home composer.
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

A started Task carries its hidden `task` agent (`agentId`), its Machine (`computerId`) and model
(`model`), fixed at start, and `captainId` for crew. `title` is the first line of the first
message, cut at a word to 80 characters, until someone renames it (`titleCustom`). `activity` is
derived from the agent's delivery: `working` while a run is active or work waits for an online
Machine, `waiting` while work waits for an offline Machine, `failed` after a failed turn, else
`idle`. `needsYou` stays false until crew reports land (step 5b). A Task filed or started before
step 5 has null `agentId`, `computerId` and `model`.

## Tasks

| Procedure | Input | Result |
| --- | --- | --- |
| `task.start` | `taskStartInputSchema`: `serverId`, `projectId`, `prompt`, `model`, `requestId`, `computerId?`, `title?`, `origin?` | `{ task }`: the Task, its Chat and its agent; the prompt posts as the person's first message and is queued as the agent's first turn. The Machine defaults to the Project's default Machine and must be one the person attached or one that allows All Captains. The same `requestId` answers the same Task |
| `task.create` | `taskCreateInputSchema`: `serverId`, `projectId`, `title`, `description?` | `{ task }`: active, no origin; the filer follows it, it wakes nobody, and nothing posts in the Project channel |
| `task.list` (query) | `taskListInputSchema`: `serverId`, `archived?`, `projectId?` | Active `Task[]`, or archived ones with `archived: true`, oldest first |
| `task.listActive` (query) | `taskListActiveInputSchema`: `serverId` | Every active Task with a Chat whose Project channel the reader can see |
| `task.get` (query) | `taskGetInputSchema`: `{ serverId, taskId }` or `{ serverId, shortId }` | `TaskDetail`: the Task plus `mentions`, `reminders`, attached work, pull requests, and the reader's `followed` and `unreadCount` |
| `task.update` | `taskUpdateInputSchema`: `serverId`, `taskId`, `expectedVersion`, `patch { title?, description? }` | `{ task }` |
| `task.archive` | `taskArchiveInputSchema`: `serverId`, `taskId`, `expectedVersion` | `{ task }`; sets `archivedAt`, cancels pending one-time reminders, closes the Task's Workers, and resets its agent's session under a new generation: the runner gets an `archive` reset and the Machine `task-archive`. Archiving an archived Task changes nothing |
| `task.unarchive` | `taskArchiveInputSchema` | `{ task }`; clears `archivedAt`, bumps the session generation again, and starts no turn. Canceled reminders stay canceled. `CONFLICT` while the Project is archived |
| `task.setFollow` | `taskSetFollowInputSchema`: `serverId`, `taskId`, `followed` | `{ serverId, taskId, followed }` |

A post in an archived Task leaves it archived; unarchive on message is step 5b.

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
| `CONFLICT` | A stale `expectedVersion`, filing in an archived Project, or restoring a Task whose Project is archived |
| `BAD_REQUEST` | A broken invariant: an unknown Project, a write to a chatless history Task, no Machine, a Machine the starter may not use, or a model the runner does not offer |

## Events

Mutations publish after commit: `task.created` and `task.updated` for Task writes (a message's
new reference adds one `task.updated` at the same version), and `task.follow.updated` to the
person whose follow changed. Subscribe with `task.onCreated`, `task.onUpdated` (every member),
and `task.onFollowUpdated` (that person). See
[specs/realtime-events.md](../../specs/realtime-events.md).
