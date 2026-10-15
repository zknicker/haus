---
summary: "Files, the Server-wide shared files (wire name: artifacts), with immutable revisions, explicit publication, and bounded Computer caching."
read_when:
  - "changing Files (the shared artifact library), media or text previews, or revision viewer"
  - "changing shared artifact APIs, revision storage, `haus files`, or Agent file sharing"
  - "changing shared file caching or R2 authorization"
  - "changing shared artifact paths, folders, or compare-and-set writes (see specs/artifact-drive.md)"
---

# Files

Files is the product noun for the Server-wide shared files: the App's Files section and the Agent
CLI's `haus files`. Wire names keep `artifact`: API routes and actions, the `artifact` tRPC router,
JSON fields (`artifact_id`), error codes (`ARTIFACT_*`), `/artifacts/<id>` URLs, the DB schema, and
local bookkeeping files. Below, "artifact" names one shared file record.

An artifact belongs to a Haus Server and has a stable identity and a canonical path in Files
([artifact drive](../../specs/artifact-drive.md)). Each publish creates an
immutable revision; its stable App URL opens the current revision and its version URL pins one
revision. Every active Server member can read and publish revisions. Files are private in Cloudflare
R2. Haus Server owns metadata, membership authorization, storage accounting, and revision selection.
Personal workspace files are never synced automatically.

The Agent API follows Raft's published action names and parameters, implemented independently:

| POST action under `/api/agent/actions/` | Input |
| --- | --- |
| `publish-artifact-raw` | Raw bytes; query `path`, optional `base_revision_id` or `replace=true` (not both), `title`, `content_type`, `request_id` |
| `list-artifacts` | JSON optional `offset` (root folder) |
| `get-artifact` | JSON `artifact_id`, optional `revision_id` |
| `list-artifact-versions` | JSON `artifact_id`, optional `offset` |
| `delete-artifact` | JSON `artifact_id` |
| `delete-artifact-version` | JSON `artifact_id`, `revision_id` |

A write names a `path` in Files. A free path creates an artifact. An occupied path adds a revision
only with `base_revision_id` equal to its current head or with `replace=true`; otherwise it fails
with 409 `REVISION_CONFLICT` and `current`, the head it lost to. The head is checked again when
the upload lands, so of two writers from one base exactly one wins.
[Artifact drive](../../specs/artifact-drive.md) owns path rules, folders, moves, error codes, and
the migration from names. Raft's `name` upserts; Haus has no name, and a path never upserts
blindly: `replace` is the only overwrite. Members publish through `PUT /artifacts/:serverId/publish`
with the same query metadata and a Clerk session.

Path routes beside the actions: `GET /api/agent/artifacts` lists a folder (`prefix`,
`recursive`, `order`, `limit`, `offset`, `query`, `mine`), `GET /api/agent/artifacts/by-path?path=`
resolves one file, and `POST /api/agent/artifacts/move` moves a file or folder (`from`, `to`,
optional `base_revision_id` for a file).

The native `artifact` tRPC router supplies App reads, moves, and deletion. Computer uses the scoped native
Agent artifact HTTP routes for authenticated download resolution. All routes call the same product
logic; no Raft source code is included. Public sharing, comments, GitHub publishing, and JSON/base64
publication are outside this MVP.

Artifact metadata carries `creator`, exactly one of `{ type: 'agent', agent_id }` or
`{ type: 'user', user_id }`: whoever created the artifact identity, not the author of later
revisions. Storage enforces one creator per artifact; a row without exactly one fails the read rather
than inventing a creator. `created_at` is when the artifact identity was created. `updated_at` is
when the described revision was published, so on current metadata it is the latest revision time.
Library lists sort by `updated_at` descending; version lists sort by revision number.

The native list query (`artifact.list`) browses one folder: `prefix` (`''` for the root) returns
its immediate child folders on the first page and its own files, and `recursive` returns every file
under it. `query` searches current titles and paths, `kind` (`all`, `images`, `documents`,
`media`, `other`) and an optional exact `creator` filter files, and filtering happens before
offset pagination; results carry `next_offset` and a page-independent `summary` of totals
(`folders`, `files_in_folders`, `files`, the same with or without `recursive`; see the drive spec). Child folders come newest first. `artifact.creators` returns one entry per creator
with at least one live artifact on the Server: `creator`, `artifact_count`, `latest_at`, and
`previews`, the creator's three most recently updated artifacts of any kind. Entries sort by `latest_at` descending, and the
procedure uses the same membership authorization as `list`.

The App's Files section (`features/artifacts/`) is a Finder-style browser in the ordinary page
column. The band carries the folder trail (Haus › Files › `starter-kit` › `scripts`, each folder
above the open one a link) and every control: search, a file-type menu, a Created by menu (Anyone,
You, Agents, then other people with live files, from `artifact.creators`), list/grid, and Upload.
The column shows the open folder's child folders (`artifact.list` folders: tinted folder icons
in the list's newest-first order, tints dealt in path-key order, each with its file count and up to three of its newest files peeking out,
taken from one recursive read of the open folder, never one read per folder), then the files
directly in it grouped by `updated_at` in the viewer's time zone (Today, Yesterday, weekdays through
the past week, days this month, months this year, then years). Search reads every file under the
open folder (`recursive`) and hides folders; a hit names its folder relative to the open one. Kind
and creator filter files, and folder counts follow them. The folder, kind, and creator ride the URL
(`?folder=starter-kit/scripts&kind=images&creator=agent:<id>`) so back, reload, and a desktop tab
return to the same view; search stays local and the list/grid choice is per device. Rows name the
file (its path's last segment), with the title first in the meta line when it differs, then kind,
creator, and relative time, plus size and a ⋮ menu (Open, Rename, Copy link, Download); folder
tiles open on press and offer Rename folder on right-click. Rename changes only the last segment
through `artifact.move` (a file move carries its head as `base_revision_id`). Pages load 50 at a
time behind Show more. The page is blank until the first read lands; the empty state appears only
when the folder truly holds nothing, with an Upload files button.

Members upload with the Upload menu (files or a folder) or by dropping files and folders anywhere
on the library; dropped folders keep their structure. Uploads land in the open folder through
`PUT /artifacts/:serverId/publish`, three at a time, each with a fresh `request_id`. Before any
bytes move the App lists the paths under the folder (`recursive`, `order: 'path'`) and plans the
upload: OS noise (`.DS_Store`, `Thumbs.db`, `._*`, `__MACOSX/`) is skipped, paths that break the
path rules, collide inside the upload, or would land on a folder or under a file are refused, and
existing names are gathered into one question ("Replace 3 files?"): Replace sends those with
`replace=true`, Skip keeps them, and new files upload either way without `replace`. A stock
progress bar counts files and bytes; refused and failed files stay listed until dismissed, and a
clean upload ends in a toast. Library reads refresh when the upload finishes.

The viewer's band shows
the file's path in Files (Files and each folder above it link back into the library, the file name
last); the tab keeps the file's title. The viewer shows a header
(icon, title, creator, last update, ⋮ menu with Download and both links), the preview, and details
with revision history beside it, stacking below it in narrow panes. Text files render inline
exactly as the Workspace pane renders workspace files (the shared `FileTextPreview` in
`features/chats/file-text-preview.tsx`): Markdown rendered, HTML as a sandboxed page with host
theme tokens, and plain text, source, JSON, and CSV/TSV as numbered code. `artifactTextRenderer`
routes by `artifactFileKind`; Office documents, slides, PDFs, and binary spreadsheets stay
downloads. The bytes come from `artifact.text`, not the signed link: the private R2 bucket sets no
CORS policy, so the App cannot fetch it cross-origin. `artifact.text` takes a required
`revision_id`, applies the same membership authorization as `download`, and returns
`{ status: 'text', text }`, `{ status: 'too_large', limit_bytes }` for revisions over 1 MiB
(`artifactTextMaxBytes`, refused from metadata without reading storage), or `{ status: 'binary' }`
when the bytes contain NUL or are not valid UTF-8. Revisions are immutable, so the App caches it
per revision with no staleness; the viewer is blank while it loads and falls back to the file's icon
and Download (with "Too large to preview." when oversize) otherwise. Passive raster images open in
the fullscreen zoom viewer; supported audio/video use native controls; other formats show their
icon with a Download action. Library rows and grid tiles, folder-tile previews, and chat file
tiles show raster images (PNG, JPEG, GIF, WebP, AVIF) through their thumbnail, whatever the
original's size; only the viewer and its fullscreen zoom load the original. A refused link
(storage disabled, revision gone) or a revision without a thumbnail falls back to the file's icon.

Files changes are live. Every committed publish, move, delete, version delete, and retention prune
publishes `artifact.onUpdated` (`{ serverId, artifactId }`, a null id for a folder move; see
[Realtime](realtime.md)), and `useArtifactUpdateStream` invalidates every `artifact.list` read,
`artifact.creators`, and that file's `artifact.get` and `artifact.versions`, so an open folder,
grid, or viewer fills in while Agents push. Revision-keyed reads (`download`, `text`,
`thumbnail`) are immutable and never refresh. Reads still recover on mount, focus, and reconnect
under `syncedSnapshot`.

### Thumbnails

Haus Server renders one WebP thumbnail per raster revision, longest edge 1024 px (never enlarged),
and stores it in the same private bucket beside the original at `<revision object key>.thumb.webp`.
Rendering uses Bun's built-in `Bun.Image` codec (`apps/server/src/artifacts/thumbnail-render.ts`), so
the compiled Server needs no native addon. A publish starts the render after the revision lands
and never waits for it or fails because of it. `artifact.thumbnail` (required `revision_id`, the
same membership authorization as `download`) answers `{ status: 'ready', thumbnail_url,
expires_at }` with a five-minute signed link, or `{ status: 'none' }` for files without one. A
revision with no thumbnail yet renders on that first read (the read waits for it), which is how
revisions published before thumbnails existed get one; there is no backfill job. Renders run two at
a time per Server, and a publish and a read of the same revision share one render.
`artifact_revisions.thumbnail_state` records the outcome: `ready`, or `failed` when the bytes do
not decode as a supported raster image (logged, never retried, kind icon in the App). A storage
error leaves the state empty so the next read retries. Originals over 100 MB are not read back
and have no thumbnail. Deleting or pruning a revision deletes its thumbnail with it. Thumbnails
are not counted against the storage cap.

### Agent CLI

Agents work on Files with explicit pulls and pushes; every command prints JSON.

```
haus files list [<folder>] [--recursive] [--query <text>] [--mine] [--offset <n>]
haus files pull <path> [<local-path>]
haus files push <local-path> [<path>] [--replace] [--title <title>] [--dry-run]
haus files mv <from> <to> [--base-revision-id <id>]
haus files view <id|link|path> [--revision-id <id>] [--output <path>]
haus files versions <id|link|path> [--offset <n>]
haus files delete <id|link|path> [--revision-id <id>]
```

`list` prints `{ summary, folder, folders, files, next_offset }` over the Agent list route; `--mine` is the
calling Agent's own files, and Agents get no creator directory (`artifact.creators` stays App-only).
`pull` resolves a file with `by-path`, otherwise pages a recursive `order=path` listing of the
folder, and copies each revision out of the Computer's verified cache (the `view` route) into the
local folder, keeping relative paths. Local writes are atomic and refuse dot segments, symlinked
folders, symlinked targets, and the manifest name. The pulled root holds `.haus-artifacts.json`:

```json
{ "version": 1, "folder": "starter-kit",
  "files": { "scripts/check.py": { "path": "starter-kit/scripts/check.py",
    "artifact_id": "art_…", "revision_id": "rev_…", "sha256": "…" } } }
```

The nearest manifest at or above a file owns it. Re-pulling skips files whose bytes match, updates
files with no local edits, keeps edited files when Files did not change, and otherwise writes
the incoming revision beside the edited file as `<file>.haus-theirs` while recording it as the new
base. Files that left the folder are deleted locally only when unedited.

`push` walks regular files (no symlinks, `.git`, `node_modules`, `__pycache__`, `.DS_Store`,
`*.haus-theirs`, or the manifest) and maps each to an explicit `<path>`, its recorded path,
its manifest's folder, or the pushed folder's name. Unchanged files are skipped; recorded files
publish with `base_revision_id`; new files create; `--replace` sends `replace=true`. Each success
rewrites the manifest atomically. A `REVISION_CONFLICT` does not stop the batch: the summary
(`{ created, updated, unchanged, conflicts, unmerged, errors, skipped }`) lists the file, its
reason (`changed`, `exists`, `deleted`, `in_progress`), the current head's revision, path,
`updated_at`, and creator, and the `haus files pull` command that stages it for a merge. A file
with a pending `.haus-theirs` copy is reported as unmerged and not pushed. Any conflict, unmerged
file, or error exits 1. When the head equals the base but the path moved, push follows the move.
Request ids derive from path, content hash, base (or replace/create), title, and content type, so
rerunning a push after `ARTIFACT_PUBLISH_UNCONFIRMED` returns the first attempt's revision; a spent
id (`DELETED`, `IDEMPOTENCY_KEY_REUSED`, `UPLOAD_CONFLICT`) is retried once with a fresh one.

The managed prompt's Files family names `list`, `pull`, and `push` and points at the `files` Manual topic,
which carries when to share versus attach or use a workbench `page` fence, the pull-merge-push
loop, sharing the `stable_url` in the message (the App renders a same-Server link as a file
chip and tile), and resolving a pasted `/artifacts/<id>` link with `view`.
Lists have 50 entries per offset page. Deletion requires the artifact creator or a human Owner/Admin;
the current revision cannot be deleted separately. Deleted records become inaccessible immediately;
cloud deletion failures retain their storage reservation and retry during Server startup.

Revisions are kept for a bounded time. Once a newer revision has replaced a revision for seven days
(`ARTIFACT_REVISION_RETENTION_DAYS` in `@haus/api`), the Server's hourly revision retention sweep
(`apps/server/src/artifacts/retention.ts`, a boot sweep beside the other retention sweeps) deletes
its R2 object and its row, freeing its storage. The current revision of a file is never pruned, however
old. The window counts from the replacement, not from the revision's own age, so every replaced
revision stays restorable for a full week. A pruned revision's version URL answers not found, like a
deleted one. A storage failure leaves the row `deleting` for startup cleanup to finish.

The Server reserves the maximum file size before accepting an upload, streams directly to R2 without
disk staging, and publishes the revision only after storage success. The current pointer advances
by revision number, so late completion of an older upload cannot replace a newer revision. Default
limits are 256 MiB per file and 100 GiB of shared storage per Server (`HAUS_ARTIFACT_STORAGE_BYTES`;
the cap is a product guard, not a cost limit). Production uploads are
limited to 100 MB to match Cloudflare ingress for haus.chat. Larger uploads require direct or chunked transfer before
promising the full 256 MiB through the Tunnel.

`view` returns a read-only local path pinned for the current turn. The Computer's shared cache lives
outside workspaces, isolates Server namespaces, verifies size and SHA-256, reuses revisions, and
evicts unused files to stay within 2 GiB. Every resolve checks current Server access, including cache
hits. `--output` explicitly creates a writable personal copy. Cached paths are temporary and must
not be modified. Issued signed download links expire after five minutes; deletion or membership
loss cannot retract bytes or links already delivered.

## Provisioning

Enable `HAUS_ENABLE_ARTIFACT_STORAGE` only after the lifecycle's private bucket and bucket-scoped
Object Read & Write credential exist. `.env.schema` resolves `Cloudflare R2 - Haus` from the matching
1Password vault: `username` is its S3 access key ID and `credential` its secret access key. Development
uses `haus-artifacts-development`; production uses `haus-artifacts-production`. Both lifecycle buckets are private. Production enables storage by default; development remains
opt-in. No public bucket endpoint or CDN is required.

Without storage configuration, metadata reads remain available and file transfer fails explicitly.
See [workspace capacity and migration](../../specs/workspace.md) for Computer-local storage.
