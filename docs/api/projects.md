---
summary: The Project tRPC procedures (`project.create`, `project.update`, `project.list`, `project.onUpdated`), their inputs, results, refusal codes, and the key rule the Server applies.
read_when:
  - calling or changing `project.create`, `project.update`, `project.list`, or `project.onUpdated`
  - creating or renaming a channel, or changing its description, icon, color, or key
  - handling `TASK_KEY_TAKEN`, `PROJECT_KEY_FIXED`, `PROJECT_HAS_AGENTS`, or `PROJECT_NAME_FIXED`
  - reading a Project's home Agents or moving an Agent's home (`agent.setHome`)
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
| `project.list` (query) | `projectListInputSchema`: `serverId` | Every live or archived Project, by name |
| `project.onUpdated` (subscription) | `serverId` | `{ serverId, projectId }` on create and on every update that changed something |

`project` carries `chatId`, `serverId`, `name`, `key`, `taskKeyId`, `keyEditable` (no Task holds
the key yet), `isHaus` (the channel's `isAll`, the Haus project), and `homeAgentIds` (the
non-retired Agents whose home it is, oldest first). The channel's `Chat.participantAgentIds` is the
same set, ordered by id. `agent.setHome` moves an Agent between Projects and publishes
`project.onUpdated` for both ([Agents API](agents.md)).

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
- Both publish `chat.onLifecycle` (`created`, or `updated` when a channel field changed) for the
  chat list, and `project.onUpdated`.
- Archiving or deleting a Project goes through `chat.archiveChannel` and `chat.deleteChannel`.
  Deleting one deletes its Tasks with their Chats; cloud work they had stays and leaves them.

## Refusals

Project refusals carry `data.project.code` on the tRPC error.

| Code | When |
| --- | --- |
| `TASK_KEY_TAKEN` (`CONFLICT`) | The key is already a ledger entry on the Server: another Project's, or one held by Tasks |
| `PROJECT_KEY_FIXED` (`CONFLICT`) | A Task already carries this Project's key |
| `PROJECT_NAME_FIXED` (`CONFLICT`) | Renaming the Haus project's channel, which is always `haus` |
| `PROJECT_HAS_AGENTS` (`CONFLICT`) | `chat.archiveChannel` or `chat.deleteChannel` on a Project that is still some Agent's home; the message names them |
| `CONFLICT` "A channel already uses that name." | The name is taken by any channel, archived or deleted included |
| `NOT_FOUND` | The chat is not a Project on the Server |
