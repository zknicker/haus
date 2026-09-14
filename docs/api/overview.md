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
roll out first without changing the behavior of an older peer.

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

Haus 1.16 requires Computer protocol 17 for Agent configuration briefs and the current Browser
and task contracts. Older Computers retain bootstrap update control but cannot execute ordinary
work. App protocol 5 gates the task-list envelope and the removal of Agent roles and prepared
actions; the hosted App and iPhone 1.6 send that version. Older iPhone builds require an update,
and an already-open hosted App requires a reload.
