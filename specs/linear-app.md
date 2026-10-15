---
summary: Draft contract for Linear as a built-in connection — a shared Haus Linear app (`actor=app`) that connects each workspace, optional per-Agent Linear identities onboarded from a first-party Linear page, Server-chosen actors behind one Agent tool surface, the `linear` Trigger kind with GitHub-style match groups, Linear issue chips, and the built-in connection definition mechanism. Includes decisions, test plan, and probe results.
read_when:
  - changing the Linear connection, its sign-in, or the tools Agents use against Linear
  - deciding how Agents appear, are mentioned, or are delegated work inside Linear
  - changing how Linear events are routed to Agents
  - adding Linear events as Triggers, or Linear issue references in chat
  - implementing or verifying any slice of the Linear work
  - adding a built-in connection or changing how built-in connection pages are composed
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
faces, and Linear work reaches the right Agent. No Agent has to remember anything. Per-Agent setup
in Linear is optional, for the Agents an Owner wants as first-class Linear teammates. Haus Tasks
stay separate from Linear.

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

**Decided (2026-10-15): the Haus app connects the workspace; a Linear identity per Agent is an
optional upgrade.**

- **The Haus app.** One install connects a Linear workspace to a Haus Server. It carries reads,
  workspace webhooks, issue chips, and workflow setup. Every granted Agent can work in Linear
  through it from the start, posting as "Juniper (via Haus)".
- **Agent identities.** An Owner can give any granted Agent its own Linear app. That Agent then
  becomes a real Linear teammate, with its own name, avatar, delegate slot, @-handle, and status
  history. Agents not onboarded keep working through the Haus app.

Linear models one app as one actor. Ownership on a multi-Agent board changes at every stage, and
Linear's own UI keys that ownership on the delegate: its fields, filters, mention menu, and agent
session panel. That is why identity is per Agent rather than per workspace. Agents and their tools
never see which path a write took.

### The Haus app

Haus registers one Linear OAuth app per lifecycle, the same way as its GitHub App
([GitHub App connection](github-app-connection.md)):

| | Production | Development |
| --- | --- | --- |
| Name shown in Linear | Haus | Haus Dev |
| Callback URL | `https://haus.chat/mcp/oauth/callback` | loopback, as GitHub |
| Webhook URL | `https://haus.chat/api/linear/webhook` | sink plus development pull, as GitHub |

Haus users never create this app. They press **Connect Linear**, and a Linear admin of their
workspace approves the install. To allow that, the production app has Linear's **Public** setting
on. Scopes are `read`, `write`, `app:assignable`, and `app:mentionable`. One Linear workspace binds
to one Haus Server, with GitHub's two-sided authority: a Haus Owner or Admin, plus the Linear admin
who completes the install. A Haus Server may connect several workspaces (D6).

### Agent identities

An Agent identity is a private Linear OAuth app that the Owner registers in their own workspace
for one Agent, using a guided flow from the [Linear page](#the-linear-page):

1. Haus shows every value pre-filled, each with a copy button: app name and avatar (the Agent's),
   callback URL, webhook URL `https://haus.chat/api/linear/webhook/<identity id>`, and the webhook
   events to tick (agent session events, permission changes, inbox notifications).
2. The Owner creates the app in Linear's settings, with a deep link to the right page.
3. The Owner pastes the client id, client secret, and webhook signing secret into Haus. Server
   stores them as connection secrets. They never reach Computer or an Agent.
4. **Install** runs OAuth with `actor=app`, limited to the teams the Haus app can reach. Server
   stores the token and the app user's id.

An identity belongs to its connection and to exactly one Agent. Removing the Agent's grant, or the
identity itself, stops it from being used. The page offers to uninstall it in Linear.

### Choosing the actor

On every Agent write, Server picks the actor without the Agent's input:

- **The Agent has an identity.** The write uses the identity's token. Linear attributes the write
  natively, including state moves, labels, and uploads.
- **It does not.** The write uses the Haus app token. Server sets `createAsUser` to the Agent's
  display name and `displayIconUrl` to its avatar on `issueCreate` and `commentCreate`, the only
  inputs that accept them. Linear rehosts the icon, so the URL only has to work once. Other writes
  show "Haus". For those, an optional `note` on the tool is posted as an attributed comment.

Server records every Agent write in a **write ledger**: issue, Agent, actor used, action, and
Linear entity id. The ledger drives loop safety and the "Juniper moved this" line in hovercards.

### Delegation between Agents

Agents name each other by Haus name, never by Linear user id. `delegate_issue(issue, agent:
"Beacon")` resolves to Beacon's identity app user when Beacon has one. If Beacon has none, it
resolves to the Haus app as delegate plus Beacon's `Agent` label (below), so the handoff stays
visible in Linear. A human can also delegate or @-mention an identity directly in Linear.

For Agents without an identity, Haus keeps a single-select `Agent` label group in each granted
team, with one label per granted Agent that has no identity. Applying a label, or writing
"@haus Beacon …", hands the issue to that Agent. Agents with an identity get no label, because the
delegate field already names them.

## Tools

An Agent's Linear tools are the same whether or not it has an identity, and the grant is the same
too: one switch per Agent on the Linear connection. The identity changes only who Linear shows as
the author.

1. **Reads: Linear's hosted MCP, read-only, on the Haus app token.** Linear accepts an app-actor
   token as `Authorization: Bearer` at `/mcp/readonly` (38 read tools). Reads look the same to
   every Agent, so one shared upstream session serves them all.
2. **Writes: a Server-hosted Haus Linear connector**
   ([ADR 0042](../docs/adr/0042-server-owns-hosted-mcp-processes.md)). Server passes it the
   invoking Agent and the chosen actor's token on each request; tokens never enter Computer.
   - `create_issue`, `update_issue` (state, labels, priority, project, and an optional `note`),
     `create_comment`, `delegate_issue`
   - `create_project`, `create_document`, `create_label`
   - workflow states: `list_workflow_states`, `create_workflow_state`, `update_workflow_state`
     (name, color, description, position), and `archive_workflow_state`
   - `upload_image`: takes a Haus file and an issue key, runs Linear's `fileUpload` with the
     server-side `PUT`, and embeds the result. Review-size images live in Linear; print masters
     stay in Haus Files.
   - `reply`: posts an agent activity to the Agent's current Linear agent session.
   - `whoami`: reports whether the Agent has an identity, and its Linear handle.

Writes are routed only through Haus, never through the hosted MCP's write tools. That keeps a
single attribution path. The write set grows only when an Agent workflow needs another write.

## Triggers

Linear becomes the third Trigger kind, `linear`, with the same authoring model, match groups,
preview, caps, and rate limits as [GitHub Triggers](github-triggers.md). An Agent does not need an
identity to create one.

### Two ways an Agent is woken

| | Addressed | Configured |
| --- | --- | --- |
| Source | someone mentions or delegates to the Agent | a `linear` Trigger the Agent created |
| Webhook | the Agent identity's app (agent session events), or the Haus app for "@haus Beacon" and labels | the Haus app's workspace webhook (data change events) |
| Needs a Trigger | no | yes |
| Lands | the Agent's inbox, with no chat anchor; the Agent answers in Linear | the chat the Trigger is anchored to |

Data change events arrive once per workspace, through the Haus app, and are matched against every
armed `linear` Trigger in that Haus Server. Identity apps subscribe only to their own agent
session, inbox, and permission events, so no event is ingested twice.

### Addressed events

When someone mentions or delegates to an Agent, Linear sends an `AgentSessionEvent`. Linear marks
the session unresponsive unless an activity or external URL arrives within 10 s. Server answers it
itself, before any Agent turn:

- It posts a `thought` ("Juniper is on it").
- It sets `externalUrls` to the Haus destination.

This works even when the Computer is offline. `prompted` follow-ups in the same session reach the
same Agent. An identity's events go to its Agent. For the Haus app, routing uses these rules in
order:

1. The Agent named in the comment ("@haus Beacon").
2. The Agent bound to the session.
3. The issue's `Agent` label.
4. The connection's default Agent.

### Configured Triggers: match groups

Each Trigger has 1 to 10 match groups, combined the same way as GitHub's. Values are ORed within a
list, filters are ANDed within a group, and groups are ORed with each other. An absent list
matches anything.

| Event | Actions | Filters |
| --- | --- | --- |
| `issue` | `create`, `update`, `remove` | `changed` (fields such as `state`, `delegate`, `labels`, `priority`, `project`), `stateFrom`, `stateTo`, `stateTypes` |
| `comment` | `create`, `update` | `onIssueDelegatedTo` |
| `project` | `create`, `update` | `changed`, `projectStatus` |
| `label` | `create` (on an issue: `added`, `removed`) | `labels` |

Every group also accepts:

- `teams`
- `projects`
- `labels` and `labelsIgnore`
- `delegate` and `assignee`
- `actors` and `actorsIgnore`

Workflow-state values take names or ids. The Agent-relative selectors `@self` and `@agent:<name>`
resolve to an Agent's identity app user, or to the Haus app plus that Agent's label when it has no
identity. Some examples:

- **Changes requested on my designs:** `issue.update`, `changed: [state]`,
  `stateFrom: Design Review`, `stateTo: Changes Requested`, `delegate: @self`.
- **New comments where I'm the delegate:** `comment.create`, `onIssueDelegatedTo: @self`,
  `actorsIgnore: [@self]`.
- **Anything entering Print-ready in the Design team:** `issue.update`, `teams: [Design]`,
  `stateTo: Print-ready`.

An Agent hears only what its groups describe. The **preview** endpoint runs the matcher against
recent events without firing. The App and CLI show suppressed counts, so a noisy Trigger can be
narrowed.

### Loop safety

Server drops a match when the ledger shows that the Trigger's own Agent caused the event. An event
caused by a different Agent still fires, which is how handoffs between Agents work. The existing
chain budget bounds Agent-to-Agent chains.

### Verification and revocation

- **Signature.** Server checks the `Linear-Signature` header, a hex HMAC-SHA256 of the raw body,
  in constant time. The Haus app and each identity have their own signing secrets.
- **Freshness.** Server rejects a `webhookTimestamp` more than 60 s from now, dedupes on the
  delivery id, and answers within 5 s.
- **Retries.** Linear retries three times (after 1 min, 1 h, and 6 h), and it may disable a
  webhook that keeps failing.
- **Revocation.** Revocation, or a `PermissionChange` that removes access, degrades the affected
  Triggers or identity. Each owning Agent gets one notice.

## The Linear page

Connections → Linear opens a first-party page, not the generic connection detail. It has four
sections:

- **Workspace.** The install, its teams, and reconnect.
- **Agents.** The roster: every Agent on the Server, each with its grant switch and its identity
  state ("Posts as Juniper via Haus" / "Linear identity: @juniper"). A **Give Linear identity**
  button opens the guided flow for that Agent.
- **Triggers.** The Agents' `linear` Triggers, read-only, linking to each Agent's Automations tab.
- **Tools.** The generic tools list.

### Built-in connection pages

The page is built from a general mechanism, not a Linear branch. Today GitHub's installations
section checks `connection.preset === 'github'` inside a section mounted on every connection page.
That pattern does not extend to a second built-in connection. It is replaced as follows:

- **App.** A built-in connection is described by one typed definition per service, kept under
  `apps/website/src/features/settings/connections/built-in/<service>/`. The definition lists the
  sections the service adds and where each sits among the generic sections (account, Agent access,
  tools). The connection page renders the generic sections plus whatever the definition declares.
  It never branches on a preset. A small registry keyed by preset is the only lookup. GitHub moves
  its installations section into its own definition as part of this work.
- **Server.** Each built-in connection likewise has one module under
  `apps/server/src/<service>/` that declares what it adds beyond the MCP connection model: install
  or binding state, webhook routes, Trigger kind, hosted connector, and its tRPC feature. The
  generic connection code never imports a service.

A third built-in connection then means adding one definition on each side, with no edits to the
generic page.

## Issue references in chat

Linear issue URLs (`linear.app/<workspace>/issue/<KEY>-…`) render as reference chips: an inline
mark with a dotted underline and no fill, the same as other reference chips.

- A `linear.issue` tRPC read uses the connection token. It authorizes members the same way as
  `mcp.amazonProduct`.
- Server caches issues for 5 minutes and evicts them on Issue webhooks. A
  `linear.onIssueChanged` subscription invalidates the App's React Query cache.
- The hovercard shows the title, the state with its color, the delegate (an Agent identity's
  avatar, or the labelled Agent's for the Haus app), the assignee, labels, the last change (attributed from the ledger, for example "Juniper moved this
  to Design Review"), and a cover thumbnail.
- `uploads.linear.app` assets need auth. Thumbnails go through a member-checked Server proxy that
  only fetches from that host.

## Open decisions and questions

- **D1.** Decided: the Haus app connects the workspace; per-Agent Linear identities are an
  optional upgrade, onboarded Agent by Agent from the Linear page.
- **D2.** Decided: delegate, not assignee. Linear never lets any app be an issue's assignee, so
  a person stays the assignee and the Agent is the delegate: its identity, or the Haus app plus
  its `Agent` label.
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
- **Q1.** Closed: yes. With only `read` and `write`, the app user created, renamed, reordered,
  and archived workflow states. Linear's team access controls are a Business-plan feature, so a
  restricted team is still untested.
- **Q2.** Not needed, because Q1 passed.
- **Q3.** Closed. Any URL Linear can fetch at write time works; Linear rehosts the icon.
- **Q4.** Closed: only `IssueCreateInput` and `CommentCreateInput` accept `createAsUser`.
  Projects, documents, labels, issue updates, and agent activities do not, so those writes use
  `note` and the ledger.
- **Q5.** Closed: yes. The app created an `Agent` label group, added a child label, and applied it
  to an issue.

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

### Results (2026-10-15)

Run in Haus's own workspace (`haus-chat`), in a throwaway **Haus Test** team (`HTST`). The
private **Haus Dev** app was installed with `actor=app` through authorization code with PKCE and
granted only that team. No client secret was needed.

| # | Result |
| --- | --- |
| 1 | Pass. `workflowStateCreate` succeeded. |
| 2 | Pass. Rename, `position`, and archive of an unused state all succeeded. |
| 3 | Expected error: `INPUT_ERROR` "The state contains active issues…". The tool surfaces Linear's `userPresentableMessage`. |
| 4 | Not needed. |
| 5 | Pass. The issue and the comment carry `botActor { name: "Haus Dev", userDisplayName: "Juniper", type: oauthClient }`, with the icon rehosted on `uploads.linear.app`. |
| 6 | `createAsUser` exists on issue and comment creation only. `delegateId` exists on issue create and update. |
| 7 | Pass for creating and applying labels. The Issue webhook was not observed (see 10). |
| 8 | Pass. `/mcp/readonly` accepts the app token and lists 38 read tools with no writes. `/mcp` lists 68 tools, including `save_issue`, `save_comment`, and attachment upload. |
| 9 | Pass. `fileUpload` plus a server-side `PUT` returned 200, and the image embedded in the issue. The asset returns 401 without auth and 200 with the app token. |
| 10 | Partly done. Delegating via `issueUpdate(delegateId)` left the assignee empty, made Haus Dev the delegate, and created a `pending` agent session within seconds; `agentActivityCreate` posted a `thought`. Not observed: webhook delivery (no public receiver; the app's webhook points at the not-yet-built Haus endpoint), mention-created sessions, and `prompted` follow-ups. |
| 11 | Not run. |

What's left before phase 3: catch real deliveries on a reachable endpoint (signature, payload
shape, `prompted` events, mention text), and revocation. The app user's mention handle is its
display name (`hausdev` for the dev app), so the production app should be named so that `@haus`
reads naturally.

## Not built

- **Automated identity registration.** Linear has no API to create apps, so the Owner registers
  each identity by hand through the guided flow. A Haus Agent completing that flow in the Owner's
  browser is a possible later step.
- **Admin operations in Linear** beyond workflow states.

## ADRs to write

When this spec is accepted, a new ADR records Linear as a built-in connection. It amends:

- **ADR 0017.** A built-in connection may own Haus tools that wrap the service's writes, with the
  actor chosen by Server per Agent.
- **ADR 0027.** Adds a third Trigger kind with Agent-relative selectors and ledger-based loop
  safety.
- **ADR 0045.** Built-in connections are declared through per-service definitions on App and
  Server, and may hold operator-entered per-Agent credentials (Agent identities).
- **[Raft alignment](raft-alignment/README.md) D9.** Linear is the first per-service downstream
  identity: a workspace app, plus optional per-Agent apps.

## Implementation plan

1. **Built-in connection definitions.** Introduce the App and Server definition mechanism and move
   GitHub onto it, with no behaviour change. This step comes first so Linear never adds a branch.
2. **Workspace connection.**
   - Register the Haus apps, add env items, and add the Linear definition with install, binding,
     and the read-only hosted MCP on the app token.
   - Existing DCR connections become custom MCP connections, as Vercel did.
   - Update [Connections](../docs/features/connections.md) and [MCP](mcp.md).
3. **Connector.**
   - Write tools with actor choice, `note`, the write ledger, `upload_image`, and the
     workflow-state tools.
   - A Manual topic for Linear.
4. **Agent identities.** The Linear page roster, the guided flow, identity install, and per-Agent
   actor selection.
5. **Triggers.**
   - The webhook endpoints and verification.
   - Addressed-event acknowledgment and routing, with the `Agent` label group for Agents that have
     no identity.
   - The `linear` Trigger kind: match groups, preview, and degradation on revocation.
6. **Chips.** URL recognition, `linear.issue`, the cache and subscription, the hovercard, and the
   thumbnail proxy.
