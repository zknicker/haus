---
summary: Server settings for remote MCP accounts, the built-in GitHub connection and its installations, and connection-level Agent access.
read_when:
  - changing Settings -> Connections
  - adding an MCP preset
  - changing connect, reconnect, disconnect, or Agent access behavior
  - changing GitHub sign-in, installations, or what removing a GitHub connection does
---

# Connections

Server Settings -> Connections manages remote MCP server accounts. It shares Settings -> Skills'
catalog layout: titled sections of borderless two-column rows, each an icon tile, name, one-line
description, and a trailing control. **Recommended** lists presets not yet added, each with a **+**
button that adds it; **Added** lists saved connections with their status, opens a connection's
page on press, and carries the **+** (**Add connection**) that opens the add drawer. Adding a
preset or a custom connection keeps you on the list. Product copy says "connection"; "MCP" appears
only where the custom form asks for an MCP server's address.

**Add connection** saves a custom MCP entry in Haus. For OAuth MCPs, **Sign in** then opens the remote
account's authorization flow; until that completes, the entry says **Sign in required**. Header
authentication uses **Add credentials** instead. Adding a connection does not grant Agents access.

The page follows Raft's flow: list MCP servers, add a remote endpoint, choose no auth, headers, or
OAuth, complete authentication in a browser window, and inspect the connected identity and
discovered tools. There is no Computer picker and no local or stdio transport.

RankWrangler, Google Calendar, Handmade, MerchBase, MerchBase Atlas, MerchBase Fulfillment, Trademark Terminal, GitHub, Linear, Cloudflare, Factory, X, CoinGecko, and Skool are presets for endpoint and auth defaults.
They remain ordinary MCP connections. CoinGecko connects to its free remote endpoint immediately
without an account or API key, subject to shared upstream rate limits. Agent access still requires
an explicit grant. GitHub is the one built-in connection
([ADR 0045](../adr/0045-github-is-a-built-in-connection.md)): **Connect** signs in through the Haus
GitHub App, and Server keeps the expiring user token refreshed. Server asks GitHub's hosted MCP for
its default toolsets plus Actions, code scanning, and Dependabot, so Agents can read workflow runs
and job logs, run, rerun, or cancel a workflow, and read security alerts. Notifications are not
offered: GitHub's notifications API refuses GitHub App tokens, and GitHub Triggers cover that need.
The hosted MCP sees what both the App's permissions and the signed-in user allow. Beyond sign-in, a
GitHub connection binds **installations** of the App: an org or account and its chosen
repositories, attached to this Server. **Install on GitHub** sends an Owner or Admin to GitHub and
binds the installation on return; **Add existing installation** binds one that is already
installed. Either way the signed-in GitHub user must own the account (an organization admin, or
the user account itself), and an installation belongs to one Haus Server only. Installations feed
`github` Triggers ([GitHub Triggers](../../specs/github-triggers.md)); removing one from Haus pauses
its Triggers and tells their Agents, and it stays installed on GitHub. X takes a token instead of a sign-in: pressing **+** asks
for an app-only Bearer token from the owner's X developer app, which lets Agents search and read
public posts on that app's credits. Factory also takes a token: a Merchbase API Key from the owner's
Account Center at merchbase.co/account/api-keys. Factory issues no keys of its own and records the
agent under that key. Skool opens an isolated browser tab in the Haus desktop app.
Sign in directly to Skool; Haus captures the resulting session and provisions the hosted connection
without showing internal tokens. Haus Server starts and supervises the bundled Skool connector; no separate service setup is required. Web users receive a desktop-required notice. After setup the
connection works from web and mobile while the desktop app is closed. Reconnect and additional
Skool accounts use the same desktop flow. A community is content within an account, not a preset.
Skool sessions can expire; reconnect in desktop when reads require sign-in again. This is browser
session authentication, not Skool OAuth. Token presets offer **Add token** while disconnected and **Replace
token** on the account menu instead of a header editor. Once added, a preset disappears from Recommended, even while disconnected. Another
account can be added deliberately from the connection's page with **Add another account**. For a
sign-in preset (GitHub, MerchBase) one press opens the provider's sign-in tab, adds the account,
and moves to its page, which shows it connecting until the sign-in finishes; the row shows a spinner
and ignores further presses meanwhile, and a failed or untrusted sign-in leaves the new account on
its page as **Sign in required**. Factory and X open the token form instead. Deleting the last account makes the
preset available in Recommended again; the section is hidden when every preset has been added.

MerchBase Atlas connects to `https://atlas.merchbase.co/mcp` through MerchBase/Clerk
OAuth. It exposes artwork search, asset management, and design exports. Adding it requires
sign-in and does not grant Agent access.

Handmade connects to `https://handmade.merchbase.co/mcp` through MerchBase/Clerk OAuth.
It exposes Etsy listing management, order lookup, and product mockup tools. Etsy shop linking
remains in Handmade; existing shops must reconnect there to authorize order reads. Adding the
connection requires sign-in and does not grant Agent access.

MerchBase Fulfillment connects to `https://fulfillment.merchbase.co/mcp/printful` through
MerchBase/Clerk OAuth. It exposes Printful order review and fulfillment tools. Linking a Printful
store happens through those tools after sign-in; adding the preset does not link a store or enable
Agent access.

Trademark Terminal connects to `https://tmterminal.merchbase.co/mcp` through MerchBase/Clerk
OAuth. It exposes trademark search, exact serial or registration lookup, and listing text
screening. Adding it requires sign-in and does not grant Agent access.

Cloudflare connects to its [official MCP](https://github.com/cloudflare/mcp) at
`https://mcp.cloudflare.com/mcp` through OAuth, with permissions selected during authorization.
It exposes Cloudflare API and documentation tools, including DNS and Workers operations.
Cloudflare requires sign-in and an explicit Agent access grant.

Linear connects by installing the Haus app in a Linear workspace; the install callback creates
one connection per workspace, served by Haus Server's own Linear connector
([Linear app](../../specs/linear-app.md)). Its page reads in setup order. The **Workspace** card
names the workspace and **Agents can work in** (the teams the Haus app was granted, where Agents
may write), with **Change in Linear**, which opens Linear's installed-applications settings where
a workspace admin changes the Haus app's team access (a reconnect never asks again); with none it
warns **No teams — Agents can't write**. Linear's permission-change webhook refreshes the teams on
the open page, the workspace menu's **Refresh teams** re-reads them on demand, and an hourly sync
backs both up. Every install Haus starts (connect, reconnect, an Agent's own app) opens Linear in a
tab beside Settings; when Linear sends the browser back, that tab closes and the Settings tab that
started the install shows the outcome, or the tab itself does when Settings has since closed. **Last delivery** shows only once Linear has been silent a week or
the workspace is failing. Changing a team's statuses or labels needs team membership, not just
access: an Agent with its own identity sends those writes as that identity, which must be a member
(it never falls back to the Haus app), an Agent without one sends them through the Haus app, and
the Server joins an Agent's own identity to the teams the Haus app is a member of when Linear
allows it. While the Haus app is
not a member of some of its teams, the card's **Team settings** row says so with **Change in
Linear**: "Haus isn't a member of any team", or "Not a member of Design" naming the missing ones;
an identity still missing one of those teams says "Not a member of Design" on its line, and its
handle's menu offers **Change teams in Linear**. **Agent Access** is one list, each row's trailing side the switch alone;
a granted Agent's description line says how it posts and carries its controls: "Posts via Haus ·
Give own identity", "Posts via Haus · Finish setup", or "Posts as @handle" (which opens Replace
webhook secret and Remove identity). The **Default Agent** that answers the Haus app closes the
list, and one line under the title says what an identity is for. Giving an identity expands under
that Agent's row, not in a dialog, so Linear's new-app page can sit in a browser tab beside
Settings. It opens with a small before-and-after of how the Agent signs its work, then one step at
a time (create the app in Linear, or **Use an existing app**, which opens Linear's app list; paste its client ID and
webhook secret; install); a done step collapses to one ticked line with **Edit**, and the panel's
height follows each change on one short spring. When the install returns, the Agent's row scrolls
into view and marks its new handle instead of a page notice. The Agents' Linear **Triggers**
follow.

Vercel is not a built-in connection. Previously saved Vercel accounts remain custom MCP
connections, retaining their credentials and Agent grants. Its official MCP requires approval of
Haus's hosted OAuth callback before web sign-in can work.

**Disconnect account** warns which Agents lose access, then clears active credentials, discovered
tools, and grants while keeping the MCP entry; a GitHub connection keeps its installations, and
its Triggers pause until an Agent is granted again. **Remove from Haus** deletes that entry and its
saved credentials, including for preset accounts; for GitHub it first removes every installation
from Haus, pausing their Triggers with one notice to each owning Agent. Signing in again uses the same connection and
can reuse its configured OAuth client and previously approved authorization-server origins.

Each Agent profile shows one switch per connected MCP server. Turning it on grants that Agent all
tools exposed by the connection. The tool names are read-only context, not individual permission
controls. A connection grant also covers tools the service adds later. Haus Server keeps the list
current in the background and listens for tool changes; no manual refresh is needed. Access changes take effect on the Agent's next MCP discovery or call without resetting
its conversation.

These grants are an Agent's only MCP access. Agents cannot add MCP servers themselves: MCP servers
an Agent writes into its execution runtime's own config are ignored (see
[MCP connections](../../specs/mcp.md#agent-execution) for the per-runtime contract).

A custom connection shows the MCP server's own icon when one can be resolved, and a tinted
monogram otherwise. Haus Server resolves and stores the image during discovery, so the settings
page makes no third-party image requests. Legacy curated presets show bundled marks. Handmade, Cloudflare, MerchBase Atlas, and Fulfillment use their service-owned
MCP icon metadata or favicon. Presets share one branding lookup across Recommended and Added,
preferring homepage icon links before legacy favicons. Adding, signing in, or disconnecting an
account does not discard its service branding. Icons are stored when a connection is added,
connected, or refreshed, so opening Connections never waits on a third-party site; existing presets
with missing artwork recover it in the background after Haus Server starts. See [Connections API](../api/connections.md#connection-icons).

A connection has its own settings page at `settings/connections/<connectionId>`; the Settings rail
keeps Connections active, and the top bar reads `Haus › Settings › Connections › <name>` with
Connections linking back. An unknown or removed connection, including one just removed from its
own page, returns to the list. The page reads like a product page in a centered reading column
that scrolls with Settings. It leads with the server's mark and name, a `···` menu (Remove from Haus), and, while the connection still needs credentials, one primary **Sign in** or
**Add credentials** button; the server's own description follows when it offers one. Below come
ruled sections, actionable first: **Connected Account** (a card with the account label and its own
`···` menu for Sign in again or Replace credentials and Disconnect account, plus **Add another
account** for a built-in service; hidden for servers that take no credentials), **In Chat** for a
connection that adds chat chips (RankWrangler's product chips, Linear's issue chips: each named
with one line and an inert sample drawn by the real chip; see
[Rich References](rich-references.md#connection-chips)), for GitHub
**Installations** (see [GitHub App connection](../../specs/github-app-connection.md#app-ui)), **Agent Access**
(one switch per Agent; a new grant waits for sign-in; a built-in definition may add a line under
the title, per-Agent state and actions on each row, a panel expanding under a row, and footer
rows), then the reference material: **Tools** (name chips with a count, collapsed to the first few
behind **Show all N**, expanding inline) and, for a custom connection only, **Information** (Server
address and sign-in kind). The credentials form, the
sign-in trust prompt, and the destructive confirmations stay dialogs over the page; the
confirmations name the Agents that lose access.
