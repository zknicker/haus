---
summary: The public inbound Trigger route, managed Agent Trigger routes, the operator Trigger tRPC procedures, and the automation provenance carried on an Agent's message.
read_when:
  - changing the inbound Trigger route, its status codes, headers, or limits
  - changing the GitHub App webhook endpoint, the sink, or `github` Trigger create and update
  - changing `linear` Trigger create, update, or preview
  - changing managed Agent Trigger routes, secrets, or fire log reads
  - changing operator Trigger creation, editing, status, rotation, test fires, or deletion
  - changing Agent-wide Trigger history or fire retention
  - changing message provenance, the `cause` field, or `automation.fireContext`
---

# Triggers API

A Trigger is an Agent-owned inbound wake (ADR 0027). Four surfaces touch it: the
public route an outside system calls, the managed Agent routes an Agent uses on
its own Triggers, the operator tRPC procedures behind the Agent profile's
Automations tab, and the provenance surface that carries a fire onto the Agent's
own message (ADR 0026), which reminders share. The two authoring surfaces share
one core and manage the same rows. Wire schemas live in
`packages/haus-api/src/triggers.ts`, where `triggerKindSchema` is
`z.enum(['webhook', 'github', 'linear'])` and the wire `Trigger` is a union on
`kind`: a `webhook` carries `url`, a `github` Trigger carries `github`
(installation, repository scope, events, `problem`, `suppressedCount`), and a
`linear` Trigger carries `linear` (`connectionId`, `workspaceName`, `groups` of
stored ids, `display` names per id, `problem`, `problemSince`,
`suppressedCount`, `selfSuppressedCount`). Neither has a URL or a secret. The
event vocabularies are `packages/haus-api/src/github-trigger-events.ts` and
`linear-trigger-events.ts`. A `github` Trigger fires from the GitHub App webhook
([GitHub App webhook](#github-app-webhook)) and a `linear` Trigger from the
Linear app's workspace webhook ([Linear app](../../specs/linear-app.md#webhooks)),
not the public route below.

## Public inbound route

```http
POST /api/triggers/{triggerId}
Authorization: Bearer grtt_<base64url>
Idempotency-Key: <optional, ≤ 200 chars>
```

This is the only first-party route authenticated by a per-Trigger bearer secret
instead of a human AppSession, a Computer credential, or an Agent runner credential. The
Server resolves the row by `sha256(secret)` and requires the path id to match
that row. It is registered before tRPC and before the static App's not-found
handler.

The body is raw text or JSON under any content type and may be empty. A
route-scoped `*/*` parser captures the raw string; the Server stores it verbatim
and never parses it for semantics. It must be storable text: valid UTF-8 with no
NUL byte, since PostgreSQL `text` cannot hold one. Only the excerpt carried in
the Agent's envelope is altered: it arrives under a provenance line marking it as
untrusted data, with every payload line indented two spaces so a body cannot forge
an envelope header line, and the envelope's last line is
`reply with: --cause <fireId> on the command that posts (haus message send or haus cloud-agent start)`. See
[specs/triggers.md](../../specs/triggers.md) for the exact envelope.

A fire writes no Chat message and emits no durable event. It records the fire and
enqueues the Agent's pending work; whether anything appears in a conversation is
up to the Agent's answer.

| Status | Body | Meaning |
| --- | --- | --- |
| `202` | `{ type: 'trigger_fire', triggerId, fireId }` | New fire recorded and dispatched |
| `200` | `{ type: 'trigger_fire', triggerId, fireId, duplicate: true }` | `Idempotency-Key` matched an existing fire for this Trigger |
| `400` | `{ code: 'invalid_idempotency_key' }` | `Idempotency-Key` over 200 characters; it is refused, not dropped |
| `401` | `{ code: 'unauthorized' }` | Missing or invalid secret, and unknown trigger id |
| `409` | `{ code: 'trigger_disabled' }` | The Trigger is disabled |
| `409` | `{ code: 'trigger_unavailable' }` | Owner Agent inactive or anchor no longer writable; the Trigger is disabled by this request |
| `413` | `{ code: 'payload_too_large' }` | Body over 65,536 bytes |
| `415` | `{ code: 'unsupported_media_type' }` | Body is not valid UTF-8, or contains a NUL byte |
| `429` | `{ code: 'rate_limited' }` plus `Retry-After` | Over 10 fires per 10 seconds or 60 per rolling hour, counted per Trigger |

The route answers in a fixed order: header and body shape first, so `400`,
`413`, and `415` answer any caller; then the bearer secret, so an unknown
trigger id answers `401` rather than `404` and the route never reveals whether a
Trigger exists; then an `Idempotency-Key` replay, answered from the recorded
fire without consuming rate-limit budget; then the rate limit; then
`trigger_disabled`; and only then the fire itself. A request refused before the
limiter costs nothing, and everything reaching the limiter is metered — a
disabled Trigger cannot be hammered for free.

## GitHub App webhook

```http
POST /api/github/webhook
X-GitHub-Event: <event>
X-GitHub-Delivery: <guid, ≤ 64 chars>
X-Hub-Signature-256: sha256=<hex HMAC of the raw body>
```

One endpoint serves every installation of the Haus GitHub App. It runs before
tRPC without a human AppSession, reads the raw body (10 MiB limit) so the HMAC covers the
exact bytes, compares in constant time, and only then parses JSON.

| Status | Body | When |
| --- | --- | --- |
| `503` | `{ code: 'github_app_unconfigured' }` | The App's credentials are not configured |
| `400` | `{ code: 'invalid_github_headers' }` | A required header is missing, or the guid is over 64 characters |
| `413` | `{ code: 'payload_too_large' }` | Body over 10 MiB |
| `401` | `{ code: 'invalid_signature' }` | The signature does not match |
| `415` | `{ code: 'unsupported_media_type' }` | The body is not a JSON object |
| `200` | `{ duplicate: true }` | This guid was already ingested |
| `202` | `{ routed: <n> }` | Accepted; `n` Triggers fired. Unknown installations, foreign repositories, filter misses, and a guid another attempt is ingesting all answer `202` too |

Every delivery is claimed by guid in `github_webhook_deliveries` before routing,
so a redelivery or a recovered copy dedupes. Lifecycle events (`installation`,
`installation_repositories`, `installation_target`) reconcile the installation
and fire nothing. Each fire's `dedupe_key` is `gh:<guid>`, its `content_type`
is `application/json`, and its payload is the event projection. Recovery reads
`GET /app/hook/deliveries` with the App JWT and ingests every guid not done
locally; it skips the HMAC because the authenticated API vouches for it.
`POST /api/github/sink` answers `204` to anything; the development App posts
there so its deliveries exist in GitHub's log for development stacks to pull.
[GitHub Triggers](../../specs/github-triggers.md) is the normative contract.

## Managed Agent routes

Managed Agents reach these through Computer's loopback proxy with the scoped
runner credential, like every other `/api/agent/*` route. An Agent may address
only its own Triggers. Anchor writability is enforced at `create` and at every
fire; the other verbs require ownership plus continued access to the anchor
message, matching the reminder precedent.

```http
POST   /api/agent/triggers            { title, messageId, kind?, instruction? }
                                      → { trigger, secret, url, curl }
POST   /api/agent/triggers            { kind: 'github', title, messageId, instruction?, github }
                                      → { trigger }
POST   /api/agent/triggers            { kind: 'linear', title, messageId, instruction?, linear }
                                      → { trigger }
GET    /api/agent/triggers            list
GET    /api/agent/triggers/{id}       show
POST   /api/agent/triggers/{id}/disable
POST   /api/agent/triggers/{id}/enable
POST   /api/agent/triggers/{id}/rotate  → { trigger, secret, url, curl }
DELETE /api/agent/triggers/{id}         → { deleted: true, id }
GET    /api/agent/triggers/{id}/log[?fire=<fireId>][&limit=<1-100>]
```

After deletion, the Trigger leaves `list`, `show`, and `log` immediately. Its
recent fire rows remain available through the operator's Agent-wide
`trigger.history` procedure until the retention sweep removes them.

`kind` defaults to `webhook`. A `github` create takes
`github: { account, repositories, events }` and answers the Trigger alone;
`account` is the GitHub org or user login, which the Server resolves without
case to its live installation on that account (`PATCH` takes the same block).
The operator `trigger.create` and `trigger.update` take `installationId`
instead. `rotate` on a `github` Trigger is `400 INVALID_ARG`
(`trigger_has_no_secret: …`). A GitHub authoring refusal is `400 INVALID_ARG`
whose message leads with its code (`github_installation_unavailable`,
`github_access_required`, `github_permissions_missing`,
`github_repositories_unavailable`, `github_trigger_limit`). A `linear` create takes
`linear: { workspace?, groups }`: `workspace` is a url key (or name) among the
Agent's granted workspaces, optional with exactly one and on update (keeping
the current one), and groups carry names, keys, URLs, emails, and `@self` /
`@agent:<handle>` selectors that the Server resolves to stable ids; its
refusals lead with `linear_workspace_unavailable`, `linear_workspace_ambiguous`
(both listing the url keys the Agent can use),
`linear_access_required`, `linear_reference_unavailable`,
`linear_reference_ambiguous` (listing candidates), `linear_team_outside_access`,
or `linear_trigger_limit`. `messageId` is the asking
message the Trigger anchors to, which is what distinguishes Agent authoring from
the operator path.

`anchorMessageId` is `string | null` on every Trigger the wire carries: an
Agent-created Trigger names its asking message, an operator-created one anchors
on the DM alone. A client that builds a link or an excerpt from the anchor must
handle null and fall back to the anchor Chat.

Every response carries the Agent view of the Trigger: the operator fields plus
`anchorTarget`, the Chat target the Trigger is anchored to.

`create` and `rotate` return the bearer secret exactly once; the Server keeps
only its SHA-256 hash, and `list` and `show` never include a secret. `log`
answers one of two tagged shapes and never an empty object:
`{ kind: 'fires', fires }` with payload-free history, newest first, 50 by
default and at most 100, or `{ kind: 'fire', fire }` with one fire and its full
payload when `fire` is supplied.

`url` is derived per request rather than from configuration: the Server has no
public-origin setting and reads `x-forwarded-host` or `host` plus
`x-forwarded-proto` or the connection protocol, so the address is the Server as
seen through the Computer proxy. A reverse proxy must forward both headers with
the externally reachable host and scheme.

Failures use the ordinary Agent API error shape: `401 MISSING_TOKEN` without a
runner credential, `400 INVALID_ARG` for a malformed request, `404
INVALID_TARGET` for a Trigger or anchor the Agent cannot address, `409
TARGET_READ_ONLY` for an archived anchor Chat, and `409 INVALID_ARG` otherwise.

These mutations carry no idempotency key and no expected version. A repeated
call applies again rather than replaying an earlier result.

## Operator procedures

The App uses the Server `trigger` tRPC router on the Agent profile's Automations
tab. Only Server Owners and Admins may call it.

- `trigger.list({ serverId, agentId?, status? })` → Triggers, oldest first
- `trigger.runs({ serverId, triggerId })` → up to 100 fires, newest first, no payloads
- `trigger.history({ serverId, agentId, limit? })` → retained fires across the Agent's Triggers, newest first
- `trigger.create({ serverId, agentId, kind: 'webhook', title, instruction? })` → `{ trigger, secret, url, curl }`
- `trigger.create({ serverId, agentId, kind: 'github', title, instruction?, github })` → `{ trigger }`
- `trigger.create({ serverId, agentId, kind: 'linear', title, instruction?, linear })` → `{ trigger }`
- `trigger.update({ serverId, triggerId, title?, instruction?, github?, linear? })` → `{ trigger }`
- `trigger.preview({ serverId, triggerId, event, payload })` (`github`) or `({ serverId, triggerId, payload })` (`linear`) → the kind's preview result
- `trigger.setStatus({ serverId, triggerId, status: 'armed' | 'disabled' })` → `{ trigger }`
- `trigger.rotate({ serverId, triggerId })` → `{ trigger, secret, url, curl }`
- `trigger.delete({ serverId, triggerId })` → `{ deleted: true, id }`
- `trigger.test({ serverId, triggerId })` → `{ fireId }`

`trigger.create` has no anchor message to take, so it finds or creates the DM
between the calling human and the owning Agent and anchors the Trigger on that
Chat with `anchorMessageId` null; the Agent then answers that Trigger's fires in
that DM. It writes no Chat message — creating a Trigger announces nothing, and
the Trigger's existence is visible on the Automations tab (ADR 0026). It records
the caller in `createdByUserId`, and the Trigger reports `createdByHandle`
alongside it.

`trigger.setStatus` arms and disables in one procedure. It replaces
`trigger.disable`, which no longer exists.

`trigger.update` needs at least one of `title`, `instruction`, `github`, and
`linear` and touches nothing else; an `instruction` of null or an empty string
clears it, and omitting it leaves it alone. `github` (or `linear`) replaces that
kind's configuration whole after the authoring checks and clears its problem; on
another kind, or both at once, it is `BAD_REQUEST` `trigger_kind_mismatch`. A
`github` create or update refuses with `BAD_REQUEST` and a leading code:
`github_installation_unavailable`, `github_access_required`,
`github_permissions_missing`, `github_repositories_unavailable`, or
`github_trigger_limit` (25 undeleted `github` Triggers per installation); a
`linear` one with the Linear codes above (25 undeleted `linear` Triggers per
workspace connection). Every mutation bumps `version`,
which is a change counter rather than an expected-version token — these
procedures carry no idempotency key and no concurrency check, so a repeated call
applies again.

`trigger.delete` tombstones the Trigger, removes it from active reads and secret
authentication, and retires queued pending work those fires created. Its fire
rows remain in `trigger.history` for 30 days, then the retention sweep deletes
the tombstone and any remaining fire rows. A non-seen inbox row is unfinished
work and blocks expiry; an in-flight row is requeued only while its Trigger is
still live. Provenance is not part of that lifecycle: the Agent's own messages
stay in canonical history and keep their mark, now archived — it still names
the Trigger that woke the Agent and drops only the live half.

`trigger.history` is operator-only and returns one row per retained fire:
`fireId`, `triggerId`, `title`, `firedAt`, `payloadBytes`, `contentType`,
`dedupeKey`, an optional earliest answer `{ chatId, messageId }`, and a
`triggerDeletedAt` tombstone marker. It is the durable Agent-profile history
path, so deleting a Trigger never makes its recent fires unreachable.

`trigger.test` fires through the same path as the public route: same
transaction, same envelope, and the same per-Trigger rate limiter, so a test
spends real fire budget. It sends
`{"test":true,"sentBy":"<member handle>","sentAt":"<ISO 8601>"}` as
`application/json` with no dedupe key and returns the new `fireId`; a `github`
Trigger's test fire sends a sample projection of its first event marked
`"test": true` under the envelope's `GitHub:` line, and a `linear` Trigger's a
sample projection of its first group under the `Linear:` line. It carries no
bearer secret deliberately: an operator who can call `trigger.rotate` can already
fire the Trigger.

`create` and `rotate` are the only procedures that return a secret, and each
returns it once (a `github` or `linear` create returns none). Every webhook the router returns carries `url`, so the App can
show the address without ever holding the secret; the URL is derived from the
request, so it is the Server as the App reached it.

Errors follow the router's shared mapping: `FORBIDDEN` below Admin, `NOT_FOUND`
for an unknown Trigger, `CONFLICT` for a disabled or unavailable Trigger, and
`BAD_REQUEST` for a malformed input. There is no durable `trigger.changed` event
and no Trigger subscription, and a fire raises no `message.created` either,
because it writes no message.

## Automation provenance

A fire reaches a conversation only through the Agent's own message. This surface
is shared with reminders; `specs/automation-provenance.md` is the normative
contract.

`POST /api/agent/messages/send` (behind `haus message send`) accepts an
optional `cause`, the id of the fire the message answers. The Server checks that
the fire exists in this Server, that its automation is owned by the sending
Agent, and, for a Trigger fire, that the retained Trigger row still exists; a failure is
`INVALID_ARG` naming the reason. On success the provenance row is written in the
message's own transaction. A send without `cause` is an ordinary message.

Every message the Server returns carries an optional `cause`
(`packages/haus-api/src/chat.ts`), read from the message's own provenance row
so a client renders the mark from the message alone. The mark's own fields are
snapshotted when the cause is recorded and outlive the automation; `live` is the
automation as it stands now, and is null once the automation or the answered
fire is gone:

```ts
cause?: {
  kind: 'trigger' | 'reminder';
  automationId: string;
  ownerAgentId: string;   // the owning Agent, for "Manage in Automations"
  fireId: string;
  firedAt: string;        // when the answered fire happened
  title: string;
  summary: string;        // a reminder's cadence, or a Trigger's kind label
  attribution: 'explicit' | 'inferred';
  live: {
    status: string;
    lastFiredAt: string | null;
    fireCount: number;
    instruction: string | null; // bounded snippet
  } | null;               // null once the automation or the fire is archived
}
```

`automation.fireContext({ serverId, messageId })` returns the Thread context for
one caused message. It is authorized by access to the message rather than by
operator role, and answers `NOT_FOUND` only when the message has no cause at
all. It returns the `cause` fields plus, for a Trigger, the `payload` bounded to
8,192 characters, `payloadBytes`, `contentType`, `firedAt`, and the fire's
ordinal among that Trigger's fires; for a reminder, `repeat`, `nextFireAt`,
`anchorMessageId`, and a bounded `anchorExcerpt`. For an archived cause it
answers from the snapshot instead: `cause.live`, `fireOrdinal`, `fireTotal`, and
every kind-specific field read null, and `anchorChatId` and `firedAt` still
stand. The operator-only `trigger.runs` is unchanged.

Product logic lives in `apps/server/src/triggers/`, and GitHub delivery ingest,
routing, matching, projection, and recovery in `apps/server/src/github/`. The public route is
`trigger-route.ts` there, the Agent routes are
`apps/server/src/agent-api/trigger-routes.ts`, and the tRPC features are
`apps/server/src/haus-api/trigger/` and
`apps/server/src/haus-api/automation/`; the CLI verbs live in
`apps/computer/src/agent-cli/commands/`.

## Agent edits and selection preview

`PATCH /api/agent/triggers/:id` accepts `{ title?, instruction?, github?, linear? }`, at least one field. Ownership and anchor access are required. An empty or null instruction clears it. GitHub and Linear config replacement use the same grant, workspace or installation, reference, and capacity checks as operator edits; identity and history stay intact.

`POST /api/agent/triggers/:id/preview` accepts `{ event, payload }`, a raw GitHub webhook JSON object, with a 65,536-byte request limit. It returns `{ groups: [{ index, matches }], matches, repositoryInScope }`. Group indexes are zero-based. `matches` combines any group match with the currently cached authorized repository scope. It does not check runtime readiness or fire. The operator equivalent is `trigger.preview({ serverId, triggerId, event, payload })`.

For a `linear` Trigger the same route accepts `{ payload }`, a raw Linear webhook body under 60,000 bytes whose `type` names the event, and returns `{ matched, groups, reason? }`: zero-based indexes of the matching groups, and a reason (`unsupported_event`, `unreadable_payload`, `team_outside_access`, `no_group_matched`, or `own_change`) when it would not fire. It projects and matches exactly as delivery does, including the ledger's Agent actor and self-suppression, and fires nothing. The operator equivalent is `trigger.preview({ serverId, triggerId, payload })`. A body of the other kind is `400 INVALID_ARG` `trigger_kind_mismatch`.

Name patterns, per-group exclusions, repeated-event OR groups, and `@default` branch selection are defined in `specs/github-triggers.md`; Linear match groups, stable ids, and selectors in `specs/linear-triggers.md`.
