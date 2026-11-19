---
status: accepted
summary: One versioned, attributed Drive replaces Files and every Agent workspace's durable files. It is mounted on Computers, everyone can read everything, and it holds the rule layers (Haus, Project and Agent AGENTS.md, plus each Agent's WORKER.md), MEMORY.md, notes and Worker deliverables. Rules reach a session by receipt, and the Agent page shows what loads before the first message. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing Files, the artifact drive, Agent workspaces, or where MEMORY.md and notes live
  - changing how rules (AGENTS.md, WORKER.md, conversation style) reach an Agent or a Worker
  - adding versions, attribution, History, Compare, or Restore to stored files
  - mounting shared files on a Computer, or deciding who can read an Agent's files
  - changing where an Agent writes a "from now on" rule
---

# ADR 0054: Drive Holds What Agents Know and Follow

## Status

Accepted 2026-11-19. Not yet implemented. Part of the direction in
[the Capy and Amp proposal](../proposals/capy-product-model.md), with
[ADR 0055](0055-projects-own-agents-and-tasks.md) (Projects) and
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) (Workers). Amends
[ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md) and replaces the Files
contract in `specs/artifact-drive.md` and the durable half of `specs/workspace.md`.

## Context

The files that steer an Agent live where nobody looks. `MEMORY.md`, `notes/` and pages sit in a
Computer-local workspace that only Owners and Admins can reach. Its voice comes from a
conversation style held on the Server. Shared files live in a separate Files drive with explicit
pulls and pushes. Nothing records who changed what, and nothing can be compared or restored. ADR
0052 already concedes that "the planned Drive work moves MEMORY.md somewhere members can read and
edit."

Capy and Amp both keep durable state in files people can read. Capy's Captain Drive holds rules,
notes and reports, versioned and attributed. Amp has no memory feature at all: knowledge lives in
`AGENTS.md`, hosted skills and searchable threads. Rules people can edit outlast facts a model
remembers.

## Decision

1. **One Drive.** Files and the durable files of every Agent workspace (`MEMORY.md`, `notes/`,
   pages) migrate into one Server-held Drive. The existing file browser becomes the Drive browser,
   with a page listing scopes: Haus, each Project, each Agent. Files open beside the chat.

2. **Layout.**

   ```
   AGENTS.md                        Haus rules
   projects/<key>/AGENTS.md         Project rules, plus Project docs
   agents/<handle>/AGENTS.md        the Agent's own rules
   agents/<handle>/WORKER.md        rules every Worker of this Agent reads
   agents/<handle>/MEMORY.md        capped memory
   agents/<handle>/notes/ …         the rest of its durable workspace
   agents/<handle>/reports/ renders/ handoffs/   Worker deliverables
   ```

3. **Every version is kept and attributed.** Each save records the person, Agent, Worker and Task
   that wrote it. The browser has History, Compare and Restore. Concurrent writes merge or keep
   both, and a mass delete is held for confirmation.

4. **Mounted, not pushed.** Every machine mounts the Drive folders its Agents and Workers can see,
   as an ordinary folder. The Agent runner reads Drive directly
   ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md)). Agents use ordinary file tools, and edits save as attributed versions. The
   machine-local workspace remains as execution scratch and checkouts, with no human surface.

5. **Everyone can read everything.** There is no privacy layer and no personal folder. Members can
   read and edit any Agent's rules and memory.

6. **Rules arrive by receipt.** The runner composes each turn from Drive. The main session receives the Haus `AGENTS.md`, its home Project's
   `AGENTS.md`, its own `AGENTS.md` and `MEMORY.md` in the turn input when they changed, the way
   ADR 0052 delivers `MEMORY.md`. A generalist in the Haus project receives a Project's
   `AGENTS.md` the first time it acts in that Project in a session. A Worker gets its whole stack
   at launch and `WORKER.md` on every turn ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md)).

7. **Loaded before the first message.** The Agent page shows each rule file that loads, with its
   token count.

8. **"From now on" goes to a rule file.** A rule for the Agent goes in its `AGENTS.md`, a rule for
   its Workers in `WORKER.md`, and a rule for the Project in the Project's `AGENTS.md`.
   `MEMORY.md` holds facts and stays under ADR 0052's cap.

9. **Attachments stay as they are.** An Agent or Worker shares a Drive file by reference, a path
   at a version.

## Considered and rejected

- **Keep workspaces local and add a viewer.** People still couldn't edit, compare or restore, and
  Workers on other machines couldn't read the Agent's rules.
- **A personal rules layer per person.** Preferences about a person belong in the Agent's
  `MEMORY.md`.
- **A privacy layer or private folders.** Haus has no private channels, and Agent memory is team
  knowledge.
- **A memory feature beyond one capped file.** Capy paused its memory experiment, and Amp ships
  none.

## Prior art

Capy's Drive is scoped volumes, content-addressed, versioned (autosave and checkpoint), and
attributed to the thread and author. It has History, Compare and Restore, and is mounted lazily on
machines. Its "Loaded before the first message" panel shows the instruction token breakdown. Amp
layers a workspace `AGENTS.md`, a personal one and the repo's own, and keeps skills and prompts in
hosted git repos. Haus takes Capy's Drive nearly whole, and Amp's one-way layering of rules.

## Consequences

Amended:

- [ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md): `MEMORY.md` moves from the
  Computer-local workspace to `agents/<handle>/MEMORY.md` in Drive. The cap and the receipt stand.
  Members can read and edit it.
- The Server-held conversation style (`conversationStyle` in `docs/api/agents.md`) becomes
  `agents/<handle>/AGENTS.md`.
- [ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) moves prompt
  composition from the Computer to the Server-side runner, which reads Drive directly.

Deleted:

- The Files section as a separate surface, the human Workspace pane, and Pages in the workspace.
- Explicit pull and push as the only way to read shared files.

Follow-up:

- Rewrite `specs/artifact-drive.md` and `specs/workspace.md` to this model, and write the Drive
  mount and versioning specs.
- The prompt's memory and rule text changes go through the guarded prompt contract: the size cap,
  the divergence register, and a `tune-agent-behavior` baseline.
