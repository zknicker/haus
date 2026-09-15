---
summary: Server settings for remote MCP accounts and connection-level Agent access.
read_when:
  - changing Settings -> Connections
  - adding an MCP preset
  - changing connect, reconnect, disconnect, or Agent access behavior
---

# Connections

Server Settings -> Connections manages remote MCP server accounts.

**Add MCP** saves an MCP entry in Haus. For OAuth MCPs, **Sign in** then opens the remote
account's authorization flow; until that completes, the entry says **Sign in required**. Header
authentication uses **Add credentials** instead. Adding an MCP does not grant Agents access.

The page follows Raft's flow: list MCP servers, add a remote endpoint, choose no auth, headers, or
OAuth, complete authentication in a browser window, and inspect the connected identity and
discovered tools. There is no Computer picker and no local or stdio transport.

Google Calendar and MerchBase are presets for endpoint and auth defaults. They remain ordinary MCP
connections. Once added, a preset disappears from Recommended, even while disconnected. Another
account can be added deliberately from the connection detail. Deleting the last account makes the
preset available in Recommended again; the section is hidden when every preset has been added.

GitHub is the one first-party connection that is not an MCP server. Owners and Admins connect one
GitHub account or token per Server, and the Server uses it only to resolve pull-request references
into their cached snapshot (title, state, additions, deletions, files changed) for
[rich references](rich-references.md). It exposes no tools and has no per-Agent access switch;
Agents reach GitHub through their own Computer tooling or an ordinary MCP connection.

**Disconnect account** warns which Agents lose access, then clears active credentials, discovered
tools, and grants while keeping the MCP entry. **Remove from Haus** deletes that entry and its
saved credentials, including for preset accounts. Signing in again uses the same connection and
can reuse its configured OAuth client and previously approved authorization-server origins.

Each Agent profile shows one switch per connected MCP server. Turning it on grants that Agent all
tools exposed by the connection. The tool names are read-only context, not individual permission
controls. Access changes take effect on the Agent's next MCP discovery or call without resetting
its conversation.

Each connection shows the MCP server's own icon when one can be resolved, and a tinted monogram
otherwise. Haus Server resolves and stores the image during discovery, so the settings page makes
no third-party image requests. See [Connections API](../api/connections.md#connection-icons).

A connection's detail dialog leads with the server's name, its connection status, and the server's
own description of itself when it offers one. Long tool and Agent lists scroll inside the dialog so
its identity and its management actions stay reachable.
