---
summary: Normative Drive contract. Drive is the Files drive extended with three areas (haus/, projects/<key>/, agents/<handle>/), revisions attributed to an Agent, Worker or person and a Task, a per-area change counter with a changes-since query, stale-base writes that merge clean text, pushes that keep both versions of a real conflict, citations by revision, retention, and the v1 Drive page. Paths, folders, compare-and-set writes, moves and batches carry over from Files.
read_when:
  - changing Drive (Files) paths, folders, listing, publish, move, delete, restore, or retention
  - changing Drive areas, who may write an area, or revision attribution (author, Task, base, parent)
  - changing the per-area change counter or the changes-since query (drive.changes)
  - changing the Server three-way merge, kept-both conflict copies, or the drive push routes
  - changing how a message cites a Drive file
  - changing the Drive page, History, Compare, or Restore
  - changing the artifact path rules in packages/haus-api/src/artifact-path.ts
---

# Drive

Drive holds what Agents know and follow
([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md)). It is the Files drive,
renamed and extended. The product noun is **Drive**. People see the App's Drive page, Agents use
`haus drive` and the `drive` Manual topic. Wire names keep `artifact`.

Drive is Server-hosted and canonical. Each Agent also keeps a plain `drive/` folder on its machine.
The folder pulls at turn start and pushes after the turn, and [Drive folder](drive-folder.md) owns
that half. There is no background process, no mount, and no continuous sync.

## What changes from Files

- Every path lives in one of three areas. Existing root paths move under `haus/`.
- Every revision records its author (an Agent, a Worker, or a person), its Task, its base, and its
  parent.
- Each area keeps a change counter, and `drive.changes` answers what changed since a counter.
- A write with a stale base merges when the text merges cleanly. Files refused it with
  `REVISION_CONFLICT`.
- A push from a machine keeps both versions of a real conflict and queues one `drive_conflict`
  inbox item.
- Write access decides who may delete, and a deleted file stays restorable for 30 days. Files
  purged a delete at once and limited it to the creator or a human Owner or Admin.
- Revisions up to 1 MiB are kept for the life of the file. Files expired every replaced revision
  after seven days.
- A message that cites a Drive file binds the citation to a revision.
- The Files page becomes the Drive page, with History, Compare, and Restore.

Unchanged are the path rules, folders as prefixes, listing, the head check under the Server row
lock, moves, batches, `request_id` idempotency, R2 object keys, `art_` links, and stable and
version URLs.

## Areas

```text
haus/AGENTS.md                                Haus rules
haus/…                                        team files
projects/<key>/AGENTS.md                      Project rules
projects/<key>/…                              Project docs
agents/<handle>/AGENTS.md                     the Agent's own rules
agents/<handle>/WORKER.md                     rules every Worker of this Agent reads
agents/<handle>/MEMORY.md                     capped memory (ADR 0052)
agents/<handle>/notes/ …                      the rest of its durable workspace
agents/<handle>/skills/                       its skills
agents/<handle>/reports/ renders/ handoffs/   Worker deliverables
```

An area is identified by `driveAreaIdSchema` (`packages/haus-api/src/drive.ts`). Its values are
`haus`, `project:<projectId>`, and `agent:<agentId>`. The folder name comes from the Project's key
or the Agent's handle, and the Server maps a path to its area by that prefix.

Every live path sits in an area. Its first segment is `haus`, `projects`, or `agents`. A path under
`projects/` names one of the Server's Projects by its key, archived and deleted ones included so
their files stay reachable, and a path under `agents/` names one of the Server's Agents, active or
retired. A key compares without case, and the folder takes the key's own spelling
(`projects/ops/a.md` lands as `projects/OPS/a.md`). A key no Project holds is `INVALID_PATH`
naming the key. No file sits directly in `projects/` or `agents/`. Any other path is
`INVALID_PATH`.

Creating a Project writes `projects/<key>/AGENTS.md`, a `# <name> rules` heading, as Haus, after
the create commits and never over a file already there (`seedProjectRules` in
`apps/server/src/projects/project-rules.ts`). Changing a Project's key moves its folder to
`projects/<new key>/` in the same transaction: paths only, deleted files included, with a delete
and a put in the Project's area for each live file, as a move records them.

A write stores the area prefix in its canonical spelling, so `HAUS/a.md` lands as `haus/a.md` and
`Agents/ORBIT/a.md` as `agents/orbit/a.md`. A handle compares without case. Handles are unique only
among active Agents, so `agents/<handle>/` names the active Agent with that handle, otherwise the
most recently retired one. `drive.changes` lists only that one area per handle, so once a handle
passes to a new Agent, the retired owner's change rows never reach a folder again. A folder move may start or end at an area root such as `haus`, but never
at `projects` or `agents` alone.

The rule and memory files are ordinary files. What reads them, and when, is ADR 0054 decisions 7
and 8 and [context management](../docs/features/context-management.md). The memory cap stays ADR
0052's.

Everyone reads every area. People write every area. An Agent writes `haus/`, every Project, and its
own `agents/<handle>/`. Another Agent's area is read-only to it, and a write there is `FORBIDDEN`.
A Worker writes what its Agent writes. Deleting needs write access to the file, and a move needs
it at both ends. A write is checked against the area when it reserves storage and again when its
upload lands, against the path the file has then. A file moved into an area the writer cannot write
while its bytes upload fails with `FORBIDDEN`, and a push answers `refused`. A push's area changes
owner only when a retired Agent's handle passes to a new Agent.

## Paths

Every artifact has one canonical drive `path`, such as `haus/starter-kit/scripts/tm_check.py`,
unique among the Server's live artifacts. Artifact and revision ids, R2 object keys
(`servers/<server>/artifacts/<artifact>/<revision>`), stable URLs, and `art_` links never change
when a path does. The metadata `filename` is the path's last segment.

`packages/haus-api/src/artifact-path.ts` owns the rules, and API validation, Server, CLI, and App
all use it:

- relative and `/`-separated: no leading or trailing `/`, no empty, `.`, or `..` segment;
- NFC-normalized on input (the only rewrite a path ever gets);
- no backslash and no C0, DEL, or C1 control character;
- at most 255 characters per segment and 1,024 in total;
- unique by key: `artifactPathKey` folds NFC and case, so `Docs/A.md` and `docs/a.md` collide;
- no live file may be a prefix-ancestor of another live path: `notes` and `notes/x.md` cannot both
  exist.

A new path adopts the stored casing of folders it lands in (`DOCS/b.md` beside `Docs/a.md` becomes
`Docs/b.md`), so one folder never lists under two spellings. Storage keeps `path` and `path_key`
with a unique index on `(server_id, path_key)` for live rows.

## Folders

A folder is a path prefix. There are no folder rows, so empty folders do not exist: a folder
appears while some live file sits under it and disappears with its last file.

`artifact.list` (and `GET /api/agent/artifacts`) takes `prefix` (`''` is the root). By default it
returns the folder's immediate child folders (`name`, `path`, `file_count`, `size_bytes`, `updated_at`; first
page only; newest `updated_at` first, path key breaking ties) and the folder's own files.
`recursive: true` returns every file under the prefix and no folders, which is the bulk-pull shape;
`order: 'path'` gives it a stable order. A recursive search (`query` set) also returns, on its first
page, up to 50 folders under the prefix whose own name matches, newest first. `order` also takes
`name` (the file name in natural order, `2` before `10`, through migration 0093's ICU collation
`artifact_natural`; equal names fall back to the path), `size`, and `kind` (content type, then
name), and `direction` (`asc`/`desc`) flips any of them; it defaults to newest first for
`updated` and ascending otherwise. Every order ends on the artifact id, so offset pages neither
repeat nor skip. `creator`, `kind`, and `query` (title or path) filter files, and folder counts
follow the same filters. Pages hold up to `limit` files (default 50, at
most 200) and report `next_offset`, null on the last page.

Every page carries `summary`, exact totals for the listed folder under the same filters and
independent of the page: `folders` (child folders), `files_in_folders` (files anywhere under them),
`files` (files directly in the folder), and `size_bytes` (every file under the folder). `recursive`
changes the listed files, not the summary.

## Revisions and attribution

Each revision records four facts.

- `author` is the writer. It is `{ type: 'agent', agent_id }`, `{ type: 'user', user_id }`,
  `{ type: 'worker', worker_id, agent_id }`, or `{ type: 'haus' }`. The Worker variant lands with
  Workers (W2). Haus is the author of the factory-managed skills it seeds into each Agent's
  area ([Skills](skills.md#managed-skills)) and of each new Project's `AGENTS.md`. A Haus revision
  stores author key `haus` with no Agent or person column, and a file Haus creates names an Agent
  or a person as its `creator`, so `creator` stays an Agent or a person for deployed CLIs: the
  Agent whose area holds a skill, and the person who created a Project for its `AGENTS.md`.
- `task_id` is the Task the write was for, or null. A push names its run, and the Server takes the
  Task from that run. That is the Task whose chat the run answered in, or the Task a
  `task_assignment` run carried. A Worker's write takes the Worker's Task. A person's write, and an
  Agent's write outside a push, carry no Task.
- `base_revision_id` is the revision the writer started from. It is null for a create and for a
  `replace`.
- `parent_revision_id` is the head the revision was committed on. It is null for a file's first
  revision.

A revision whose base is set and differs from its parent was merged. The writer comes from the caller's credential,
never from the request body. The Server sets every id, counter, and timestamp.

In `packages/haus-api`, `artifactAuthorSchema` widens `artifactCreatorSchema` with the Worker
variant, and `artifactRecordSchema` gains `task_id`, `base_revision_id`, and `parent_revision_id`.
`creator` still names who made the file. Agent artifact routes keep `artifactMetadataSchema` as it
is, because deployed CLIs parse it strictly.

## Change counter

Each area keeps one counter that starts at zero and only grows. Every committed change in the area
takes the next value. A new revision, a delete, and a restore are one change each. A move inside an
area is a delete at the old path and a put at the new one, so it takes two values. A move across
areas takes one value in each area, a delete in one and a put in the other. A batch takes what its
files would take one at a time, so a batch move of n files inside one area takes 2n values and a
batch delete takes n.

The Server keeps one change row per live or deleted path key in each area, holding the latest
sequence that touched it and its state. A delete leaves its row as a tombstone. Rows are never
pruned, so any counter, however old, has an exact answer. Change rows and counters commit in the
write's own transaction under the Server row lock, so no reader sees a counter without its changes.

`drive.changes` (tRPC for the App and the runner, `GET /api/agent/drive/changes` for machines)
answers what changed.

```ts
// packages/haus-api/src/drive.ts
driveChangesInput  = { serverId, since: Record<DriveAreaId, number>,
                       until?: Record<DriveAreaId, number> }
driveChangesResult = {
  areas:   { area: DriveAreaId, root: string, counter: number }[],
  until:   Record<DriveAreaId, number>,
  changes: { area: DriveAreaId, sequence: number, path: string, change: 'put' | 'delete',
             artifact_id: string, revision_id: string | null, sha256: string | null,
             size_bytes: number | null, content_type: string | null }[],
  complete: boolean,
}
```

An area missing from `since` reads from zero, and an area missing from a passed `until` returns
nothing until the next call. The Agent route takes `since` and `until` as JSON-encoded query
parameters, and bad JSON or a bad shape is 400 `INVALID_ARG`. `areas` lists every area with its current counter, so
a caller learns of a new Agent or Project from any call. Changes come in area order, then sequence
order, at most 1,000 per page. A call without `until` fixes it at each area's counter and returns
it. When `complete` is false, the caller applies the page and asks again from the last sequence it
applied in each area, passing the same `until`. Every page returns only changes at or below
`until`, so writes that land while a caller pages cannot keep it from finishing. Those writes come
in its next call. A delete carries null revision, hash, size, and type.

## Writes

A write names a `path`. A free path creates an artifact and needs no base. A free path whose base
names a file deleted since brings that file back with the written bytes. An occupied path adds a
revision only when:

- `base_revision_id` equals its current head, or
- `base_revision_id` is an older revision of the same file and the merge below succeeds, or
- `replace: true` deliberately overwrites whatever the head is (the App's Replace).

Anything else fails with 409 `REVISION_CONFLICT` whose `current` is the live head the write lost
to: the head of the artifact `base_revision_id` belongs to, wherever that artifact lives now (a
moved file reports its new path), otherwise the artifact at the path. `current` is null when
nothing has published there yet (a first upload still in flight, or a base that names no file this
Server ever held). A push never gets this error. It keeps both versions instead (below).

The head is checked twice: when the write reserves storage, before any bytes move, and again when
the upload lands. Reserve lets through any base that is an older revision of the file at the path,
because only the landed bytes can decide a merge. The second check runs under the same Server row
lock that serializes every artifact insert, move, and delete. Two writers from one base both upload. The first to land becomes the head, and the second
merges onto it or fails. A create whose only upload fails frees its path. `request_id` retries
return the first attempt's revision even after the head has moved; reusing a `request_id` for
another path, title, or content type fails with `IDEMPOTENCY_KEY_REUSED`.

Writes travel as raw bytes with query metadata: Agents through
`POST /api/agent/artifacts/publish-artifact-raw`, members through
`PUT /artifacts/:serverId/publish` with a Haus AppSession. Both take `path`, optional
`base_revision_id` or `replace=true`, `request_id`, and optional `title` (default: the file name)
and `content_type`. A write answers its revision as `{ artifact }`. Deployed CLIs and the App parse
that shape strictly, so a merge shows as a revision whose base differs from its parent, and as the
`merged` push outcome.

### Merging a stale base

The Server merges base, head, and the incoming bytes when all three are text. Text means valid
UTF-8 with no NUL byte and at most `artifactTextMaxBytes` (1 MiB), the same test `artifact.text`
uses. A line ends after its `\n`, so a `\r` stays part of its line and a missing final newline
changes the last line. Changed regions that overlap or touch conflict, as `git merge-file` decides.
The same change made on both sides is not a conflict. Each side's diff is git's Myers diff
(`xdiff`), with its linear-space split, cost cutoffs, line cleanup, and change compaction, so hunks
stay separate at any size up to the text limit, and a change inside a run of equal lines lands at the
same place on both sides.

A clean merge commits the merged bytes as a new revision. Its author is the writer, its base is the
stated base, and its parent is the head. The merge runs under the row lock against the head the
lock sees, so no commit can land between the merge and its own commit.

A merge fails when the regions conflict, when any of the three is not text, or when the base
revision is gone. An edit always beats a delete. A write onto a file deleted since its base brings
the file back with the written bytes, and a delete of a file changed since its base leaves it in
place.

## Pushes

A machine sends one turn's changes as one push. The push id is the run id from the turn's start
frame (`runId`). The Server takes the Agent and the Task from that run, so the machine names
neither. A Worker's push uses its own run's id (W2).

The push routes take any live runner credential of the pushing Agent, because the run's own
credential ends when its turn settles and the push runs after that. `push_id` must name a run the
Server dispatched to that Agent, otherwise the request fails with 404 `NOT_FOUND`. The push's Task
is the Task whose chat the run answered in, or for a Task assignment run, the Task of the
assignment that led it.

| Route (Agent API) | Input |
| --- | --- |
| `POST /api/agent/drive/push/put` | Raw bytes; query `push_id`, `path`, `request_id`, optional `base_revision_id`, `content_type` |
| `POST /api/agent/drive/push/delete` | JSON `push_id`, `path`, `base_revision_id`, `request_id` |
| `POST /api/agent/drive/push/close` | JSON `push_id`; answers `{ listed }`, the files the conflict item lists |

Each put or delete answers one `drivePushOutcomeSchema` (`packages/haus-api/src/drive.ts`). Every
outcome carries `current`, the revision now at the path with its author. When nothing is live at
the path, as after a refused create, `current` is an explicit null. Drive never invents a revision
or an author to fill it.

| Outcome | When | What Drive holds after |
| --- | --- | --- |
| `committed` | The base is the head, or the path was free | The incoming bytes as the head |
| `merged` | A stale base merged cleanly | The merged bytes as the head |
| `unchanged` | The bytes equal the head | The head, untouched |
| `deleted` | A delete whose base is the head | A tombstone |
| `kept_both` | A put whose merge failed, or a create at a path someone else filled | The other version at the path, and the incoming bytes in a copy |
| `kept_edit` | An edit met a delete, on either side | The edited file, live at its path |
| `refused` | Path rules, area write access, a file and folder clash, size, content type, or a run a full reset replaced (`AGENT_RESET`) | Nothing new |

The path rules apply after the request parses, so a bad path is a `refused` outcome, not a 400.
A clean merge whose result equals the head answers `unchanged`. A create at a filled path, or a base
that names a different file than the one at the path, keeps both with reason `both_created`. A put
whose base names a file that moved to another path since, with nothing at the pushed path, keeps
both with reason `base_gone`: the moved file stays as it is, `current` names it at its new path,
and the incoming bytes land in a copy beside the pushed path, so an edit made during a person's
move never silently splits the file in two. A delete onto a path that holds
another file than its base's leaves that file alone and answers `deleted` with it as `current`. A
delete onto a path where nothing is live answers `deleted`. So does a delete whose path spells the
live file differently, as the old half of a case-only rename does: it matches the path key but not
the canonical spelling, so it deletes nothing and answers with no `current`. A transient failure, such as storage
being unavailable, the storage budget being exhausted (`STORAGE_LIMIT`), or a duplicate request
still uploading, answers an error and stores nothing, so the machine sends the file again. A stored
`STORAGE_LIMIT` refusal would outlive the shortage, because the same bytes keep the same
`request_id`.

A copy is named `<stem>.conflict-<handle>.<ext>`, splitting the file name at its last dot. A name
with no dot, or only a leading dot, takes the suffix at its end, so `.env` becomes
`.env.conflict-blippy`. The handle is the pushing Agent's, or the Worker's Agent's. A taken copy
name takes `-2`, then `-3`, before the extension. A copy name that would break the path rules, such
as a file name pushed past 255 characters, refuses the put with `INVALID_PATH`, and the item lists
it. The copy is an ordinary new file in the same
folder, authored by the writer with the push's Task, with no base and no parent. It takes over the
object the push uploaded, so its R2 key keeps the prefix of the file the push first wrote to. It is
resolved by merging into the original and deleting the copy.

A machine sends deletes before puts, so a case-only rename frees its path key first. A rename is a
delete plus an add. The added file is a new file, and History does not follow it yet.

`request_id` derives from the change, never the run. It hashes the writer, the path, the base
revision, and the content hash (null for a delete). A create has no base, so it hashes the area
counter the folder had pulled in its place, so recreating a deleted file with the same bytes is a
new request. A lost create replayed after a later pull finds the folder already recorded the file,
and sends nothing. A request repeated after a lost answer, even under a
later push, returns the stored outcome. It never makes a second copy or a second `drive_conflict`
item, and it succeeds even after the push it first belonged to has closed.

Each outcome stores the request it answered: put or delete, the path key, the base revision, the
content type, and for a put the sha256 of the body. A `request_id` reused for a different request
fails with 409 `IDEMPOTENCY_KEY_REUSED` and stores nothing. A replay's metadata is compared first,
before its body is read. Only a put whose metadata matches reads its body, and only to hash it. A
put refused before its body was read, such as one with a bad path, stores no body hash, so its
replay answers without reading the body. A fresh put hashes its body in the same pass that uploads
it.

The Server records each file's outcome under the push id. A push closes on `close`, or when the
same writer opens its next push, so a machine that crashed mid-push still reaches the Agent.
A full reset increments the Agent's `reset_generation` under the Server lock. Each dispatched run
records the generation it was dispatched in (`agent_run_triggers.reset_generation`), a dispatched
Worker turn records its Agent's (`worker_turns.reset_generation`), and its push copies it (`drive_pushes.reset_generation`). A put or delete under a push whose generation is not
the Agent's current one is refused with `AGENT_RESET`, so a turn the reset interrupted cannot
revive a deleted file or add one to the reseeded area. The comparison is by counter, not by time,
because a transaction's `now()` is its start, not the moment it took the lock. Those refusals stay out of the push's
`drive_conflict` item. Closing twice changes nothing. A new request for a closed push fails with `PUSH_CLOSED`, and the
machine sends that file in its next push. On close, a push with any `kept_both`, `kept_edit`, or
`refused` outcome queues one `drive_conflict` item ([Agent inbox](inbox.md)). A Worker's item goes
to its Agent.

## Citations

A message cites a Drive file with a typed link, `[label](drive://<path>)`, which people insert from
the composer and Agents write. At send, the Server resolves the path and stores a citation with the
message. In `packages/haus-api`, the message gains `driveCitations: { path, artifactId, revisionId
}[]`. The chip opens the cited revision, and the viewer offers the latest when a newer revision
exists.

An Agent cites files its turn wrote, and the push runs after the turn. The Server binds the
citation to the head at send time. When the sending run's push closes, each citation whose path
that push changed moves to the revision the push left. When the push kept both versions, the
citation moves to the writer's own copy, because the copy holds what the Agent meant. A path that
does not exist at send has null ids until the push creates it. A citation that never resolves renders its label as plain text.
The Server reads links in order with the GFM parse the App renders with
(`readMarkdownSpans` in `packages/haus-api`, on `mdast-util-from-markdown` with GFM), so links inside code
and images never cite, and titles, `<…>` destinations and escapes read as Markdown reads them. It percent-decodes each
path, ignores one that is malformed or breaks the path rules, keeps each path once by its key, and
reads at most 100 per message. A kept-both rebind moves the ids to the copy and keeps the path as the
link wrote it. Citations keep artifact and revision ids, so they survive moves. A citation whose revision was
purged opens the current revision and says the cited one is gone. Attachments stay as they are.

## Retention

The current revision is always kept. A replaced revision up to `artifactTextMaxBytes` is kept for
the life of the file, so rule and memory history never expires. A larger replaced revision is
deleted seven days after a newer revision took its place (`ARTIFACT_REVISION_RETENTION_DAYS`), and
only while the file is live. A deleted file keeps every revision, large replaced ones included, for
30 days (`driveDeletedRetentionDays`), then its revisions are purged and its tombstone stays.
Every soft delete (a single delete, `deleteMany`, a push delete, and a full reset's area delete)
records `artifacts.deleted_by`, the deleter's author key (`agent:<id>`, `user:<id>`, or `worker:<id>` for a Worker's push, as
its revisions are keyed), and a revive or restore clears it. `artifact.listDeleted` returns it as `deleted_by`, an author or null
for files deleted before the column existed.
`delete-artifact-version` still removes one non-current revision at once. A delete also turns off
the file's public link, so a restore never re-exposes a link the delete ended.
`artifact.restore` on a deleted file's revision brings the file back at its last path on top of its
last head, or fails with `PATH_TAKEN` when another file lives there now. A restore never merges. It
lands only while the head it read is still the head; a restore that races another write fails with
`REVISION_CONFLICT`.

## Moves

`artifact.move` (and `POST /api/agent/artifacts/move`) takes `{ from, to }`. When `from` is a live
file it moves that file; otherwise it moves every live file under the `from` folder. One
transaction rewrites only paths. The destination must be free: no other file at `to` and no files
that stay behind under `to` (`PATH_TAKEN`); `to` may not sit inside `from`, under a live file, or
on a folder when moving a file (`PATH_CONFLICT`). Case-only renames are allowed.

A single-file move accepts an optional `base_revision_id` that must equal the head. A folder move
takes none (`INVALID_ARG`): it touches no bytes, and a client writing to an old path afterwards
gets `REVISION_CONFLICT` naming each file's new path, so per-file checks add nothing. A move needs
write access at both ends. Deletion needs write access to the file.

## Batches

A selection acts in one request per action, at most `artifactBatchMaxItems` (1,000) items
(`packages/haus-api/src/artifact-batch.ts`):

- `artifact.moveMany` (`{ items: [{ path, base_revision_id? }], to_folder }`) moves every item into
  one folder, keeping its name, in one transaction under the Server row lock: each item follows the
  single-move rules above, and the first refusal rolls the whole batch back. An item already in
  `to_folder` stays put; an item inside another selected folder travels with it; two items with
  one name are `PATH_TAKEN` before anything moves. The result lists each item's `from` and `to`
  plus `moved_count` (files whose path changed).
- `artifact.deleteMany` (`{ artifact_ids }`) deletes, in one transaction, every named file the
  caller may write and reports `deleted`, `forbidden` (left in place), and `missing` (already gone
  or never here). A file still taking an upload refuses the batch (`UPLOAD_CONFLICT`). Revisions
  stay restorable under the retention rules above.
- `artifact.zip` plans a zip download of paths under one root ([Files](../docs/api/artifacts.md#zip-downloads)).

Each committed move or delete batch announces one `artifact.onUpdated` with a null id.

## Drive page

The v1 Drive page replaces the Files page and keeps its library, viewer, and actions.

- The root lists three folders, Haus, Projects, and Agents. Agents holds one folder per Agent.
- The list layout (the default) draws folders and files alike as one-line rows under Name,
  Updated by, Modified, and Size; the grid draws folder and file tiles. A footer counts the open
  folder's files and bytes. One Filter button holds the file type and Created by choices; where
  only fixed places stand (the root and its shelves), the band leaves it out. A plain click opens a
  folder or file; Command- and Shift-click select.
- The root and its shelves are full-width lists under a hairline, with Search, Filter, and the
  layout on the band. Inside an area (Haus, a Project, an Agent) every folder and file opens in one
  split workspace: the area's tree on the left (from a medium width), and on the right the open
  folder's list or the open file. The tree stays mounted and keeps what is unfolded, per area,
  while you move between them; it highlights the open folder or file. URLs are unchanged
  (`?folder=` for a folder, `/artifacts/<id>?in=` for a file).
- Inside the workspace the band is only the trail, stopping at the area, and reads the same for a
  folder and a file. A slim path row over the right pane owns the rest of the path, from All
  files down; its folder crumbs take dropped library items. A folder's path row carries its
  controls: Filter, list or grid, and Upload. An empty folder with no filter set shows none of
  them, since its empty state offers the same.
- The tree's header reads All files, with New file, Upload, and one Expand all / Collapse all
  toggle (only when the area has folders). Its filter over names and paths is the area's search
  and covers the whole area. Pressing a folder opens and unfolds it; pressing a file opens it.
  An empty area's tree says nothing; the right pane owns the empty state.
- New file writes `untitled.md` (then `untitled-2.md`, …) into the open folder, or the open file's
  folder, and opens it with the cursor in the document.
- An empty area root shows the mascot with Add instructions, which writes the area's `AGENTS.md`
  and opens it, New file, and Upload.
- A file's path row has the area's glyph and crumbs, then View source, History, Copy (a text
  file's contents, in one click), Download, Save (only while edits are unsaved), and ⋯ File
  options, which holds the links and the path to copy; Previous and Next show only while the tree
  is hidden. Text and Markdown read as an unframed centered column on the app's type scale and edit
  in place. Markdown edits as rendered text only when the editor writes the file back byte for
  byte; otherwise it renders read-only and View source edits it. Plain text edits as source. A
  pinned `?revision=` is read-only. Unsaved edits stay in the App's draft store across navigation,
  and ⌘S saves. An image sits on the pane's canvas with its size and bytes under it.
- History and Details are tabs of the viewer's side panel (`#revisions`, `#details`). Each
  History row opens its revision, names the author (an Agent, a Worker with its Agent, or a
  person), links the Task, and marks a merged revision and the one on screen.
- Compare renders any two revisions of a text file with `@pierre/diffs` from two `artifact.text`
  reads, so it needs no Server work. It opens on a revision against its parent. A revision that is
  not text offers no Compare.
- Restore publishes an older revision as the new head through `artifact.restore`, unchanged. Each
  folder's menu offers Recently deleted, which lists the folder's deleted files from the last 30
  days (`artifact.listDeleted`) with Restore.
- A person's save carries its base. A failed merge refuses the save and opens Compare between the
  person's text and `current`, because the person is there to resolve it.
- The Agent page links the Agent's `AGENTS.md`, `WORKER.md`, and `MEMORY.md`, and a Project's
  settings page links its `AGENTS.md` (its folder when the file is missing).

The page stays live through `artifact.onUpdated`. Drive adds no subscription, and machines
subscribe to nothing.

## Errors

Agent routes answer `{ code, message }`, plus `current` for `REVISION_CONFLICT`. tRPC errors carry
`data.artifact = { code, current }`. Path-shaped input errors are 400 `INVALID_PATH` on the Agent
API and `BAD_REQUEST` on tRPC. Codes: `INVALID_ARG`, `INVALID_PATH`, `NOT_FOUND`,
`UNAUTHORIZED`, `FORBIDDEN`, `REVISION_CONFLICT`, `PATH_TAKEN`, `PATH_CONFLICT`,
`IDEMPOTENCY_KEY_REUSED`, `UPLOAD_CONFLICT`, `DELETED`, `CURRENT_REVISION`, `CONTENT_TYPE`,
`SIZE_LIMIT`, `STORAGE_LIMIT`, `STORAGE_UNAVAILABLE`, `AUTH_UNAVAILABLE`, `PUSH_CLOSED`,
`AGENT_RESET`.

## Migration

Migration `0087_artifact-paths` backfills every artifact's path from its former `name` plus its
current revision's filename extension (letters, digits, `_+-`, at most 16 characters): `report` +
`q4.pdf` becomes `report.pdf`. Live rows take the first free of `report.pdf`, `report-2.pdf`… in
creation order, compared by the folded key. The `name` column, its index, and the create-only name
contract are gone; the path is the identity.

The Drive migration (D2, `0129_drive`) prefixes every path with `haus/`, deleted rows included, so `starter-kit/scripts/tm_check.py`
becomes `haus/starter-kit/scripts/tm_check.py`. It rewrites paths only, like a move, and starts each
area's counter at the number of its files. Moving Agent workspaces into `agents/<handle>/` is D3,
which writes each file as the Agent that owned the workspace, with no Task. R4d-4 retired D3's
launch-time run; the Server now seeds a new Agent's factory files (starter `MEMORY.md`, `AGENTS.md`,
`WORKER.md` and managed skills) as Haus revisions when the Agent is created
([workspace.md](workspace.md#the-seed-at-creation)). D3 wrote a fresh Agent's
factory seed the same way, never over a path Drive already holds, and derives each `request_id` as
the SHA-256 of `drive-migration`, the Agent id, the start frame's run id, the Drive path and the
content hash (NUL-separated). Unlike a push, the id names the run: a relaunch of the same run gets
its own answers back, and the next run makes a fresh attempt, so a reservation that failed or a
revision since deleted cannot fail every later launch. A fresh attempt over equal bytes answers a
conflict whose head matches, which counts as stored. A legacy file over other bytes keeps both
with the copy name from [Pushes](#pushes), and a refused one moves to `drive-refused/` as a refused
push does ([workspace](workspace.md#migration)).

## Deferred

- Fetching large files on first use. v1 pulls every changed file in full.
- History that follows a rename. v1 records a rename as a delete plus an add.
- Held mass deletes and the "Loaded before the first message" token panel.

## Out of scope

Mounts, continuous sync, background watchers, empty folders, private folders, and a personal rules
layer.
