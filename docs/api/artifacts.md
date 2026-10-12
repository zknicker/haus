---
summary: "Server-shared files with immutable revisions, explicit publication, and bounded Computer caching."
read_when:
  - "changing the shared artifact library, media previews, or revision viewer"
  - "changing shared artifact APIs, revision storage, or Agent file sharing"
  - "changing shared file caching or R2 authorization"
---

# Shared artifacts

An artifact belongs to a Haus Server and has a stable identity and name. Each publish creates an
immutable revision; its stable App URL opens the current revision and its version URL pins one
revision. Every active Server member can read and publish revisions. Files are private in Cloudflare
R2. Haus Server owns metadata, membership authorization, storage accounting, and revision selection.
Personal workspace files are never synced automatically.

The Agent API follows Raft's published action names and parameters, implemented independently:

| POST action under `/api/agent/actions/` | Input |
| --- | --- |
| `publish-artifact-raw` | Raw bytes; query `name` or `artifact_id`, `title`, `filename`, optional `content_type`, `request_id` |
| `list-artifacts` | JSON optional `offset` |
| `get-artifact` | JSON `artifact_id`, optional `revision_id` |
| `list-artifact-versions` | JSON `artifact_id`, optional `offset` |
| `delete-artifact` | JSON `artifact_id` |
| `delete-artifact-version` | JSON `artifact_id`, `revision_id` |

The native `artifact` tRPC router supplies App reads and deletion. Computer uses the scoped native
Agent artifact HTTP routes for authenticated download resolution. All routes call the same product
logic; no Raft source code is included. Public sharing, comments, GitHub publishing, and JSON/base64
publication are outside this MVP.

Artifact metadata carries `creator`, exactly one of `{ type: 'agent', agent_id }` or
`{ type: 'user', user_id }`: whoever created the artifact identity, not the author of later
revisions. Storage enforces one creator per artifact; a row without exactly one fails the read rather
than inventing a creator. `created_at` is when the artifact identity was created. `updated_at` is
when the described revision was published, so on current metadata it is the latest revision time.
Library lists sort by `updated_at` descending; version lists sort by revision number.

The native list query accepts `query` (Server-side search across current titles, filenames, and
artifact names), `kind` (`all`, `images`, `documents`, `media`, `other`), and an optional exact
`creator`; filtering happens before offset pagination. Storage is flat; the library groups by
creator instead of folders. `artifact.creators` returns one entry per creator with at least one live
artifact on the Server: `creator`, `artifact_count`, `latest_at`, and `previews`, the creator's three
most recently updated artifacts of any kind. Entries sort by `latest_at` descending, and the
procedure uses the same membership authorization as `list`.

The App library (`features/artifacts/`) is a Finder-style page in the ordinary page column: the
title with search and a list/grid toggle beside it, a row of folders (All files, then the viewer's
own files as Yours, then Agents, then other people, each with up to three peeking previews and a
file count), a kind filter, and the files grouped by `updated_at` in the viewer's time zone (Today,
Yesterday, weekdays through the past week, days this month, months this year, then years). The
folder and kind ride the URL (`?creator=agent:<id>`, `?kind=images`) so back, reload, and a desktop
tab return to the same view; search stays local and the list/grid choice is per device. Rows show
the file's icon or a photo thumbnail, its kind, creator, and relative time, with size and a ⋮ menu
(Open, Copy link, Download); pages load 50 at a time behind Show more. The viewer shows a header
(icon, title, creator, last update, ⋮ menu with Download and both links), the preview, and details
with revision history beside it, stacking below it in narrow panes. Passive raster images open in
the fullscreen zoom viewer; supported audio/video use native controls; other formats show their
icon with a Download action. Library thumbnails and folder previews load only raster images up to
512 KiB; larger originals load when opened, pending dedicated thumbnail renditions. A refused
download link (storage disabled, revision gone) falls back to the file's icon. The App has no
artifact realtime events: lists refresh on mount, focus, and reconnect under `syncedSnapshot`.

`haus artifact publish`, `list`, `get`, `versions`, `view`, and `delete` expose these primitives.
Publish leaves the source untouched. The CLI prints a request ID before transfer; reuse it with
identical metadata and bytes to retry a lost success response without adding another revision.
An in-progress or failed publication requires waiting or a new ID. New IDs create new revisions.
Lists have 50 entries per offset page. Deletion requires the artifact creator or a human Owner/Admin;
the current revision cannot be deleted separately. Deleted records become inaccessible immediately;
cloud deletion failures retain their storage reservation and retry during Server startup.

The Server reserves the maximum file size before accepting an upload, streams directly to R2 without
disk staging, and publishes the revision only after storage success. The current pointer advances
by revision number, so late completion of an older upload cannot replace a newer revision. Default
limits are 256 MiB per file and 10 GiB of shared storage per Server. Cloudflare ingress can impose a
lower request limit; production promotion must verify the account's limit or add a direct/chunked
transfer before promising the full 256 MiB through the Tunnel.

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
uses `haus-artifacts-development`; production uses `haus-artifacts-production`. The MVP provisions
only the development bucket. No public bucket endpoint or CDN is required.

Without storage configuration, metadata reads remain available and file transfer fails explicitly.
See [workspace capacity and migration](../../specs/workspace.md) for Computer-local storage.
