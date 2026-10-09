---
summary: Server settings for remote MCP accounts and connection-level Agent access.
read_when:
  - changing Settings -> Connections
  - adding an MCP preset
  - changing connect, reconnect, disconnect, or Agent access behavior
---

# Connections

Server Settings -> Connections manages remote MCP server accounts. It shares Settings -> Skills'
catalog layout: titled sections of borderless two-column rows, each an icon tile, name, one-line
description, and a trailing control. **Recommended** lists presets not yet added, each with a **+**
button that adds it; **Added MCPs** lists saved connections with their status, opens a connection's
page on press, and carries the **+** that opens the add drawer. Adding a preset or a custom MCP
keeps you on the list.

**Add MCP** saves an MCP entry in Haus. For OAuth MCPs, **Sign in** then opens the remote
account's authorization flow; until that completes, the entry says **Sign in required**. Header
authentication uses **Add credentials** instead. Adding an MCP does not grant Agents access.

The page follows Raft's flow: list MCP servers, add a remote endpoint, choose no auth, headers, or
OAuth, complete authentication in a browser window, and inspect the connected identity and
discovered tools. There is no Computer picker and no local or stdio transport.

RankWrangler, Google Calendar, MerchBase, GitHub, and X are presets for endpoint and auth defaults.
They remain ordinary MCP connections. GitHub is a one-click sign-in like Google Calendar: **Connect**
opens GitHub's authorization page for Haus's own OAuth App, and Server keeps the token refreshed.
Server asks GitHub's hosted MCP for its default toolsets plus Actions, so Agents can read workflow
runs and job logs and run a workflow.
A GitHub organization with OAuth app access restrictions hides its private data until an
organization owner approves the Haus app. X takes a token instead of a sign-in: pressing **+** asks
for an app-only Bearer token from the owner's X developer app, which lets Agents search and read
public posts on that app's credits. Its page offers **Add token** while disconnected and **Replace
token** on the account menu instead of a header editor. Once added, a preset disappears from Recommended, even while disconnected. Another
account can be added deliberately from the connection's page with **Add another account**. For a
sign-in preset (GitHub, MerchBase) one press opens the provider's sign-in tab, adds the account,
and moves to its page, which shows it connecting until the sign-in finishes; the row shows a spinner
and ignores further presses meanwhile, and a failed or untrusted sign-in leaves the new account on
its page as **Sign in required**. X opens the token form instead. Deleting the last account makes the
preset available in Recommended again; the section is hidden when every preset has been added.

Separately from the GitHub MCP preset, the GitHub pull-request connection is the one first-party
connection that is not an MCP server. Owners and Admins connect one
GitHub account or token per Server, and the Server uses it only to resolve pull-request references
into their cached snapshot (title, state, additions, deletions, files changed) for
[rich references](rich-references.md). It exposes no tools and has no per-Agent access switch;
Agents reach GitHub through their own Computer tooling or the GitHub MCP preset.

**Disconnect account** warns which Agents lose access, then clears active credentials, discovered
tools, and grants while keeping the MCP entry. **Remove from Haus** deletes that entry and its
saved credentials, including for preset accounts. Signing in again uses the same connection and
can reuse its configured OAuth client and previously approved authorization-server origins.

Each Agent profile shows one switch per connected MCP server. Turning it on grants that Agent all
tools exposed by the connection. The tool names are read-only context, not individual permission
controls. Access changes take effect on the Agent's next MCP discovery or call without resetting
its conversation.

These grants are an Agent's only MCP access. Agents cannot add MCP servers themselves: MCP servers
an Agent writes into its execution runtime's own config are ignored (see
[MCP connections](../../specs/mcp.md#agent-execution) for the per-runtime contract).

A custom connection shows the MCP server's own icon when one can be resolved, and a tinted
monogram otherwise. Haus Server resolves and stores the image during discovery, so the settings
page makes no third-party image requests. Presets always show their bundled marks, in Recommended
and once added, because a server's own icon is often only a small favicon. See [Connections API](../api/connections.md#connection-icons).

A connection has its own settings page at `settings/connections/<connectionId>`; the Settings rail
keeps Connections active, and the top bar reads `Haus › Settings › Connections › <name>` with
Connections linking back. An unknown or removed connection, including one just removed from its
own page, returns to the list. The page reads like a product page in a centered reading column
that scrolls with Settings. It leads with the server's mark and name, a `···` menu (Refresh tools,
Remove from Haus), and, while the connection still needs credentials, one primary **Sign in** or
**Add credentials** button; the server's own description follows when it offers one. Below come
ruled sections, actionable first: **Connected Account** (a card with the account label and its own
`···` menu for Sign in again or Replace credentials and Disconnect account, plus **Add another
account** for a built-in service; hidden for servers that take no credentials), **Agent Access**
(one switch per Agent; a new grant waits for sign-in), then the reference material: **Tools** (name
chips with a count, collapsed to the first few behind **Show all N**, expanding inline) and
**Information** (Server address, sign-in kind, built in or custom). The credentials form, the
sign-in trust prompt, and the destructive confirmations stay dialogs over the page; the
confirmations name the Agents that lose access.
