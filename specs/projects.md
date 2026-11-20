---
summary: The Projects contract. Humans create Projects and each Project is its channel; `#all` becomes the Haus project. A Project carries one Task key, its home Agents, repos linked per Computer, its `AGENTS.md`, and the default place for its Workers. Every Agent has exactly one home Project. Covers the data shape, settings and who edits them, the Haus project and generalists, Agent placement, and the one-time migration from channels.
read_when:
  - creating, configuring, archiving, or listing Projects or their channels
  - changing a Project's key, its Agents, its repos, its `AGENTS.md`, or its default Worker place
  - changing an Agent's home Project, generalist Agents, or the Haus project
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

  The Haus project is the channel whose `chats.is_all` is true, exactly one per Server; the flag
  stays on the channel row and the wire `Chat.isAll` until an explicit rename, and `projectSchema`
  exposes it as `isHaus`. The default place landed with W3 (migration 0142). A check keeps the
  Computer id set exactly when the place is `computer`, and the API renders it as
  `computer:<computerId>`.
  Repos are `project_repos` rows ([Repos](#repos)). Home Agents are `agents.home_project_id`
  ([Agents](#agents)). Name, description, icon, color, archive, and delete stay on the channel's
  Chat row as they are today ([chats.md](chats.md#channels-are-projects)).
- The wire noun is `project`. `packages/haus-api/src/project.ts` holds `projectSchema` (the fields
  above plus the channel's `chatId`, `name`, and the home Agent ids) and the create and update
  inputs. The tRPC feature is `apps/server/src/haus-api/project/`. `chat.createChannel` and
  `chat.updateChannel` are deleted in the same wave, and `taskKey.create` with them.
- The Project's channel keeps Chat kind `channel`. Agents and people still address it as
  `#name` in targets, mentions, and links.

## Creating a Project

- Only people create Projects. "New project" asks for a name and a key, suggests the key from the
  name with `suggestProjectKey` (`packages/haus-api/src/project-key.ts`), and creates the channel, its `projects` row, and the key's ledger entry in one
  transaction. The key is optional on `project.create`: without one the Server allocates it by
  the key rule. The creator becomes the channel's first human member. There is no "New channel".
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
| Repos, and which Computers link each | `project_repos`, `project_repo_links` | W3 (API), W4 (UI) |
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

- An Agent's home Project is `agents.home_project_id`, not null. Every Agent has exactly one.
- The Project's Agents are the Agents whose home it is. Adding an Agent in a Project's settings
  moves its home there from wherever it was. The settings list shows where each candidate lives
  now, so a person sees what the move takes away.
- Agent creation takes a home Project. The App's create dialog asks for one and defaults to the
  Haus project. `haus agent create --project <key>` names it and defaults to the Haus project.
- Moving an Agent changes what reaches it ([inbox.md](inbox.md#hearing)) and which Project
  `AGENTS.md` its main session receives ([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md)
  decision 7). It does not touch its session, its memory, or its machine
  ([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)). Queued
  inbox items stay queued.
- An Agent cannot move itself. A person moves it from either the Project's settings or the
  Agent's own settings.

### Repos

- A repo is a `project_repos` row: the Project and a repository (`owner/name`), unique per
  Project. A link is a `project_repo_links` row: the repo, a Computer, and an optional local
  checkout path. A null path means the Computer clones the repo into its own data root on first
  use. A repo can be linked on several Computers and on none.
- Workers of the Project's Tasks run in a worktree of a linked repo
  ([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decisions 6 and 7).
  [Workers](workers.md#layout) owns the Worker side of this contract.
- The person who attached a Computer, or an Owner or Admin, links a repo on that Computer, the
  same people who set its "Workers can run here" switch.
- The API exists since W3: `project.addRepo`, `project.removeRepo`, `project.linkRepo`, and
  `project.unlinkRepo`, each publishing `project.updated`. The settings UI is W4. Until it ships, a
  Worker start that names a repo the Project lacks adds it
  ([Workers](workers.md#w3-transitional-decisions)).

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

- `#all` becomes the Haus project. Its channel is renamed `haus` and shown as Haus. An existing
  channel already named `haus` is first renamed `haus-2`, or the next free suffix, keeping its id
  and Tasks. `#all` stops
  resolving as a target in the same wave, and the prompt's references move through the guarded
  prompt contract.
- Every member of the Server belongs to the Haus project's channel, as they belong to `#all` today.
- Its rules are `haus/AGENTS.md`. It has no `projects/<key>/` folder, and its Drive area is `haus`.
- It cannot be archived or deleted, and its channel cannot be renamed (`PROJECT_NAME_FIXED`).
- Its key is the key `#all` used, which is `GEN` on every Server that never configured another.

## Generalists

- An Agent whose home is the Haus project is a **generalist**. Every Agent created without a named
  Project starts as one. A new Server has none: the Haus project holds the generalists people put
  there, and may hold none ([ADR 0059](../docs/adr/0059-haus-starts-empty-without-cove.md)).
- A generalist hears the Haus project the way any Agent hears its home. It may start a Task in any
  Project. When it acts in a Project, its turn input carries that Project's `AGENTS.md` the first
  time in a session ([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md)
  decision 7).

## What an Agent may do outside its home

- Every Agent reads and posts in every Project's channel and Tasks on its Server, as people do.
  Projects are open; nothing gates them by membership.
- Reading or posting elsewhere does not change what reaches the Agent. Only its home, mentions,
  assignments, followed Tasks, and followed reply chains do ([inbox.md](inbox.md#hearing)).
- Every non-retired Agent is offered as a mention in every Project.
- A non-generalist Agent starts Tasks only in its home Project. Elsewhere the Server refuses with
  `TASK_PROJECT_NOT_HOME`, whose next action is to @mention that Project's Agent in that Project's
  channel. A generalist is never refused.
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
  channel, its `projects` row, and its repos. Its key's ledger entry stays, so its numbers are
  never reused. Cloud work attached to those Tasks stays and loses its Task.

## Migration from channels

One migration in J2 turns channels into Projects. J3 sets home Projects. Both are idempotent: a
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
4. **Home Projects (J3).** Each Agent's home is the unarchived Project where it authored the most
   messages in the last 30 days, counting a Task's messages toward its Project. A tie goes to the
   Project with its newest message. Archived Projects are never eligible. An Agent with no such
   messages, and Cove, go to the Haus project.
5. **Memberships (J3).** `channel_agent_participants` and `agent_channel_mutes` are dropped in the
   same migration that sets homes. Queued inbox items stay and drain under the rules they were
   planned with.

The migration logs one line per Agent with its old channels, its message counts, and the home it
chose, so a person can check the result and move any Agent in settings.
