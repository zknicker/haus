---
summary: The uniform avatar system — one uploaded square image (or initials) for agents and people alike, its Server storage contract, and the shared React components.
read_when:
  - rendering an identity mark for an agent or a person anywhere in the app
  - changing avatar upload rules, storage, or the avatar URL contract
  - adding a surface that shows who authored or owns something
---

# Avatars

Agents and people share **one** identity mark: a square image the owner
uploads, or initials when there is none. There is no agent-specific art and no
agent-vs-human branch at any call site.

## Contract

`packages/haus-api/src/avatar.ts` (`@haus/api/avatar`) owns the rules:

- `avatarMediaTypes` — `image/jpeg`, `image/png`, `image/webp`. Nothing else is
  accepted, and the server re-checks the magic signature against the declared
  media type.
- `avatarPixelSize` (256) — clients resize to at most this square before
  upload. The original is never stored.
- `avatarMaxBytes` (512 KiB) — checked after the client resize and again on the
  server.
- `avatarIdSchema` / `isAvatarId` — hosted ids are `avt_` + 16 lowercase
  alphanumeric characters.

Every record that can wear an avatar exposes **`avatarUrl: string | null`** —
an absolute-or-relative URL a surface drops straight into an `<img src>`. Call
sites never see an avatar id, media type, or byte payload. This holds for
`Agent` and `ServerMember` alike.

## Generation

Avatar generation is one Server-owned image service with two ingresses; neither is a second avatar
storage path. The service applies the canonical pixel-art prompt, requests one `gpt-image-2` PNG
without a reference image, and center-crops and normalizes it to the ordinary 256×256 PNG/512 KiB
contract.

A managed Agent reaches it through `haus agent create --avatar-concept <text>`, which generates
before the creation transaction and assigns the result to the new Agent, and through
`haus agent avatar --agent @handle --concept <text>`, which replaces an existing Agent's avatar.
There is no standalone generate command and no transient avatar file. A Server with no provider
provisioned still creates Agents, without an avatar; a transient failure refuses the create.

The service admits one request per Agent and two per Server. Busy requests are retryable, and
provider failures or malformed output never expose provider details. Safe operational logs include
request identity, actor/Server, model, duration, outcome, and normalized metadata only — no concept
text or image bytes.

The human App exposes the same service through `avatar.generate` for Server Owners and Admins on an
active ordinary Agent. It accepts only the explicit short concept plus the Server and Agent ids; it
does not derive a concept from profile fields. Each returned image joins an App-local generation
session as a selectable variant; an explicit Use Avatar sends the staged variant's bytes through
ordinary `avatar.set`. Generating, retrying, canceling, or a failed save leaves the current avatar and
hosted rows untouched; upload and initials behavior remain unchanged.

The session (`features/members/agent-profile/avatar-generation-session.ts`) lives with the
always-mounted generator in the Agent header, not with the dialog: closing the dialog keeps the
concept, every variant, and any run in flight, and reopening resumes it. It resets after a successful
save (on the next open, so the closing dialog does not flash empty) or when the generator remounts for
a different Agent. Only a save in flight blocks dismissal. Generation and save errors are attributed
separately: a failed run becomes the last page on the stage while earlier variants stay
selectable, and a save error clears when save is retried or a different slot is staged. Run ids never
repeat, so a result from a run superseded by a newer run or a save is dropped. A busy Server
(`TOO_MANY_REQUESTS`) reads as a retry-in-a-moment message.

The dialog is one column built for the common case of generating once and using it: a square stage
spanning the body, the concept prompt bar, and the footer. It never changes size across states. With
two or more pages (variants, then the latest run while it draws or after it fails), a compact pager
floats over the bottom of the stage — previous and next icon buttons around a `2 / 3` counter, both
ends wrapping, Left and Right paging while a pager button has focus, and a polite live region naming
the shown page; with one page there is no pager. A generation error is clamped inside the stage, a
save error is clamped to two lines in the footer's reserved slot, and Use Avatar is always present,
disabled until a variant is staged.

## Storage

**Hosted (Postgres).** Bytes live in an `avatars` table
(`id`/`media_type`/`byte_size`/`sha256`/`bytes`/`created_at`); `agents.avatar_id`
and `users.avatar_id` point at it with `on delete set null`. Writes go through
`avatar.set` / `avatar.clear` (`apps/server/src/haus-api/avatar/`, backed by
`apps/server/src/avatars/`) with the bytes base64-encoded on the ordinary tRPC
call — 512 KiB is far under the body limit, so no attachment reservation is
involved. Setting takes the Server row lock, authorizes (owner/admin for an
Agent, self for a person), inserts the new row, repoints the owner, and deletes
the replaced row in the same transaction, so a row exists only while something
wears it.

The hosted table permits a release-owned image up to 2 MiB so the exact Cove
avatar can be assigned byte-for-byte by the Server factory operation. Ordinary
human and Agent uploads remain limited to `avatarMaxBytes` (512 KiB) and still
flow through `avatar.set`; this internal asset allowance does not widen the
upload contract or create a Cove-specific renderer.

Reads are `GET /api/avatars/:avatarId`, unauthenticated on purpose — an `<img>`
cannot carry a bearer token, ids are opaque, and every replacement mints a fresh
id. The response is `immutable`-cached for a year. `avatarUrlFor` builds the URL
projections emit.

## Rendering

- `EntityAvatar` (`components/ui/entity-avatar.tsx`) is the only identity mark
  in the app — rail, sidebar rows, mention chips, transcript, profile pages.
  A stock HeroUI `Avatar` at `sm` (32px), `md` (40px), or `lg` (48px), with
  `<Avatar.Image>` only when `src` is set and an always-present initials
  fallback. `className` is for layout offsets only, never for restyling.
  Pass a **number** for slots below HeroUI's 32px floor (contextual sidebar rows
  at 24px, mention chips at 18px, thread reply previews at 20px); the exact box
  arrives as inline style, which is the one place this primitive reaches past
  the variant. Do not add a second avatar component for small sizes.
- Servers currently use initials rather than an uploaded image. Every Server
  surface renders those initials through `EntityAvatar` at the stock `sm`
  size; do not pass an exact numeric size from a Server call site.
- Avatar shape and styling are HeroUI defaults. Do not override `.avatar`
  globally or introduce an app-specific radius token. `ChannelIconBox` uses
  the stock `rounded-lg` utility for the adjacent Channel mark.
- `AgentAvatar` composes `EntityAvatar` with the stock HeroUI `Badge.Anchor` and
  an empty `Badge` availability dot. Its live-Agent input requires the
  canonical `Agent.availability`; it has no unknown or missing-status variant.
  Historical or unresolved authors render `EntityAvatar` without a status
  badge. Availability decoration belongs here; do not add a second status-dot
  primitive. Offline uses the theme's stronger `muted` fill because HeroUI's
  pale `default` fill disappears on sidebar surfaces.
- `getEntityInitials(name)` is the single initials algorithm: empty → `?`, one
  word → its first two letters, otherwise first + last initial. Handle an empty
  display name at the call site (e.g. `name={displayName || 'You'}`) rather
  than reintroducing a local variant.

## Uploading

`features/avatars/` owns the whole upload experience for both humans and
Agents. `readAvatarImage(file)` validates the media type, center-crops to a
square, resizes down to `avatarPixelSize` (it never upscales), re-encodes in the
source media type, enforces `avatarMaxBytes`, and returns `{ base64, blob,
dataUrl, mediaType }` — one canvas encode serving both the hosted upload and the
local data URL. `AvatarPicker` wraps that in a stock HeroUI `Button` +
`Tooltip` around `EntityAvatar`, and reports failures through `onError` so each
caller presents them in its own idiom.
