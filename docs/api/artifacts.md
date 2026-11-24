---
summary: "Files, the Server-wide shared files (wire name: artifacts), with immutable revisions, explicit publication, and bounded Computer caching."
read_when:
  - "changing Files (the shared artifact library), media or text previews, or revision viewer"
  - "changing shared artifact APIs, revision storage, `haus drive`, or Agent file sharing"
  - "changing shared file caching or R2 authorization"
  - "changing shared artifact paths, folders, or compare-and-set writes (see specs/artifact-drive.md)"
  - "changing Drive areas, revision attribution, the change counter, pushes, merges, kept-both conflict copies, citations by revision, or the Drive page (see specs/artifact-drive.md)"
  - "changing the drive/ folder on a machine, turn-start pull, or the push after a turn (see specs/drive-folder.md)"
---

# Files

Files is the product noun for the Server-wide shared files in the App's Files section. Agents see
them as Drive: the `drive/` folder and `haus drive` ([ADR 0054](../adr/0054-drive-holds-what-agents-know-and-follow.md)
renames the App side too). Wire names keep `artifact`: API routes and actions, the `artifact` tRPC router,
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
with `base_revision_id` equal to its current head, with an older revision of the same file whose
text merges cleanly onto the head, or with `replace=true`; otherwise it fails with 409
`REVISION_CONFLICT` and `current`, the head it lost to. The head is checked again when the upload
lands, so of two writers from one base the second merges onto the first or fails. A merged
revision's base differs from its parent; a `request_id` retry compares the bytes the writer sent.

After a turn, the machine pushes the turn's Drive changes under the run id:
`POST /api/agent/drive/push/put` (raw bytes; query `push_id`, `path`, `request_id`, optional
`base_revision_id`, `content_type`), `POST /api/agent/drive/push/delete` (JSON `push_id`, `path`,
`base_revision_id`, `request_id`), and `POST /api/agent/drive/push/close` (JSON `push_id`). Each
put or delete answers one push outcome and never a `REVISION_CONFLICT`; a failed merge keeps both
versions in a `.conflict-<handle>` copy. The code is `apps/server/src/drive/push/`.
[Artifact drive](../../specs/artifact-drive.md) owns path rules, folders, moves, error codes, and
the migration from names. Raft's `name` upserts; Haus has no name, and a path never upserts
blindly: `replace` is the only overwrite. Members publish through `PUT /artifacts/:serverId/publish`
with the same query metadata and a Haus AppSession.

Path routes beside the actions: `GET /api/agent/artifacts` lists a folder (`prefix`,
`recursive`, `order`, `limit`, `offset`, `query`, `mine`), `GET /api/agent/artifacts/by-path?path=`
resolves one file, and `POST /api/agent/artifacts/move` moves a file or folder (`from`, `to`,
optional `base_revision_id` for a file).

The native `artifact` tRPC router supplies App reads, moves, deletion, their batches (`moveMany`, `deleteMany`), and zip links (`zip`, below). Computer uses the scoped native
Agent artifact HTTP routes for authenticated download resolution. All routes call the same product
logic; no Raft source code is included. Comments, GitHub publishing, and JSON/base64 publication
are outside this MVP. Public links are opt-in per file (below).

Artifact metadata carries `creator`, exactly one of `{ type: 'agent', agent_id }` or
`{ type: 'user', user_id }`: whoever created the artifact identity, not the author of later
revisions. Storage enforces one creator per artifact; a row without exactly one fails the read rather
than inventing a creator. `created_at` is when the artifact identity was created. `updated_at` is
when the described revision was published, so on current metadata it is the latest revision time.
Library lists sort by `updated_at` descending unless asked otherwise; version lists sort by
revision number. App reads (`artifact.list`, `get`, `byPath`, `versions`) return records: the metadata plus
`author` (who published that revision, same shape as `creator`) and `image` (`width`, `height`,
and `dpi` from a PNG `pHYs` chunk, or null when unmeasured or not raster). Agent routes keep the
plain metadata, which deployed CLIs parse strictly. A revision published without its own `title`
took its file name, so its title follows the file through renames (and a restore of it); a chosen
title stays as written.

`artifact.byPath({ serverId, path, revision_id? })` reads the live file at one drive path, matched
by its case- and NFC-folded key on the live `(server_id, path_key)` unique index, and with
`revision_id` that revision of the same file. A path with no live file, or a revision of another
file, is `NOT_FOUND`, as in `artifact.get`. An Agent page card opens its page this way.

The native list query (`artifact.list`) browses one folder: `prefix` (`''` for the root) returns
its immediate child folders on the first page and its own files, and `recursive` returns every file
under it. `query` searches current titles and paths, `kind` (`all`, `images`, `documents`,
`media`, `other`) and an optional exact `creator` filter files, `order` (`updated`, `path`,
`name` in natural order, `size`, `kind`) with `direction` sorts them, and filtering happens before
offset pagination; results carry `next_offset` and a page-independent `summary` of totals
(`folders`, `files_in_folders`, `files`, `size_bytes`, the same with or without `recursive`; see the drive spec). Child folders come newest first. `artifact.creators` returns one entry per creator
with at least one live artifact on the Server: `creator`, `artifact_count`, `latest_at`, and
`previews`, the creator's three most recently updated artifacts of any kind. Entries sort by `latest_at` descending, and the
procedure uses the same membership authorization as `list`.

The App's Files section (`features/artifacts/`) is a Finder-style browser in the ordinary page
column. Its band is the shared page band: the folder trail (Haus › Files ›
`starter-kit` › `scripts`, each folder above the open one a link; past three folders the middle
folds into an ellipsis menu, keeping Files and the parent) and every control: search (fixed width,
placeholder "Search"), a file-type menu, a Created by menu (Anyone, You, Agents, then other people
with live files, from `artifact.creators`), list/grid, and Upload. When the band is narrower than
58rem the two menus and list/grid fold into one Filters menu. Back and Forward are the shell's,
not Files' own ([React → Shell](../internals/react.md#shell)): opening a folder pushes an entry
and a filter change replaces it, so they walk folders as part of the tab's ordinary history.

Selection follows Finder. The open folder's tiles and every date group of files are one React Aria
collection (`artifact-library-collection.tsx`, sections of one grid) with stock multiple selection
in `replace` behavior, so one selection spans folders and files in visual order: a plain click
opens the item, as in Capy (a press right after an open is ignored, so a habitual double click
does not open what replaced it), Command-click toggles, Shift-click and Shift+Arrow extend a range (across folders and
date groups, in the current sort and filters), Command-A selects every loaded item and loads the
rest of the folder up to `artifactBatchMaxItems` (past that the summary says "loaded files only"),
Escape or a click on empty space clears, Return opens, and a touch tap opens at once while a
long press starts selecting. On desktop a middle click still opens in a new tab;
Command- and Shift-click shape the selection instead. The selection belongs to the open folder:
opening another starts empty, and live updates keep every selected item that still exists.

While two or more items are selected, the band's controls give way to a stock `Toolbar`
(`artifact-selection-bar.tsx`): the summary ("4 selected · 120 MB", naming folders apart), the
selection's actions, and Clear; clearing brings the controls back, so the column never moves.
Right-clicking inside a selection of several opens the same actions for all of it; right-clicking
any other item selects it first; the empty area clears the selection. Keys: F2 renames the one
selected item, Delete or Backspace deletes the selection, Command-Shift-M moves it, and Shift+F10
or the Menu key opens the menu at the focused item.

File and folder actions are defined once (`artifact-actions.ts`) and rendered by the row ⋮ menu,
the context menu, and the viewer's menu: files offer Open, Download, Copy link, Copy public link
(Disable public link when allowed), Rename…, Move to… (a folder picker), Version history (the
viewer's Revisions), and Delete… (confirmed; shown only to the creator and human Owners/Admins,
the Server's `artifact.delete` rule), plus Copy path, Open in new tab (desktop windows only, ADR
0046), and Show in folder (wherever the item is not in the folder on screen: the viewer, a search
hit). Folders offer Open, Download as zip, Copy link, Copy path, Rename, and Move to…; the empty
area offers Upload files… and Upload folder…. A selection of several offers Download as zip, Copy
links (one per line), Move to…, and Delete… (only when some selected file may be deleted). Every
item carries its verb's icon. Actions a member cannot run are hidden, not disabled. In the
library, Rename (or F2) edits the name in place: Return or leaving the field commits, Escape
cancels; the viewer renames through a dialog.

Bulk actions are one request each, however many items are selected. Move to… walks folders and
sends `artifact.moveMany` (each file guarded by its head revision; a selected folder never lists
itself). Delete… confirms with `artifact.deleteMany`, sending only the files this member may
delete; when the selection holds others, or folders, the dialog says so ("3 of 5 selected items
can be deleted") and the rest stay. Dragging items (a selected item drags the whole selection,
React Aria's stock draggable collection) onto a folder tile or a linked trail crumb moves them
there; the target lights up only when the move can land, so a folder into itself or items onto
their own folder is a no-op. Files dragged in from the system still upload anywhere on the
library, rows and tiles included. Download as zip asks `artifact.zip` for a short-lived link and
hands it to the browser's download manager (the desktop's system browser), as single downloads do.
The column shows the open folder's child folders (`artifact.list` folders: tinted folder icons
in the viewer's sort, each tint hashed from the folder's own path so it never shifts when a sibling
appears, names cut in the middle across two lines with the full path on hover, each with its file count and up to three of its newest files peeking out,
taken from one recursive read of the open folder, never one read per folder), then the files
directly in it in the viewer's sort: Name (natural), Modified (the default, newest first, which
groups files by `updated_at` in the viewer's time zone: Today, Yesterday, weekdays through the
past week, days this month, months this year, then years), Size, or Kind, either way. The sort is
per device, set from the band's sort menu or the list's column headers (Name, Kind, Modified, Size,
each column shown once the library is wide enough). Grid tiles fit the whole image on a neutral
well. Search reads every file under the open folder (`recursive`) plus the folders whose name
matches; a hit names its folder relative to the open one as a link there. Kind
and creator filter files, and folder counts follow them. The folder, kind, and creator ride the URL
(`?folder=starter-kit/scripts&kind=images&creator=agent:<id>`) so back, reload, and a desktop tab
return to the same view; search stays local to the folder, and the list/grid choice is per
device. A folder that holds nothing unfiltered does not exist, so its URL shows "Folder not found"
with the way back up; an address no route matches shows "Page not found". Rows name the
file (its path's last segment), with the title first in the meta line when it differs, then kind,
who last published it (the revision author), and relative time, plus size and the ⋮ menu. Rename changes only the last segment and Move
to… only the folder, both through `artifact.move` (a file move carries its head as
`base_revision_id`). Pages load 50 at a
time behind Show more. The page is blank until the first read lands; the empty state appears only
when the folder truly holds nothing, with an Upload files button.

Members upload with the Upload menu (files or a folder) or by dropping files and folders anywhere
on the library; dropped folders keep their structure. Uploads land in the open folder through
`PUT /artifacts/:serverId/publish`, three at a time, each with a fresh `request_id`. Before any
bytes move the App lists the paths under the folder (`recursive`, `order: 'path'`) and plans the
upload: OS noise (`.DS_Store`, `Thumbs.db`, `._*`, `__MACOSX/`) is skipped, paths that break the
path rules, collide inside the upload, or would land on a folder or under a file are refused, and
files whose bytes match the current revision (SHA-256) are skipped, like an Agent's `drive/` push. The
remaining existing names are gathered into one question ("Replace 3 files?", naming the first
five): Replace sends those with `replace=true`, Skip keeps them, and new files upload either way
without `replace`. A stock progress bar counts files and bytes beside Cancel, which stops the rest;
a file whose upload makes no progress for 45 seconds fails with that reason
(`artifactUploadStallMs`), so a stalled storage backend never leaves Upload stuck. Refused and
failed files stay listed until dismissed, and a clean upload ends in a toast. Library reads refresh
when the upload finishes.

The viewer's band shows
the file's path in Files (Files and each folder above it link back into the library, the file name
last); the tab keeps the file's title. The viewer shows a header
(icon, title, the revision author's mark and name, last update, previous/next, and the shared file
actions without Open, plus Copy link to this revision; deleting returns to the file's folder), the
preview, and details (with pixel size and DPI for images) with revision history beside it,
stacking below it in narrow panes. Opened from the library, the viewer URL carries that folder view
(`?in=<folder>&kind=…&creator=…&q=…`), and previous/next (buttons, ← and →, and the zoom viewer's
arrows) step through its files in the current sort, replacing the history entry; Back returns to
the library with the last viewed file selected and focused. Each revision row names its author and
size; any revision but the current one can be restored (`artifact.restore` publishes its bytes as
a new revision on the current head, never rewriting history), and the list notes that replaced
revisions are removed after `ARTIFACT_REVISION_RETENTION_DAYS`. Images show at no more than their
own pixels, and the zoom viewer's label is the true scale (a fitted print reads 14%, not 100%). Text files render inline
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
publishes `artifact.onUpdated` (`{ serverId, artifactId }`, a null id for a folder move, for a
batched move or delete, which announces once per batch, and for a retention sweep, which announces
once per affected Server; see [Realtime](realtime.md)), and
`useArtifactUpdateStream` invalidates every `artifact.list` read, `artifact.creators`, and that
file's `artifact.get` and `artifact.versions`, so an open folder, grid, or viewer fills in while
Agents push. Listing and creator refreshes are throttled per Server (the first event refreshes at
once, then at most once per 300 ms with a trailing refresh), so a burst of pushes refetches a
folder a handful of times rather than once per file; per-file reads refresh on every event.
Revision-keyed reads (`download`, `text`,
`thumbnail`) are immutable and never refresh. Reads still recover on mount, focus, and reconnect
under `syncedSnapshot`.

### Thumbnails

Haus Server renders one WebP thumbnail per raster revision, longest edge 1024 px (never enlarged),
and stores it in the same private bucket beside the original at `<revision object key>.thumb.webp`.
The render also records the original's pixel size and PNG density on the revision
(`image_width`, `image_height`, `image_dpi`); a revision rendered before those existed is
measured once, in the background, on its next thumbnail read.
Rendering uses Bun's built-in `Bun.Image` codec (`apps/server/src/artifacts/thumbnail-render.ts`), so
the compiled Server needs no native addon. A publish starts the render after the revision lands
and never waits for it or fails because of it. `artifact.thumbnail` (required `revision_id`, the
same membership authorization as `download`) answers `{ status: 'ready', thumbnail_url,
expires_at }` with a five-minute signed link, or `{ status: 'none' }` for files without one. A
revision with no thumbnail yet renders on that first read (the read waits for it), which is how
revisions published before thumbnails existed get one: old revisions get thumbnails lazily, on
first view, and there is no backfill job. Because renders run two at a time per Server, the first
grid open of a folder holding many old large images can be slow while its thumbnails render; later
opens read the stored WebP. A publish and a read of the same revision share one render.
Two caps bound a render's memory (`thumbnail-render.ts`): originals over 50 MB
(`artifactThumbnailSourceMaxBytes`) are never read back, and sources over 40 million decoded
pixels (`artifactThumbnailSourceMaxPixels`, about 160 MB of RGBA; a 4500×5400 print still
renders) are refused by the decoder. `artifact_revisions.thumbnail_state` records the outcome:
`ready`, or `failed` when the source is over either cap or the bytes do not decode as a supported
raster image (never retried, kind icon in the App; the publish itself never fails). A storage
error leaves the state empty so the next read retries. Deleting or pruning a revision deletes its
thumbnail with it. Thumbnails are not counted against the storage cap.

### Public links

A member or Agent who can read a file may give it a public link,
`https://<app origin>/f/<token>` (192-bit random token), that anyone outside the Server can open
or embed; the [public links spec](../../specs/artifact-public-links.md) owns the contract. The
link serves the current revision, survives moves, and answers a bare 404 once disabled or the file
is deleted; re-enabling issues a new token. Disabling is limited to the link's creator or a human
Owner/Admin. `GET /f/<token>` streams the bytes through the Server under a safe content-type
allowlist (never HTML; markup becomes `text/plain`, unknown types download) with a 60-second
public cache and the revision's SHA-256 as `ETag`; `/f/<token>/thumbnail` streams the WebP
thumbnail. Image links therefore embed and unfurl as images; there is no OpenGraph page. The
App's row and viewer ⋮ menus carry Copy public link and Disable public link, a public file shows a
globe mark in its row or tile and a Public link chip in the viewer, and `artifact.list` pages
carry `public_links` for their files (`artifact.publicLink`, `artifact.share`, and
`artifact.unshare` serve one file). The Agent-route `artifact.list` shape is unchanged.

### Zip downloads

`artifact.zip` (`{ serverId, root, paths }`, member authorization) plans a zip of files and folders
under one `root` folder and returns `{ zip_path, filename, file_count, total_bytes, expires_at }`.
Planning reads every current ready revision the paths name (a folder path takes every live file
under it, each file once) and refuses the request before any bytes move: a path outside `root` is
`BAD_REQUEST`, and more than `artifactZipMaxFiles` (10,000) files or `artifactZipMaxBytes` (4 GB)
is `PAYLOAD_TOO_LARGE` with `SIZE_LIMIT` and a message naming the cap and the selection's size.
`zip_path` (`/artifacts/zip/<token>`, 192 random bits) is a short-lived link
(`artifactZipLinkSeconds`, five minutes) that works as a plain GET, so the browser's download
manager (or the desktop's system browser) saves it, retries it, and cancels it. Links live in the
Server process only, like its realtime topics; a restart expires them. Opening one checks the
issuing member's access again and re-reads the selection, so a file deleted since is left out.

`GET /artifacts/zip/:token` streams `application/zip` with `Content-Disposition: attachment`
(`<folder>.zip` for a lone folder, otherwise the root folder's name) and no `Content-Length`.
Entries are named by their path relative to `root`, so a folder unzips as itself with its
structure, and every entry is stored (STORE, no deflate): shared files are mostly PNG, JPEG, and
WebP, which deflate cannot shrink, and the archive's bytes are the originals. The archive is
written with `fflate`'s streaming `Zip` and `ZipPassThrough` (`apps/server/src/artifacts/zip-stream.ts`),
pull-driven: it reads the next storage chunk only when the client takes more, one object open at
a time, so a slow download never buffers whole files; cancelling the download cancels the open
storage read. Without ZIP64 an archive must stay under 4 GiB, which the 4 GB cap guarantees. A
stored object whose length no longer matches its revision errors the stream. Expired or unknown
links answer a plain-text 404.

### Agent CLI

Agents edit shared files in their `drive/` folder with native file commands (`ls`, `cat`, `rg`,
edits, `mv`, `rm`). The Computer pulls the folder when a turn starts and pushes it after the turn
([Drive folder](../../specs/drive-folder.md)). `haus drive` keeps the read commands, and every
command prints JSON.

```
haus drive versions <id|link|path> [--offset <n>]
haus drive view <id|link|path> [--revision-id <id>] [--output <path>]
haus drive share <id|link|path> [--disable]
```

A target is an artifact id, a pasted `/artifacts/<id>` link, a `drive://<path>` citation, or a
Drive path such as `haus/reports/q4.md`. A leading `drive/` folder prefix is accepted. A path
resolves through `GET /api/agent/artifacts/by-path`. `versions` pages the retained revisions.
`share` prints `{ artifact_id, url }` (`POST /api/agent/artifacts/:id/public-link`); `--disable`
prints `{ artifact_id, disabled: true }` (`…/public-link/disable`).

`haus files pull` and `push`, their `.haus-artifacts.json` manifests and `.haus-theirs` copies,
and `haus files list`, `mv`, and `delete` are gone: the `drive/` folder replaces them.

The managed prompt's Drive family entry points at the `drive/` folder and the `drive` Manual
topic. The topic carries when to share versus attach or use a workbench `page` fence, the three
areas and who writes them, the conflict copy and `drive-refused/` outcomes, citing a file with
`[label](drive://<path>)`, and the three `haus drive` commands.

Lists have 50 entries per offset page. Every path sits in a Drive area (`haus/`, `projects/<key>/`,
`agents/<handle>/`); any other path is `INVALID_PATH`, and the area prefix is stored in its canonical
spelling. Writing, deleting, and moving (at both ends) need write access to the area: people write
every area, and an Agent writes `haus/`, Projects, and its own area (`FORBIDDEN` elsewhere;
`artifact.deleteMany` reports such files as `forbidden`). The current revision cannot be deleted
separately. A deleted file leaves the listings at once but keeps its head and every revision:
`artifact.listDeleted` lists a folder's deleted files from the last 30 days, `artifact.restore` on
one of its revisions brings it back at its last path (`PATH_TAKEN` when another file lives there),
and a write whose `base_revision_id` names one of its revisions brings it back at the written path.
Deleting a file disables its public link. `delete-artifact-version` purges one replaced revision at
once; its cloud deletion failures retain their storage reservation and retry during Server startup.

Every committed put and delete also bumps its area's change counter in the same transaction.
`drive.changes` (tRPC) and `GET /api/agent/drive/changes?since=<json>&until=<json>` answer what
changed since a set of counters ([artifact drive](../../specs/artifact-drive.md#change-counter)).

A replaced revision up to `artifactTextMaxBytes` (1 MiB) is kept for the life of the file. A larger
one goes once a newer ready revision of the same file was created seven days ago
(`ARTIFACT_REVISION_RETENTION_DAYS` in `@haus/api`): the Server's hourly revision retention sweep
(`apps/server/src/artifacts/retention.ts`, a boot sweep beside the other retention sweeps) deletes
its R2 objects and frees its storage. The clock starts when the newer revision was created, not at
the older revision's own creation. The same sweep purges every revision of a file deleted more than
`driveDeletedRetentionDays` (30) ago, keeping the file's row and its change tombstone. The current
revision of a live file is never pruned, however old.
A pruned revision ends exactly like a deleted one: its row stays as `deleted` with no reserved
bytes, so its version URL answers not found, a late `request_id` retry answers `DELETED` instead
of publishing again, and a push based on it after a move still names the file's new path. The
sweep claims at most 200 revisions per batch (`for update skip locked`), stops between revisions
when the Server shuts down (handing unprocessed claims back), and publishes one null-id
`artifact.onUpdated` per affected Server. A storage failure leaves the row `deleting` for startup
cleanup to finish.

The Server reserves the maximum file size before accepting an upload, streams directly to R2 without
disk staging, and publishes the revision only after storage success. A revision takes its number
when it lands, under the Server row lock: an upload in flight holds a negative placeholder, and a
write refused at landing gives its number back, so the numbers people see have no gaps and follow
landing order. A write from a stale base merges or fails at landing; a `replace` that lands last
becomes the head. Default
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

Production stores Files in the private `haus-artifacts-production` R2 bucket. `.env.schema` resolves
`Cloudflare R2 - Haus` from the Production vault: `username` is its bucket-scoped Object Read & Write
S3 access key ID and `credential` its secret access key. No public bucket endpoint or CDN is
required.

Development stores Files in a per-worktree local S3 gateway (versitygw) that `bun run dev` starts
with a `haus-artifacts-development` bucket and a fixed local key pair, so storage is on in every
worktree with no cloud credential (see [Development](../operations/development.md#local-stack)).
The Server's S3 client is unchanged: path-style requests signed for region `auto`, and signed
`GET` links served by the gateway like R2's. The gateway sets no CORS policy either. Tests and App
e2e leave storage off; e2e seeds Files rows and intercepts the publish route and storage-backed
`artifact` responses, so it needs no gateway.

Without storage configuration, metadata reads remain available and file transfer fails explicitly.
See [workspace capacity and migration](../../specs/workspace.md) for Computer-local storage.
