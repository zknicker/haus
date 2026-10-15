---
summary: Draft contract for Linear as a built-in connection — one shared Haus Linear app (`actor=app`) for every Haus Server, Server-enforced per-Agent attribution, Haus-side routing of Linear work to the right Agent, workflow-setup and image-upload tools beyond Linear's hosted MCP, the `linear` Trigger kind with agent sessions, and Linear issue chips in chat. Includes open decisions and the test plan that closes them.
read_when:
  - changing the Linear connection, its sign-in, or the tools Agents use against Linear
  - deciding how Agents appear, are mentioned, or are delegated work inside Linear
  - changing how Linear events are routed to Agents
  - adding Linear events as Triggers, or Linear issue references in chat
  - implementing or verifying any slice of the Linear work
---

# Linear app

Status: **Draft** (2026-10-15). Nothing here is built. Decisions D1–D6 are settled; open
questions (Q*) are closed by the [test plan](#test-plan) before implementation.

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
3. **Agents are not addressable in Linear.** Nobody can mention or hand work to an Agent.
4. **Linear cannot wake Agents.** Triggers support `webhook` and `github` only. Generic webhooks
   need a `Bearer grtt_` header, which Linear cannot send.
5. **Linear is invisible in chat.** Issue links render as plain URLs.

The goal is that the Haus integration does the work. An Owner connects Linear once and grants
Agents, as with any connection. From then on, Agents show up in Linear under their own names and
faces, and Linear work reaches the right Agent. No Agent has to remember anything, and no per-Agent
setup happens in Linear. Haus Tasks stay separate from Linear.

## What Linear offers

With [`actor=app`](https://linear.app/developers/oauth-actor-authorization), an OAuth install
creates one app user per Linear workspace. That user is not a billable seat
([agents docs](https://linear.app/developers/agents)). One app is one actor: one `appUserId`, one
mention target, one delegate. Installing needs a Linear workspace admin, and the admin picks which
teams the app can reach. App actors cannot hold `admin` scope.

On `issueCreate` and `commentCreate` only, an app token may pass `createAsUser` and
`displayIconUrl`. Linear then shows "Juniper (via Haus)". Every other write shows the bare app
user: state changes, labels, attachments, projects, documents, workflow states, and agent
activities.

`app:assignable` makes the app the issue's **delegate**; the human stays the assignee.
`app:mentionable` makes it @-mentionable.

## Identity

**Decided (2026-10-15): one shared Haus app. No per-Agent Linear apps.** Linear models one app as
one actor, and apps can only be registered by hand, so per-Agent apps do not scale. Haus makes up
the difference itself, in two ways:

- **Enforced attribution.** Agents appear under their own names.
- **Haus-side routing.** Work in Linear reaches the right Agent even though Linear sees only
  "Haus".

### The app

Haus registers one Linear OAuth app per lifecycle, the same way as its GitHub App
([GitHub App connection](github-app-connection.md)):

| | Production | Development |
| --- | --- | --- |
| Name shown in Linear | Haus | Haus Dev |
| Callback URL | `https://haus.chat/mcp/oauth/callback` | loopback, as GitHub |
| Webhook URL | `https://haus.chat/api/linear/webhook` | sink plus development pull, as GitHub |

Scopes are `read`, `write`, `app:assignable`, and `app:mentionable`. One Linear workspace binds to
one Haus Server, with GitHub's two-sided authority: a Haus Owner or Admin, plus the Linear admin
completing the install. A Haus Server may connect several workspaces (D6).

### Enforced attribution

Agents never pass identity, and they cannot forget it. Server knows the invoking Agent on every
call (the grant scope's `agentId`), so Server writes the identity into every write:

- **Attributable writes.** On `issueCreate` and `commentCreate`, Server sets `createAsUser` to
  the Agent's display name and `displayIconUrl` to the Agent's public avatar URL. **Open (Q3):**
  Haus needs a stable public avatar URL that Linear can fetch.
- **Other writes.** State moves, labels, and uploads show as "Haus" in Linear. To make them
  readable there, these tools take an optional `note`. When present, Server posts it as an
  attributed comment in the same call ("Juniper (via Haus): moved to Design Review — three
  colourways attached"). The Manual teaches Agents to add a note on handoffs.
- **The write ledger.** Server records every Agent write: issue, Agent, action, and Linear
  entity id. The ledger drives routing, loop safety, and the "by Juniper" label in hovercards.

All Agent writes therefore go through Haus tools. The hosted MCP is mounted at its read-only
endpoint `/mcp/readonly`, so no write path skips attribution. That also closes the old duplicate
create-tools question.

### Haus-side routing

Server keeps an **issue owner**: the one Agent responsible for each Linear issue it has seen. An
issue gets an owner, and its owner changes, in these cases (later ones win):

1. An Agent creates the issue through Haus.
2. A team or project in connection settings maps to a default Agent.
3. An **Agent label** is applied. Haus keeps a single-select `Agent` label group in each granted
   team, with one label per granted Agent, synced as grants change. Applying "Juniper" hands the
   issue to Juniper. Owners stay visible and filterable in Linear.
4. A comment names an Agent ("@Haus Juniper, take this").

When Haus changes an owner from a comment, it sets the matching Agent label, so Linear and Haus
always agree.

An event goes to one Agent, chosen in this order:

1. The Agent named in the triggering comment.
2. The Agent already bound to that Linear agent session; follow-up prompts stay with it.
3. The issue owner.
4. The team or project mapping.
5. The connection's default Agent.

If nothing resolves, the event goes to the default Agent with the ambiguity stated in its event
input.

## Tools

The connection has one grant, which covers two tool sources:

1. **Linear's hosted MCP, read-only, with the app token.** Linear accepts an app-actor token as
   `Authorization: Bearer`. It handles search and reads.
2. **A Server-hosted Haus Linear connector**
   ([ADR 0042](../docs/adr/0042-server-owns-hosted-mcp-processes.md)) for every write. It uses the
   same token. Server passes it the invoking Agent's identity on each request, and the token never
   enters Computer.
   - `create_issue`, `update_issue` (state, labels, priority, project, and an optional `note`),
     `create_comment`, `set_owner`
   - `create_project`, `create_document`, `create_label`
   - Workflow states: `list_workflow_states`, `create_workflow_state`, `update_workflow_state`
     (name, color, description, position), `archive_workflow_state`. These ship only if Q1 passes.
   - `upload_image`: takes a Haus file and an issue key, runs Linear's `fileUpload` and the
     server-side `PUT`, and embeds the result in the issue or a comment. Review-size images live
     in Linear, and print masters stay in Haus Files.

The write set copies Linear's own surface on purpose, and it grows only when an Agent workflow
needs another write.

## Triggers

Linear becomes the third Trigger kind, `linear`, modelled on [GitHub Triggers](github-triggers.md).

- **Delivery.** Linear auto-creates one webhook per installing workspace, all posting to the
  shared endpoint. Server routes each delivery by organization id to the bound Haus Server.
- **Verification.**
  - Server checks the `Linear-Signature` header: a hex HMAC-SHA256 of the raw body, compared in
    constant time.
  - It rejects a `webhookTimestamp` more than 60 s from now, dedupes on the delivery id, and
    answers within 5 s.
  - Linear retries three times (after 1 min, 1 h, and 6 h) and may disable a webhook that keeps
    failing.
- **Agent sessions.**
  - Mentioning or delegating to Haus sends `AgentSessionEvent`. That event always wakes the
    routed Agent; no Trigger has to be configured.
  - Linear marks the session unresponsive unless an activity or external URL arrives within
    10 s. Server therefore posts a `thought` itself ("Juniper is on it"), and sets `externalUrls`
    to the Haus destination, before any Agent turn. This works even when the Computer is offline.
  - Agent replies go back as agent activities through a connector tool. Activities cannot carry a
    persona, so Server prefixes the Agent's name to their content.
- **Configured Triggers.**
  - Filters: team, project, label, owner, `stateFrom`/`stateTo` (for example, Design Review →
    Approved or Changes requested), and comment creation.
  - Events reach the routed Agent's inbox as event input, the same way as other Triggers.
- **Loop safety.**
  - Server drops an event only when the ledger shows the routed Agent itself caused it.
  - When one Agent moves an issue, a Trigger can still wake a different Agent, which is how
    handoffs between Agents work.
  - The existing chain budget bounds Agent-to-Agent chains.
- **Revocation.** Revocation, or a `PermissionChange` that removes access, degrades the affected
  Triggers, with one notice to each owning Agent.

## Issue references in chat

Linear issue URLs (`linear.app/<workspace>/issue/<KEY>-…`) render as reference chips: an inline
mark with a dotted underline and no fill, the same as other reference chips.

- A `linear.issue` tRPC read uses the connection token. It authorizes members the same way as
  `mcp.amazonProduct`.
- Server caches issues for 5 minutes and evicts them on Issue webhooks. A
  `linear.onIssueChanged` subscription invalidates the App's React Query cache.
- The hovercard shows the title, the state with its color, the owner Agent's avatar, the
  assignee, labels, the last change (attributed from the ledger, for example "Juniper moved this
  to Design Review"), and a cover thumbnail.
- `uploads.linear.app` assets need auth. Thumbnails go through a member-checked Server proxy that
  only fetches from that host.

## Open decisions and questions

- **D1.** Decided: one shared Haus app, with enforced attribution and Haus-side routing.
- **D2.** Decided: delegate, not assignee. Linear never lets any app be an issue's assignee, so
  a person stays the assignee and Haus is the delegate. Per-Agent apps would not change this;
  the delegate would only read "Juniper" instead of "Haus". The `Agent` label names the
  responsible Agent.
- **D3.** Dropped. Which states gate a pipeline is an Agent's configuration — it chooses the
  `stateFrom`/`stateTo` filters when creating a Trigger. It is not a product decision.
- **D4.** Decided: the Agent decides where to talk. A configured `linear` Trigger is
  Agent-created and anchored to the chat where someone asked for it, like every other Trigger
  ([Triggers](triggers.md)). It never writes a chat message itself. An agent session started
  from a mention or delegation has no Trigger behind it, so it arrives as inbox event input with
  no chat anchor. The Agent answers in Linear and posts in Haus only when that helps.
- **D5.** Decided: building on Linear's agent platform is fine while parts of it are in preview.
- **D6.** Decided: a Haus Server may connect several Linear workspaces, each as its own
  connection, like GitHub installations. A workspace binds to one Haus Server, and deliveries
  route by organization id.
- **Q1.** Can an app user run the workflow-state mutations with only `read` and `write`? In the
  UI, editing a team's workflow is a team-admin action.
- **Q2.** If not, can a workspace admin give the app user team-admin rights?
  - If both fail, workflow states stay a human step: the Agent writes the checklist and verifies
    it with `list_workflow_states`.
  - Using a borrowed admin API key instead would make those changes appear under that admin's
    name, and needs its own justification.
- **Q3.** Is there a public Agent avatar URL?
- **Q4.** Which other inputs accept `createAsUser` (projects, documents, agent activities)? Any
  that do get native attribution in place of a `note`.
- **Q5.** Can the app create and apply labels in every granted team, for the `Agent` label
  group?

## Test plan

Run in a throwaway Linear workspace with "Haus Dev" registered. Make direct GraphQL calls from a
scratch script, with the token taken from 1Password. No Haus code is needed. Record each result
here.

| # | Setup | Action | Pass when | Closes |
| --- | --- | --- | --- | --- |
| 1 | Install with `actor=app` and `read,write,app:assignable,app:mentionable`; grant team T | `workflowStateCreate` (type `started`, team T) | state exists | Q1 |
| 2 | Same | `workflowStateUpdate` (rename, `position`), then `workflowStateArchive` on an unused state | both succeed; ordering changes in the UI | Q1 |
| 3 | Same | `workflowStateArchive` on a state that still has issues | record the error | Q1 |
| 4 | If 1 fails: workspace admin tries to make the app user a team admin | repeat 1 | succeeds, or no such role exists | Q2 |
| 5 | Same token | `issueCreate` and `commentCreate` with `createAsUser` and `displayIconUrl` | "Name (via Haus Dev)" with the avatar | attribution, Q3 |
| 6 | Same token | introspect `ProjectCreateInput`, `DocumentCreateInput`, `AgentActivityCreateInput` | record which accept `createAsUser` | Q4 |
| 7 | Same token | create an `Agent` label group with two labels; apply one to an issue | labels created and applied; Issue webhook shows the label change | Q5, routing |
| 8 | Same token as Bearer on `https://mcp.linear.app/mcp/readonly` | list tools; read an issue | read tools discovered; no write tools | hosted MCP |
| 9 | Same token | `fileUpload`, server-side `PUT`, embed in a comment; then fetch the asset with and without auth | image renders in Linear; unauthenticated fetch fails | upload, proxy |
| 10 | Webhook with agent session events | mention the app with "@Haus Juniper …"; delegate an issue; send a follow-up prompt | `AgentSessionEvent` `created` and `prompted` arrive with comment body and session id; a `thought` posted within 10 s shows | Triggers, routing |
| 11 | Admin revokes team T from the app | any write on T | clean authorization error; `PermissionChange` arrives | revocation |

If 1 and 2 pass, the workflow-state tools ship in phase 2. If 1 and 4 both fail, those tools are
dropped and workflow states stay a human step.

## Not built

- **Per-Agent Linear apps.** Each would need manual registration in Linear for every Agent, so
  they do not scale. Routing and attribution cover the need.
- **Admin operations in Linear** beyond workflow states.

## ADRs to write

When this spec is accepted, a new ADR records Linear as a built-in connection. It amends:

- **ADR 0017.** A built-in connection may own Haus tools that wrap the service's writes,
  including Server-enforced attribution.
- **ADR 0027.** Adds a third Trigger kind, routed by Haus, with ledger-based loop safety.
- **[Raft alignment](raft-alignment/README.md) D9.** Linear is the first per-service downstream
  identity: one shared app, with per-Agent attribution and routing done by Haus.

## Implementation plan

1. **Identity.**
   - Register the apps, add env items, and add the built-in connection with install, binding, and
     the read-only hosted MCP on the app token.
   - Existing DCR connections become custom MCP connections, as Vercel did.
   - Update [Connections](../docs/features/connections.md) and [MCP](mcp.md).
2. **Connector.**
   - Write tools with enforced attribution, `note`, the write ledger, and `upload_image`.
   - Workflow-state tools, if Q1 passes.
   - A Manual topic for Linear.
3. **Routing and Triggers.**
   - Issue owners, the `Agent` label group, and team and project mappings.
   - Webhook endpoint and verification.
   - Agent-session acknowledgment and replies.
   - Configured `linear` Triggers, and degradation on revocation.
4. **Chips.** URL recognition, `linear.issue`, the cache and subscription, the hovercard, and the
   thumbnail proxy.
