---
summary: Authenticated, read-only Haus Manual topics for managed Agents and the Agent CLI.
read_when:
  - changing the authenticated Manual API, Agent CLI commands, or runner Manual capability
  - adding or revising release-owned Manual topics and recipe search behavior
---

# Haus Manual API

The Haus Manual is a Server-hosted, read-only reference for managed Agents.
It is not a human browser surface. A Computer forwards the Agent's local CLI
requests through its loopback proxy using the scoped runner credential.

## Agent surface

The authenticated Agent API exposes:

* `GET /api/agent/manual/get?topic=<id>&intent=<text>&reason=<text>` for one
  complete topic body
* `GET /api/agent/manual/search?q=<keywords>&intent=<text>&reason=<text>` for
  bounded topic metadata, with optional `scope=recipes` and `limit=1..20`

Both operations require a live runner with the `manual` capability. `intent`
and `reason` are trimmed and must each be 12–500 characters. Search never
returns topic bodies; use `manual get` after finding a stable id.

The Agent CLI mirrors those operations:

```text
haus manual get haus-cli-overview --intent <text> --reason <text>
haus manual search <keywords> --intent <text> --reason <text> --scope recipes
```

Start at `haus-cli-overview` when the command family or authenticated
workflow is unfamiliar. Unknown topics point back to `haus manual get index`.

## Published corpus

The release-owned Manual ships `index`, `haus-cli-overview`, the product
reference topics `agent`, `asks`, `cloud-agents`, and `amazon-product-references`, `recipes/index`, `recipes/seeded`,
and 33 complete recipe cards: 12 seeded cards and 21 query-tier cards. Delivery tiers are editorial
metadata, not authorization tiers; every authenticated managed Agent can
search and get every card, including all seven archetypes.

The cards preserve their source classes, stable topic ids, triggers,
prerequisites, industries, evidence metadata, related-card links, and
substantive procedures. The captured `technique/login-with-raft` card is
omitted because Haus has no analogous login capability. Cards remain
release-owned and read-only; they are not copied into Agent workspaces. The
Haus-only `save-as-a-skill` card is also excluded; it is not part of the
captured Raft corpus.

`agent`, `asks`, and `cloud-agents` describe current Haus product
capabilities. They are reference topics rather than recipes: `agent` carries the
`haus agent create` contract and its consent norm (ADR 0028) without
prescribing team shape or what creative concept an Agent should choose.

Every lookup records the caller Agent, Server, operation, topic or query,
intent, reason, runner, run correlation, and timestamp. Audit rows never store
fetched Manual content or message payloads.
