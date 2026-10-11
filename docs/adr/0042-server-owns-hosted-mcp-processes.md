---
summary: Haus Server owns hosted MCP packages, process supervision, private transport, storage, and observability.
read_when:
  - adding or changing a Server-hosted MCP connector
  - changing Server subprocess supervision or connector release packaging
---

# ADR 0042: Server owns hosted MCP processes

Accepted 2026-10-11.

Haus Server manages a catalog of hosted MCP connectors. Each connector keeps its own
package, runtime, process, and credential storage. A connector may use any language;
the catalog declares its command and sanitized environment. Hosted connectors ship
in the Server artifact and participate in the Server's startup and shutdown.
They have no independent release, launchd job, or public endpoint.

The Server's Effect scope supervises each connector. Initial readiness is required
before Server listens. Process exit or a failed health probe triggers cleanup and
restart with bounded exponential delay. A failing connector degrades Server health
without interrupting healthy connectors. Shutdown closes MCP clients before stopping
connectors and reaps connector and account-worker process groups.

A private Unix socket carries standard MCP Streamable HTTP and account provisioning.
The socket directory is temporary and mode 0700. Server generates a new control
credential per connector process and passes it through stdin. The pipe also reports
Server death to the connector. Account tokens and native sessions persist in separate
mode-0600 account records under Server-owned private storage.

Connections retain stable logical URLs under `https://hosted-mcp.haus.invalid/`.
These identifiers never resolve on the network. Only a catalog-selected preset uses
the private transport; custom URLs cannot select a connector process. Existing
Server membership, connection secrets, and Agent grants remain the authorization
boundary.

Logs report connector readiness, failures, and restart counts. Lifecycle and request
spans use the Server telemetry resource and a safe connector identifier. Arbitrary
connector output, sessions, tokens, and tool bodies never enter logs or telemetry.
Worker lifecycle events carry process ids only for local cleanup.

Skool is the first connector. Its bounded account worker pool retains per-account
isolation, deadlines, capacity limits, and idle eviction. Adding another connector
requires its own catalog definition, package, and verification, rather than another
service deployment or another copy of process supervision.
