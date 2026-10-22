# Haus

Haus is a collaboration product for durable chat and machine-local Agent execution.

This file defines stable product language. It is not a docs index; run `bun run docs:list` to pick
the docs to read before changing behavior.

## Language

**Haus Server**:
The hosted deployment and durable top-level collaboration container. It serves Haus App and
owns the API, persistence, Chats, members, agents, reminders, tasks, attachments, and other shared
product state. A human may belong to multiple independent Haus Servers.
_Avoid_: Runtime, Computer, workspace, deployment

**Server slug**:
The globally unique, immutable human-facing address chosen when a Haus server is created. Server
relationships and authorization use the stable Server id instead.
_Avoid_: Server name, Server id, invitation code

**Haus App**:
The React product surface through which humans use one or more Haus Servers. It runs in a browser
or the Electron desktop shell; Electron adds native window, credential, deep-link, and update behavior.
_Avoid_: Server UI, website, Electron-only App

**Computer**:
A Server-scoped attachment of a physical machine that runs Agent sessions and Agent turns and
stores its Agents, workspaces, skills, queues, and execution credentials. None of those resources
can be referenced or used across Computers, including attachments on the same physical machine.
MCP connections and grants belong to Haus Server instead. A Haus server may have multiple
Computers; one physical machine may have a separate Computer attachment in multiple Haus
servers. The physical installation shares only installed software and native runtime/model access.
_Avoid_: Hosted Computer, Haus server, tenant, Haus Computer installation, agent runtime, model provider

**Haus Computer**:
The local service installation that connects a physical machine to zero or more Haus servers and
supervises each Server-scoped Computer attachment independently. One resident OS service supervises
one isolated Server attachment daemon per attachment; each daemon owns only that Server's
credential, socket, and Agent processes. WS6 supports Apple Silicon macOS only and installs the
resident service with launchd.
_Avoid_: Haus server, Computer attachment, Agent runtime, child runner, attachment runner, tenant

**Haus Runtime (retired)**:
The pre-Computer standalone product that combined local collaboration state and Agent execution in
one self-contained service. It is not a current product, release, connection, or compatibility surface.
_Avoid_: using this name for Haus Computer or for Codex, Claude Code, or Pi execution runtimes

**Haus CLI**:
The agent-facing `haus` command that acts on one Haus server through the managed Agent's local
Haus Computer proxy. For managed Agents it is bundled inside the installed `haus-computer`
artifact and exposed through an injected wrapper; it is not a separately installed npm package.
_Avoid_: Haus Computer CLI, human administration CLI, local service

**Haus Computer CLI**:
The human-operated `haus-computer` command that installs, attaches, inspects, and controls Haus
Computer on a physical machine. Its release artifact also embeds the managed Haus CLI
implementation behind an internal entrypoint. Its human lifecycle is `login`, `logout`, `attach`,
`setup`, and `status`; `setup` logs in if needed, attaches one Server, and starts the service.
Re-running `setup` reuses a valid local attachment and fails closed rather than replacing an
attachment whose credential is rejected. Setup is additive across Servers: adding another Server
starts another isolated Server attachment daemon without stopping existing daemons.
Stopping Haus Computer is temporary and preserves every attachment; permanent Computer removal
is a Haus App action, not a CLI detach operation. A manual `stop` persists across machine restarts
until an operator explicitly runs `start`; otherwise the installed OS service starts
automatically at boot.
_Avoid_: Haus CLI, Agent tool, hosted Server administration

**Computer release**:
An independently versioned, immutable Haus Computer executable plus its signed production
descriptor. It uses `computer-vX.Y.Z` tags and one production stream, but participates in the same
holistic release decision as Server and App. A compatible Computer release is published
and publicly verified before a Server release that requires its protocol.
_Avoid_: App release, Server deployment, release channel, npm package

**Computer update**:
An operator-triggered upgrade of the installed Haus Computer service. The service reports its
current version and update state to every attached Server. Owners and Admins initiate updates from
Haus App's Computer settings; the Server sends a typed update command to the online Computer, which
downloads and verifies the signed standalone release, drains active turns, atomically replaces the
executable, restarts, and reconnects. Updates never install automatically during ordinary startup.
Because the resident service is shared, any attached Server's Owner or Admin may trigger the
update and every attachment observes its byte progress, phase, disconnect, and reconnect. Other
Servers receive no initiating Server or User identity. A stuck Agent must be explicitly stopped;
updates never force-interrupt a turn. `haus-computer upgrade` is the local recovery path, and
`haus-computer upgrade --rollback` restores the one previous verified executable. Haus
publishes one production Computer release stream; there are no release channels or pinned tracks,
and every normal update targets the latest release.
_Avoid_: App update, automatic update, Agent runtime change, protocol fallback

**Haus update opportunity**:
A currently observable App, Computer, or Agent release change that Haus can act on now. Offline
Computers are excluded because their installed state may have changed since their last report;
reconnection may therefore reveal another update opportunity after an earlier update completes.
_Avoid_: ecosystem compliance state, offline Computer, blocked update

**Computer offline attention**:
An attached Computer's unavailable connection state, presented independently from software updates.
It directs an authorized operator to that Computer even when no update is known or required.
_Avoid_: update failure, blocked update, stale version

**Computer install root**:
The disposable location containing the signed standalone Haus Computer executable and its
embedded managed Haus CLI. The canonical executable is
`~/.local/bin/haus-computer`; the updater may retain one verified
`~/.local/bin/haus-computer.prev` for explicit rollback. Installation and updates atomically
replace code but never write to the Computer data root. npm, Homebrew, and the application bundle
do not own this root.
_Avoid_: Computer data root, Agent workspace, attachment state

**Computer data root**:
The stable, version-independent local root containing the Computer login session, Server attachment
state, delivery queues, logs, and Agent workspace directories. It is outside npm package and
executable locations. Updates drain Agents before changing code and never replace, recursively
clean, or relocate this root. The updater does not snapshot the data root or Agent workspaces;
small Computer-owned records use atomic writes, and local schema changes are transactional. Its
canonical path is `~/.haus`; resident service state lives under `computer/`, while each attachment
owns `computer/servers/<server-id>/` with its credential, vault, queues, and
`agents/<agent-id>/{home,skills,workspace,runtime}/` directories. Removing or reinstalling the
standalone executable never deletes this root. Reinstalling resumes every still-valid attachment
and workspace. Immutable execution-runtime bridge packages use the machine-wide
`cache/harness-bridge-store/` and may be shared by production Computers, development stacks, and
Server attachments; Agent state and credentials never enter that cache.
_Avoid_: Computer install root, npm package directory, application bundle

**Computer model access**:
The physical machine's shared installed runtimes, model inventory, subscriptions, and provider
sessions. Every Server attachment receives sanitized availability and health, and its Owners and
Admins may assign Agents to available models. Haus only detects these native runtime sessions:
provider setup and login happen through each runtime's own local flow, and Haus never accepts,
stores, or relays provider credentials. Attaching a Server explicitly authorizes this shared paid
compute capacity, matching Raft's reuse of host runtime logins such as Codex OAuth.
_Avoid_: Server-owned model credential, per-Agent provider login, hosted provider secret

**MCP connection**:
A Server-owned configured account on one remote HTTP MCP server. Haus Server stores its
credentials, OAuth state, discovered tools, connection-level Agent grants, and client sessions.
Server keeps its inventory current through MCP notifications and background reconciliation,
independently of Agent turns. A connection grant covers current and future upstream tools.
Computer receives only safe tool schemas and returns granted calls through a scoped runner
credential. Reusing an external account on another Server requires a separate connection.
_Avoid_: Computer-owned integration credential, local MCP process, stdio connection

**MCP OAuth attempt**:
A short-lived Server-owned authorization flow for one MCP connection. Haus Server creates and
retains PKCE and routing state, validates the hosted callback, exchanges the one-time code, and
stores and refreshes tokens. Computer does not participate.
_Avoid_: Computer callback relay, Agent-visible token, durable authorization code

**Built-in connection**:
An MCP connection where Haus owns the relationship with the service and integrates beyond MCP
tools. GitHub is the only one: its sign-in uses the Haus GitHub App, it binds GitHub
installations, and its deliveries fire `github` Triggers. Custom MCP connections stay tools-only.
_Avoid_: provider, integration framework, plugin

**GitHub installation**:
One Haus GitHub App installation (an org or user account and its repository selection) bound to
one Haus Server through one GitHub connection. Binding needs a Server Owner or Admin and the
signed-in GitHub user's ownership of the account. A removed installation is kept as a tombstone.
Agents reach it only through the connection grant.
_Avoid_: GitHub org connection, repository connection, seeing an installation as authority

**Linear workspace**:
One Linear organization bound to one Haus Server through one Linear connection, by an install of
the shared Haus Linear app that a Server Owner or Admin starts and a Linear admin approves. Its
app user is the workspace actor every granted Agent can work through. An organization binds to at
most one Haus Server; a removed workspace is kept as a tombstone.
_Avoid_: Linear team, Linear account, Linear installation

**Linear identity**:
An optional per-Agent Linear app the Owner registers in their own workspace, which makes that
Agent a Linear teammate with its own name, avatar, delegate slot, and @-handle. The Server picks
the actor per operation; the Agent never names one.
_Avoid_: Linear user, Linear seat, Linear account per Agent

**Linear session**:
Linear's agent session, opened when someone mentions or delegates an issue to the Haus app or an
identity, held in Haus under an `lss_` handle and routed to one Agent. Its events reach the Agent
as Linear session inbox rows; the Agent answers in Linear with the session's handle.
_Avoid_: Agent session, Haus session, Linear conversation

**Computer bootstrap protocol**:
The minimal stable handshake through which a Computer authenticates and reports its binary and
protocol versions before entering the versioned Computer protocol. An incompatible Computer may
remain connected in `update-required` mode only, allowing signed update control and progress
reporting but no Agent execution, delivery, or ordinary control. A Computer too old for the
bootstrap protocol requires local `haus-computer upgrade`.
_Avoid_: Computer protocol, backward-compatible Agent protocol, version fallback

**Agent proxy credential**:
A narrow local credential that lets one managed Agent use its Haus Computer proxy as itself for
one Server attachment. It has no authority when presented directly to a Haus server.
_Avoid_: Computer credential, external Agent credential, human session

**Agent runner credential**:
A scoped, revocable Server credential minted to Haus Computer for one managed Agent launch.
Haus Computer keeps it behind the localhost proxy and revokes it when the launch ends; the
Agent process and shell never receive it.
_Avoid_: Agent proxy credential, external Agent credential, Computer credential, provider credential

**Computer login session**:
A revocable, machine-local human session bound to one Haus origin and used by Haus Computer to
discover and manage Computers across the signed-in User's Servers. It never authenticates Agent
execution or grants Chat access.
_Avoid_: Clerk browser session, Computer credential, Agent session, provider login

**Computer credential**:
A revocable credential issued by one Haus server when an authorized Computer login session
attaches a physical machine. It authenticates one Computer attachment's outbound connection and
grants no human or cross-Server authority. The credential is stored in an atomic, mode-`0600`
attachment file under the Computer data root, not macOS Keychain.
_Avoid_: Human session, Agent credential, provider credential, shared Runtime token

**Server member**:
A human User or Agent with standing access to one Haus server. Server membership governs
server-wide identity and role; participation in a specific Chat is a separate relationship.
_Avoid_: Hosted Server member, Chat participant, Clerk user, Computer, external actor

**User**:
A persistent human identity in Haus that may hold membership in multiple Haus servers. Clerk
authenticates the human and supplies an external identity reference but does not own the User.
_Avoid_: Server member, Chat participant, Clerk user, local operator

**Server role**:
A human Server member's authority within one Haus server: Member, Admin, or Owner. A Haus
server has one or more Owners, and its last Owner cannot leave, be removed, or be demoted. Agents
carry no Server role.
_Avoid_: Chat role, agent specialty, global user role, Agent role

**Server invite**:
A Server-owned, email-bound, single-use invitation that lets one Clerk-authenticated human become a
Member of one Haus server before it expires. Administrative roles are assigned only after the
human joins.
_Avoid_: Clerk invitation, reusable join link, Server membership

**Agent**:
A persistent non-human Server member whose collaboration identity belongs to one Haus server.
An Agent is created on one Computer, where its workspace and execution state live; that assignment
never changes. An offline Computer leaves the Agent offline, and the Computer cannot be removed
until the Agent is explicitly deleted.
_Avoid_: Hosted Agent, Agent session, Agent turn, executor, Computer

**Agent handle**:
The Server-scoped alias used to address one active Agent. A retired Agent keeps its historical
handle, while a newly created Agent may reuse that alias with a new Agent identity.
_Avoid_: Agent id, display name, permanent username

**Message**:
The only durable unit of a Chat transcript. It has one author, one immutable sequence position,
meaningful immutable content, and one typed body; Tasks and attachments remain orthogonal metadata.
_Avoid_: chat entry, timeline item, post, card

**Message body**:
The typed Haus product act carried by a Message: text or a created Agent. It may project a
separately mutable Server record but never replaces the Message's readable content. Cloud Agent
work is not a body; a text Message links it.
_Avoid_: generic action, card payload, arbitrary content block, provider event

**Card**:
The Haus App presentation of a Message body, linked Cloud Agent work, or recognized reference. A card has no durable
identity, placement, lifecycle, or authorization of its own.
_Avoid_: card record, Chat entry, Widget, artifact

**Unread**:
The Inbox section listing every Channel, DM, and Thread with something one human has not read,
newest activity first. A Channel or DM counts only its own messages; a Thread counts its replies
the human follows or is mentioned in, on its own row (ADR 0043). Viewing a Chat while Haus is in
view clears it; **Mark read** clears it without opening it. There is no attention tier above
unread (ADR 0038).
_Avoid_: Needs you, attention, Done, notification center

**Message notification**:
A platform alert (iPhone push, desktop or web notification) for a new message one human did not
write: every message in their DMs, and in a Channel or Thread one that @mentions them, inline-replies
to their message, or sits in a Thread on their message. One shared rule decides it; it is
independent of the Inbox. An @mention is how an Agent asks a person anything (ADR 0037).
_Avoid_: Needs you alert, attention, escalation

**Inbox**:
The Haus App page below Search where one human sees the week's active Agents, their Unread Chats,
and Agent and Cloud Agent work running now. It is a lens over existing records and owns no state
of its own; unread is the viewer's read marker.
_Avoid_: Agent inbox, notification center, activity feed, task list

**Agent inbox**:
The durable Server-owned delivery ledger of pending work for one Agent, with exact model
visibility, notice turns, and Agent-discretion pulls. It is agent-only state and never renders as
a human surface.
_Avoid_: Inbox, notification, Chat unread, message queue

**Agent-created Agent**:
An Agent one Agent created directly with `haus agent create` after a human in that Chat asked for
it. It inherits its creator's runtime, model, reasoning effort, and Computer, and its creator's
announcement Message is the record of it: that Message names the new Agent as `@handle` in ordinary
prose. There is no proposal, approval, or human commit step.
_Avoid_: prepared action, Agent creation proposal, draft mutation, Agent approval, action card

**Avatar generation**:
A Server-owned image operation that turns a short freeform brief into square avatar bytes using
Haus's canonical release-owned pixel-art prompt. It never stands alone: a human keeps the preview
until they save it, and an Agent reaches it only through `haus agent create --avatar-concept` or
`haus agent avatar`, which assign the result in the same operation.
_Avoid_: avatar repository, automatic profile update, transient avatar file

**Cloud Agent work**:
Durable provider-hosted work delegated by a Haus Agent. It is a standalone Agent-owned record that
belongs to no Message or Chat (ADR 0044): it owns its delegating Agent, one or more provider Runs,
and its mutable lifecycle, and it survives deletion of the Chat that asked for it. Results reach
the work Thread as ordinary Messages, references, attachments, and artifacts composed by the
delegating Agent, which owns follow-up after terminal completion reaches its inbox.
_Avoid_: Harness subagent, Haus Task, named teammate, Cursor Message

**Cloud Agent work link**:
A `cloud-agent://<workId>` rich reference in a Message's content, recorded by the Server when the
Message is written. Every link shows the same live card; none is primary and none is a copy. The
launch Message is simply the first link. Anyone who can read a live linking Message can see the
work, and an author may link only work they can already see.
_Avoid_: work copy, embedded work, origin card, primary card

**Image generation**:
One image an Agent renders through `haus image generate`, kept as a standalone Server record that
belongs to no Message or Chat. It is started detached from any Chat, owns its model, request,
state, and cost, and is addressed as `image-generation://<id>`. Messages link to it and render
its card; the finished image is an ordinary Agent-owned attachment. See
[Image generation](specs/image-generation.md).
_Avoid_: image job, image Message, native image tool output

**Agent execution configuration**:
The Haus server's immutable Computer assignment plus desired executor, model reference, execution
policy, Server-owned MCP connection grants, and lifecycle state for an Agent. Humans may edit this desired
state while the Computer is offline using its last reported inventory. The Computer applies the
current snapshot after reconnect and reports any unavailable local reference as degraded instead
of substituting it. A stopped lifecycle state persists until a human starts the Agent and
suppresses automatic wake without discarding pending work.
_Avoid_: Effective execution state, provider credentials, executable model inventory

**Effective execution state**:
Computer-reported facts about an Agent's current executor, model, session, process, capability
health, and failures. A Computer reports unsatisfied configuration instead of silently substituting
another executor or model.
_Avoid_: Agent execution configuration, Server policy, cached Haus App state

**Reported execution snapshot**:
The Haus server's latest persisted report of a Computer's effective execution state. It serves
routine Haus App reads without contacting the Computer and may be labeled stale when reports stop.
_Avoid_: Desired configuration, live Computer query, execution trace

**Turn summary**:
A Haus server record of one Agent turn's trigger, timing, outcome, effective model, usage totals,
and short failure category, excluding prompts, tool details, transcripts, and files.
_Avoid_: Execution trace, Chat message, model-context compaction

**Chat**:
A durable Haus conversation container, shaped like a channel or DM, where humans, agents, system
actors, and external actors can participate.
_Avoid_: Hosted Chat, Agent session, thread, executor channel, transcript

**Channel**:
A named multi-participant Chat in a Haus workspace.
_Avoid_: Room, group chat

**DM**:
A one-to-one Chat between one human and one Agent. Agents do not DM each other; they
meet in the channels and threads they share.
_Avoid_: Private channel, direct channel, agent-to-agent DM

**Chat participant**:
One actor with membership in a Chat, such as a human user, Haus agent, system actor, or external
identity.
_Avoid_: Worker, sender, runtime identity

**Agent seat**:
An Agent Chat participant in a specific Chat, used for membership, addressing, authorship, and
Chat-scoped routing. The Agent's execution continuity belongs to the Agent, not to this seat.
_Avoid_: Agent presence, session key, runtime route

**Agent session**:
The rotatable execution continuity record for one Agent across all of its Chats. An Agent has at
most one current session. Changing its runtime or model starts a fresh session generation while
preserving the Agent's identity, workspace, memory, and skills. A runtime resume failure also
rotates automatically with explicit recovery evidence rather than leaving the Agent stuck on
unusable context.
_Avoid_: Chat, seat, runtime session

**Agent turn**:
One execution attempt by an Agent inside its Agent session. A turn may receive or act across
multiple Chats and is not owned by the Chat that woke it.
_Avoid_: Agent run, Chat, session

**Agent activity**:
A human-readable observation of meaningful Agent work during an Agent turn, such as a lifecycle
transition or semantic tool category. It is safe, summarized execution metadata—not reasoning,
message drafts, raw tool inputs or outputs, command contents, or private file contents.
_Avoid_: Chat activity, typing indicator, raw execution trace

**Chat engagement**:
An Agent turn's hold on a Chat whose human messages it has read and not yet answered, shown to
humans as typing above that Chat's composer. It ends when the Agent sends into the Chat or the
turn settles.
_Avoid_: typing state, composition, Agent activity

**Agent activity history**:
The Server-persisted chronological record of summarized Agent activity, including lifecycle changes
and semantic tool categories. It remains available when the Agent's Computer is offline and never
contains the detailed Computer-local execution journal. An Agent's creator is provenance, not its
owner or a separate authorization role.
_Avoid_: Chat history, turn list, current status

**Turn Details**:
The role-aware drawer opened from an Agent-authored Chat message to inspect the turn associated with
that response. Server members see the Server-persisted activity summary. Server Owners and Admins
may request the detailed execution journal from the Agent's online Computer through an authorized
live relay; those details are unavailable while the Computer is offline and are not persisted by
Server. Agent activity history remains the canonical chronological summary.
_Avoid_: Chat transcript, unrestricted execution trace, Agent activity history

**Agent execution journal**:
The Computer-local, turn-keyed record of inspectable tool calls, inputs, outputs, errors, and timing.
It is available to Server Owners and Admins through an authorized live relay such as Turn Details,
but is not copied into Server persistence. It excludes model reasoning. Its retention and cleanup
behavior are intentionally deferred to the holistic Agent data-retention policy.
_Avoid_: Agent activity history, Chat history, model session

**Agent workspace**:
The Computer-local per-Agent filesystem home that stores the Agent's editable identity,
instructions, briefing files, episodic observations, generated files, and working state. The
Haus Server does not cache it; authorized Haus App reads use a live Computer relay and are unavailable
while that Computer is offline. Only human Server Owners and Admins may inspect it through Haus App.
_Avoid_: Server attachment storage, Wiki root, provider home

**Agent runtime home**:
The Haus-managed logical `HOME` seen by one Agent's executor. It lives beside that Agent's
workspace inside its Computer attachment and contains only per-Agent executor state. Its
executor-native skill locations, including `.agents/skills` for Codex and Pi and `.claude/skills`
for Claude Code, resolve to the Agent skill library beside it. The executor does not discover the
operator's global skill folders. It is not a macOS account, the operator's home, or a
provider-credential store. Runtime-specific references or environment injection let the executor
reuse the physical machine's native provider session without copying that credential into Haus
state.
_Avoid_: Agent workspace, host home, Computer data root, global skill folder

**Active turn stream**:
Transient Runtime state for an in-progress Agent turn, used for live updates before durable Chat
messages and activity are complete.
_Avoid_: Chat history, UIMessage array, browser request

**Agent executor**:
A small Runtime implementation boundary that turns an Agent turn request into Haus turn events.
_Avoid_: Agent engine, provider adapter, harness wrapper

**Agent addressing**:
The rule that decides which agent participants should create Agent turns for a Chat message.
_Avoid_: Session routing, runtime routing, trigger parsing

**Model provider**:
A Runtime integration that can expose agent-executable models after the user enables it and completes
its access setup.
_Avoid_: Model family, provider option, model row

**Provider catalog**:
The maintained list of Model providers Haus can add to a Runtime.
_Avoid_: Executable model list, enabled providers, provider credentials

**Enabled model provider**:
A Model provider the user has added to the Runtime. It may still need credentials, OAuth, CLI setup,
or host dependencies before it can execute turns.
_Avoid_: Connected provider, catalog provider, installed provider

**Provider access**:
The credential and host setup state for an Enabled model provider.
_Avoid_: Model capability, provider config, agent model

**Executable provider**:
An Enabled model provider whose Provider access is ready for Agent turns on the Runtime host.
_Avoid_: Catalog provider, connected provider, authenticated provider

**Model record**:
A catalog row for a concrete model route, including its model ref, display metadata, capabilities,
provider, and execution kind. A Model record is executable only when it belongs to an Executable
provider.
_Avoid_: Model alias, provider option, model family

**Executable model**:
A Model record that belongs to an Executable provider and can be used for Agent turns now.
_Avoid_: Available model, configured model, default model

**Agent runtime profile**:
An agent's selected Model record plus execution policies for tools, memory, and sandboxing.
_Avoid_: Provider config, harness config, model config

**Agent default model**:
The Model record stored on an Agent runtime profile and used when Runtime creates a new Agent
session.
_Avoid_: Global model, provider default, app default

**Effective model**:
The Model record an Agent session currently uses. Agent runtime profiles provide defaults, but
current model selection is session-scoped.
_Avoid_: Global agent model, provider setting

**Tool**:
A Runtime-visible executable action an agent may invoke during an Agent turn.
_Avoid_: Skill, MCP server, channel, Plugin

**Harness-native tool**:
A Tool supplied by the selected Agent executor's harness, such as local file, shell, search, web
search and fetch, or provider-native subagent actions. Haus may display these as provider facts, but does not own their
individual lifecycle.
_Avoid_: Haus tool, Plugin action, MCP server

**Haus host tool**:
A Tool implemented by Haus Computer and passed to the Agent executor: browser control and the
Server MCP `execute` tool. Web search and fetch are harness-native, never Haus host tools.
_Avoid_: Harness-native tool, raw Runtime route, MCP connection setting

**MCP connection**:
A Haus Server-owned configured instance of a remote HTTP Model Context Protocol server,
including authentication, account identity, connection state, and discovered tools. Multiple
connections may target the same server for different accounts. Server invokes granted calls
without exposing credentials to Agents or Computers.
_Avoid_: Hosted MCP connection, local process, stdio transport, Tool, Channel, Plugin

**MCP tool grant**:
An Agent-level policy that enables one whole MCP connection during Agent turns. Every current tool
on that connection becomes available, and Server rechecks the connection grant immediately before
forwarding every call.
_Avoid_: Per-tool switch, per-chat MCP setting, global grant

**Sandbox mode**:
The execution environment for an agent's tools and harness processes: none, Docker, or Podman.
_Avoid_: Approval mode, runtime prompt

**Local workspace sandbox**:
A Sandbox mode of none where Haus gives an agent a host filesystem workspace under the Haus data
root and runs child processes directly from that workspace.
_Avoid_: Secure sandbox, container, VM

**Assignable primitive**:
A Haus capability that can be attached to an agent definition, such as an MCP tool grant,
host-tool grant, Memory namespace, or Channel membership. Skills are local Agent files, not
assignable primitives.
_Avoid_: Runtime plugin, harness setting, bundled feature

**Agent skill library**:
The canonical, writable `skills/` directory owned by one Agent inside one Computer attachment.
The Agent may create, edit, or delete its skills through `haus skill`; a human may explicitly
import a selected bundle from the physical machine into this directory while the Computer is
online. Its contents are the exact skill set exposed to every executor the Agent uses. Changing
the Agent's runtime or model never changes, copies, converts, or filters this library. The Computer
reports compact metadata—name, description, content hash, and modified time—to the Server for
offline Haus App display. Skill bodies and supporting files remain Computer-local and require an
authorized live relay to view or edit.
_Avoid_: Global skill folder, disposable harness projection, skill assignment

**Skill import**:
An explicit online copy of one bundle from a runtime-compatible global skill folder on the physical
machine into one Agent skill library. Global folders are opt-in import sources only and are never
inherited or scanned by an Agent executor. Matching Raft's skill-list boundary, the Computer may
report importable names, descriptions, and shortened source paths to Server Owners and Admins in
Haus App, but bundle contents never transit or persist on the Server. **Import to Agent** performs
the copy entirely on the Computer. The imported copy has no synchronization or provenance
lifecycle and may be modified freely by the Agent.
_Avoid_: Skill assignment, shared catalog, global skill enablement

**Agent skill removal**:
A confirmed deletion of one bundle from one Agent skill library. It may destroy Agent-authored
adaptations, so the dialog names the Agent and skill and states that the Agent's copy will be
deleted. The import source and every other Agent library remain unchanged; there is no archive or
disabled copy.
_Avoid_: Import-source deletion, unassignment, global skill disablement

**Widget activity envelope**:
The durable `haus.widget.<name>` render envelope that historical `widget` rows use for a Visual or Page in chat
history (ADR 0010; the Page's row name stays `artifact`). The retired closed widget catalog (tables, charts, calendars, html-preview)
replays as fallback-text cards.
_Avoid_: Rich Response, UI block, AG-UI component, ChatKit widget

**Visual**:
One bespoke model-authored HTML/SVG graphic rendered from a `visual` fence in a sandboxed inline
frame styled with Haus theme tokens.
_Avoid_: Rich Response, custom widget, raw HTML block

**Visuals skill**:
The seeded skill that owns rendering guidance for agents: when to render, the visual and page
fence contracts, and the design system (ADR 0012).
_Avoid_: Prompt design section, page-design skill, per-medium design skills

**Workspace**:
An Agent's own files on its Computer, persisting across its turns. A user opens it full-page from
the Agent's profile or beside a chat in the Workspace pane; only Server Owners and Admins can
inspect it, and only while that Computer is online.
_Avoid_: drive, sandbox, artifacts

**Attachments**:
Files sent in a conversation, each a copy stored with its message and readable by the
conversation's members; the chat's Attachments pane lists them.
_Avoid_: artifacts, uploads (as the product noun)

**Page**:
A self-contained HTML file in an Agent's workspace, posted with a `page` fence; chat shows a card
that opens a live view of that file in the Workspace pane, so the card changes when the file does
and opens only for those who can inspect the workspace. A page to share with every member or keep
as a version goes in as an attachment or in Files. The old `artifact` fence is not read.
_Avoid_: artifact, artifact page, snapshot, document, report (as the noun for this output)

**Files**:
The Server-wide tree of shared folders and files every member can read and edit, with retained
revisions and a stable link per file: the App's Files section and `haus files` in the Agent CLI.
Wire names keep `artifact` (`artifact_id`, `/artifacts/<id>`, `ARTIFACT_*`).
_Avoid_: drive, shared drive, shared artifacts (in product prose)

**Workspace pane**:
The chat's side pane for browsing Agent workspaces, for Server Owners and Admins: Pages, `haus://workspace` links, and files
picked from its + menu open here as tabs, each tab one workspace target (a file, folder, or root;
code names it the artifact panel). Haus never auto-opens it; a user opens it from a page card,
link, or the topbar toggle.
_Avoid_: Artifacts, Artifact Panel, Artifact pane, output pane, canvas

**Inspectable output**:
A workspace file, Wiki page, Markdown or HTML doc, image, or generated asset an agent created or
updated for the user to inspect.
_Avoid_: Haus resource, tool result, attachment

**Host adapter**:
A small adapter file in Runtime, Server, or Website that connects a Widget contract to that
layer's existing event, projection, or rendering pipeline.
_Avoid_: Widget implementation, plugin loader

**Surface component**:
A normal Haus App React component used to render validated Widget props with the UI's shared
visual system.
_Avoid_: Model component, widget primitive

**Memory**:
Haus's per-agent durable context system: briefing files, episodic observations, and background
workers that keep those files useful.
_Avoid_: Wiki, vault, knowledgebase, prompt-time memory

**Wiki**:
The shared user-owned Markdown graph for durable cross-agent knowledge. Agents browse and maintain it
through `wiki_*` tools.
_Avoid_: Memory, vault, prompt briefing, episodic log

**Wiki root**:
The filesystem directory that stores the shared Wiki Markdown files and local Git history.
_Avoid_: Runtime storage root, managed workspace, workbench

**Agent briefing file**:
An agent-owned startup briefing file in the Agent workspace, such as `MEMORY.md` or `USER.md`,
loaded into that agent's prompt and refreshed from Memory by background workers.
_Avoid_: root-level briefing files, Vault page

**Dreaming**:
The nightly heartbeat: an Agent's own memory consolidation, run once per night as a private,
chatless dream turn in a throwaway session. It reflects on the day, consolidates `MEMORY.md` and
`notes/` (Manual topic `recipes/technique/memory-hygiene`), follows up dropped promises, and writes
a summary. The Agent does the work; nothing rewrites memory for it.
_Avoid_: Tidy pass, nightly memory review, background extraction, compaction

**Heartbeat**:
A daytime check-in: a chatless run, every three hours from 08:00 to 20:00 Computer-local, in a
throwaway session. It catches up on the Chats the Agent took part in, follows leads, and files at
most one heartbeat report; it posts nothing in a Chat. Skipped while the Agent is busy, and it
yields to a message addressed to the Agent. Spec: `specs/heartbeat.md`.
_Avoid_: Ping, poll, cron, scout

**Heartbeat report**:
The one report a heartbeat run files, queued as a chatless inbox item for the Agent's main session.
The main session decides whether anyone hears it.
_Avoid_: Notification, alert, digest

**Lead**:
A shared, Server-owned claim on a question or thread an Agent is researching, so two Agents do not
research the same thing. Claimed for seven days, kept fourteen; a finished lead records its finding.
_Avoid_: Task, ticket, claim (alone)

**Charts**:
The Widget family for agent-authored chart displays.
_Avoid_: Chart kit

**Calendar displays**:
The Widget family for agent-authored calendar event and calendar day displays.
_Avoid_: Calendar widget tools
