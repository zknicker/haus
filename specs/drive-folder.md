---
summary: The machine half of Drive. Each Agent keeps its own plain drive/ folder on its machine (and each Worker on a Computer keeps one), pulled at turn start while the turn runs, with large binaries fetched on first use, and pushed after every turn with the revision each file started from. Covers what waits for the pull, how push outcomes land in the folder, and how instruction composition reads the folder until the runner ships.
read_when:
  - changing the drive/ folder on a Computer, its layout, its location, or its state file
  - changing turn-start pull, what waits for it, or large-binary placeholders
  - changing the push after a turn, deletes, renames, or how a machine applies push outcomes
  - changing how instruction composition or MEMORY.md delivery reads the drive/ folder before the runner
  - retiring or replacing haus files pull and push
---

# Drive folder

[Drive](artifact-drive.md) is canonical on the Server. This spec is the machine's copy. The folder is
plain files that the Agent works on with native commands. It changes at two moments, a pull when a
turn starts and a push after the turn settles. Nothing runs between turns.

## One folder per writer

Each Agent keeps its own `drive/` folder in its working directory on its machine
(`agents/<agent-id>/workspace/drive/`, per [workspace](workspace.md)). Each Worker on a Computer
keeps its own folder outside its checkout, and the Workers contract (W1) names where. Two writers
never share a folder. So every change in a push belongs to one writer, and two turns never edit
one folder at once.

```text
drive/haus/…
drive/projects/<key>/…
drive/agents/<handle>/…
```

The folder holds every area, because everyone reads everything. Files in areas the writer cannot
write, such as another Agent's area, are written read-only (files `0444`, folders `0555`). The
folder persists between turns.

The machine keeps its bookkeeping outside the folder, in `agents/<agent-id>/runtime/drive.json`.
It holds each area's counter and, per file, `path`, `artifact_id`, `revision_id`, `sha256`, and
`size_bytes`. Nothing inside `drive/` is Haus bookkeeping.

The Agent uses `ls`, `cat`, `rg`, its edit tool, `mv`, and `rm`. There are no sync commands. D4
deletes `haus files pull` and `haus files push`, with their `.haus-artifacts.json` manifests and
`.haus-theirs` copies. The read commands that remain become `haus drive versions`,
`haus drive view --revision-id`, and `haus drive share`.

## Pull at turn start

When a turn starts and the Agent's machine is online, the machine pulls while the model works.

1. It calls `drive.changes` once with the folder's counters, then once more per incomplete page.
2. It skips a change whose revision the folder already has, which is the folder's own last push.
3. A file whose local bytes still match its recorded hash takes the new revision by atomic
   replace, or is removed for a delete. A move arrives as a delete and a put of the same artifact,
   and lands as a local rename.
4. A file the Agent changed locally keeps its bytes and its recorded base. The next push merges it
   on the Server, so a pull never makes a local conflict.
5. It records each area's counter once that area's changes are applied.

Files up to `driveEagerFetchMaxBytes` (8 MiB) download during the pull. Larger files become
placeholders (below).

Only a tool call on the machine waits for the pull. A `bash` or edit invocation that arrives during
the pull runs once the pull ends. The model's first response, Haus actions through `execute`, and
Drive reads through the Server never wait. An Agent whose machine is offline or unset pulls nothing.
A pull that fails leaves the folder as last pulled, and waiting calls run on it. The next turn
pulls again.

A folder's pull and push never overlap. A pull waits for the previous turn's push to finish.

## Large binaries on first use

A file over `driveEagerFetchMaxBytes` arrives as a placeholder. A placeholder is a symbolic link at
the file's path whose target is `haus-remote:<revision_id>`. `ls` lists it, `ls -l` shows the
target, and opening it fails until it is fetched.

Before a `bash` or edit invocation runs, the machine fetches every placeholder whose file name
appears in the command text or the edit path, and replaces each link with the file. A command that
reaches a placeholder without naming it, through a glob or a script, sees a missing file. Naming
the file fetches it. The fetch belongs to the invocation and happens after the invocation is
recorded as accepted, so it never makes a call run twice
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 7).

Replacing a placeholder with a real file is an edit. Removing it is a delete. An untouched
placeholder pushes nothing.

## Push after the turn

When a turn settles, the machine pushes the folder's changes under the turn's run id. That covers
a turn that replied, one that ended without a reply, and one that failed or was stopped, so an edit
is never stranded.

1. Walk regular files. Skip `.git`, `node_modules`, `__pycache__`, and `.DS_Store`, as
   `haus files push` does today. Symbolic links other than untouched placeholders are not Drive
   content and are skipped. An empty folder exists only locally.
2. Compare each file with its recorded hash, using size and modification time as a shortcut.
3. Send every delete, then every put ([Pushes](artifact-drive.md#pushes)). A changed file goes
   with its recorded revision as its base, and a new file goes with none. A missing file is a
   delete with its base. A rename is a delete plus an add, and the Server records it as a move when
   the bytes match.
4. Apply each outcome to the folder and the state file.
5. Close the push.

| Outcome | What the folder does |
| --- | --- |
| `committed`, `unchanged`, `deleted` | Records `current` |
| `merged` | Downloads the merged revision into place and records it |
| `kept_both` | Moves its own bytes to the copy path, writes `current` at the path, and records both |
| `kept_edit` | Writes `current` at the path and records it |
| `refused` | Moves its own bytes to `agents/<agent-id>/workspace/drive-refused/<path>` and restores the Drive state at the path |

A refused file leaves the folder, so the next push does not send it again and the conflict item
that names it cannot repeat every turn.

A push that cannot reach the Server changes nothing locally. The edits stay, the next pull keeps
them, and the next push sends them. A machine that crashes mid-push sends the rest in its next push
under the next run id, and the Server closes the old push then. Request ids derive from the push
id, path, hash, and base, so a request repeated after a lost answer gets the first outcome.

Changing an Agent's machine happens while the Agent is idle, after its last push
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 4).
Edits that a failed push left on the old machine stay there.

## Before the runner

Until the runner ships (R3 and R4), an Agent's loop runs on its Computer.

- Instruction composition and `MEMORY.md` delivery read the Agent's `drive/` folder (D3). They wait
  for the pull's first `drive.changes` answer, then only for the files they read that it names.
- Tool calls wait for the pull through the runtime driver's pre-tool hook. A runtime with no such
  hook waits for the whole pull before its harness starts. The same hook fetches placeholders.

After R4 the runner composes from the Server's current revisions
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision
10), and the machine pulls only for tool calls. The runtime contract (R1) names the message that
starts a machine's pull.

## Workers

A Worker on a Computer pulls when it launches and when each follow-up turn starts, and pushes after
each turn under its run id. Its revisions name the Worker as author, and its conflicts go to its
Agent's inbox. A cloud Worker has no folder
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md)).

## Regression guards

D2 and D4 add these guards.

| Contract | Guard |
| --- | --- |
| Two folders edit one text file on different lines, and both edits land in one merged revision | `apps/server/test/drive-push-merge.test.ts` |
| The same lines, or a binary, keep both versions and queue exactly one `drive_conflict` item per push | `apps/server/test/drive-push-conflict.test.ts` |
| A push that never closed is closed by the writer's next push, and its item queues once | `apps/server/test/drive-push-conflict.test.ts` |
| `drive.changes` from any counter returns exactly the paths changed since, tombstones included | `apps/server/test/drive-changes.test.ts` |
| A pull updates unedited files, keeps edited ones, and never blocks a turn that makes no tool call | `apps/computer/src/drive/pull.test.ts` |
| A placeholder is fetched before an invocation that names it, and never refetched on replay | `apps/computer/src/drive/placeholder.test.ts` |
| A push applies every outcome to the folder, and a refused file does not repeat | `apps/computer/src/drive/push.test.ts` |
