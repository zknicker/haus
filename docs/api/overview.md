---
summary: API ownership across hosted tRPC, Computer attachment protocol, and scoped Agent HTTP routes.
read_when:
  - changing Server routers, Computer protocol, Agent HTTP routes, or shared API types
  - adding a first-party cross-boundary capability
---

# API overview

```text
App -- tRPC --> Server
Computer -- attachment protocol --> Server
Agent CLI -- localhost proxy --> Computer -- scoped HTTP --> Server
Outside system -- Trigger bearer secret --> Server
```

`packages/haus-api/src/` owns shared Zod and TypeScript contracts. Server routers live under
`apps/server/src/haus-api/`. Computer protocol handling lives in `apps/computer/src/`. The
OpenAPI document describes the managed Agent HTTP surface plus the public inbound Trigger route,
and generates `src/generated/openapi.d.ts`.

The `@haus/api` package root is a browser-safe contract surface. It must not import Node built-ins
or re-export modules that do. Browser clients may use the root for types and browser-safe values;
narrow subpaths remain preferred for values. Node-only implementations live under explicit
`@haus/api/node/*` exports whose package conditions exclude browser resolution. The Website build
rejects any `node:*` module that enters its browser dependency graph.

`POST /api/triggers/:triggerId` is the one first-party route authenticated by a per-Trigger
bearer secret instead of Clerk, a Computer credential, or a runner credential; see
[Triggers](triggers.md).

Server is authoritative for collaboration and authorization. Computer is authoritative for local
execution facts and reports bounded state through typed protocol messages. Realtime notifications
invalidate or update durable Server reads; clients recover after reconnect by refetching Server
state.

The attachment protocol negotiates heartbeats after bootstrap without changing the stable bootstrap
frame. Computer closes a connection that misses the negotiated acknowledgement deadline and its
resident supervisor reconnects; Server independently expires negotiated Computers that stop sending
heartbeats. Heartbeats require an explicit post-bootstrap opt-in, so either Server or Computer can
roll out first without changing the behavior of an older peer. Independently of that opt-in,
Server pings every attachment socket at the WebSocket transport level, which any client answers.
Routine timings match Raft: Server pings every 30 seconds, negotiates the same 30-second interval
and 60-second timeout for app-level heartbeats, and reaps a socket that stays silent for 60 seconds
as a `heartbeat-timeout` disconnect. Any inbound frame counts as alive. Server's live attachment
registry, not the stored `health` column, decides whether `computer.list` reports a Computer as
connected.

Because a silent socket can look attached for up to a minute, Server also probes on demand: it pings
the live socket and treats a pong or any inbound frame within 3 seconds as present. An unanswered
probe reaps the socket through the same generation-guarded `heartbeat-timeout` path. The
`computer.checkPresence` mutation, authorized like `computer.list`, probes all of a Server's
attached Computers in parallel and returns the fresh `computer.list` shape. `computer.update` probes
its target before sending the update frame and rejects an unanswered Computer as not connected.

After bootstrap, Computer sends its bounded management-event outbox in a separate system-event
report. Server inserts those stable event ids idempotently and also records the connection events it
observes itself. The App pages through the retained history with the focused
`computer.systemLog` query, so the log remains available while Computer is offline and no page
grows without bound. Keeping the report separate lets older peers ignore the capability without
rejecting the ordinary inventory report.

Cross-boundary types use Haus product nouns and narrow discriminated unions. Do not add aliases
for the retired standalone Runtime or SDK surfaces.

`computer.refreshInventory` is an Owner/Admin mutation for one attached Computer. Server sends a
correlated `inventory-refresh-request` and waits up to 30 seconds for `inventory-refresh-result`.
Concurrent requests for the same Computer share one scan. A successful response replaces only
the stored runtimes and models, then emits a Computer update event before the mutation completes.
Failed, disconnected, or unanswered requests preserve the last inventory. Computer separately
reports refreshed usage. These optional frames leave older peers' ordinary reports intact.

Computer protocol 26 adds the Cursor model catalog to inventory and the resolved model to each
Cloud Agent Run. Computer protocol 27 adds per-model `features` to inventory; the inventory schema
is strict, so a protocol-26 Server would reject a report that carries them. Server and Computer
therefore ship it in the same release, and the release requires an exact match: Server accepts
ordinary work only from a Computer that reports protocol 27. A protocol-26 or older Computer
connects in bootstrap mode, which keeps update control but cannot execute ordinary work, so the
Computer artifact must publish before the Server is promoted
([release prerequisites](../operations/releases.md#prerequisites)). App protocol 8 gates the unread Inbox, the removal of Needs you
and Done, and the shared notification facts. Haus App 5.0.0 and iPhone 5.0.0 send that version.
Older installed clients require an update, and an already-open hosted App requires a reload.
