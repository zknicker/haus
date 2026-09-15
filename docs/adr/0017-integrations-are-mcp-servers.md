---
summary: Decision to replace plugins with Server-owned remote MCP connections and connection-level Agent access.
read_when:
  - changing MCP connections, OAuth, discovery, or Agent access
  - deciding whether a capability is an MCP connection, host tool, skill, or model capability
  - adding an external service integration
---

# ADR 0017: Integrations Are MCP Servers

## Status

Accepted 2026-07-24. Amended 2026-07-28 for Server ownership. Supersedes ADR 0004.

## Decision

External service integrations are standard remote HTTP MCP servers. The plugin product,
proprietary integration framework, local MCP process, and stdio transport are retired.

Haus Server is the AI SDK MCP client and credential broker:

- Server stores connection configuration and secrets.
- Server owns OAuth, token refresh, authorization-server trust, discovery, sessions, and upstream
  invocation.
- One `(Server, Agent, connection)` grant enables every tool on that connection.
- Server rechecks the grant at call time.
- Credentials never enter Agent prompts, tool arguments, audit records, or Computer.
- Computer exposes one fixed `execute` tool backed by headless Executor. Its discovery and
  invocation read safe schemas and use the scoped runner identity; changing grants never changes
  the harness catalog. See [the execution contract](../../specs/mcp.md#agent-execution).

Each connection is one account. The same MCP server or preset may have multiple connections.
Disconnect removes its active credentials, inventory, and Agent grants. Deleting also removes a
connection, including a preset account.

OAuth follows the MCP authorization standard through AI SDK. Server owns discovery, PKCE, dynamic
client registration, optional pre-registered clients, refresh tokens, and authorization-server
trust. A cross-origin authorization server requires explicit operator confirmation.
Credential-bearing endpoints require HTTPS.

Google Calendar and MerchBase are connection presets only. Server owns their immutable endpoints
and auth defaults; they use the same generic path as custom connections.

## Other capability kinds

- Browser and other Computer capabilities are host tools, not MCP connections.
- Skills are instruction packages assigned separately from tools.
- Model-native capabilities remain model configuration.

## Consequences

- External service logic and schemas live with the MCP server.
- Haus can connect to compatible remote HTTP MCP servers without service-specific product code.
- UI access is one Raft-style switch per Agent and connection; the discovered tool list is
  read-only.
- An unavailable MCP connection does not prevent an Agent from starting.
- OAuth interoperability depends on upstream standards support. Google needs configured Server
  client credentials; DCR-capable servers need no packaged client.
