---
summary: Draft contract for Linear as a built-in connection — Agent identity in Linear (shared Haus app plus optional per-Agent apps, both `actor=app`), attributed writes, workflow-setup and image-upload tools beyond Linear's hosted MCP, the `linear` Trigger kind with agent sessions, and Linear issue chips with hovercards in chat. Includes open decisions and the test plan that closes them.
read_when:
  - changing the Linear connection, its sign-in, or the tools Agents use against Linear
  - deciding how Agents appear, are mentioned, or are delegated work inside Linear
  - adding Linear events as Triggers, or Linear issue references in chat
  - implementing or verifying any slice of the Linear work
---

# Linear app

Status: **Draft** (2026-10-15). Nothing here is built. Open decisions (D*) need Zach; open
questions (Q*) are closed by the [test plan](#test-plan). Both are settled before implementation.

## Problem

Linear is a preset today: Linear's [hosted MCP](https://linear.app/docs/mcp) at
`https://mcp.linear.app/mcp`, signed in through DCR OAuth as whichever human added it
([MCP connections](mcp.md)). The motivating use is running a print-on-demand pipeline with
Agents: one Linear issue per design, moving through review states, with niche projects above them.
The gaps:

1. **Setup is out of reach.** The hosted MCP covers issues, projects, comments, labels, and
   documents, but not workflow states. Linear's GraphQL API has `workflowStateCreate`,
   `workflowStateUpdate`, and `workflowStateArchive`.
2. **Agents act as the human.** Every Agent action is authored by whoever signed in.
3. **Agents are not addressable in Linear.** Nobody can mention or delegate work to an Agent.
4. **Linear cannot wake Agents.** Triggers support `webhook` and `github` only. Generic webhooks
   need a `Bearer grtt_` header, which Linear cannot send.
5. **Linear is invisible in chat.** Issue links render as plain URLs.

The goal is that it is seamless from the Haus App: an Owner connects Linear once, grants Agents
as for any connection, and Agents show up and get work in Linear as themselves. Haus Tasks stay
separate from Linear.

## Identity

### What Linear offers

With [`actor=app`](https://linear.app/developers/oauth-actor-authorization), an OAuth install
creates one app user per Linear workspace. That user is not a billable seat
([agents docs](https://linear.app/developers/agents)). One app is one actor: one `appUserId`, one
mention target, one delegate. Apps can only be registered by hand in Linear's settings; there is no
API for it. Installing needs a Linear workspace admin, and the admin picks which teams the app can
reach. App actors cannot hold `admin` scope.

On `issueCreate` and `commentCreate` only, an app token may pass `createAsUser` and
`displayIconUrl`. Linear then shows "Juniper (via Haus)". Every other write — state changes,
labels, attachments, projects, documents, workflow states, agent activities — shows the bare app
user.

`app:assignable` makes the app the issue's **delegate**; the human stays the assignee.
`app:mentionable` makes it @-mentionable.

### D1: shared app plus per-Agent apps

| | Shared Haus app | One app per Agent |
| --- | --- | --- |
| Onboarding | one install per workspace, from the Haus App | operator registers an app in Linear per Agent and pastes its credentials into Haus |
| Works for any Haus user | yes | yes, but with manual Linear setup per Agent |
| Create attribution | "Juniper (via Haus)" on issues and comments | Juniper everywhere |
| State moves, labels, uploads | "Haus" | Juniper |
| Delegate an issue to one Agent | no; delegate to Haus, then route | yes |
| @-mention one Agent | no; "@Haus Juniper …" with routing | yes |

**Decided (2026-10-15): both, layered.** The shared Haus app is the default: zero Linear setup per Agent,
which is what makes it seamless for any Haus user. An Owner can **promote** an Agent to its own
Linear app from the Agent profile when that Agent must be delegated work by name, as in the design
pipeline. Promotion follows [Per-Agent apps](#per-agent-apps). Server routes a write through the
Agent's own token when it has one, otherwise through the shared app with attribution. Agents and
their tools do not change.

### Shared Haus app

Haus registers one Linear OAuth app per lifecycle, the same way as its GitHub App
([GitHub App connection](github-app-connection.md)):

| | Production | Development |
| --- | --- | --- |
| Name shown in Linear | Haus | Haus Dev |
| Callback URL | `https://haus.chat/mcp/oauth/callback` | loopback, as GitHub |
| Webhook URL | `https://haus.chat/api/linear/webhook` | sink plus development pull, as GitHub |

Scopes are `read`, `write`, `app:assignable`, and `app:mentionable`. One Linear workspace binds to
one Haus Server, with GitHub's two-sided authority: a Haus Owner or Admin, plus the Linear admin
completing the install.

### Per-Agent apps

1. The Agent profile shows copyable values: app name, avatar, callback URL, webhook URL
   `https://haus.chat/api/linear/webhook/<app id>`, and the webhook categories to enable.
2. The operator creates the app in Linear.
3. The operator pastes the client id, client secret, and webhook signing secret into Haus. Server
   stores them as connection secrets. They never reach Computer or an Agent.
4. **Install** runs OAuth with `actor=app` and stores the token and the app user's `viewer.id`.

The connection is **pinned**: it can be granted only to its Agent. A **Connect all Agents**
checklist page walks an operator through every Agent in turn.

### Attribution

Server knows the invoking Agent on every call, so Agents never choose identity. With the shared
app, Server sets `createAsUser` to the Agent's display name and `displayIconUrl` to a public URL
for its avatar. **Open (Q3):** does Haus have a stable public avatar URL Linear can fetch?

## Tools

There is one grant per connection. It covers two tool sources:

1. **Linear's hosted MCP with the app token.** Linear accepts an OAuth token or API key as
   `Authorization: Bearer`, including an app-actor token. This is the default for reading and
   editing.
2. **A Server-hosted Haus Linear connector**
   ([ADR 0042](../docs/adr/0042-server-owns-hosted-mcp-processes.md)) for what the hosted MCP
   cannot do. It uses the same token and receives the invoking Agent's identity from Server.
   - `create_issue` and `create_comment`, with Server-filled attribution.
   - Workflow states: `list_workflow_states`, `create_workflow_state`, `update_workflow_state`
     (name, color, description, position), and `archive_workflow_state`. Shipped only if Q1
     passes.
   - `upload_image`: takes a Haus file and an issue key, runs Linear's `fileUpload` and the
     server-side `PUT`, and embeds the result in the issue or a comment. Review-size images live
     in Linear; print masters stay in Haus Files.

**Open (Q4):** the hosted MCP's create tools duplicate the attributed ones. Server can hide those
two hosted tools from the catalog, which would be the first per-tool filter. Alternatively, the
Manual tells Agents to prefer the attributed ones.

## Triggers

Linear becomes the third Trigger kind, `linear`, modelled on [GitHub Triggers](github-triggers.md).

- **Delivery.** Linear auto-creates one webhook per installing workspace for an OAuth app. The
  shared app posts to one endpoint, and each per-Agent app to its own path.
- **Verification.** Server checks the `Linear-Signature` header: hex HMAC-SHA256 of the raw body,
  compared in constant time. It rejects a `webhookTimestamp` more than 60 s from now and dedupes
  on the delivery id. It answers within 5 s. Linear retries three times (1 min, 1 h, 6 h) and may
  disable a webhook that keeps failing.
- **Agent sessions.** Mentioning or delegating to an app sends `AgentSessionEvent`. That event
  always wakes an Agent, without needing a configured Trigger. Linear marks the session
  unresponsive unless an activity or external URL arrives within 10 s. Server therefore posts a
  `thought` activity itself and sets `externalUrls` to the Haus destination, before any Agent
  turn. This works even with the Computer offline.
- **Agent routing.** A per-Agent app routes to its Agent. The shared app routes by these rules,
  in order:
  1. An Agent named first in the comment ("@Haus Juniper …").
  2. The Agent mapped to that team or project in connection settings.
  3. The connection's default Agent.
- **Configured Triggers.** These fire on issue updates, with filters for team, project, label,
  `stateFrom`/`stateTo` (for example design review → Approved or Changes requested), and comment
  creation. Events reach the Agent's inbox as event input, the same way as other Triggers.
- **Loop safety.** Server drops events whose actor is the delivering app's own app user and keeps
  the existing chain budget.
- **Revocation.** Revocation or a `PermissionChange` that removes access degrades the affected
  Triggers, with one notice to each owning Agent.

## Issue references in chat

Linear issue URLs (`linear.app/<workspace>/issue/<KEY>-…`) render as reference chips: an inline
mark with a dotted underline and no fill, the same as other reference chips.

- A `linear.issue` tRPC read loads the issue, checking membership the way
  `mcp.amazonProduct` does. It uses any installed token for that workspace.
- Server caches issues for 5 minutes and evicts on Issue webhooks. A `linear.onIssueChanged`
  subscription invalidates the App's React Query cache.
- The hovercard shows title, state with its color, delegate mapped to a Haus Agent avatar,
  assignee, labels, updated time, and a cover thumbnail.
- `uploads.linear.app` assets need auth. Thumbnails go through a membership-checked Server proxy
  restricted to that host.

## Open decisions and questions

- **D1.** Decided: layered identity, as above.
- **D2.** Is the delegate model acceptable: the human stays assignee and the Agent is delegate?
- **D3.** Which Linear states form the design review gate?
- **D4.** Does a Linear wake land in a Haus Thread per issue, or in the Agent's channel?
- **D5.** Building on Linear's agent platform: check it is still preview-labelled before relying
  on it. The interaction docs only mark the Agent Plan API as a preview.
- **D6.** Is there exactly one Linear workspace per Haus Server?
- **Q1.** Can an app user run the workflow-state mutations with only `read` and `write`? In the
  UI, editing a team's workflow is a team-admin action.
- **Q2.** If not, can a workspace admin give the app user team-admin rights?
  If both fail, workflow states stay a human step: the Agent writes the checklist and verifies it
  with `list_workflow_states`. A borrowed admin API key is the other option, but it would author
  as that admin and needs its own justification.
- **Q3.** Is there a public Agent avatar URL?
- **Q4.** Hide the duplicated hosted create tools, or steer Agents in the Manual?
- **Q5.** Which other inputs accept `createAsUser` (projects, documents, agent activities)?

## Test plan

Run in a throwaway Linear workspace with "Haus Dev" registered, using direct GraphQL calls from a
scratch script with the token taken from 1Password. No Haus code is needed. Record each result
here.

| # | Setup | Action | Pass when | Closes |
| --- | --- | --- | --- | --- |
| 1 | Install with `actor=app` and `read,write,app:assignable,app:mentionable`; grant team T | `workflowStateCreate` (type `started`, team T) | state exists | Q1 |
| 2 | Same | `workflowStateUpdate` (rename, `position`), then `workflowStateArchive` on an unused state | both succeed; ordering changes in the UI | Q1 |
| 3 | Same | `workflowStateArchive` on a state that still has issues | record the error | Q1 |
| 4 | If 1 fails: workspace admin tries to make the app user a team admin | repeat 1 | succeeds, or no such role exists | Q2 |
| 5 | Same token | `issueCreate` and `commentCreate` with `createAsUser` and `displayIconUrl` | "Name (via Haus Dev)" with the avatar | attribution, Q3 |
| 6 | Same token | introspect `ProjectCreateInput`, `DocumentCreateInput`, `AgentActivityCreateInput` | record which accept `createAsUser` | Q5 |
| 7 | Same token as Bearer on `https://mcp.linear.app/mcp` | list tools; create an issue | tools discovered; issue authored by the app | hosted MCP |
| 8 | Same token | `fileUpload`, server-side `PUT`, embed in a comment; then fetch the asset with and without auth | image renders in Linear; unauthenticated fetch fails | upload, proxy |
| 9 | Webhook with agent session events | mention the app; delegate an issue | `AgentSessionEvent` `created` for both; a `thought` posted within 10 s shows | Triggers |
| 10 | A second app ("Juniper Dev") in the same workspace | delegate one issue to each app | each webhook carries its own app; state moves show the right actor | D1 per-Agent path |
| 11 | Admin revokes team T from the app | any write on T | clean authorization error; `PermissionChange` arrives | revocation |

If 1 and 2 pass, the workflow-state tools ship in phase 2. If 1 and 4 both fail, they are dropped
and workflow states stay a human step.

## ADRs to write

The accepted spec gets one new ADR making Linear a built-in connection. It amends:

- **ADR 0017.** A built-in connection may add bounded Haus-owned tools.
- **ADR 0027.** Adds a third Trigger kind with a self-actor filter.
- **ADR 0045.** Per-Agent apps' credentials are entered by the operator, per install.
- **[Raft alignment](raft-alignment/README.md) D9.** Linear is the first per-service downstream
  identity, and connections can be pinned to one Agent.

## Implementation plan

1. **Identity.** Register the shared apps, add env items, and add the built-in connection with
   install, binding, and the hosted MCP on the app token. Existing DCR connections become custom
   MCP connections, as Vercel did. Update [Connections](../docs/features/connections.md) and
   [MCP](mcp.md).
2. **Connector.** Attributed create tools, `upload_image`, and the workflow-state tools if Q1
   passes. Add a Manual topic for Linear.
3. **Triggers.** Webhook endpoints, verification, agent-session acknowledgment and routing,
   configured `linear` Triggers, and degradation on revocation.
4. **Chips.** URL recognition, `linear.issue`, cache and subscription, hovercard, and the
   thumbnail proxy.
5. **Per-Agent apps.** Promotion from the Agent profile, pinned connections, the Connect all
   Agents page, and token selection by Agent.
