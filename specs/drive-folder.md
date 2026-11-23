---
summary: The machine half of Drive. Each Agent keeps its own plain drive/ folder on its machine (and each Worker on a Computer keeps one), pulled at turn start while the turn runs and pushed after every turn with the revision each file started from. Covers what waits for the pull, how a failed pull stays safe, how push outcomes land in the folder, and how the Computer pulls before the turn until the runner ships.
read_when:
  - changing the drive/ folder on a Computer, its layout, its location, or its state file
  - changing turn-start pull, what waits for it, or what a failed pull leaves behind
  - changing the push after a turn, deletes, renames, or how a machine applies push outcomes
  - changing how instruction composition, MEMORY.md delivery, or rule delivery reads the drive/ folder before the runner
  - retiring or replacing haus files pull and push
  - changing a Worker's drive/ folder on a Computer, its pull, or its daemon push
---

# Drive folder

[Drive](artifact-drive.md) is canonical on the Server. This spec is the machine's copy. The folder is
plain files that the Agent works on with native commands. It changes at two moments, a pull when a
turn starts and a push after the turn settles. Nothing runs between turns.

## One folder per writer

Each Agent keeps its own `drive/` folder in its working directory on its machine
(`agents/<agent-id>/workspace/drive/`, per [workspace](workspace.md)). Each Worker on a Computer
keeps its own folder outside its checkout, at `servers/<serverId>/workers/<worker-id>/drive/`
([Workers](workers.md#layout)). Two writers
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
It holds each area's counter and root, the id of a push that has not closed yet, the last revision
of each path whose record was dropped, and, per file, `path`, `artifact_id`, `revision_id`,
`sha256`, `size_bytes`, and the `mtime_ms` the file had when it was recorded. Downloads land in `runtime/drive-scratch/` and move into place by rename. Nothing
inside `drive/` is Haus bookkeeping. A `drive.json` whose `drive/` folder is gone, as after a full
reset that clears the workspace, is replaced with empty bookkeeping the moment the Computer sees it,
so a folder that reappears never pushes deletes from stale records. A file name in decomposed
Unicode is renamed to its NFC form, the form Drive paths take.
`apps/computer/src/drive/` owns the folder on a Computer. A runner-hosted Agent works in Drive
through the runner, and the Computer syncs a machine folder for invocations and Workers
([Drive folder](runtime-drivers.md#drive-folder)).

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
5. Each file's bytes and its record are written together, one file at a time, bytes first. The
   area counters advance only after the whole pull finishes.
6. A local folder where Drive has a file, or a local file where Drive has a folder, blocks only
   that change. The pull applies the rest and holds the counters, so the change comes again once
   the push has moved the blocking path out.

The pull downloads every changed file, whatever its size. Fetching large files on first use is
deferred.

A pull that fails is logged as a warning and the turn runs.

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
   `haus files push` did. Symbolic links are not Drive content and are skipped. An empty
   folder exists only locally.
2. Compare each file with its record, using size and modification time as a shortcut.
3. Send every delete, then every put, each in path order
   ([Pushes](artifact-drive.md#pushes)). A changed file goes with its recorded revision as its
   base, and a new file goes with none. A missing file is a delete with its base. A rename is a
   delete plus an add. A file whose bytes still equal its record sends nothing.
4. Apply each outcome to the folder and its record.
5. Close the push.

A push with nothing to send makes no request at all, so a turn that left `drive/` alone costs no
Server round trip. A push that has something to send mints its own runner credential for the
turn's run and revokes it after the close, because a Stop revokes the run's own credential. The
request id is `dp_` and the first 48 hex characters of the SHA-256 of the writer's Agent id, the
path, the base revision (or, for a create, `<area>@<counter>:<last dropped revision>`), and the
content hash. The dropped revision keeps a re-create distinct even while a counter cannot advance.
A create's request id is stored in `drive.json` when it is first sent and reused until the create
resolves, so a create whose answer was lost replays its stored outcome after a pull moved the
counter, instead of making a second copy. A pull that sees a revision equal to a pending create's
bytes records it as the file's base.

A pull that keeps a locally edited file notes the newer revision it skipped. After that file's
push outcome is applied, the folder reads the path's current head and moves to it when it differs,
because a replayed stored outcome can name a revision older than one the pull already passed.

Outcomes apply under Drive's spelling of the path. A delete's outcome never touches a file that
only folds to its path, such as the renamed half of a case-only rename, so an edit made under the
new spelling reaches Drive as its own put or as a conflict copy.

A delete removes only a file whose name matches the path exactly, so the delete half of a
case-only rename on a case-insensitive disk never removes the renamed file, and a folder that
replaced a file stays. A request that fails for that one file, a local file error or a 4xx answer
other than `PUSH_CLOSED` or 401, is logged and skipped, and the rest of the push goes on. A
network failure, a 5xx, or a 401 stops the push. A full Drive answers 507 `STORAGE_LIMIT`,
which stops the push like `STORAGE_UNAVAILABLE`, so the edit stays and the next push sends it. A
409 `IDEMPOTENCY_KEY_REUSED` on a create drops its stored request id, so the next push sends the
create under a fresh one. A push whose run already sent everything still
closes on a relaunch. One Computer process runs a folder's pulls and pushes one at a time.

| Outcome | What the folder does |
| --- | --- |
| `committed`, `unchanged`, `deleted` | Records `current` |
| `merged` | Downloads the merged revision into place and records it |
| `kept_both` | Moves its own bytes to the copy path, writes `current` at the path, and records both |
| `kept_edit` | Writes `current` at the path and records it |
| `refused` | Moves its own bytes to `agents/<agent-id>/workspace/drive-refused/<path>` and restores the Drive state at the path |

A refused file leaves the folder, so the next push does not send it again and the conflict item
that names it cannot repeat every turn. Any download an outcome needs happens before the writer's
own bytes move aside, so a download that fails leaves the folder as it was, and the next push
replays the stored outcome. The writer's bytes are hard-linked aside and then the current version
is renamed over the path, so the path is never empty at any crash point. A refused path that
already has a different refused copy takes the next free `.2`, `.3` suffix.

A push that cannot reach the Server changes nothing locally. The edits stay, the next pull keeps
them, and the next push sends them. A machine that crashes mid-push sends the rest in its next push
under the next run id. The folder records the open push id, so that next push closes the old push
first and its conflict item queues without waiting. Each request id derives from the
change itself, not the run ([Pushes](artifact-drive.md#pushes)). So a request repeated after a lost
answer gets the stored outcome, and never a second copy or a second conflict item.

## When the Machine changes

An Agent's Machine changes between turns
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)
decision 7, [ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md#amendment-2026-11-23-drive-on-a-machine-change)).
The Server keeps the request in `agent_machine_changes` and moves it a step at a time
(`apps/server/src/agent-machine/advance-machine-change.ts`):

1. **Turn.** It waits while the Agent has an active run. No new run starts while the change can
   move, so the next turn runs on the new Machine.
2. **Flush.** With the old Machine online it sends `drive-flush` with a fresh flush id. The
   Computer pushes the folder under that id and closes the push even when nothing changed
   (`flushDriveForRun`), and the close is what tells the Server the folder reached Drive. The
   change switches only then. A flush that has not closed in two minutes, or whose Machine
   reconnects, is sent again under a new id. Conflicts follow the ordinary push rules.
3. **Old Machine offline.** The person waits, and the Agent keeps working with no Machine to sync
   until the old one reconnects and flushes; or they move from the last synced revision, which
   switches at once and leaves unpushed edits in the old folder, unmerged. Removing a Device moves
   its Agents this way.
4. **Switch.** `agents.computer_id` changes and `agents.placement_generation` goes up by one. A
   run records its generation in `agent_run_triggers`, a push in `drive_pushes`, and a push opened
   for a run of an older generation is refused `AGENT_MOVED`, like a push from before a full reset.
   The old Machine can no longer mint a drive-sync credential, because that needs the Agent's
   Machine.
5. **Pull.** The new Machine's first turn pulls into an empty folder.

**Moving back to a Mac that still holds a folder.** Every sync frame carries the placement
generation, and the Computer records the generation its folder belongs to in
`agents/<agent-id>/runtime/drive-placement.json` (none means 0). A frame from an older generation
is stale and does nothing. A newer one means the Agent left and came back: the Computer moves the
old folder to `workspace/drive-before-move/placement-<old>-<time>/` for recovery, forgets its
bookkeeping, and pulls a full copy from the Server, so nothing from that folder is pushed
(`apps/computer/src/drive/folder-placement.ts`). Haus never merges a folder it left behind.

## Before the runner

This section is history. Every Agent now runs on the runner, which composes instructions and
delivers `MEMORY.md` and the rule layers `haus/AGENTS.md` and `agents/<handle>/AGENTS.md` from
Drive ([Runtime drivers](runtime-drivers.md)). The Computer's launch no longer pulls, composes, or
migrates. It answers `drive-pull` and `drive-push` frames and clears the folder on a full reset. What
follows is the migration the Computer ran at launch before R4d-4.

D3 ran first at launch: it moved a legacy workspace into the Agent's area, or seeds a fresh one
([workspace](workspace.md#migration)), and places those files in the folder with no record in
`runtime/drive.json`. Pull step 3 adopts them: a local file with no record whose bytes equal the
incoming revision is recorded as that revision, so the first pull downloads nothing it placed.

A legacy file that met other bytes in Drive is placed only as its `.conflict-<handle>` copy; the
original path is left empty in the folder, and the first pull fetches Drive's head there. A legacy
file Drive refused moves to `agents/<agent-id>/workspace/drive-refused/<path>`, the same place a
refused push uses. Full reset clears `drive/` after the Server deleted the Agent's area, keeps
`drive-refused/`, and until the migration receipt exists it keeps the legacy sources too, so the
next launch can still move them. A turn the full reset interrupts skips its push, a push already in
flight is aborted before its next request, and the reset clears `drive/` only after that push settles.

After R4 the runner composes from the Server's current revisions
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision
10), and only machine tool calls wait for the pull. The runtime contract (R1) names the message that
starts a machine's pull.

## Workers

A Worker on a Computer keeps its own folder, with its bookkeeping in that Worker's
`runtime/drive.json` and refused files in its `drive-refused/`
([Workers](workers.md#layout)). The folder's writer is the delegating Agent, so it reads and
writes exactly what that Agent does. Each revision it pushes names the Worker as author with its
Task, and its conflicts go to the Agent's inbox as `drive_conflict` naming the Worker.

- **Seeded, then a full listing.** A new Worker folder first seeds from the freshest other Worker
  folder in its Server's partition on the machine, the one with the highest change counters. Under
  that folder's sync lock the Computer copies each recorded file to scratch, keeps only a copy whose
  bytes hash to the file's record, places it with this writer's read-only rule, and carries that
  record. An unpushed edit, a pending create, or a missing file never matches its record, so it is
  never copied, and another writer's edits cannot leak in. The seed lands in a staging folder, its
  records are written, and only then is the folder renamed into place, so a crash in between
  leaves records with no folder, which the next pull discards as orphaned. The folder's counters stay at zero, so its
  first pull still lists every path's latest change and tombstone, and downloads only what the seed
  did not hold or what changed since. A folder that already exists is never seeded, and with no
  sibling the first pull is a full one.
- **Pull before launch.** Each turn pulls after its checkout is ready and before the harness
  starts, with the turn credential, so the Worker's first tool call sees the pulled folder.
- **Daemon push.** When the harness process ends, the daemon pushes under the turn id with a push
  credential it mints itself, which never enters the harness environment, then closes the push
  before it reports the turn ended. A Worker push never closes the Agent's own run push or another
  Worker's, because open pushes are keyed by source (`drive_pushes.worker_id`).
- **Push before end.** A push that cannot finish, from a network failure, a 5xx or 401, or a
  failed mint, leaves the turn `pushing` and sends no end. The Computer keeps the turn and pushes
  again under the same turn id after 5 seconds, 30 seconds, 2 minutes, then every 10 minutes, and
  a connect, restart, or `worker-stop` pushes at once. The first push that finishes ends the turn.
  `worker-close` and shutdown cancel the wait and leave the turn for the next connect or restart. A per-file `refused` outcome is a result, not a
  failure, and does not hold the end. A refused mint means the turn is no longer this Computer's,
  so the turn ends without a push. `worker-close` leaves a Worker whose turn is `pushing` in place,
  and the next `worker-held` round closes it.

A cloud Worker has no folder ([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md)).

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
| Two folders editing one file merge different lines and keep both versions of the same line | `apps/computer/src/drive/two-writers.test.ts` |
| `drive-pull` and `drive-push` frames sync the Agent folder under a run credential the Computer mints | `apps/computer/src/drive/drive-sync-frames.test.ts` |
| A push for a folder a full reset discarded sends nothing | `apps/computer/src/drive/drive-sync-frames.test.ts` |
| Full reset deletes the Agent's area, restorable from Recently deleted, and session reset leaves it | `apps/server/test/agent-full-reset-drive.test.ts` |
| Two Computer folders sync through the real Server routes: create, pull, merge, kept-both, refused | `apps/server/test/drive-folder-sync.test.ts` |
| A start frame's `driveConflict` renders as the whole turn input | `apps/runner/src/turn/turn-input.test.ts` |
