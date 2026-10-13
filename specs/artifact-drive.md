---
summary: Normative contract for shared-artifact drive paths, folders, compare-and-set writes, and moves.
read_when:
  - changing shared artifact paths, folders, listing, publish, or move behavior
  - changing how the CLI or App reads or writes shared artifacts in bulk
  - changing the artifact path rules in packages/haus-api/src/artifact-path.ts
---

# Artifact drive

Shared artifacts stay Server-hosted with explicit reads and writes. There is no sync engine, no
local mirror, and no background process: clients list, pull, and push on demand. The drive adds
canonical paths, folders, and writes that cannot silently overwrite each other.

## Paths

Every artifact has one canonical drive `path`, such as `starter-kit/scripts/tm_check.py`, unique
among the Server's live artifacts. Artifact and revision ids, R2 object keys
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
returns the folder's immediate child folders (`name`, `path`, `file_count`, `updated_at`; first
page only) and the folder's own files. `recursive: true` returns every file under the prefix and no
folders, which is the bulk-pull shape; `order: 'path'` gives it a stable order. `creator`, `kind`,
and `query` (title or path) filter files, and folder counts follow the same filters. Pages hold up
to `limit` files (default 50, at most 200) and report `next_offset`, null on the last page.

## Writes

A write names a `path`. A free path creates an artifact and needs no base. An occupied path adds a
revision only when:

- `base_revision_id` equals its current head, or
- `replace: true` deliberately overwrites whatever the head is (the App's Replace, the CLI's
  `--replace`).

Anything else fails with 409 `REVISION_CONFLICT` whose `current` is the live head the write lost
to: the head of the artifact `base_revision_id` belongs to, wherever that artifact lives now (a
moved file reports its new path), otherwise the artifact at the path. `current` is null when
nothing has published there yet (a first upload still in flight, or a base at a free path that
names no live artifact). The client merges onto `current` and retries with its revision as base.

The head is checked twice: when the write reserves storage, before any bytes move, and again when
the upload lands, under the same Server row lock that serializes every artifact insert, move, and
delete. Two writers from one base both upload, and exactly one becomes the head; the other's
revision fails, frees its reserved bytes, and returns the conflict. A create whose only upload
fails frees its path. `request_id` retries return the first attempt's revision even after the head
has moved; reusing a `request_id` for another path, title, or content type fails with
`IDEMPOTENCY_KEY_REUSED`.

Writes travel as raw bytes with query metadata: Agents through
`POST /api/agent/artifacts/publish-artifact-raw`, members through
`PUT /artifacts/:serverId/publish` with a Clerk session. Both take `path`, optional
`base_revision_id` or `replace=true`, `request_id`, and optional `title` (default: the file name)
and `content_type`.

## Moves

`artifact.move` (and `POST /api/agent/artifacts/move`) takes `{ from, to }`. When `from` is a live
file it moves that file; otherwise it moves every live file under the `from` folder. One
transaction rewrites only paths. The destination must be free: no other file at `to` and no files
that stay behind under `to` (`PATH_TAKEN`); `to` may not sit inside `from`, under a live file, or
on a folder when moving a file (`PATH_CONFLICT`). Case-only renames are allowed.

A single-file move accepts an optional `base_revision_id` that must equal the head. A folder move
takes none (`INVALID_ARG`): it touches no bytes, and a client writing to an old path afterwards
gets `REVISION_CONFLICT` naming each file's new path, so per-file checks add nothing. Any member
who can publish can move. Deletion stays per artifact, limited to the creator or a human
Owner/Admin.

## Errors

Agent routes answer `{ code, message }`, plus `current` for `REVISION_CONFLICT`. tRPC errors carry
`data.artifact = { code, current }`. Path-shaped input errors are 400 `INVALID_PATH` on the Agent
API and `BAD_REQUEST` on tRPC. Codes: `INVALID_ARG`, `INVALID_PATH`, `NOT_FOUND`,
`UNAUTHORIZED`, `FORBIDDEN`, `REVISION_CONFLICT`, `PATH_TAKEN`, `PATH_CONFLICT`,
`IDEMPOTENCY_KEY_REUSED`, `UPLOAD_CONFLICT`, `DELETED`, `CURRENT_REVISION`, `CONTENT_TYPE`,
`SIZE_LIMIT`, `STORAGE_LIMIT`, `STORAGE_UNAVAILABLE`, `AUTH_UNAVAILABLE`.

## Migration

Migration `0087_artifact-paths` backfills every artifact's path from its former `name` plus its
current revision's filename extension (letters, digits, `_+-`, at most 16 characters): `report` +
`q4.pdf` becomes `report.pdf`. Live rows take the first free of `report.pdf`, `report-2.pdf`… in
creation order, compared by the folded key. The `name` column, its index, and the create-only name
contract are gone; the path is the identity.

## Out of scope

Sync engines, local mirrors, background watchers, empty folders, folder deletes beyond per-file
delete, and revision retention thinning.
