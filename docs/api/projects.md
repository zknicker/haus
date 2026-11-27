---
summary: The Project tRPC procedures (`project.create`, `project.update`, `project.list`, `project.onUpdated`), their inputs, results, refusal codes, and the key rule the Server applies, plus the Server-level repo list and each Computer's repo folders (ADR 0060).
read_when:
  - calling or changing `project.create`, `project.update`, `project.list`, or `project.onUpdated`
  - creating or renaming a channel, or changing its description, icon, color, or key
  - handling `TASK_KEY_TAKEN`, `PROJECT_KEY_FIXED`, `PROJECT_HAS_AGENTS`, `PROJECT_NAME_FIXED`, or `COVE_HOME_FIXED`
  - reading a Project's home Agents or moving an Agent's home (`agent.setHome`)
  - calling or changing `computer.repoFolders`, `addRepoFolder`, `removeRepoFolder`, `repoFolderStates`, or `/computer/repos/*`
---

# Projects API

A Project is its channel ([specs/projects.md](../../specs/projects.md)). The contracts live in
`packages/haus-api/src/project.ts`; the procedures in `apps/server/src/haus-api/project/`; the
product logic in `apps/server/src/projects/`. Every procedure runs for an active member of
`serverId`. Agents never create or edit Projects.

| Procedure | Input | Result |
| --- | --- | --- |
| `project.create` | `projectCreateInputSchema`: `serverId`, `name`, `key?`, `description?`, `icon?`, `color?` | `{ chat, project }` |
| `project.update` | `projectUpdateInputSchema`: `serverId`, `chatId`, and any of `name`, `description`, `icon`, `color`, `key`; `null` clears a description, icon, or color | `{ chat, project }` |
| `chat.updateAllChannel` | `allChannelUpdateInputSchema`: `project.update`'s input without `key`, on the `#all` chat | `{ chat }` |
| `project.list` (query) | `projectListInputSchema`: `serverId` | Every live or archived Project, by name |
| `project.onUpdated` (subscription) | `serverId` | `{ serverId, projectId }` on create and on every update that changed something |

`project` carries `chatId`, `serverId`, `name`, `key`, `taskKeyId`, `keyEditable` (no Task holds
the key yet), `isHaus` (the channel's `isAll`, the Haus project), and `homeAgentIds` (the
non-retired Agents whose home it is, oldest first). The channel's `Chat.participantAgentIds` is the
same set, ordered by id. `agent.setHome` moves an Agent between Projects and publishes
`project.onUpdated` for both ([Agents API](agents.md)). A Project also carries `defaultMachine`,
`{ computerId, computerName }` or null, the Machine its Tasks run on when their starter names none.
`project.setDefaultMachine { serverId, projectId, computerId | null }` sets it, refuses a Computer
that is not this Server's, and publishes `project.onUpdated`. A Project carries no repos
([Repos and repo folders](#repos-and-repo-folders)).

- `project.create` makes the channel, its creator's membership, its ledger entry, and its
  `projects` row in one transaction. A new Project has no Agents. Without `key` the Server
  allocates one by the key rule: `suggestProjectKey(name)` from `project-key.ts` (the name's
  letters and digits uppercased, a `P` before a leading digit, padded with `X` to 2, cut to 4),
  then `2`, `3`, ... appended on a collision, trimming the base to stay within 5 characters; a
  name with no letter or digit takes the next free `P2`, `P3`, .... Migration 0130 follows the
  same rule.
- `project.update` renames the Project's ledger entry in place while no Task holds it. It
  needs the same access as a channel write: a member outside the channel gets `FORBIDDEN`, and an
  archived channel `CONFLICT`, before anything commits.
- `#all` has no `projects` row, so `project.update` answers it `NOT_FOUND`. The App's channel
  settings save its description, icon, and color through `chat.updateAllChannel`, with the same
  access check. A new name refuses with `PROJECT_NAME_FIXED`; sending its current name is a no-op.
  It publishes `chat.onLifecycle` `updated` when a field changed.
- Both publish `chat.onLifecycle` (`created`, or `updated` when a channel field changed) for the
  chat list, and `project.onUpdated`.
- Archiving or deleting a Project goes through `chat.archiveChannel` and `chat.deleteChannel`.
  Deleting one deletes its Tasks with their Chats; cloud work they had stays and leaves them.

## Repos and repo folders

Repos belong to the Server, and each Computer lists its repo folders
([ADR 0060](../adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)). The contracts live in `packages/haus-api/src/repos.ts`. A repo is a
lower-cased GitHub `owner/name`; a folder is `{ computerId, repository, path, addedBy, addedAt }`,
where a null `addedBy` is Haus's own clone. `project.addRepo`, `removeRepo`, `linkRepo` and
`unlinkRepo` are deleted.

| Procedure | Input | Result |
| --- | --- | --- |
| `computer.repoFolders` (query) | `serverId`, `computerId` | `{ folders, canAdd, canRemove }`: `canAdd` for the attacher, `canRemove` also for Owners and Admins |
| `computer.addRepoFolder` | `serverId`, `computerId`, `path` | The online Computer reads the folder's real path and its `origin`, which must be on `github.com`; only the attacher adds, one folder per repo per Computer |
| `computer.removeRepoFolder` | `serverId`, `computerId`, `repository` | The attacher, an Owner or an Admin removes it; refuses while a Haus worktree of it exists, naming them |
| `computer.repoFolderStates` (query) | `serverId`, `computerId` | Each folder `present`, `missing`, or `other-origin`, asked of the online Computer |

Changes publish `computer.updated`. On the machine, `haus-computer repo add <path>`, `list` and
`remove` call `POST /computer/repos/add|list|remove` with the person's Haus Computer login
([ADR 0022](../adr/0022-computer-login-sessions-authorize-management.md)). A Computer reports
Haus's own clones with `repo-clones`, and each becomes its folder for that repo. Agents read the
list with `GET /api/agent/repos` (`haus repo list`) and check out with `haus repo checkout`, a
`repo-checkout` invocation the Server sends only to a Computer with a folder for that repo.
`POST /api/agent/repos/co-authors` (`haus repo co-author @handle…`) answers a `Co-authored-by:`
trailer per person, from their Haus account name and email, and names who has no email.

An Agent's git on a Computer reaches GitHub only as the Haus GitHub App
([specs/github-app-connection.md](../../specs/github-app-connection.md#git-on-a-computer)). The
Computer's credential helper calls `POST /computer/github/git-credential` with the Computer
credential and `{ access: 'write', invocationId, repository }` (git inside an open Agent command)
or `{ access: 'read', agentId, repository }` (the Computer's own cleanup fetch), and gets
`{ token, expiresAt }`: an installation token scoped to that one repo with `contents` at that
level. A refusal is `403 { code, error }` with `github_app_needs_access`,
`github_connection_not_granted`, `repo_folder_missing`, `agent_not_allowed` or
`invocation_not_open`, and `503 github_app_unavailable` when the Server has no App.
`GET /computer/github/bot` answers the bot's git identity, `{ name: '<slug>[bot]', email }`.

## Refusals

Project refusals carry `data.project.code` on the tRPC error.

| Code | When |
| --- | --- |
| `TASK_KEY_TAKEN` (`CONFLICT`) | The key is already a ledger entry on the Server: another Project's, or one held by Tasks |
| `PROJECT_KEY_FIXED` (`CONFLICT`) | A Task already carries this Project's key |
| `PROJECT_NAME_FIXED` (`CONFLICT`) | Renaming the Haus project's channel, which is always `haus` |
| `PROJECT_HAS_AGENTS` (`CONFLICT`) | `chat.archiveChannel` or `chat.deleteChannel` on a Project that is still some Agent's home; the message names them |
| `COVE_HOME_FIXED` (`CONFLICT`) | `agent.setHome` moving Cove, whose home is always the Haus project |
| `CONFLICT` "A channel already uses that name." | The name is taken by any channel, archived or deleted included |
| `NOT_FOUND` | The chat is not a Project on the Server |
