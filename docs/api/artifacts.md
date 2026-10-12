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

The App library offers grid/list views and Server-side search across current titles, filenames, and
artifact names. Its native list query accepts `query` and `kind` (`all`, `images`, `documents`,
`media`, `other`); filtering happens before offset pagination. The viewer keeps file details and
revision history beside the preview, with stable and fixed links available to copy. Passive raster
images support fullscreen fit/zoom; supported audio/video use native controls. Other formats open
through the file action. Library thumbnails load only raster images up to 512 KiB; larger originals
load when opened, pending dedicated thumbnail renditions.
Library and viewer controls occupy Haus's shell band; the collection and preview use the remaining
app surface without a document-page header or content-width limit.

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
