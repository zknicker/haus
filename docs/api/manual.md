---
summary: Authenticated, read-only Haus Manual topics for managed Agents and the Agent CLI.
read_when:
  - changing the authenticated Manual API, Agent CLI commands, or runner Manual capability
  - adding or revising release-owned Manual topics and recipe search behavior
  - changing Manual lookup ranking, aliases, miss guidance, or command-family help pointers
  - reviewing Manual lookup misses from the audit table
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
(what the Agent is trying to accomplish) and `reason` (why it needs the Manual
for that now) are trimmed and must each be 12–500 characters. Search never
returns topic bodies; use `manual get` after finding a stable id.

The Agent CLI mirrors those operations:

```text
haus manual get haus-cli-overview --intent <text> --reason <text>
haus manual search <keywords> --intent <text> --reason <text> --scope recipes
```

Start at `haus-cli-overview` when the command family or authenticated
workflow is unfamiliar. Every command family's `--help` (group and
subcommand) ends with `Details: haus manual get <family>`, and
`haus manual --help` shows example flows.

## Lookup behavior

Lookup lives in `packages/agent-manual` (`lookup.ts`, `lookup-text.ts`,
`lookup-guidance.ts`); the Server route only records the audit row and
renders the result.

* **Normalization.** Ids, titles, aliases, and queries are compared
  lowercased, with every punctuation or path run (`/ - _ .`) as one space and
  English plurals singularized. There are no synonyms.
* **Get** resolves the exact id first, then a normalized id, a recipe id
  without its `recipes/` prefix, a title, or an alias. `reminders`,
  `Cloud Agents`, and `technique/task-claim-lock` all resolve. Lookup keys must
  stay unique across topics (tested).
* **Search** is ranked, not all-terms. Each query term scores its strongest
  field: id 8, alias 7, title 6, recipe trigger 5, summary 4, recipe metadata 2,
  body 1. A whole-query match on an id, title, or alias adds 50; a multi-word
  query contained in a title, alias, or trigger adds 10. A topic qualifies when
  it matches at least half of the meaningful terms. A term no topic contains
  may match a corpus word one edit away (five letters or more) at half weight.
  Recipe-index bodies are not matched, so the index does not join every result.
* **Get miss** returns `404 MANUAL_TOPIC_NOT_FOUND` whose `nextAction` lists up
  to three closest topics with their matched terms, a ready-to-run `get` for
  the closest, a ready-to-run `search` built from the missed id, and the index
  command.
* **Empty search** returns `404 MANUAL_NO_MATCH` with the same closest-topic
  block, a retry hint, a widen-to-all-topics command for `--scope recipes`, and
  the index command.
* **Successful search** prints a next step that opens the top result with the
  caller's own `--intent` and `--reason`.

Topics may carry `aliases`, which steer lookup only and never cross the wire.
Add an alias only for an exact lookup shape an Agent was observed to try, and
only when an existing topic truly answers it. A miss no topic answers stays a
miss; the guidance still shows the nearest topics and the index.

## Reviewing misses

The audit table records the raw get topic or search query with its intent and
reason, but not the outcome. Review misses by replaying the rows against the
current corpus: fixed misses drop out on their own. On the Server host (see
[Hosted Haus troubleshooting](../operations/haus-server-troubleshooting.md)):

```sh
/opt/homebrew/bin/docker exec haus-postgres psql -U haus_admin -d haus_production -At -c \
  "SELECT json_build_object('at', created_at, 'agent', agent_id, 'operation', operation,
     'lookup', coalesce(topic_id, query), 'intent', intent, 'reason', reason)
   FROM manual_lookup_audit WHERE created_at > now() - interval '30 days'
   ORDER BY created_at" > lookups.jsonl
```

Then, from a checkout: `bun packages/agent-manual/scripts/manual-misses.ts < lookups.jsonl`.
Each remaining row is a lookup the Manual still cannot answer. Read its intent
and reason, then either add the exact observed shape as an alias on the topic
that answers it, or record a missing topic as a gap. Never add guessed
aliases.

## Published corpus

The release-owned Manual ships `index`, `haus-cli-overview`, the product
reference topics `agent`, `cloud-agents`, `tasks`, `replies`, and
`amazon-product-references`, one product-noun topic per remaining command
family (`message`, `inbox`, `thread`, `channel`, `server`, `profile`,
`attachment`, `skill`, `reminder`, `trigger`, `visual`), `recipes/index`, `recipes/seeded`,
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

`agent` and `cloud-agents` describe current Haus product
capabilities. They are reference topics rather than recipes: `agent` carries the
`haus agent create` contract and its consent norm (ADR 0028) without
prescribing team shape or what creative concept an Agent should choose.

Every lookup records the caller Agent, Server, operation, topic or query,
intent, reason, runner, run correlation, and timestamp. Audit rows never store
fetched Manual content or message payloads.
