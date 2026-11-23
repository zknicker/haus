---
summary: The Projects contract. Humans create Projects and each Project is its channel; `#all` stays the everyone channel and is not a Project. A Project carries one Task key, its home Agents, its `AGENTS.md`, and the default place for its Workers; it has no repos, which belong to the Server (ADR 0060). Every Agent has exactly one Project. Covers the data shape, settings and who edits them, `#all`, Agent placement, and the one-time migration from channels.
read_when:
  - creating, configuring, archiving, or listing Projects or their channels
  - changing a Project's key, its Agents, its `AGENTS.md`, or its default Worker place
  - deciding whether a Project should list repos (it does not: ADR 0060)
  - changing an Agent's Project
  - changing what an Agent may read, post in, or start Tasks in across Projects
  - writing or running the channels-to-Projects migration
---

# Projects

[ADR 0055](../docs/adr/0055-projects-own-agents-and-tasks.md) is the product contract. A
**Project** is the home of an effort: one channel, the Tasks filed in it, the Agents that own it,
and the settings its work runs with. Tasks are [tasks.md](tasks.md). What reaches an Agent is
[inbox.md](inbox.md#hearing). Drive areas are [artifact-drive.md](artifact-drive.md#areas).
Workers and their places are [ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md).

## A Project is its channel

- Every channel is a Project, and every Project is one channel. There is no channel without a
  Project and no Project without a channel. DMs and Task Chats are not Projects.
- A Project's id is its channel's Chat id. The `projects` row is keyed by `chat_id` and holds what a
  bare channel lacks, so a Project never has a second identity:

  | Field | Shape |
  | --- | --- |
  | `chat_id` | The channel's Chat id, primary key, references `chats` |
  | `server_id` | The Server |
  | `task_key_id` | The Project's key, a `task_keys` row, unique across Projects |
  | `default_worker_place` | `computer`, `cursor`, `claude`, or null |
  | `default_worker_computer_id` | The Computer when the place is `computer`, else null |

  The everyone channel `#all` is the chat whose `chats.is_all` is true, exactly one per Server and
  always named `all`. It has no `projects` row: `projects.chat_is_all` joins the composite
  `projects_chat_fk` to `chats.is_all` and `projects_chat_not_all` requires it false, so Postgres
  refuses a Project on `#all` (migration `0142_all-is-a-chat`, ADR 0059 decision 5). The default
  place landed with W3 (migration 0144). A check keeps the Computer id set exactly when the place
  is `computer`, and the API renders it as `computer:<computerId>`.
  A Project has no repos ([Repos](#repos)). Home Agents are `agents.home_project_id`
  ([Agents](#agents)). Name, description, icon, color, archive, and delete stay on the channel's
  Chat row as they are today ([chats.md](chats.md#channels-are-projects)).
- The wire noun is `project`. `packages/haus-api/src/project.ts` holds `projectSchema` (the fields
  above plus the channel's `chatId`, `name`, and the home Agent ids) and the create and update
  inputs. The tRPC feature is `apps/server/src/haus-api/project/`. `chat.createChannel` and
  `chat.updateChannel` are deleted in the same wave, and `taskKey.create` with them.
- The Project's channel keeps Chat kind `channel`. Agents and people still address it as
  `#name` in targets, mentions, and links.

## Creating a Project

- Only people create Projects. "New project" asks for a name, and the Server allocates the key by
  the key rule (`suggestProjectKey` in `packages/haus-api/src/project-key.ts`). It creates the
  channel, its `projects` row, and the key's ledger entry in one transaction. The key is optional
  on `project.create`. There is no repo step
  ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)
  decision 1). Asking for a purpose, the channel description, at creation is not built yet. The creator becomes the channel's first human member. There is no "New channel".
- Agents cannot create Projects. `POST /api/agent/channels/create` and `haus channel create` are
  deleted. An Agent asked for a new Project says that a person creates it in the App.
- A new Project has no Agents. A person adds them in its settings.

## Settings

Settings sit behind the channel header menu. There is no Overview pane.

| Setting | Owner | Lands in |
| --- | --- | --- |
| Name, description, icon, color | The channel, as today | J2 |
| Key | `projects.task_key_id` | J2 |
| Agents | `agents.home_project_id` | J3 |
| `AGENTS.md` | A link that opens `projects/<key>/AGENTS.md` in Drive | J2 |
| Default place for Workers | `projects.default_worker_place` | W3 (API), W4 (UI) |

- Any person who can open the Project edits its settings, as channel editing works today. Agents
  never edit Project settings.
- Every settings change publishes `project.updated` with the Project's id. The App's Project query
  owns the state.

### Key

- A Project has exactly one key, which prefixes the numbers of Tasks filed in it
  ([tasks.md](tasks.md#keys)). No two Projects share a key.
- The key is editable until the first Task is filed under it. From then on it is fixed, because
  Tasks, bare-key references, and commit trailers carry it. Changing it moves the Project's Drive
  folder to `projects/<new key>/`.
- A key matches `^[A-Z][A-Z0-9]{1,4}$` and is unique on the Server. A key in use by another
  Project, or held by Tasks of another Project, is `TASK_KEY_TAKEN`.

### Allocating a key

The migration, and the key "New project" suggests, follow one total rule:

1. Take the uppercase of every letter and digit in the name, in order. A name with none becomes
   `P` plus the next free number (`P2`, `P3`, ...), and the rule stops.
2. With fewer than 2 characters, pad with `X`. With more than 4, keep the first 4.
3. If the result collides with a live key or a reserved ledger entry, append `2`, then `3`, and so
   on, trimming the base from the end so the key stays within 5 characters.

The result always matches `^[A-Z][A-Z0-9]{1,4}$` once the base starts with a letter. A base that
starts with a digit is prefixed with `P` before step 2.

### Agents

- An Agent's Project is `agents.home_project_id`. Every active Agent has exactly one, an open
  Project that is never `#all`; only a retired Agent may have none (`agents_home_project_shape`).
- The Project's Agents are the Agents whose home it is. Adding an Agent in a Project's settings
  moves its home there from wherever it was. The settings list shows where each candidate lives
  now, so a person sees what the move takes away.
- Agent creation takes a Project, an open Project validated in the creating transaction;
  `#all` is never one. `agent.create` requires `homeProjectId`, and the App's create dialog asks
  for one and, with no Project, says to create one first. `haus agent create --project <key>`
  names it; without the flag the new Agent joins the creating Agent's own Project, refused when
  that Project is not open.
- Moving an Agent changes what reaches it ([inbox.md](inbox.md#hearing)) and which Project
  `AGENTS.md` its main session receives ([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md)
  decision 7). It does not touch its session, its memory, or its machine
  ([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)). Queued
  inbox items stay queued.
- An Agent cannot move itself. A person moves it from either the Project's settings or the
  Agent's own settings.
- Moving or creating an Agent starts its read position at the present in its new home's channel
  and Tasks, so the history it never heard is not unread.

### Repos

A Project has no repos
([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)).
`project_repos` and `project_repo_links` retired in migration `0152_repos-belong-to-the-server`.

- A repo is a Server-level `repos` row, a lower-cased GitHub `owner/name`. Any Agent or Worker in
  any Project may use any repo. A repo joins the list only after a Computer's repo folder is added,
  a Computer clones it for a Worker, or a cloud provider starts a Worker on it.
- Each Computer lists where its repos live as `repo_folders`, added by its attacher from the
  Device page or `haus-computer repo add`. [Workers](workers.md#layout) owns how Workers use them,
  and [docs/api/projects.md](../docs/api/projects.md#repos-and-repo-folders) the API.

### Default place for Workers

- `default_worker_place` is where a Worker of this Project's Tasks runs unless the Agent names a
  place. Null means the Agent must name one, and the Worker CLI says so.
- A `computer:` place must name a Computer whose "Workers can run here" switch is on. Turning the
  switch off clears every Project default that names it, and removing the Computer clears them
  first in the same transaction. This replaces the per-Computer **Make default** provider setting.
- The API exists since W3: `project.setDefaultWorkerPlace { serverId, projectId, place | null }`,
  publishing `project.updated`. The settings UI is W4. Until it ships, a Project with no default
  falls back to the Agent's Computer's **Make default** cloud provider
  ([Workers](workers.md#w3-transitional-decisions)).

## The Haus project

- `#all` is not the Haus project ([ADR 0059](../docs/adr/0059-haus-starts-empty-without-cove.md),
  amended 2026-11-20). A new Server creates `#all` and no Project. Migration `0142_all-is-a-chat`
  moves an existing Server's Haus project to a new `#general` (see [Migration](#migration-from-channels)).
- Every member of the Server belongs to the Haus project's channel, as they belong to `#all` today.
- Its rules are `haus/AGENTS.md`. It has no `projects/<key>/` folder, and its Drive area is `haus`.
- It cannot be archived or deleted, and its channel cannot be renamed (`PROJECT_NAME_FIXED`).
- Its key is the key `#all` used, which is `GEN` on every Server that never configured another.

## Generalists

Retired 2026-11-20 by Zach's decision that every Captain belongs to a real Project. `#all` is no
Project and no Agent's Project, so creation and `agent.setHome` refuse it, and every active Agent
hears it as the team room ([inbox.md](inbox.md#hearing)). No Agent hears a Project that has no
Agent of its own, and every Agent is refused `TASK_PROJECT_NOT_HOME` outside its Project.

## What an Agent may do outside its home

- Every Agent reads and posts in every Project's channel and Tasks on its Server, as people do.
  Projects are open; nothing gates them by membership.
- Reading or posting elsewhere does not change what reaches the Agent. Only its home, mentions,
  assignments, followed Tasks, and followed reply chains do ([inbox.md](inbox.md#hearing)).
- Every non-retired Agent is offered as a mention in every Project.
- Any active Agent may be assigned a claim in any Project; a claim in a DM goes only to that DM's
  Agent. A reminder or Trigger anchor is out of an Agent's reach only in a deleted Chat or another
  Agent's DM.
- A Task started from a message in `#all` or a DM goes to the starting Agent's Project
  unless `--project` names another.
- An Agent starts Tasks only in its Project. Elsewhere the Server refuses with
  `TASK_PROJECT_NOT_HOME`, whose next action is to @mention that Project's Agent in that Project's
  channel. A Task started from a DM or from `#all`, which is no Project, goes to the starting
  Agent's home Project unless `--project` names it.
- Agent channel membership is deleted: the `channel_agent_participants` table, its single write
  seam `joinChannelAgents`, and `haus channel join`, `leave`, and `add`. Channel mutes are deleted
  with them ([inbox.md](inbox.md#hearing)). `haus channel info` and `haus channel members` stay and
  report the Project's key and home Agents.

## Archiving and deleting

- A Project with home Agents cannot be archived or deleted. The Server refuses with
  `PROJECT_HAS_AGENTS` and names them. A person moves them first. Retired Agents do not count;
  deleting the Project moves any retired Agent homed there to the Haus project.
- Otherwise archiving and deleting a Project are the channel's archive and delete
  ([chats.md](chats.md#config-and-observation)). Deleting a Project deletes its Tasks with the
  channel and its `projects` row. It deletes no repos, because repos belong to the Server. Its
  key's ledger entry stays, so its numbers are
  never reused. Cloud work attached to those Tasks stays and loses its Task.

## Migration from channels

One migration in J2 turns channels into Projects. J3 sets each Agent's Project. Both are idempotent: a
second run changes nothing.

1. **Projects (J2).** Each live or archived channel gets a `projects` row. The `#all` channel is
   the Haus project and is renamed `haus`, after any existing `haus` channel is renamed `haus-2`
   or the next free suffix. The migration logs that rename.
2. **Keys (J2).** Each Project takes its channel's ledger entry. Where several channels share one,
   the Haus project keeps it if it is among them. Otherwise the channel with the most Tasks under
   it keeps it, and the oldest channel wins a tie. Every other channel gets a new entry whose key
   follows the [key rule](#allocating-a-key). Existing Task identifiers never change
   ([tasks.md](tasks.md#keys)).
3. **Task Projects (J2).** Each Task's Project is its origin Message's channel. A Task from before
   Tasks were places, with no origin, takes the Project that holds its key. When no channel holds
   that key, the Task goes to the Haus project. Either way it keeps its key and number.
4. **Agent Projects.** Migration 0142 (`all-is-a-chat`) moves `#all`'s old Project row to an
   ordinary `#general` and gives each active Agent the open Project where it wrote the most,
   falling back to `#general`.
5. **Memberships (J3).** Migration 0146 (`agents-hear-their-home`) keeps those Projects, marks
   each Agent's Project read at the present so its backlog is not unread, and drops
   `channel_agent_participants` and `agent_channel_mutes`. Queued inbox items stay and drain
   under the rules they were planned with. It logs one line per Agent with the channels it had
   joined and the Project it now hears.

Migration `0142_all-is-a-chat` (E2d, ADR 0059 amended 2026-11-20) then takes `#all` out of
Projects, idempotently, with a `RAISE NOTICE` per decision:

1. On each Server whose `#all` has a `projects` row, a new channel `#general` (the first free of
   `general`, `general-2`, …) takes that row, its key and counters, every Task's `project_id`, and
   every Task chat's parent. The human members of `#all` join it. Tasks keep their ids and numbers;
   origin Messages stay in `#all`.
2. Each active Agent homed in `#all` moves to the unarchived, undeleted Project it authored the most
   messages in over the last 30 days, then all time, then the oldest Project, counting a Task's
   messages toward its Project. `#onboarding-owner` is chosen only when nothing else qualifies, and
   `#general` when nothing does. A retired Agent homed there gets a null home, which
   `agents_home_project_shape` allows only for a retired Agent.
3. Every other channel named `all`, archived and deleted ones included, becomes `all-2` or the
   next free suffix, and every `is_all` chat is renamed `all`; `chats_shape` requires that name.
