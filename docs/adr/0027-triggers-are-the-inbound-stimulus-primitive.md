---
summary: Decision to make Agent-owned, Chat-anchored, secret-authenticated webhook Triggers the inbound stimulus primitive, separate from Reminders and MCP connections.
read_when:
  - adding or changing inbound wakes, webhooks, callbacks, or any outside-event surface
  - deciding whether work is a Reminder (time) or a Trigger (outside event)
  - changing how Server bounds, stores, and relays untrusted third-party payloads
---

# ADR 0027: Triggers Are the Inbound Stimulus Primitive

## Status

Accepted 2026-09-02, amended 2026-09-03 to give people an authoring path and to
name each Trigger's `kind`, and amended by ADR 0026, which removes the fire
receipt and, on 2026-09-04, the creation receipt as well, and on 2026-09-09 to
retain bounded fire history across Trigger removal. Complements ADR 0016,
which keeps reminders the scheduling primitive, and ADR 0017, which keeps MCP
connections the outbound integration axis. Neither is superseded. Amended by
[ADR 0045](0045-github-is-a-built-in-connection.md) (2026-10-11): a second kind, `github`, is fed
by the GitHub App's webhook; for that kind only, the Server matches deliveries against a typed
event allowlist and stores a trimmed projection, and the owning Agent must hold the GitHub
connection grant. The `webhook` kind and the rest of this decision are unchanged.

## Decision

A Trigger is an Agent-owned, anchored, authenticated inbound wake. For the
`webhook` kind, an outside system POSTs to `/api/triggers/:triggerId` with the Trigger's
bearer secret; the hosted Server records the fire and wakes the owning Agent with
the payload. The fire writes nothing to the anchored Chat (ADR 0026); if the
Agent has something to say it sends an ordinary message carrying that fire as its
cause.

A Trigger has no schedule and no recurrence, ever. Time-based work is a reminder;
outside-event work is a Trigger. The two vocabularies stay separate: reminder
semantics, tables, verbs, and prompt text are unchanged by this decision.

A Trigger names its `kind`: `webhook`, or `github` (ADR 0045). The kind is a
stored column, a wire enum, a CLI flag, and a picker in the App, so a second
stimulus is a new row in a list rather than a new shape. A `github` Trigger has
no URL and no secret; GitHub's app webhook feeds it, and it is owned by the
GitHub built-in connection rather than a provider abstraction.

For the `webhook` kind, the Server bounds, stores, and relays the payload; it
never interprets it. There is no JSONPath, templating, predicate, or filtering on
Server. The `github` kind is the one exception: the Server matches a delivery
against a closed, typed event allowlist and stores a trimmed projection. For the
`webhook` kind, a fire stores the
body verbatim up to 65,536 bytes and hands the Agent an indented excerpt under a
provenance line marking it as untrusted data, in its own `type=trigger` envelope.
The payload never enters the Chat transcript. People reach it through the Thread
context card on the Agent's answer and through the Trigger's fire history.

The hosted Server owns the Trigger and fires it while the owning Agent's Computer
is offline. Delivery rides the existing agent inbox (`agent_inbox`), so a fire is
durable and resent on reconnect.

People and Agents both author Triggers, over the same rows. A Server Owner or
Admin creates and manages one from the Agent profile's Automations tab; an Agent
creates and manages its own with the `haus` CLI. Whoever authors it, the owning
Agent is the one that wakes, and operators hold the full lifecycle: create, edit,
arm or disable, rotate, test fire, read history, and delete.

The anchor follows the author. An Agent-created Trigger anchors on the message
where someone asked for it. A human-created Trigger has no such message, so it
anchors on the DM between the creating human and the owning Agent with a null
anchor message; that DM is then where the Agent answers its fires. A Trigger
writes no Chat message at any point in its life (ADR 0026); the Automations tab
is where its existence, status, and history are visible.

Secrets are minted at create and rotate, returned once, stored only as a SHA-256
hash, and never readable afterwards. A test fire deliberately needs no secret: it
runs the same fire path, transaction, and rate limiter as a real POST, and an
operator who can rotate the secret can already fire the Trigger.

Removing a Trigger is a logical delete: the Server stamps `deleted_at`, disables
the row, removes it from active reads and secret authentication, and retires
queued wakes. The Trigger's fire rows remain in the Agent-wide history surface
until each fire's own 30-day retention clock expires, while the removal
tombstone remains for 30 days from removal. A non-seen inbox row is unfinished work and blocks expiry; physical
deletion of the tombstone then cascades any remaining fires. This keeps recent
history reachable without treating execution history as a Chat mark.

Triggers are not MCP connections. ADR 0017 governs outbound tool calls the Agent
makes; a Trigger is an inbound stimulus an outside system makes. A `webhook`
Trigger shares no credential, registry, or grant model with connections. A
`github` Trigger depends on an installation bound through the GitHub connection,
and its owning Agent must hold that connection's grant.

## Consequences

- Haus has two Agent wake primitives with a single question between them: is
  the cause a clock or an outside system? A Trigger that wants a schedule is a
  reminder, and a reminder that wants a webhook is a Trigger.
- Unknown trigger ids and bad secrets both answer `401`, so the endpoint never
  reveals whether a Trigger exists.
- A fire the Agent does not answer leaves no trace in the transcript. Its record
  is the fire history on the Automations tab (ADR 0026).
- A fire whose owning Agent is inactive or whose anchor is no longer writable
  disables the Trigger lazily on that request, mirroring reminder lazy cancel.
  A separate hourly retention sweep bounds removed Trigger and fire history; it
  never changes an active Trigger's status.
- Status is one operator procedure, `trigger.setStatus`, which arms and disables.
  The one-way `trigger.disable` it replaces no longer exists.
- Trigger wakes count toward the Agent chain budget, so an Agent whose own
  actions cause its Trigger to fire cannot loop unbounded (ADR 0045).
- Haus deliberately does not build: a provider registry or general provider
  flavors (`github` is a built-in connection's kind, not a registry entry); a
  general payload predicate or filter engine; script payloads and therefore any
  Trigger-specific attention table; more than one stimulus per Trigger, so a
  `webhook` Trigger has exactly one endpoint and one secret; a durable `trigger.changed`
  event; and a Trigger command idempotency ledger, so mutations are not
  idempotent. These are future extensions to be designed when a product need
  arrives, not extension points left open in the code.
