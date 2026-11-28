---
status: accepted
summary: Drive is the existing Files drive, renamed and extended with three areas (Haus, each Project, each Agent), revisions attributed to an Agent, Worker or person and a Task, and a per-area change counter. It holds the rule layers (Haus, Project and Agent AGENTS.md, plus each Agent's WORKER.md), MEMORY.md, notes, reports and skills, and everyone can read everything. Each Agent keeps a plain drive/ folder on its machine that pulls changes at turn start and pushes changes after the reply; the Server merges clean text edits and turns real conflicts into a kept-both copy plus a drive_conflict inbox item. The runner reads rules and memory from the Server. Accepted 2026-11-19, not yet implemented; amended 2026-11-20 (a Drive citation opens its revision in the file viewer, not beside the chat); amended 2026-11-23 (the folder lives on the Agent's Machine, and a Machine change waits for the old Machine's push, or moves from the last synced revision when that Mac is offline, fenced by a placement generation); amended 2026-11-28 (only a Captain keeps a drive/ folder; a Task reads and writes Drive through haus drive).
read_when:
  - changing Files, the artifact drive, Agent workspaces, or where MEMORY.md, notes and skills live
  - changing how rules (AGENTS.md, WORKER.md, conversation style) reach an Agent or a Worker
  - adding versions, attribution, History, or Restore to stored files
  - changing the drive/ folder on a machine, turn-start pull, turn-end push, or Drive conflicts
  - changing what happens to an Agent's drive/ folder when its Machine changes
  - changing the drive_conflict inbox item, or deciding who can read an Agent's files
  - changing where an Agent writes a "from now on" rule
---

# ADR 0054: Drive Holds What Agents Know and Follow

## Status

Accepted 2026-11-19. Not yet implemented. Amended 2026-11-19 by the Drive contract
([specs/artifact-drive.md](../../specs/artifact-drive.md),
[specs/drive-folder.md](../../specs/drive-folder.md)) in decisions 4, 5, 6 and 11: one folder per
writer, no pull without an online machine, large binaries fetched in full with lazy fetch deferred,
people see conflicts instead of copies, and citations follow the turn's push. Part of the direction in
[the Capy and Amp proposal](../proposals/capy-product-model.md), with
[ADR 0055](0055-projects-own-agents-and-tasks.md) (Projects),
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers) and
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) (runtime). Amends
[ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md), extends the Files contract in
`specs/artifact-drive.md`, and replaces the durable half of `specs/workspace.md`.

Amended 2026-11-23 in decisions 4 and 5 by
[ADR 0057's Machine amendment](0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer):
an Agent's `drive/` folder lives on its Machine, which can now change, and
[the handoff](#amendment-2026-11-23-drive-on-a-machine-change) says what happens to the folder
when it does.

Amended 2026-11-28 in decisions 4 and 5 by
[ADR 0062](0062-tasks-are-agent-sessions-issues-are-the-backlog.md): only a Captain keeps a
`drive/` folder. A Task has no folder and no pull or push; it reads a file with `haus drive view`
and writes a deliverable with `haus drive write`, through the Server. A Captain's pull downloads
up to eight files at once.

## Context

The files that steer an Agent live where nobody looks. `MEMORY.md`, `notes/` and pages sit in a
Computer-local workspace that only Owners and Admins can reach. Its voice comes from a
conversation style held on the Server. Nothing records who changed those files, and nothing can be
restored. ADR 0052 already concedes that "the planned Drive work moves MEMORY.md somewhere members
can read and edit."

Haus already has most of a drive. Files (`specs/artifact-drive.md`) has canonical paths and
folders, revisions stored in R2, compare-and-set writes that never silently overwrite, and bulk
pull, with no local mirror and no background process.

Capy and Amp both keep durable state in files people can read. Capy's Captain Drive holds rules,
notes and reports, versioned and attributed, and agents work on it with ordinary file tools. Capy
built a full sync engine to do that: lazy mounts, sync states, capture and flush tools, held
deletes. Amp has no memory feature at all: knowledge lives in `AGENTS.md`, hosted skills and
searchable threads. Rules people can edit outlast facts a model remembers.

## Decision

1. **Drive is Files, renamed and extended.** The existing drive keeps its paths, folders, R2
   revisions, compare-and-set writes and bulk pull. The durable files of every Agent workspace
   (`MEMORY.md`, `notes/`, pages) and its skills migrate into it. The Files page becomes the Drive
   page, and files open beside the chat.

   Amended 2026-11-20: a Drive citation opens the cited revision in the file viewer, not beside
   the chat; opening it in a side pane beside the chat is a possible follow-up.

2. **Three areas.**

   ```
   haus/AGENTS.md                         Haus rules
   projects/<key>/AGENTS.md               Project rules, plus Project docs
   agents/<handle>/AGENTS.md              the Agent's own rules
   agents/<handle>/WORKER.md              rules every Worker of this Agent reads
   agents/<handle>/MEMORY.md              capped memory
   agents/<handle>/notes/ …               the rest of its durable workspace
   agents/<handle>/skills/                its skills
   agents/<handle>/reports/ renders/ handoffs/   Worker deliverables
   ```

3. **Every revision is attributed.** Each one records the Agent, Worker or person that wrote it,
   and the Task it was written for. Each area keeps a change counter, and the Server answers
   "what changed since counter N" for an area.

4. **A plain `drive/` folder for each writer.** Each Agent keeps its own `drive/` folder on its
   machine, and each Worker on a Computer keeps one, so every push belongs to one writer. A folder
   holds `drive/haus/`, `drive/projects/<key>/` and `drive/agents/<handle>/` for every area, since
   everyone can read everything, and it persists between turns. Agents use only native file
   commands on it: `ls`, `cat`, `rg`, edits. There are no sync commands.

5. **Pull at turn start, push after the reply.**
   - When a turn starts, the Agent's machine pulls only what changed since its last pull, while the
     turn runs. Only a tool call on the machine waits for the pull. An Agent whose machine is
     offline or unset pulls nothing.
   - The pull fetches every changed file. Fetching large binaries the first time something opens
     them is deferred.
   - After the reply, the Computer pushes each changed file with the revision it started from. A
     deleted file records a delete, and a rename is a delete plus an add.

6. **Conflicts.**
   - The Server merges a text file changed on different lines by both sides, from the known base
     revision. The Agent never sees it.
   - The same lines, or a binary file: the other version stays current, and the Agent's version is
     saved beside it as `<name>.conflict-<handle>.<ext>`. The Server queues one `drive_conflict`
     inbox item per push, listing every file. It wakes the Agent, which merges with ordinary file
     commands and deletes the copy.
   - A Worker's conflicts go to its Agent's inbox. The wording rides the inbox item, not the
     prompt.
   - People editing in the app get the same merge. A real conflict refuses their save and shows
     them Compare instead of saving a copy, because they are there to resolve it.

7. **The runner reads the Server.** The Agent's runner
   ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md)) reads rules and
   memory from the current revisions on the Server, never from a machine. The main session
   receives the Haus `AGENTS.md`, its home Project's `AGENTS.md`, its own `AGENTS.md` and
   `MEMORY.md` in the turn input when they changed, the way ADR 0052 delivers `MEMORY.md`. A
   generalist in the Haus project receives a Project's `AGENTS.md` the first time it acts in that
   Project in a session.

8. **Workers get rules at launch and on change.** A Worker gets its whole stack at launch, and
   `WORKER.md` again whenever it changes, by receipt like memory
   ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)).

9. **Everyone can read everything.** There is no privacy layer and no personal folder. Members can
   read and edit any Agent's rules and memory.

10. **"From now on" goes to a rule file.** A rule for the Agent goes in its `AGENTS.md`, a rule for
    its Workers in `WORKER.md`, and a rule for the Project in the Project's `AGENTS.md`.
    `MEMORY.md` holds facts and stays under ADR 0052's cap.

11. **References carry a revision.** Citing a Drive file in a message records the revision current
    at send time. A file the sending turn changed is pushed after the reply, so its citation moves
    to the revision that push leaves. Either way the citation opens what the Agent meant.
    Attachments stay as they are.

12. **v1 Drive page.** History, Compare and Restore. Compare renders two stored revisions with
    `@pierre/diffs` (Apache-2.0), so it needs no Server work. The Agent page links its rule files.

## Amendment 2026-11-23: Drive on a Machine change

An Agent's "machine" in decisions 4 and 5 is its Machine
([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)),
and a person can now change it. The folder never moves between Macs. The Server is canonical, so
the new Machine pulls Drive into a fresh folder, and the handoff only has to make sure the old
folder's edits reached the Server first, or that everyone knows they did not.

**Today a settled turn proves nothing.** The turn-end push is one frame, sent to the Agent's
current Computer only while it is online (`apps/server/src/runner/ingest.ts:145-162`), so a
settled turn does not show that local edits reached Drive. The old Machine also loses its way to
push the moment `agents.computer_id` changes: the Drive sync credential is minted only for the
Agent's own Computer (`apps/server/src/computers/runner-credentials.ts:54-56`), and the reconnect
push covers only Agents assigned there
(`apps/server/src/agent-delivery/drive-reconcile.ts:8-29`).

**The handoff.**

1. **Between turns.** The change waits until the Agent's turn settles.
2. **Flush.** With the old Machine online, Haus asks it to push and switches the Machine only
   after that push lands. Its conflicts follow decision 6 as usual.
3. **Old Machine offline.** The person can wait for it, or move from the last synced revision.
   Moving says that edits not yet pushed stay in the old folder, and that Haus will not merge them.
4. **Fence.** Each change bumps the Agent's durable placement generation. A push from a run that
   started under an older generation is refused, the way a push from an earlier reset generation
   is today (`apps/server/src/postgres/schema/agents.ts:90`). The old folder stays on that Mac
   for recovery.
5. **Pull.** The new Machine's first turn pulls into an empty folder, as a first turn does.

What a change back to a Mac that still holds an old folder does with it is decided with the
implementation.

## Considered and rejected

- **A mounted remote filesystem or a Capy-style sync engine.** Continuous two-way sync with lazy
  mounts, sync states and held deletes is a distributed filesystem to build and maintain. Pulling
  at turn start and pushing after the reply against one authority is a short loop on APIs Haus
  already has.
- **Syncthing.** It syncs continuously in the background, credits a device rather than an Agent or
  Task, and keeps its own versions and conflict files beside Drive's.
- **Seafile.** A second server to run and a second drive to keep consistent with Haus's.
- **rclone.** Plumbing only, with no attribution and no conflicts tied to revisions. The `haus` CLI
  already pulls.
- **Git, visible or hidden.** A second history beside Drive's, awkward with binaries, and a visible
  `.git` that pulls agents into talking about git instead of Drive.
- **Keep workspaces local and add a viewer.** People still couldn't edit or restore, and Workers on
  other machines couldn't read the Agent's rules.
- **A personal rules layer per person.** Preferences about a person belong in the Agent's
  `MEMORY.md`.
- **A privacy layer or private folders.** Haus has no private channels, and Agent memory is team
  knowledge.
- **A memory feature beyond one capped file.** Capy paused its memory experiment, and Amp ships
  none.

## Prior art

Capy's Drive is scoped volumes, content-addressed, versioned and attributed to the thread and
author, with History, Compare and Restore, mounted lazily on machines and kept in step by explicit
capture and flush tools. Conflicting writes overwrite, merge, keep both or are refused as stale,
and large deletes are held. Its "Loaded before the first message" panel shows the instruction token
breakdown. Amp layers a workspace `AGENTS.md`, a personal one and the repo's own, and keeps skills
and prompts in hosted git repos. Haus takes Capy's experience (attributed versions, files beside
the chat, kept-both conflicts, references by version, real files for agents) on the drive it
already has, and Amp's one-way layering of rules.

## Consequences

Amended:

- [ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md): `MEMORY.md` moves from the
  Computer-local workspace to `agents/<handle>/MEMORY.md` in Drive. The cap and the receipt stand.
  Members can read and edit it.
- The Server-held conversation style (`conversationStyle` in `docs/api/agents.md`) becomes
  `agents/<handle>/AGENTS.md`.
- [ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) moves prompt
  composition from the Computer to the Server-side runner, which reads Drive directly.
- `specs/inbox.md` gains the `drive_conflict` item kind.

Deleted:

- The Files section as a separate surface, the human Workspace pane, and Pages in the workspace.
- Computer-local `MEMORY.md`, `notes/` and skills as the source of truth.

Deferred:

- Held mass deletes, and mounts of any kind.
- Fetching large binaries on first open, and History that follows a rename.
- The "Loaded before the first message" token panel.

Follow-up:

- Done: `specs/artifact-drive.md` carries areas, attribution, the change counter, pushes and
  conflicts, and `specs/drive-folder.md` carries the machine folder, pull and push.
- Rewrite `specs/workspace.md` to this model.
- 2026-11-23: the Machine change handoff in `specs/drive-folder.md`: the flush, the offline
  choice, the placement generation on pushes, and the Drive sync credential and reconnect push
  for the old Machine during the flush.
- The prompt's memory and rule text changes go through the guarded prompt contract: the size cap,
  the divergence register, and a `tune-agent-behavior` baseline.
