---
summary: The machine half of Drive. Each Agent keeps its own plain drive/ folder on its machine (and each Worker on a Computer keeps one), pulled at turn start while the turn runs and pushed after every turn with the revision each file started from. Covers what waits for the pull, how a failed pull stays safe, how push outcomes land in the folder, and how the Computer pulls before the turn until the runner ships.
read_when:
  - changing the drive/ folder on a Computer, its layout, its location, or its state file
  - changing turn-start pull, what waits for it, or what a failed pull leaves behind
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

1. It calls `drive.changes` with the folder's counters, then once per further page under the
   first page's `until` ([Change counter](artifact-drive.md#change-counter)).
2. It skips a change whose revision the folder already records.
3. A file whose local bytes still match its record takes the new revision by atomic replace, or is
   removed for a delete. A local file with no record whose bytes equal the incoming revision is
   recorded as that revision.
4. A file the Agent changed locally keeps its bytes and its recorded base. The next push merges it
   on the Server, so a pull never makes a local conflict.
5. Each file's bytes and its record are written together, one file at a time. The area counters
   advance only after the whole pull finishes.

The pull downloads every changed file, whatever its size. Fetching large files on first use is
deferred.

Only a tool call on the machine waits for the pull. A `bash` or edit invocation that arrives during
the pull runs once the pull ends. The model's first response, Haus actions through `execute`, and
Drive reads through the Server never wait. An Agent whose machine is offline or unset pulls nothing.

A pull that fails leaves every file it already applied correctly recorded, and waiting calls run on
the folder as it stands. Its counters did not advance, so the next pull asks again from the same
point and skips what is already recorded. A file it never reached keeps its old bytes and base. The
push is safe at any point of a failed pull, because every file's base names the bytes the folder
holds.

A folder's pull and push never overlap. A pull waits for the previous turn's push to finish.

## Push after the turn

When a turn settles, the machine pushes the folder's changes under the turn's run id. That covers
a turn that replied, one that ended without a reply, and one that failed or was stopped, so an edit
is never stranded.

1. Walk regular files. Skip `.git`, `node_modules`, `__pycache__`, and `.DS_Store`, as
   `haus files push` does today. Symbolic links are not Drive content and are skipped. An empty
   folder exists only locally.
2. Compare each file with its record, using size and modification time as a shortcut.
3. Send every delete, then every put ([Pushes](artifact-drive.md#pushes)). A changed file goes
   with its recorded revision as its base, and a new file goes with none. A missing file is a
   delete with its base. A rename is a delete plus an add.
4. Apply each outcome to the folder and its record.
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
under the next run id, and the Server closes the old push then. Each request id derives from the
change itself, not the run ([Pushes](artifact-drive.md#pushes)). So a request repeated after a lost
answer gets the stored outcome, and never a second copy or a second conflict item.

Changing an Agent's machine happens while the Agent is idle, after its last push
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 4).
Edits that a failed push left on the old machine stay there.

## Before the runner

Until the runner ships (R3 and R4), an Agent's loop runs on its Computer. The Computer finishes the
pull before the turn starts, then composes the instructions and delivers `MEMORY.md` from the
folder (D3). That is one `drive.changes` round trip, and it is usually empty.

After R4 the runner composes from the Server's current revisions
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision
10), and only machine tool calls wait for the pull. The runtime contract (R1) names the message that
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
| A replayed request returns its stored outcome, even after its push closed, and makes no second copy or item | `apps/server/test/drive-push-replay.test.ts` |
| `drive.changes` from any counter returns exactly the paths changed since, tombstones included, and finishes under continuous writes | `apps/server/test/drive-changes.test.ts` |
| A pull updates unedited files, keeps edited ones, and a pull that fails midway leaves a folder that pushes correctly | `apps/computer/src/drive/pull.test.ts` |
| A push applies every outcome to the folder, and a refused file does not repeat | `apps/computer/src/drive/push.test.ts` |
