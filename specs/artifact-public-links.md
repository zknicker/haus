---
summary: Normative contract for public links to Files (shared artifacts) — opt-in unguessable URLs that anyone outside the Server can open or embed.
read_when:
  - changing Files public links, the `/f/<token>` route, or `haus files share`
  - changing how Files bytes are served outside Server membership
  - changing artifact deletion, retention, or moves in a way that could break a public link
---

# Files public links

A public link lets people and tools outside the Server see one file in Files: paste it into
Linear, Slack, a Markdown doc, or a browser. Everything else about Files stays membership-gated
([Files](../docs/api/artifacts.md)).

## Contract

- **Opt-in per file.** A file has no public link until a member or Agent who can read it creates
  one. Creating one when it already exists returns the existing link (idempotent).
- **Unguessable URL.** `https://<app origin>/f/<token>`. The token is 24 random bytes (192 bits)
  in base64url, 32 characters, unrelated to any id. The App origin is the Server's origin in
  production (the Server serves the App), so the link is a Server route; the dev website proxies
  `/f/` to the Server.
- **Follows the file.** The link serves the file's current revision, so a pasted link always
  shows the latest. It survives moves and renames (it names the artifact, not the path).
- **Ends with the file.** Disabling the link, deleting the file, or deleting the Server makes the
  token answer 404 at once. Re-enabling issues a new token; an old token never comes back.
  Revision retention never prunes a current revision, so a live link always has bytes.
- **Who.** Any member or Agent who can read the file may create its link (Files is shared
  Server-wide). Disabling is allowed for whoever created the link or a human Owner/Admin, the
  same shape as deletion: other members' embeds are not theirs to break.

The `artifact.list` result Agents read is unchanged (older Computers parse it strictly); only
the App's tRPC page adds `public_links`.

## Storage

Columns on `artifacts`: `public_token` (unique among non-null), `public_link_created_at`, and
exactly one of `public_link_creator_agent_id` / `public_link_creator_user_id`. All four are null
together (`artifacts_public_link_shape`). Disabling clears them.

## Serving

`GET /f/<token>` streams the current revision's bytes through the Server. There is no HTML page,
no listing, and no other route under `/f/`. Every miss (unknown, disabled, deleted, malformed
token, or file still uploading) is the same bare 404, so a response never says whether a file
exists.

The response type is chosen from the stored content type, never sniffed or trusted for HTML:

| Stored type | Served as | Disposition |
| --- | --- | --- |
| PNG, JPEG, GIF, WebP, AVIF, SVG | itself | inline |
| PDF | `application/pdf` | inline |
| audio/video the App previews | itself | inline |
| `text/*` (including HTML), JSON, XML, YAML, CSV, Markdown | `text/plain; charset=utf-8` | inline |
| anything else | `application/octet-stream` | attachment |

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Resource-Policy: cross-origin` (other sites may embed it), and
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, so even an SVG
opened top-level runs no script on the App origin. PDFs carry no CSP: browser PDF viewers refuse
to render under one, and their own script runs isolated from the page. Caching is `Cache-Control: public, max-age=60` with the revision's SHA-256 as a
strong `ETag`; `If-None-Match` answers 304 without touching storage. A revoked link can stay in
a shared cache for at most a minute.

`GET /f/<token>/thumbnail` streams the current revision's WebP thumbnail (raster images only;
404 otherwise), for embedding a large print file at preview size. `HEAD` answers the headers
without reading storage.

### Unfurls and embeds

The same URL serves both: a Markdown image (`![](…/f/<token>)`) and an unfurl bot both receive
`image/*` bytes, which Linear, Slack, GitHub, and Discord render as an image. No OpenGraph page
exists, so non-image files unfurl as a plain link or download. Serving user content as HTML on
the App origin is never allowed, which an OpenGraph page would need care to avoid; add one only
behind its own review.

## Surfaces

- **App.** The file row ⋮ menu and the viewer header ⋮ menu offer Copy public link (creates or
  reuses, then copies) and, when the file is public and the viewer may disable it, Disable public
  link. A public file shows a small globe mark in its row and grid tile and a "Public link" chip
  in the viewer header. tRPC: `artifact.publicLink` (one file's link), `artifact.share`
  (create or reuse), `artifact.unshare` (disable), and `artifact.list` pages carry
  `public_links` keyed by artifact id for the page's files.
- **Agents.** `haus files share <id|link|path>` prints `{ artifact_id, url }`; `--disable`
  disables. The `files` Manual topic teaches it. Agent routes: `POST /api/agent/artifacts/:id/public-link` and
  `POST /api/agent/artifacts/:id/public-link/disable`.
- **Events.** Creating or disabling a link publishes `artifact.onUpdated` with the artifact id.

## Abuse

Tokens carry 192 bits, so enumeration is infeasible and the route needs no rate limit of its
own. Bytes flow only for files someone deliberately shared. Range requests are not supported;
players and PDF viewers fall back to a full read.
