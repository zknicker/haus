---
summary: Agent-local skill library and host import contracts.
read_when:
  - changing Agent skill API routes or Computer skill reports
---

# Skills API

## Agent API

The scoped Agent API exposes the calling Agent's canonical library:

- `GET /api/agent/skills`
- `GET /api/agent/skills/:skillId`
- `POST /api/agent/skills/create`
- `POST /api/agent/skills/patch`
- `POST /api/agent/skills/write-file`
- `DELETE /api/agent/skills/:skillId`

Every route is bound to the authenticated Agent id. Paths are validated inside
that Agent's skill directory. The API cannot read or mutate another Agent's
library or a host import source.

## Computer report

The Computer's ordinary attachment report includes:

- `importableSkills`: opaque source id, name, description, and shortened source
  location for host-installed bundles.
- `agentSkills`: Agent id plus compact name, description, content hash, and
  modification time for each Agent-local bundle.
- `agentSkillImports`: the latest durable accepted, applied, or failed import
  records, including request and source ids.

Only metadata is persisted by the Server. The Server stores the latest complete
inventory in `computers.reported_inventory` for offline display.

## Operator import

`agent.importSkill` accepts `serverId`, `agentId`, and a reported `sourceId`.
Only a Server Owner or Admin may call it. The Server verifies that the Agent is
assigned to the reporting Computer, then sends a typed import request over that
Computer's live attachment.

The Computer resolves the opaque source id against a fresh local scan and
durably records acceptance before `agent.importSkill` returns `{ requestId,
status: "accepted" }`. It waits for any active turn to settle, copies the bundle
atomically into the Agent's library, and reports either `applied` with compact
metadata or `failed` with a bounded error. Accepted work resumes after a
Computer reconnect. The Server never receives bundle bytes.

The Computer parses YAML frontmatter, deduplicates overlapping host roots by
canonical directory, and reports only the first bundle for each destination
name using configured root precedence. It skips bundle symlinks and enforces
bounded depth, file count, per-file bytes, and total bytes before copying. File
contents remain binary-safe.

The independent copy is visible to the next turn. There is no background sync.

## Operator skill file relay

The Owner/Admin tRPC surface exposes:

- `agent.skillFile` to read one Agent copy's `SKILL.md`;
- `agent.updateSkillFile` to replace it with an expected bundle hash; and
- `agent.deleteSkillFile` to delete the bundle with the same hash guard.

The Server rechecks current Owner/Admin membership and the Agent's assigned
Computer for every call. Requests and results exist only in the live
Server-to-Computer relay; the Server does not write content into PostgreSQL or
logs. Updates use atomic file replacement. A stale expected hash returns a
conflict instead of overwriting newer Computer-local content.

Successful mutations emit the ordinary Computer inventory report. App caches
refresh from that Server event; there is no polling.

## Operator host skill preview

`computer.skillFile` accepts `serverId`, `computerId`, and a reported
`importableSkills` source id, and returns `{ content }`: that host bundle's
`SKILL.md`. Only a Server Owner or Admin may call it, and the Computer must be
attached to that Server.

The Server relays a typed `host-skill-file-request` over the Computer's live
attachment. The Computer resolves the opaque source id against a fresh scan of
its own host skill roots — no path crosses the wire — and reads `SKILL.md` up to
2 MiB. It answers with the content or a typed failure: `not-found` (the source
is gone; `NOT_FOUND`), `too-large` or `unreadable` (`UNPROCESSABLE_CONTENT`). An
offline or silent Computer returns `SERVICE_UNAVAILABLE`. Content exists only in
the live relay; the Server never stores it.
