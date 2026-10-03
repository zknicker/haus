---
summary: Decision to make hosted Haus servers the durable collaboration boundary and attached Haus Computers the local execution boundary.
read_when:
  - changing the Haus Server or Computer boundary
  - changing Agent identity, membership, roles, Computer assignment, or execution configuration ownership
  - changing App-to-Server or Computer-to-Server transport
  - changing hosted persistence, attachment storage, or the Haus CLI split
---

# ADR 0019: Servers Own Collaboration; Computers Own Execution

## Status

Accepted 2026-07-25 for WS6 of the Raft-alignment program. ADR 0021 supersedes
only this ADR's statements that first-Agent setup is optional and that Cove
uses a normal Owner-to-Cove DM; the Server/Computer ownership boundary remains
accepted. ADR 0022 supersedes this ADR's inline approval and no-human-session
Computer setup decision while preserving the same execution boundary.

## Decision

Haus adopts Raft's hosted Server and attached Computer architecture. A
Haus server is the durable tenant: it owns Chats, humans, Agents, Server
membership, roles, desired Agent execution configuration, tasks, reminders,
attachments, and credentials issued to Agents and Computers. Humans and
Agents are both Server members. Humans may hold Member, Admin, or Owner;
Agents may hold Member or Admin. A Server may have multiple human Owners and
must always retain at least one.

For reminders, Server ownership includes the schedule, fire log, the provenance
on the Agent's answering message, the durable change event, and pending Agent
attention even while the assigned Computer is offline. A fire writes no Chat
message (ADR 0026). A script payload remains opaque
Computer execution data: the Server validates and stores it but never executes
or interprets it. Pending reminder attention is an unacknowledged fire
snapshot, not a transport, retry, drain, or acknowledgment protocol.

Clerk authenticates humans only. Haus stores its own stable Users, Server
memberships, roles, ownership, and invites in PostgreSQL; a Clerk user id is
only a unique external reference. Clerk Organizations and Clerk role metadata
are not authorization sources. Agents use Haus Server membership without
Clerk identities.

Human onboarding uses Server-owned email invitations. A human Owner or Admin
may issue a revocable, single-use invite that expires after seven days. The
recipient authenticates through Clerk with the same verified email; accepting
the invite atomically creates a Member membership and joins `#all`.
Administrative roles are granted separately after acceptance. WS6 does not
ship reusable or open invitation links.

Removing a human Server member requires a confirmation dialog and immediately
revokes that membership on every Server request. Authored messages,
attachments, and task history remain under a former-member identity; active
task assignments and personal pending reminders are cleared. Agents and
Computers created or attached by that User remain Server-owned and operational.
If the same User is invited again, they return as a fresh Member joined only
to `#all`; prior roles and private-Channel memberships are not restored. The
last Owner remains ineligible for removal, demotion, or departure.

Deleting an entire Server is an Owner-only permanent cascade and does not
require deleting its Agents or Computers first. Haus follows Raft's strict
danger-zone interaction: opening **Delete Server** shows a modal that names
the Server and the categories of data being destroyed, states that the action
cannot be undone, and requires the Owner to type the exact immutable Server
slug. The input renders `/` as a fixed prefix; the Owner types the slug
without it. The destructive button remains disabled until the value matches
exactly, and the Server procedure independently requires and verifies that
confirmation slug together with current Owner authority.

After confirmation, the Server is immediately disabled and its invites,
memberships, Computer credentials, and pending work are revoked. PostgreSQL
records and local attachment files are purged asynchronously. Online
Computers receive a best-effort local cleanup command before disconnection;
the dialog warns that Haus cannot erase data from offline, lost, or
destroyed machines. There is no restore path.

Each Haus server has a stable opaque id, an immutable globally unique slug,
and an editable display name. Human-facing Server UI routes and Computer setup use
the slug; stored relationships and protocol authorization use the id.

Creating a Server creates its first Owner and `#all`, but no Computer or
Agent.

> **Historical WS6 onboarding detail, superseded by ADR 0021:** the original
> decision made first-Agent creation optional and used an Owner-to-Cove DM.
> Fresh Servers now require Cove and retain private `#onboarding-owner`; this
> correction does not change the Server/Computer ownership boundary below.

Haus Computer is the local execution service. One installation may maintain
isolated Computer attachments to multiple Haus servers. A reusable,
machine-local Computer login session authorizes management across the signed-in
User's Servers; each attachment then uses its own revocable, Server-scoped
Computer credential. Existing Server attachment daemons depend only on those Server-scoped
credentials and never receive the human session. The Computer CLI exposes
`login`, `logout`, `attach`, `setup`, and `status`; `setup` logs in if needed,
attaches one Server, and starts the service. Re-running `setup` for a valid
local attachment validates and starts that attachment idempotently. If its
credential is rejected while the Server attachment may still exist, `setup`
fails closed and directs the operator to the App; it never silently creates a
replacement Computer or adopts the old identity. Computers own Agent
workspaces, provider credentials, executable model inventory, skill bundles,
Agent sessions, processes, and effective execution state. An Agent is created on one Computer and that
assignment is immutable. If the Computer is offline, its Agents remain
assigned and offline until that same Computer reconnects. Haus does not
migrate, adopt, or restart an existing Agent on another Computer. A Computer
cannot be removed while Agents remain assigned; each Agent must first be
explicitly deleted through its confirmed deletion flow. The Server never
silently substitutes an executor or model that a Computer cannot satisfy.

One resident `haus-computer` OS service supervises one isolated Server
attachment daemon per Server attachment. Each daemon owns only that attachment's Computer
credential, outbound socket, local state partition, Agents, workspaces, skill
bundles, queues, and processes. These resources never
cross Computer boundaries, including between two attachments supervised by
the same resident service. Server records for desired Agent configuration are
scoped by Computer id and may reference only inventory reported by that
Computer. The physical installation shares only installed executable code and
native runtime/model access.

An Agent's one global session inherently serializes its turns. New work for a
busy Agent waits in that Agent's pending inbox; no separate Agent scheduler is
introduced. Different Agents run concurrently on the same Computer, including
Agents owned by different Server attachments. Haus Computer does not
serialize them through a Computer-wide job queue.

Every executor, including Codex, Claude Code, and Pi, receives a universal,
isolated logical `HOME` for the Agent; it is not a separate OS account.
Executor-native locations such as `.agents/skills` and `.claude/skills` resolve
to the Agent's canonical skill directory. The Computer reads that directory
into the AI SDK harness skill contract, so its contents are the exact set
visible to the executor. This deliberately diverges from Raft's ambient
host-global discovery: harnesses never inherit the operator's global runtime
skills or another Agent's skills. Nor do they auto-load instruction files
(`AGENTS.md`, `CLAUDE.md`) from the workspace, its ancestors, or the operator's
home; Computer's per-runtime settings and the one Grok Build gap are listed in
[Context Management](../features/context-management.md). Changing an Agent between Codex, Claude Code,
or Pi preserves the same canonical library without copying, conversion,
runtime-specific variants, or compatibility filtering. A runtime-specific
instruction that does not work under the new executor remains ordinary
Agent-owned skill content. Runtime-specific references or environment injection
expose the physical machine's native provider session without copying provider
credentials into Haus-owned state.

Agents may create, edit, and delete bundles in their own libraries through
`haus skill`. The App may explicitly import a selected bundle from a
runtime-compatible global skill folder on the physical machine into one Agent
library while its Computer is online. Those host folders are browseable import
sources only; Haus has no shared catalog, Server-owned skill assignment,
automatic synchronization, or reconciliation flow. An imported bundle is an
independent mutable copy.

Matching Raft's `agent:skills:list` boundary, the Computer reports only
importable skill names, descriptions, and shortened source paths to Server
Owners and Admins in the App. **Import to Agent** sends a typed command to that
Computer, which copies the selected bundle locally without relaying its
contents through the Server. The Server neither stores nor inspects the source
bundle.

Skill imports and Agent-authored changes never interrupt an active turn and
become visible when the next turn starts or resumes; no service restart or
mid-turn reload protocol exists.

Removing a skill from an Agent is a confirmed deletion of that Agent's mutable
copy, including any adaptations it contains. The dialog names both the Agent
and skill and states that the copy will be deleted. It does not change the
import source or another Agent's library, and Haus keeps no archive or hidden
disabled copy.

The Computer reports compact Agent-skill metadata to the Server: name,
description, content hash, and modified time. This lets the App show the latest
reported library while the Computer is offline. Skill bodies and supporting
files remain Computer-local; authorized App viewing and mutation use the
existing typed live relay and require the Computer online. The Server does not
keep a second copy of skill contents.

Running `haus-computer setup /another-server` starts another child under the
existing service without stopping or detaching current Server attachments.
`start` resumes every attachment by default and may target one Server;
`stop` temporarily stops the local service and its children while preserving
attachments, credentials, workspaces, and Server records. Installation enables
automatic startup at machine boot. An explicit `stop` records an operator pause
that survives reboot until an explicit `start`; a reboot never overrides that
pause.
Stopping, restarting, disconnecting, or failing one attachment does not
disturb another attachment on the same physical machine.

Computer updates are operator-triggered, matching Raft's Computer settings
model and Haus's existing Runtime update UX. The service reports its installed
version, available release, and update phase. An Owner or Admin starts an update
from the App; the Server sends a typed update command over the Computer's
existing attachment socket. The Computer downloads and verifies the signed
release, stages it, restarts the resident service and Server attachment daemons, then
reconnects with its new version. The App presents checking, available,
requested, byte-progress downloading, verifying, waiting-for-agents, installing,
restarting, complete, and failed states. Restart uses prominent indeterminate
progress through the expected disconnect and new bootstrap handshake. Offline
Computers cannot update. Ordinary service startup never installs an update automatically.
`haus-computer upgrade` remains the local repair path. The resident binary is
shared by every attachment on the physical machine, so an update restarts all
Server attachment daemons. An Owner or Admin of any attached Server may trigger a signed
Computer update. Every attachment observes the update state and reconnect, but
only the initiating Server records the initiating User; other Servers receive
no cross-Server identity or slug.

An update drains execution before restart. Download and signature verification
may proceed while turns run. Once staged, the Computer stops admitting new
turns, reports `waiting-for-agents`, lets active turns finish, then restarts.
Messages and wakes remain queued for delivery after reconnect. There is no
hidden deadline that force-kills a turn; an Owner or Admin must explicitly stop
a stuck Agent before the update can continue.

The attachment socket begins with a small, stable Computer bootstrap protocol.
It authenticates the Computer and carries only installed binary version,
Computer protocol version, update commands, downloaded and total bytes, and
update phase/result. When the
ordinary Computer protocol is incompatible, the Server admits the attachment
in `update-required` mode: Agent execution, message delivery, and ordinary
control remain disabled, while Owners and Admins can still repair it through
the App. This is not a compatibility implementation for old Agent behavior.
If a binary is too old to speak the bootstrap protocol, the App directs the
operator to run `haus-computer upgrade` locally.

The release artifact, trust root, installation, rollback, coordinated release
process, and responsive progress UX are detailed by
[ADR 0020](0020-computer-ships-as-a-signed-standalone-release.md).

Unlike Raft, Haus has one production Computer release stream. There is no
release-channel setting, alpha track, or pinned track. App-triggered updates and
plain `haus-computer upgrade` always target the latest production release.

Computer code and Computer data have separate roots. The signed standalone
executable at `~/.local/bin/haus-computer` contains the service and embedded
managed Haus CLI and is disposable. Computer identity, Server attachments,
delivery queues, logs, credentials, and Agent workspaces live in the stable,
version-independent `~/.haus` data root. Update code may atomically replace
the executable but must never recursively replace, clean, relocate, or use the
data root as a staging directory. Agent workspace contents are not update or
local-schema migration inputs. Matching Raft's data-isolation level, Haus
does not copy or snapshot the data root or Agent workspaces before an update.
Small Computer-owned records use atomic temporary-write-and-rename; any future
local database schema change is transactional.

Removing or reinstalling the executable leaves every attachment, credential,
queue, vault record, and Agent workspace intact. Reinstalling validates and
resumes every still-valid attachment. Permanent cleanup remains an explicit
product lifecycle operation, never an installer side effect.

Haus now copies Raft's standalone-binary recovery model. The production
updater downloads a signed platform executable, verifies it, atomically swaps
it, and retains one previous verified executable for explicit rollback. See
ADR 0020 for the current release contract.

WS6 supports Apple Silicon macOS only. Haus Computer has one signed and
notarized standalone executable plus one launchd service implementation and
reports operating system and architecture in its handshake. WS6 adds no Linux,
Intel Mac, Windows, or generic service-manager abstraction.

Computer secrets use Raft-style locked-down local files rather than macOS
Keychain. Each durable Server attachment credential lives in its own
atomically-written mode-`0600` file under that attachment's data partition.
Per-launch Agent runner credentials remain memory-only inside Haus Computer
and are revoked at launch end. The Agent receives only a per-launch local proxy
token in a mode-`0600` file; normal shutdown removes it and startup sweeps
orphaned tokens after crashes. MCP credentials remain on Haus Server.
Secret values never enter logs, traces, update metadata, or Server-visible
diagnostics.

Model-provider access is physical-machine-wide, matching Raft. Haus Computer
reuses the host's installed runtimes, subscriptions, and provider sessions
such as Codex OAuth rather than creating separate provider logins per Server
or Agent. Every attachment may report sanitized runtime/model availability and
health, and that Server's Owners and Admins may assign Agents to those
available models. Provider setup and authentication use the runtime's native
local flow. Haus Computer only detects availability: Haus has no provider
credential form, vault record, or relay. The Computer attachment
acknowledgement explicitly includes this sharing of paid execution capacity.

MCP is a Server service, not Computer execution state. Every configured remote
HTTP MCP connection, credential, OAuth attempt, discovered tool, client
session, and Agent grant belongs to one Haus Server. The Server terminates
MCP and auth, persists secrets outside public tRPC shapes, and invokes upstream
tools. Computer receives only safe schemas and returns calls through its scoped
per-run Server credential. It cannot read or reuse MCP credentials.

MCP OAuth remains remotely operable because Haus Server owns PKCE, the
hosted callback, code exchange, refresh tokens, and authorization-server trust.
Computer does not participate. Google Calendar and MerchBase are endpoint/auth
presets on this path. Custom connections support no auth, secret headers, or
OAuth over remote HTTP; local and stdio MCP are not supported.

A Computer is shared Server compute rather than a private resource of the
User who attached it. Human Owners and Admins may assign and control Agents on
it; Members and Agent Admins may not manage Computer lifecycle or provider
credentials. Attachment records the initiating User for audit and requires
explicit acknowledgement that Server administrators can consume the
Computer's configured execution capacity. Its local operator can always stop
or uninstall `haus-computer`; stopping preserves every attachment and local
workspace.

Haus has no Computer detach, forget, reclaim, or adoption flow. A human
Owner or Admin removes a Computer through a confirmation dialog in the App,
and only after every assigned Agent has been explicitly deleted. Agent
deletion remains available while the Computer is offline and commits entirely
on the Server; it never waits for local cleanup acknowledgement. Once no
active Agent records reference the Computer, removal revokes its credential
and deletes the Server attachment. Any pending cleanup for a permanently lost
machine is discarded because no local machine remains to clean.
Replacing a Computer creates a new identity rather than transferring the old
one. Because a Server may have multiple Computers, an operator may set up the
replacement first, create new Agents there, then delete the old Agents and
remove the old Computer. A lost machine is never required to participate in
that flow.

The command surface splits cleanly:

- `haus` is the Agent-facing Server CLI. A managed Agent calls a
  localhost Haus Computer proxy using a narrow per-Agent proxy credential;
  the Computer forwards the action to the hosted Server. Before starting each
  Agent launch, the Computer uses its Computer credential to mint a scoped,
  revocable Agent runner credential. The Computer keeps that credential
  behind the proxy and revokes it when the launch ends; the Agent process
  receives only the local proxy credential.
- `haus-computer` installs, attaches, inspects, updates, and controls the
  local Computer service.

These are separate command surfaces but not separate managed release
artifacts. `haus-computer` embeds the Agent CLI implementation behind an
internal entrypoint; each managed Agent receives a generated `haus` wrapper
that re-executes that entrypoint with its local proxy context. Haus does not
publish a standalone Agent CLI package while external Agents remain out of
scope.

External Agents are not part of WS6 or the near-term architecture. Haus does
not add direct Agent login, hosted Agent credential profiles, or an external
wake bridge, and it does not introduce extension points for them.

Haus App connects directly to the hosted Server through typed tRPC over
HTTPS and WebSocket. The packaged local app server and SQLite projection
retire. Electron remains an optional thin shell with a narrow typed IPC bridge
for native windows, links, authentication storage, and desktop updates; no
product operation is routed through IPC.

Each Computer attachment maintains one outbound, Computer-authenticated
WebSocket to the hosted Server. Haus Computer independently supervises every
attachment connection. The socket carries typed start, canonical message
delivery, lifecycle, local-inspection, and Computer-control messages rather
than a generic tunnel. App tRPC and Agent actions remain ordinary Server API
traffic. The hosted Server never opens an inbound connection to a Computer.

An Agent delivery is a durable Postgres outbox row. The Server sends its
canonical message envelope over the Computer socket and retries after
disconnect or a missing acknowledgement. The Computer acknowledges only
after it has accepted the envelope into the Agent's pending inbox or start
path. That transport acknowledgement does not advance the model-seen cursor.
Ordinary wake and busy-runtime inputs contain only pending-target metadata;
the full envelope remains in the Computer inbox until the Agent drains it
through `haus message check`, whose localhost proxy answers from the local
inbox before falling through to the hosted Server. Configuration is sent as a
current snapshot on connect, while status updates remain best-effort socket signals.
ADR 0023 adds durable semantic activity metadata while keeping detailed execution journals local.
No generic reliability framework is added.

Deleting an Agent is permanent and requires a destructive confirmation dialog
in the App. The Server immediately retires the Agent's membership, desired
execution assignment, reminders, and task claims while preserving past
messages and attachments under a tombstoned author identity. Computer-local
workspace cleanup is an asynchronous durable command: deletion does not wait
for an offline Computer, and cleanup runs if it reconnects before the Computer
attachment is removed. Haus does not provide Agent restore or deletion
recovery.

Computers continuously publish compact turn summaries and effective execution
snapshots to the Server. Routine App reads use those persisted reports and
never synchronously query a Computer. Mutations of desired Agent state return
after the Server commits the change; Computers apply it asynchronously and
report the result. Matching Raft's offline Runtime Config behavior, humans may
change an Agent's runtime/model choice and Server-owned MCP grants while its
Computer is offline. The Server validates references
against that Computer's last reported inventory, marks the change pending,
and sends the complete current snapshot after reconnect. If a referenced
local resource is then absent, the Computer reports degraded configuration;
it never substitutes another resource.

Matching Raft, a runtime or model change takes effect after the active turn
finishes and starts a fresh Agent session generation on the next turn. Haus
does not translate or replay an executor transcript across runtimes. The
Agent's identity, workspace, `MEMORY.md`, and canonical skill library persist.
Session age and Computer downtime never cause rotation. Apart from explicit
human reset or runtime/model change, Haus resumes the current session and
delegates context compaction to the executor. Matching Raft Computer, a
missing stored runtime session or provider-rejected replay automatically
rotates the Agent session generation and cold-starts once. Activity and the
fresh runtime context explicitly state that earlier context was not restored
and direct recovery from Haus history plus local `MEMORY.md`/notes. Only a
failed cold start leaves the Agent offline with an error.

Agent lifecycle keeps Raft's three-level repair ladder. **Restart** restarts
the executor and resumes the current session. **Session reset** starts fresh
context while preserving the workspace, `MEMORY.md`, and canonical skill
library. **Full reset** starts fresh context and recreates the Agent's
`home/`, `skills/`, `workspace/`, and `runtime/` directories, deleting every
piece of Agent-owned local state. Host-global import sources remain untouched.
Full reset preserves the Agent's Server identity, memberships, authored
history, Computer assignment, runtime/model configuration, and MCP grants.
Its strict confirmation names the Agent and explicitly lists workspace,
memory, and Agent-owned skills as permanently deleted.

Matching Raft, **Stop** is not merely a turn interrupt. It commits a persistent
Server-owned stopped lifecycle state, terminates the live turn, and suppresses
automatic message and reminder wakes across Computer reconnects and service
restarts. Delivery still accumulates in the Agent's pending inbox. A human
**Start** clears the stopped state, resumes the current session, and drains
pending work.

Operations that must observe or mutate local state require an online Computer:
runtime rescans; MCP connect, reconnect, test, identity, and secret changes;
skill installation, creation, editing, and deletion; workspace, trace, and log
inspection; and process start, stop, restart, or reset. They are never queued
as generic desired state. Only inherently local details such as raw
transcripts, workspace files, logs, and credential setup use an authorized
live relay through the Server. These raw local details are not cached in hosted storage:
the App calls an explicit typed Server procedure, the Server authorizes the
human and relays the bounded request over the Computer's existing outbound
connection, and the Computer returns the result. If the Computer is offline,
the local detail is unavailable; the App continues to show the latest
persisted summary and effective-state report. Files that must remain available
to collaborators are deliberately published as Server attachments rather than
implicitly synchronized from the workspace. Only human Owners and Admins may
inspect raw workspaces, traces, or Computer logs. Ordinary Members and Agent
Admins receive only Server-owned summaries and authored collaboration records.
No relay procedure returns provider or integration credential contents.

The hosted Server is one modular monolith deployed as a single node on the
operator's always-on Mac mini behind Cloudflare Tunnel. Cloudflare provides
DNS, TLS, and ingress only. Bun/Fastify, PostgreSQL, attachment storage,
search, durable jobs, leases, events, inbox delivery, and the transactional
outbox all run on the Mac mini, so ordinary requests never cross a
home-to-cloud database or object-storage boundary. Attachment bytes live in a
dedicated Server-owned local filesystem root with authorization metadata in
PostgreSQL. Redis, Kafka, S3-compatible object storage, and separately
deployed schedulers are deferred until measured load or a future deployment
requires them.

PostgreSQL and attachment files have automated asynchronous off-machine
backups, and the deployment includes a tested isolated restore procedure.
Backups are not part of the request path. If the Server later moves off the
Mac mini, the application, PostgreSQL, jobs, and attachment store move
together into one provider and region rather than splitting the hot path
across home and cloud.

WS6 is a complete clean start. Existing local Chat data and Agent workspaces
are discarded through the operator-approved cutover checklist; no migration,
workspace adoption, or memory-file carryover is implemented.

Every Server-owned row carries `server_id`, and cross-record constraints keep
relationships inside one Server. Application services and Server-scoped
repository APIs enforce tenant and resource authorization. PostgreSQL
row-level security is intentionally not used; its request-scoped session state
and privileged worker paths add more operational complexity than this
deployment needs.

## Consequences

- The current local Runtime-as-tenant topology, owner Runtime token, claim
  flow, app-side sync database, and mixed operator/Agent CLI retire.
- Server mutations can atomically commit product state, events, inbox
  delivery, and Computer wake work.
- Every Server UI surface is available from the web; Computer-local operations are
  authorized and relayed through the hosted Server.
- Computer outages degrade execution and local inspection without making
  hosted collaboration state unavailable.
- The Mac mini and its internet connection are one Server availability
  domain. Service-level Computer failure remains isolated, but a physical host
  outage makes the Server unavailable until the node recovers or its off-site
  backup is restored elsewhere.
