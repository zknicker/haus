---
summary: Normative contract for the built-in GitHub connection — the Haus GitHub App, sign-in, installation binding and owner authority, repository access, lifecycle reconciliation, deletion, tokens, environment, migration from the OAuth App, App UI, and the implementation plan.
read_when:
  - changing the GitHub connection, its sign-in, installations, permissions, or repository access
  - changing GitHub App credentials, environment items, or token handling
  - implementing any slice of the GitHub App work (see Implementation plan)
---

# GitHub App connection

GitHub is the first built-in connection ([ADR 0045](../docs/adr/0045-github-is-a-built-in-connection.md)).
It keeps the MCP connection model from [MCP connections](mcp.md) for GitHub's hosted MCP and adds
installations and the `github` Trigger kind ([GitHub Triggers](github-triggers.md)). The GitHub
OAuth App and every `HAUS_GITHUB_OAUTH_CLIENT_*` path are deleted. v1 adds no Haus-owned tools.

## The App

Haus registers one GitHub App per lifecycle under @zknicker: **Haus Chat** (`haus-chat`) for
production (installable by any account) and **Haus Chat Dev** (`haus-chat-dev`, private) for
development. GitHub reserves the plain names for existing accounts. Each has an app id, slug, client id and secret, private key, and
webhook secret. "Expire user authorization tokens" is on. "Request user authorization during
installation" is off, because GitHub then sends the code to the first callback URL without Haus's
`redirect_uri` or PKCE ([user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)).

| Setting | Production | Development |
| --- | --- | --- |
| Callback URL | `https://haus.chat/mcp/oauth/callback` | `http://127.0.0.1/mcp/oauth/callback` (loopback, any port) |
| Setup URL, redirect on update | `https://haus.chat/github/setup` | empty |
| Webhook URL | `https://haus.chat/api/github/webhook` | `https://haus.chat/api/github/sink` |

The sink answers `204` to anything and reads nothing. It exists only so GitHub records the dev
App's deliveries, which development stacks pull ([GitHub Triggers](github-triggers.md#recovery-and-the-development-pull)).
No public relay (Smee or similar) carries Haus deliveries.

### Permissions

Minimal for the hosted MCP toolsets and the Trigger event list. A user token is the intersection
of these and the user's own access.

| Permission | Level | Why |
| --- | --- | --- |
| Metadata | read | mandatory |
| Contents | read & write | MCP `repos`; `push`, `release` events |
| Issues | read & write | MCP `issues`; `issues` events |
| Pull requests | read & write | MCP `pull_requests`; `pull_request`, `pull_request_review` events |
| Actions | read & write | MCP `actions` (runs, logs, dispatch, rerun, cancel); `workflow_run`, `workflow_job` events |
| Checks | read | `check_run`, `check_suite` events |
| Commit statuses | read | PR and commit status reads |
| Deployments | read | `deployment_status` events |
| Code scanning alerts | read | MCP `code_security` |
| Dependabot alerts | read | MCP `dependabot` |
| Organization: Members | read | owner-authority check, org and team reads |

Not requested: Secrets and Organization secrets (no secret tools in v1), Workflows, Administration,
Webhooks, Secret scanning alerts (alerts carry plaintext secrets), Projects, Gists, Discussions.
Adding a permission later makes every installation accept it
([failure modes](github-triggers.md#failure-modes)).

## Sign-in

The `github` preset stays an OAuth MCP connection at `https://api.githubcopilot.com/mcp/`. Its
configured client is `HAUS_GITHUB_APP_CLIENT_ID` and `HAUS_GITHUB_APP_CLIENT_SECRET` through the
existing `oauth-clients.ts` path with PKCE and Server-held state. The callback forwards GitHub’s
RFC 9207 `iss` parameter to the SDK, which validates it against the discovered issuer before
exchanging the code. GitHub Apps ignore `scope`, so the
preset sends none. The hosted MCP accepts GitHub App user tokens and permission-checks them through
the API ([host integration](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md),
[scope filtering](https://github.com/github/github-mcp-server/blob/main/docs/scope-filtering.md)).

The preset header is `X-MCP-Toolsets: default,actions,code_security,dependabot`; the Server's MCP
inventory sweep keeps the stored tool list current. `secret_protection` is deliberately excluded because
its alerts carry secret values, and `notifications` because GitHub's notifications API accepts only
classic tokens ([notifications](https://docs.github.com/en/rest/activity/notifications)); GitHub
Triggers cover that need. The MCP client would forward the resource's advertised classic scopes,
so the OAuth provider strips `scope` from the authorization URL for a configured client without
one.

Server-side GitHub reads (owner checks, repository access, pickers) use the stored user token and
refresh it once when GitHub answers 401 (`github/user-token.ts`); a rejected refresh is
`github_sign_in_required`. GitHub rotates the refresh token on every use, so the MCP OAuth provider
re-reads stored tokens per request and a refresh on either path reaches the other. Concurrent
refreshes of one connection in a Server process share one exchange, and the new pair is stored
under the secret-row lock only while the stored refresh token is still the one exchanged;
otherwise the pair another path stored first wins.

Starting sign-in already clears the connection's identity and Agent grants (`clearMcpIdentity`),
and disconnect deletes grants. Both stay as they are.

## Installations

A **GitHub installation** is one App installation (an org or user account) bound to one Haus
Server through one GitHub connection. Agents reach it only through the connection grant.

`github_installations`: `id` (`ghi_` + 16), `server_id`, unique `(server_id, id)`, `connection_id`
nullable with composite FK `(server_id, connection_id)` → `mcp_connections(server_id, id)` (no
action, deferred for the Server purge; cleared before the connection is deleted), `installation_id` bigint unique among rows whose
status is not `removed`, `account_id` bigint, `account_login`, `account_type` (`User` |
`Organization`), `repository_selection` (`all` | `selected`), `permissions` jsonb, `events` text[],
`status` (`active` | `suspended` | `removed`), `accessible_repository_ids` bigint[],
`access_synced_at`, `bound_by_user_id` (FK users, set null), `created_at`, `updated_at`,
`synced_at`, `removed_at`. Removed rows are tombstones that keep dependent Triggers explainable;
they are never revived by a different `installation_id`.

### Binding

Binding needs both sides' authority. The Haus side is a Server Owner or Admin acting on that
Server. The GitHub side is the connection user's ownership of the installation's account, proven
with the user token:

- **Organization:** `GET /user/memberships/orgs/{org}` returns `state: active` and `role: admin`.
- **User account:** the installation's `account.id` equals the connection user's id (`GET /user`).

Seeing an installation in `GET /user/installations` is not authority; ordinary members and
collaborators see it too. Account facts come from `GET /app/installations/{id}` with the App JWT,
never from a redirect ([setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
warns that `installation_id` can be spoofed).

1. **Install on GitHub.** `github.startInstall` (Owner or Admin) stores single-use state (32 random
   bytes, 15 minutes, bound to Server, connection, and Haus user) and returns
   `https://github.com/apps/<slug>/installations/new?state=<state>`. Like MCP OAuth state, it is
   Server memory; a restart forgets pending installs and path 2 recovers them. `GET /github/setup`
   consumes the state atomically, rechecks the user's Owner or Admin role, runs the owner check,
   binds, and redirects to the connection page with `?github_setup=<outcome>` (`bound`,
   `requested`, or the refusal reason). Missing, expired, or used state binds nothing.
   `setup_action=request` (a member asked an owner) binds nothing and says so. An update redirect
   carries no state and only prompts reconciliation; because it is unauthenticated, it reconciles
   one installation at most once a minute and never concurrently.
2. **Bind an existing installation.** `github.installCandidates` lists unbound installations from
   `GET /user/installations` that pass the owner check; `github.bindInstallation` (Owner or Admin)
   reruns the check and binds. This is the development path and the recovery path after a lost
   state.

An installation already bound to another Haus Server, or to another GitHub connection on this
one, answers `CONFLICT github_installation_already_bound` without naming that Server.

### Repository access

A connection's Triggers may only see repositories its GitHub user can access within the
installation. `accessible_repository_ids` caches the full paginated
`GET /user/installations/{id}/repositories` for the connection's user token. It is refreshed at
bind, at sign-in, on `installation_repositories` deliveries, and hourly. A transient failure keeps
the cache; a cache older than 24 hours, or a connection that is not connected, puts dependent
Triggers into `sign_in_required`. A sign-in GitHub refuses (no token, or a rejected refresh)
invalidates the cache (`access_synced_at = null`) and enters `sign_in_required` in one transaction,
so deliveries stop routing on access the user may have lost; the notices wake their owners. Trigger creation and every delivery check the cache
([matching](github-triggers.md#events)). Repository pickers read the same endpoint.

### Lifecycle reconciliation

Lifecycle deliveries (`installation.*`, `installation_repositories.*`) and the hourly sweep are
signals, not truth; GitHub may deliver them out of order. `reconcileGithubInstallation` fetches
`GET /app/installations/{id}` with the App JWT and derives state from the answer:

| Answer | Effect |
| --- | --- |
| `200`, no `suspended_at` | `active`; refresh selection, permissions, events; refresh repository access |
| `200` with `suspended_at` | `suspended` |
| `404` | `removed` (tombstone) |
| `429`, `5xx`, rate-limited `403`, network error | no change; retry with backoff |

Every status change and its Trigger problems ([failure modes](github-triggers.md#failure-modes))
commit in one transaction.

### Removal and deletion

`github.unbindInstallation`, deleting the GitHub connection, and reconciliation to `removed` share
one transaction: mark each dependent armed Trigger `installation_removed` (bumping `version`),
enqueue one problem notice per Trigger, tombstone the installation (`status = 'removed'`,
`connection_id = null`), and only then delete the connection when deleting. Notices dispatch after
commit. `deleteMcpConnection` is GitHub-aware for this. Disconnect keeps installations; its grant
deletion leaves Triggers `agent_access_revoked` at their next match.

## Tokens

| Token | Lifetime | Stored | Used for |
| --- | --- | --- | --- |
| User access (`ghu_`) | 8 hours | `mcp_secrets`, as today | hosted MCP, owner checks, repository access, pickers |
| User refresh (`ghr_`) | 6 months | `mcp_secrets` | refresh; expiry means **Sign in required** |
| App JWT (RS256) | ≤ 10 minutes | memory | installation reads, delivery API |

`apps/server/src/github/app-auth.ts` signs the JWT (`iat` 60 s back, `exp` 9 minutes). v1 mints no
installation tokens; the first feature that needs one adds minting.

## No Haus-owned tools in v1

The hosted MCP covers repository, issue, PR, and Actions work, including rerun, cancel, and
dispatch. Actions secret management is cut: a secret value would pass through Agent tool
arguments, which the model writes into `execute` code and Computer records in execution journals.
That breaks ADR 0017's custody rule ("credentials never enter ... tool arguments"). A later secret
flow needs a human-facing Server or vault path that hands Agents an opaque reference, never a
literal.

## Environment

One 1Password item per lifecycle, `GitHub App - Haus` in `Development` and `Production`, with
fields `app_id`, `slug`, `client_id`, `client_secret`, `private_key`, `webhook_secret`. Each
resolves with `allowMissing=true`; without them the GitHub connection reports unavailable and the
webhook answers `503`. Test resolves fake literals (tests inject generated keys); release resolves
none. All are in the Server's delivered set (`apps/server/src/config/env.ts`).

| Variable | Sensitivity |
| --- | --- |
| `HAUS_GITHUB_APP_ID`, `HAUS_GITHUB_APP_SLUG` | `@public @optional` |
| `HAUS_GITHUB_APP_CLIENT_ID`, `HAUS_GITHUB_APP_CLIENT_SECRET` | `@sensitive @optional` |
| `HAUS_GITHUB_APP_PRIVATE_KEY` (PEM, delivered like `HAUS_APNS_PRIVATE_KEY`) | `@sensitive @optional` |
| `HAUS_GITHUB_APP_WEBHOOK_SECRET` (≥ 32 random bytes) | `@sensitive @optional` |

`HAUS_GITHUB_OAUTH_CLIENT_ID`, `HAUS_GITHUB_OAUTH_CLIENT_SECRET`, and the `GitHub MCP OAuth - Haus`
items are deleted.

## Migration

The migration that adds these tables invalidates every `preset = 'github'` connection: deletes its
`mcp_secrets` row, deletes its Agent grants, sets `connected = false`, `tools = '{}'`,
`account_label = null`. Grants are not preserved; after signing in again an Owner or Admin regrants
Agents, which matches every other re-sign-in. No compatibility stub exists.

## App UI

The GitHub connection page adds **Installations** between Connected Account and Agent Access: one
row per installation (account mark and login, "All repositories" or "N repositories", a status
chip for Suspended, Removed, or Permissions update needed, and a `···` menu with Configure on
GitHub and Remove from Haus). **Install on GitHub** is primary when there are none; **Add existing
installation** appears when owner-checked candidates exist. Remove confirmation names dependent
Triggers. The OAuth app access restriction copy is deleted. iOS has no connection UI and gets
none. Trigger UI is in [GitHub Triggers](github-triggers.md#app-ui).

## Security

- The App JWT and private key never leave Server memory or `server.env`.
- `mcp_secrets` stores the user token pair as plaintext JSONB in a Server-only table, unchanged
  from today. Encryption at rest is a separate decision.
- Agents never post secrets in Chats ([Manual changes](github-triggers.md#agent-cli-and-manual)).

## Not built

A Server-owned GitHub pull-request snapshot resolver. Docs described a separate "GitHub
pull-request connection"; no code exists. When built, it reads through this connection and adds no
connection kind. Slice B removes the stale claims from `docs/features/connections.md`,
`docs/features/rich-references.md`, and `specs/cloud-agents.md`. An installation shared by two Haus
Servers is refused, not fanned out.

## Implementation plan

Briefs paste the owns and must-not-touch lists below. Workers never `git checkout`, `restore`, or
`stash`; they keep backup copies. Proof follows
[Change Routing](../docs/operations/testing.md#change-routing). Order: Seam, then B and C in
parallel, then D and E in parallel, then integration.

**Slice 0: MCP snapshot and toolsets.** Done (`fix(mcp): keep agent tool inventory in sync with
live listing`).

**Seam (one worker; atomic; typechecks clean).** Owns `packages/haus-api/src/{triggers,github}.ts`
and tests, `apps/server/src/postgres/schema/{triggers,github,agent-delivery}.ts`, `schema.ts`, the
one generated migration (all GitHub tables, the Trigger kind check and nullable `secret_hash`,
`agent_delivery.agent_chain_advanced_at`, and the GitHub connection invalidation with grant
deletion), the Server Trigger mapper (`triggers/trigger-queries.ts`, `triggers/operator-triggers.ts`,
`agent-api/triggers.ts`, `haus-api/trigger/rotate.ts`), every App and Computer consumer of the
Trigger union (`apps/website/src/features/members/agent-profile/{agent-trigger-model.ts,trigger-*}`,
`apps/computer/src/agent-cli/commands/agent-trigger-actions.ts` and test), `.env.schema`,
`config/env.ts`, `docs/operations/environment.md`, `CONTEXT.md` (Built-in connection, GitHub
installation), `github/app-auth.ts`, `github/github-api.ts`, `github/routes.ts` with `501` stubs,
an empty `github` tRPC router, and signature stubs `reconcileGithubInstallation` and
`markGithubTriggersProblem`. Consumers render a `github` Trigger read-only with no URL.
`trigger.create` refuses `github` with `BAD_REQUEST github_triggers_unavailable`. Must not touch
`server-mcp/`, `agent-delivery/` logic, or ingest. Proof: API gate plus Server, website, and
Computer typechecks; server gate on a fresh schema; `env:check`, `env:contract`; JWT unit tests.

As built, the Seam keeps `@haus/api` files under 300 lines by adding
`github-trigger-events.ts` (event allowlist, filters, permissions, problems, repository scope,
`githubTriggerConfigInputSchema`, `githubTriggerViewSchema`) and `agent-triggers.ts` (Agent CLI
Trigger contracts) beside `triggers.ts` and `github.ts`. On every wire contract `installationId`
names the Haus row (`ghi_…`) and `githubInstallationId` names GitHub's number. Refusals share
`triggerRequestRefusalSchema`; the message leads with the code (`github_triggers_unavailable: …`).
The stubs live in `github/installation-reconcile.ts` and `github/trigger-problems.ts` (Slice B
fills them), and `github/routes.ts` answers `501 not_implemented` on `/api/github/webhook`,
`/api/github/sink`, and `/github/setup` until B and C replace each edge.

**Slice B: connection, installations, lifecycle.** Owns `server-mcp/{oauth-clients,preset-headers,
presets,service}.ts` and tests (App client, OAuth App deletion, GitHub-aware delete),
`github/{install-state,setup-route,installation-binding,owner-authority,repository-access,
installation-reconcile,trigger-problems,problem-notice}.ts`, `haus-api/github/*`,
`agent-delivery/inbox-lanes.ts` (the `trigger_problem` source),
`docs/features/connections.md`, `docs/api/connections.md`, `specs/mcp.md`,
`docs/features/rich-references.md`, `specs/cloud-agents.md`. Must not touch `triggers/`,
webhook or recovery files, `agent-delivery/{chain-budget,delivery}.ts`, `apps/website`,
`apps/computer`. Proof: server gate; tests for member-only and spoofed installations refused, user
account owner match, state single-use and expiry, cross-Server `CONFLICT`, reconcile
classification (404, suspended, 429, 5xx), deletion degrading Triggers with one notice each,
access cache refresh and staleness; live: Haus Dev sign-in, bind, one MCP call per toolset.

As built, Slice B derives every Trigger problem in one place (`github/trigger-problem-sync.ts`,
most fundamental cause first: removed, suspended, sign-in required, Agent access revoked,
permissions missing, repositories unavailable) and runs it wherever installation state changes:
bind, reconcile, repository-access refresh, sign-in completion, and the hourly sweep, which
re-derives from stored state when GitHub cannot answer so a stale cache still degrades. A Trigger
scoped to repositories is `repositories_unavailable` while any selected repository is outside the
cache. Deletion lives in `server-mcp/delete-connection.ts`, which reaches GitHub only through
its built-in connection module (`github/github-connection.ts`, looked up in
`built-in-connections/built-in-connections.ts`), and `github/installation-removal.ts`;
the user token in `github/user-token.ts`; Haus-side checks and reads in
`github/installation-access.ts`; App-JWT and user installation reads in
`github/installation-facts.ts`. Agents have no installation-listing route: an Agent's `github`
Trigger names a GitHub account login and the Server resolves the installation
(`triggers/github-trigger-account.ts`; [Authoring](github-triggers.md#authoring)).

**Slice C: deliveries and the `github` kind.** Owns `github/{webhook-route,webhook-signature,sink-route,
delivery-ingest,delivery-recovery,delivery-cursor,trigger-matching,trigger-envelope}.ts`,
`github/event-projection/*`, `apps/server/src/triggers/*` (create and update for `github`, the
authoring cap, the `recordTriggerFire` transaction split), `agent-api/trigger-routes.ts`,
`haus-api/trigger/*`, `agent-delivery/{chain-budget,delivery}.ts` and tests,
`automations/automation-summary.ts`, `specs/triggers.md`, `docs/features/triggers.md`,
`docs/api/triggers.md`, `docs/internals/agent-daemon-delivery.md`. Calls B's reconcile and problem
functions; must not edit them or `server-mcp/`. Removes the `github_triggers_unavailable` refusal
last and merges after B. Proof: server gate; tests in
[GitHub Triggers](github-triggers.md#verification); live: Haus Dev events fire a Trigger through
the dev pull.

As built, Slice C also added the shared App wiring B builds on: `github/github-app.ts` (`GithubApp`:
config, JWT signer, REST transport; `null` when unconfigured) carried as `githubApp` on the
application options, tRPC context, and Agent API routes; `githubRecoveryIntervalMs` on the
application options (10 seconds under `HAUS_DEV_STACK=1`, 10 minutes otherwise, `null` in the
test harness); `github/deliveries.ts` binding ingest to the running Server; and
`github/routes.ts` registering the webhook and sink. It also touched `agent-api/triggers.ts`
(the Agent `github` create), `agent-delivery/store.ts` (the chain stamp), and
`triggers/retention-sweep.ts` (seven-day delivery expiry). New authoring refusal codes live in
`triggerRequestRefusalSchema`; `github_triggers_unavailable` is gone.

**Slice D: App UI.** Owns `apps/website/src/features/settings/connections/built-in/github/*`
(the GitHub built-in connection definition and its installations section),
`apps/website/src/hooks/github/*`, `features/members/agent-profile/trigger-*` and
`agent-triggers.tsx`, `hooks/members/use-trigger-*.ts`, and iOS
`HausModels/AutomationModels.swift`, `HausModels/AutomationFormatting.swift`, and
`HausUI/Automations/TriggerDetailView.swift` (GitHub label, problem line, footer copy without
"rotate the secret" for `github`). Uses `architect-react-features`, the HeroUI catalog, and
`.design/guidelines.md`. Proof: website gate plus focused tests, Browser pane walkthrough, scoped App e2e for
GitHub Trigger creation, `swift test` and a Simulator build.

**Slice E: Agent CLI and Manual.** Owns `apps/computer/src/agent-cli/commands/agent-trigger*.ts`,
`packages/agent-manual/src/corpus/*` (rewrite `trigger-webhook` in `techniques-b.ts`),
`specs/haus-cli.md`. GitHub adds no CLI family, Manual topic, or recipe; its Trigger vocabulary
lives in `haus trigger create --help`. Proof: computer gate,
agent-manual tests, `test:agents` scenarios "wake me when CI fails" (creates a `github` Trigger,
posts no secret) and "set up a webhook for my service" (posts no secret in any Chat).

Then integration proof on the dev stack, `autoreview`, and grouped commits.

### Operator steps

Registration, the `GitHub App - Haus` vault items, and OAuth App retirement are done (2026-10-12).
What remains ongoing: install **Haus Chat** on each org Haus uses as an org owner, and accept
permission updates when Haus adds one.
