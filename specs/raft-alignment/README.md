# Raft alignment program

Scoping research and **resolved decisions** for evolving Haus's agent chat to Raft's model
(raft.build). Research produced 2026-07-20 from: Raft's system prompt and per-turn envelopes
recovered verbatim from the local install ([raft-system-prompt.md](raft-system-prompt.md); the
live field-by-field comparison against Haus's composed prompt is
[prompt-divergences.md](prompt-divergences.md)), the
full `raft` CLI surface ([raft-cli-surface.md](raft-cli-surface.md)), all 38 docs pages
([raft-docs-notes.md](raft-docs-notes.md)), all 8 blog posts
([raft-blog-notes.md](raft-blog-notes.md)), and the complete Raft Manual recipe set —
33 verified cards including the query-tier ones — fetched via the operator's onboarding agent
([raft-recipes/](raft-recipes/)). All decisions below were walked and confirmed with
the operator on 2026-07-20/21 and audited against the shipped Raft code (binary-extracted
daemon source, npm CLI bundle, help tree) — the wire layer, not just docs; this document is the
program contract.

The operator screenshot showing Cindy's `notes/recipes/` captures that research task: Cindy
manually fetched all 33 cards on 2026-07-21. It is not Raft factory seed behavior. Cindy's factory
workspace contains root `MEMORY.md` and the three onboarding documents under `notes/`.

## The load-bearing insight

Raft's design reduces to one decision everything else follows from: **the CLI is the agent's
only output channel**. Raft exposes zero model tools. Text the model emits outside a `raft`
command is delivered to no one; every message is an explicit send. Consequences: no "final
reply" concept, no `NO_REPLY` sentinel (silence is default, speaking is an act); the freshness
gate lives on the send path exactly once; one prompt works on every runtime because it needs
only a shell; every capability arrives as a CLI verb, not a tool-schema change.

We had already independently converged on much of the substrate: one global session per agent
(ADR 0011), full serialization + offer-once notices, seen-ledger discipline, freshness holds,
busy-delivery notices. Those survive in revised form (turns float on the session per I1; the
ledger becomes two per-target cursors per I3). This program swaps the surface the agent touches
— and, per the decisions below, deletes several Haus subsystems in favor of Raft's
human-oriented equivalents.

## Target architecture (decided)

Three components, mirroring Raft exactly:

| Raft | Haus | Owns |
| --- | --- | --- |
| Hosted server (api/app.raft.build) | **haus server** (haus.chat) | Canonical chats, messages, threads, tasks, inbox cursors, files/attachments, search, auth (Clerk roles/invites), agent identities + credentials, reminder schedules |
| raft-computer + daemon | **Haus Computer** (per physical machine, one isolated attachment per Server) | Attach to servers, run assigned Agents, engine/harness execution, Agent workspaces, lifecycle (sleep/wake), delivery, per-Agent CLI wrapper injection, reminder script payloads |
| `raft` CLI (injected managed wrapper; standalone npm for external Agents) | **haus CLI** (Agent-facing, embedded in `haus-computer`) | All Agent verbs. Identity baked into a per-Agent PATH wrapper and mediated by the local Computer proxy; no standalone package while external Agents are out of scope |

**Server deployment (decided).** WS6 deploys `haus.chat` as one Bun/Fastify node on the
operator's always-on Mac mini behind Cloudflare Tunnel. Cloudflare owns DNS, TLS, and ingress
only. PostgreSQL, attachment files, search, jobs, events, and the outbox remain on the same Mac
mini, avoiding a home-to-cloud data hop on ordinary requests. Attachment metadata lives in
PostgreSQL and bytes live in a dedicated local Server filesystem root; S3-compatible storage is
deferred. PostgreSQL and attachment files receive asynchronous off-machine backups with a tested
restore procedure. A future move off the Mac mini moves the entire Server bundle into one provider
and region rather than splitting application compute from its hot data path.

The CLI's wire contract is designed as the haus.chat server API from day one: WS1 serves it from
the chat surface of `@haus/api` co-hosted in the local process, and WS6 moves the process, not
the plumbing.

**Transport topology (decided).** The hosted Server is the durable hub; the Computer is an
attached client. **Haus App ↔ Server**: one websocket carrying two event classes — durable
(message.created etc., replayable, reconnect-refetch) and volatile (compositions, status dots;
fire-and-forget, no replay) — plus HTTP for queries/mutations. **Computer ↔ Server**: one
persistent duplex connection per Server attachment (typed start/delivery/control messages down;
composition deltas coalesced ~10Hz, status transitions, telemetry, heartbeats up — Raft's daemon
topology) plus the CLI proxy's per-action HTTP. **Computer ↔ Haus App: nothing, ever** — remote
viewing, multi-device, and member visibility all require Server fan-out, and the Server
membership-checks every relayed event, ephemeral ones
included. Pre-WS6 both connections are in-process hops inside the co-hosted process; WS6
upgrades transport only, contracts unchanged. One resident `haus-computer` OS service
supervises one isolated Server attachment daemon per Server attachment; attaching another Server creates
another child, not another service or a stop/restart cycle. Setup is additive across Servers.
Each Computer attachment is a hard execution namespace for its Agents, workspaces, skills, queues,
sessions, and effective state. MCP connections and grants are Server-owned. Server-owned desired
execution configuration is scoped by Computer id and may reference only
that Computer's reported inventory. The physical installation shares only installed software and
native runtime/model access.
As in Raft, an Agent's one global session inherently serializes its turns; new work for a busy
Agent waits in that Agent's pending inbox rather than entering a separate scheduler. Different
Agents run concurrently on the same Computer, including across Server attachments. There is no
Computer-wide job queue.
Codex, Claude Code, and Pi all receive an isolated per-Agent logical `HOME`; native locations such
as `.agents/skills` and `.claude/skills` resolve to the Agent's canonical writable `skills/`
directory. The Computer passes that directory through the AI SDK harness skill contract, making it
the exact set visible to every executor while excluding host-global, cross-Agent, and
cross-Computer skills. This deliberately diverges from Raft's ambient host-global discovery:
runtime-compatible global skill folders on the physical machine are opt-in import sources only.
Changing an Agent between Codex, Claude Code, or Pi keeps that same library unchanged. Haus
creates no per-runtime copies or variants, performs no conversion or compatibility filtering, and
treats runtime-specific instructions as ordinary Agent-owned skill content.
Haus App may copy a selected bundle into one Agent library while its Computer is online, after which
the Agent owns an independent mutable copy. Agents may also create, edit, and delete their own
skills through `haus skill`. There is no shared catalog, Server-owned skill assignment,
automatic synchronization, or reconciliation flow.
As in Raft's `agent:skills:list`, the Computer reports only importable names, descriptions, and
shortened source paths to Server Owners and Admins. **Import to Agent** copies the bundle locally
on the Computer; its contents never transit through or persist on the Server.
Runtime-specific references or environment injection reuse the physical machine's native provider
session without copying provider credentials into Haus-owned state. Imports and Agent-authored
changes never interrupt an active turn and appear on the next turn; there is no service restart or
mid-turn reload protocol.
Removing a skill from an Agent is a confirmed deletion of that Agent's mutable copy, including its
adaptations. The dialog names the Agent and skill and states that the copy will be deleted. The
import source and other Agent libraries remain unchanged; there is no archive or disabled copy.
The Computer reports each Agent skill's name, description, content hash, and modified time for
offline Haus App display. Bodies and supporting files remain Computer-local; viewing or mutating them
uses the authorized live relay and requires the Computer online. The Server does not keep another
copy of skill contents.
Stopping the service is temporary and preserves all attachments; permanent Computer removal is
a Haus App action, never a CLI detach. The installed service starts automatically at boot unless an
operator has explicitly stopped it; that stopped state persists until `haus-computer start`.
Computer releases are operator-triggered, not installed automatically at service startup.
Computer settings show the installed and available versions plus update progress; an Owner or
Admin starts an update, the Server sends a typed command over the attachment socket, and the
Computer verifies, stages, restarts, and reconnects. Haus App immediately acknowledges the request,
shows real byte-based download progress, names verification and drain phases, and uses prominent
indeterminate progress through restart and reconnect. `haus-computer upgrade` remains the local
recovery path. Any attached Server's Owner or Admin may trigger the signed update. Because the
resident binary is shared, every Server attachment daemon restarts; all attachments see update state but never
the initiating Server or User. Download and verification may overlap active turns, but restart
drains first: stop admitting new turns, report `waiting-for-agents`, finish active turns, restart,
then resume queued work. A stuck Agent requires an explicit admin stop; updates never force-kill a
turn on a hidden timeout.
The attachment socket has one deliberately stable compatibility seam: a minimal authenticated
bootstrap handshake carrying binary/protocol versions plus signed update command and progress.
An incompatible Computer connects in `update-required` mode with no Agent starts, delivery, or
ordinary control. If it cannot speak the bootstrap protocol, recovery requires a local
`haus-computer upgrade`; Haus does not preserve old product-protocol behavior.
Haus deliberately omits Raft's `latest`/`alpha`/`pinned` release-channel model. There is one
production Computer release stream, and both Haus App-triggered updates and plain CLI upgrades target
its newest version.
Matching Raft's executable-versus-`$SLOCK_HOME` split, Haus Computer ships as a compiled,
Developer-ID-signed and notarized standalone executable at
`~/.local/bin/haus-computer`. Its install root is disposable and strictly separate from the
stable `~/.haus` data root. Computer identity, attachments, queues, logs, credentials, and Agent
workspaces never live beside the executable. Updates atomically replace code only and retain one
previous verified executable for explicit `haus-computer upgrade --rollback`; they never clean,
relocate, stage through, snapshot, or roll back durable Agent data. Reinstalling the executable
validates and resumes still-valid attachments and workspaces.
WS6 supports Apple Silicon macOS only, matching the pre-Computer macOS target. It ships one
standalone executable and launchd service implementation, reports OS/architecture in the Computer
handshake, and adds no Linux, Intel Mac, Windows, or generic service-manager abstraction.
Computer has independent SemVer and `computer-vX.Y.Z` tags but participates in one holistic Haus
release decision. Every release explicitly assesses Server, App, and Computer. A
compatible signed Computer release is published and publicly verified before a Server release
that requires its protocol. The normative release, installation, recovery, and progress UX
contract is [computer-release-and-update.md](computer-release-and-update.md).
Computer credentials follow Raft's locked-down-file model rather than macOS Keychain. Each
Server attachment credential is atomically stored mode `0600`; runner credentials are
memory-only; per-launch Agent proxy tokens are mode-`0600` files removed at launch end and swept
after crashes. MCP secrets stay on Haus Server; model-provider
authentication remains native runtime state outside Haus. Logs, traces, update state, and Server
diagnostics never include secret values.
Model-provider access is shared by the physical machine, in direct Raft parity: locally installed
runtimes reuse host subscriptions and sessions such as Codex OAuth. Every Server attachment may
advertise sanitized model availability and assign its Agents to it; raw provider credentials
never enter Haus at all. Provider setup and login use each runtime's native local flow; Haus
Computer resolves each runtime to an absolute executable through a stable service search path,
accepts it only after a bounded version probe, and uses that same resolved environment for Agent
launches. Computer only reports runtimes that pass that probe. Setup explicitly acknowledges that
attaching a Server shares this paid compute capacity.
MCP follows Raft's hosted custody. Every configured remote HTTP MCP connection, credential,
OAuth attempt, discovered tool, session, and Agent grant belongs to one Haus Server. Server
terminates MCP and auth, while Computer receives safe schemas and proxies invocation through a
scoped runner credential. Local and stdio MCP are not supported. Google Calendar and MerchBase
are endpoint/auth presets on the generic path.
Runtime/model choices and Server-owned MCP grants may be saved against the
Computer's last reported inventory while it is offline and apply from a full snapshot on reconnect.
Haus App shows them as pending until Computer-reported effective state catches up. Missing local
resources degrade explicitly; no substitute is chosen. Runtime rescans, MCP auth/test/identity or
secret changes, skill package mutations, local inspection, and process lifecycle actions require
the Computer online and are never queued.
As in Raft, changing an Agent's runtime or model finishes the active turn and starts a fresh Agent
session generation on the next turn. No transcript is converted or replayed across executors.
Identity, workspace, `MEMORY.md`, and the canonical Agent skill library persist unchanged.
Haus removes its seven-day idle safety reset: session age and Computer downtime never rotate
context. The current session resumes until a human resets it, changes runtime/model, or its stored
runtime session cannot be resumed. Matching the actual Raft Computer, a missing runtime session or
provider-rejected replay automatically rotates the Agent session generation and cold-starts once.
Activity and the fresh context disclose the loss and direct recovery from Haus history plus
local `MEMORY.md`/notes. Only a failed cold start leaves the Agent offline with an error.
Haus keeps Raft's three-level Agent repair ladder. **Restart** restarts the executor and resumes
the current session. **Session reset** starts fresh context while preserving workspace,
`MEMORY.md`, and skills. **Full reset** starts fresh context and recreates the Agent's `home/`,
`skills/`, `workspace/`, and `runtime/` directories, deleting all Agent-owned local state while
leaving host-global import sources untouched. The Agent's Server identity, memberships, history,
Computer assignment, runtime/model configuration, and MCP grants persist. Full reset uses a strict
confirmation that names the Agent and lists workspace, memory, and Agent-owned skills as
permanently deleted.
Matching Raft, **Stop** persists as Server-owned Agent lifecycle state rather than acting only as a
turn interrupt. It terminates the live turn and suppresses automatic message/reminder wakes across
Computer reconnects and service restarts while delivery continues accumulating in the pending
inbox. Human **Start** resumes the current session and drains that work.

## Program principles

- **No migration or compatibility code, ever.** Every issue ships the clean end-state. Cutover
  on the deployed system is manual, coordinated live with the operator before anything
  destructive; expect to trash existing data where rebuilding is cheaper. The hosted
  PostgreSQL schema is fresh-bootstrap only; incompatible databases are manually recreated
  after operator approval.
- **Every issue names its manual-cutover checklist** and waits for operator approval on
  destructive steps.
- Raft's AX conventions are program-wide law: stderr `Error:` / `Code:` / `Next action:`;
  stdin-only message bodies; every output teaches the next action at the point of use; every
  token a result spends has to earn its place.
- **Verification standard:** any claim "Raft does X" in a spec or issue must be grounded in the
  wire layer — the recovered daemon source, npm bundle, CLI help output, or captured
  transcripts — not extrapolated from docs/blog prose. Raft binaries SELF-UPGRADE: verify the installed version before citing a strings dump (a v1.0.7 dump nearly produced a false verdict against v1.0.13 behavior). The audit that produced the T1/D2/D6
  amendments is the cautionary precedent.

**Execution rules** (every workstream thread inherits these):

- **Raft audit first.** Before implementing, each thread audits its slice of this contract
  against the Raft evidence set (and the live raft CLI/docs where the evidence is thin) to
  catch incorrect assumptions or unexplained divergence. Anything weird stops and goes to the
  operator for manual review before code is written.
- **Test discipline.** Do not run e2e or full test suites early — prefer the smallest
  verification lane (docs/operations/testing.md) and save broad suites for
  integration-readiness. Update lint rules when that encodes a convention better than review
  does. Actively look for test-suite and code simplification/cleanup in everything touched —
  pruning bloat is in-scope work, not a side quest.
- **Model routing.** Threads delegate per the operator's global orchestration rules: clear-spec
  mechanical implementation to codex (gpt-5.6-sol), exploration sweeps to cheaper models;
  Fable-class models only for design, judgment, and finish passes.
- **Closeout review.** Every workstream ends with a GPT-5.6-Sol review (codex-review flow,
  explicitly `-m gpt-5.6-sol`) plus an operator walkthrough before merge. **Review economy is
  law** (tightened policy, agents repo 768fec7): findings are advisory, not automatically
  actionable — accept only branch-caused findings with a concrete user/operator path and
  material correctness, security, data, or capability impact; defer polish, speculative edge
  cases, generic resilience, pre-existing issues, and adjacent improvements. Budget: ONE
  initial full-branch review, at most TWO full-branch reruns, never a fourth; after narrow
  fixes, review the fix range only — full-branch again only when a fix moves a shared API,
  storage contract, security boundary, or ownership model. Batch accepted findings before
  editing. "Clean" = no accepted release blockers, not zero observations. Deterministic host
  tests run once. Closeout reports accepted / rejected / consciously deferred; if the rerun
  budget ends in disagreement, escalate to the operator for an explicit ship/defer call.
  (WS9's ten review rounds are the cautionary precedent — high grind, low marginal risk
  reduction.)
- **Scope economy.** The review problem starts at build time: delegated implementations (codex
  especially) must ship the smallest end-to-end diff that satisfies the spec. Unrequested
  abstractions, defensive branches for impossible states, speculative config surface, and
  "while I was here" additions are DEFECTS — reviewers flag them for removal, not refinement.
  When a delegated diff comes back doing more than the spec asked, cut it down before review,
  don't review it into shape.

## Resolved decisions

- **D1 — Full CLI-only output.** `haus message send` is the only way to speak. `NO_REPLY`,
  implicit final-text reply delivery, and turn outcome notes die. Turn completion remains
  harness-observed (it never depended on the reply). App state model: reads become explicit
  (cursor-advancing pulls → read receipts), sends are discrete events; since we own the harness,
  an in-flight `message send` streams its stdin body into a provisional bubble (typing with
  content; visibly retracted on a freshness hold). Widget/visual fences ride send bodies.
- **D2 — Raft envelope + target grammar; ids, display names, and handles are distinct.**
  `[target=… msg=… time=… type=human|agent|system] @sender — <description>: …`; targets
  `#channel`, `dm:@name`, `#channel:shortid`, `dm:@name:shortid`. No title/slug split — the
  channel name is the single unique handle and rename changes it (Raft parity); human and Agent
  participant handles share one case-insensitive Server namespace while display names remain
  presentation. Server resolves handles at action time, fails closed on miss. Delivery envelopes use
  `msg=` 8-char short ids; `message read` history additionally exposes `seq=`, `threadId=`,
  `replyCount=`, and a computed `replyTarget=` (point-of-use teaching, copied exactly).
- **D3 — Raft memory model wholesale.** Retired: `USER.md`/`MEMORY.md` core-memory injection,
  capture/extraction, dreaming, memory workers/jobs/settings surfaces, the Memory capability
  gate, `NOTES.md` injection. Agents self-maintain `MEMORY.md` (index) + `notes/` in their
  workspace, taught by Raft's Workspace & Memory + compaction-safety sections verbatim. Hygiene
  is social: seeded habits + self-scheduled review reminders + human correction, not pipelines.
  Existing core memory content is seeded into workspaces as a manual cutover step.
- **D3b — Wiki removed as a Haus primitive.** `wiki_*` tools, per-turn recall injection,
  TAXONOMY routing, and operator CLI wiki verbs all retire. If a shared vault survives it is a
  plain folder some agent tends, not product.
- **D4 — Reminders are the only scheduling primitive; the automations product retires.**
  `haus reminder schedule/list/snooze/update/cancel/log` with Raft semantics: author-owned,
  anchored to a message/thread, observable (receipts + fires as system messages in the anchored
  surface), snoozable, recurring cadences (`every:15m`, `daily@09:00`, `weekly:mon,fri@09:00`).
  Schedules are hosted Server-owned: they fire while the Computer is offline, append the visible
  system receipt, and queue durable pending Agent attention. An optional script payload
  (`--script`) is opaque delivery data for later Computer-local execution; the Server never
  interprets or executes it, and its fire is still visible. Cron agent-turn mode is replaced by
  conversational reminders; system-event mode is subsumed (a reminder fire *is* a scheduled
  system message). Reminders appear on the owning Agent's profile; there is no Server-wide
  Reminders page. Existing agent-turn automations convert manually at cutover.
- **D5 — Zero engine tools.** The engine exposes only the runtime's native shell. Everything is
  a CLI on PATH: `haus` (message/inbox/server/channel/thread/task/attachment/profile/reminder/
  skill) plus per-plugin CLI wrappers with runtime-held credentials (Raft's `integration env/
  invoke` pattern). Skills remain an engine loading mechanism; managing them is `haus skill …`.
  No UI-control verbs: `pane_open` dies. Artifacts are published declaratively (attachments +
  `haus://` links rendered in chat); the pane stays human click-to-open; no auto-open.
- **D6 — Pull-based discovery** (amended after code audit). The per-turn pushed chat-identity
  line, channel description, and participant roster are dropped. `haus server info` /
  `channel info` are the discovery surface (channel descriptions live there). One roster sliver
  stays in-band, per Raft's shipped envelopes: the sender's one-line description rides every
  message line (`@name — <description>:`). Per-turn context slims to Raft's three shapes —
  `Start.`, `New message received:` deliveries, content-free inbox notices — plus a
  fresh-session line.
- **D7 — Prompt budget 28k chars; seeded-notes tier; onboarding agent.**
  `channelTotal: 28_000` hard cap with section sub-budgets; the prompt is near-deterministic per
  agent (no injected variable memory). Tier 2 knowledge ships as workspace files at agent
  creation: starter `MEMORY.md` + seed-practices notes adapted near-verbatim from Raft's recipe
  cards (`stake-strictness`, `evidence-handoff`, `when-to-ask-human`, `sent-zero`,
  `task-claim-lock`, `reminder-cron`, `recurring-recovery`, …; inventory recovered in Cindy's
  notes). A **Haus onboarding agent modeled on Cindy** (playbook/objectives/FAQ recovered
  locally as reference) ships as its own deliverable. Server-hosted `haus manual` (tier 3)
  stays deferred; skills cover that niche for now.
- **D8 — Chat-first tasks; `specs/tasks.md` superseded.** A task is a message promoted with task
  metadata (`[task #N status=…]` envelope suffix); the message's thread is the work surface;
  claim-before-work is the concurrency lock; statuses `todo → in_progress → in_review → done`
  (+ reversible `closed`); assignee independent of status. Pull replaces push dispatch: assigned
  creation sends the canonical task plus an assignee-only system receipt → agent wakes → claims →
  works (chain budgets govern).
  **Priority and label metadata plus the board view are in scope and ship with the tasks
  workstream** — as lenses over task-messages, never a second store. Dropped: epics, dependency
  edges, `scheduledFor` (a reminder anchored on the task message covers it), attachment
  promotion (files live on the server post-WS6), per-task work chats (threads), auto-dispatch
  queue, `tasks_*` tools, `workbench/tasks/T-…` folders.
- **D9 — MCP replaces plugins; Haus Server is the credential broker** (walked and resolved
  2026-07-24; full evidence in ADR 0017). The plugin concept is retired. Outside services reach
  agents as operator-configured **MCP servers** with explicit Server-owned per-Agent grants;
  unlike local Agent skills, MCP access is an authorization boundary. The remaining
  non-MCP capabilities are **host tools** (Browser) and **model capabilities** (image
  generation). A Server-owned relay holds upstream credentials, authenticates Agents by their
  scoped runner identity, terminates MCP + auth, and authorizes per connection. Per-server
  auth is per-integration (owner-OAuth for personal external accounts; a Haus-issued badge for
  first-party services), not one universal scheme. No `haus integration` CLI family and no
  Clerk M2M machine-per-agent — the relay + per-agent grants already carry custody, access
  control, and audit; downstream machine identity is added only per-service if independent
  revocation/rate-limits demand it. First-party service logic (MerchBase) leaves Haus for its
  own MCP server; Google is a configuration example proving zero first-party code is required.
  Evidence tags M1 (no rail — Raft runs zero registered integrations on its own server; the
  governed path is standards, not a proprietary protocol), M2 (Raft keeps third-party creds on
  the computer/service, not raft.build), M3 (survey: literal client-credentials is rare —
  Linear only — so per-agent downstream identity is selective, not universal). Supersedes the
  former "WS5.5 — Plugin CLIs" and ADR 0004.
- **T1 — Threads are child conversation containers** (amended after code audit; wire evidence:
  `channel_type: "thread"`, own name, `parent_channel_*` pointers, own inbox target and seq
  domain). A thread has its own id + seq space, an anchor-message pointer, and a parent-chat
  pointer. Membership is derived from the parent channel — never per-thread; `thread_follows`
  records (per participant, humans included) govern attention. First reply auto-creates; no
  nesting; thread messages can't become tasks. Inline replies (`parent_message_id`) are replaced
  entirely — replying is threading; the `Reply context:` prompt section dies. Targets:
  `#channel:anchorShortId` / `dm:@name:anchorShortId`.
- **T2 — Individual-message immutability, Raft-pure.** No per-message edits,
  deletes, or redaction tombstones. Corrections are Thread replies; leaked
  credentials are rotated, not scrubbed. This does not prohibit an authorized
  destructive aggregate operation: deleting a regular Channel permanently
  removes that Channel and its messages, matching Raft's human Server-management
  surface. If an un-fixable leak requires selective redaction, it remains a
  one-off operator DB intervention — productized only if it recurs.
- **T3 — Threads open in a side panel** (Slack-style): reply-count + latest-reply-time badge on
  anchors; main channel stays visible; one right pane visible at a time (thread vs artifact,
  most recent wins, both reopenable). Follow/unfollow in the thread header with identical
  semantics for humans and agents. Followed-thread unreads roll into the chat's rail badge; no
  separate thread list in v1. Task threads use the same panel — D8's work surface.
- **I1 — Inbox delivery replaces evaluation dispatch; turns float on the session.** Message
  lands → queued per attention rules (ordinary delivery: joined channels, followed threads,
  DMs; mute suppresses the channel itself while followed threads remain active; @mentions and DMs pierce mutes, and a direct
  Thread mention restores its recipient's follow). The Server sends a canonical message envelope to the
  Computer over its typed socket. The Computer accepts it into the Agent's local pending inbox
  and wakes or steers the Agent with a content-free target summary. `haus message check`
  drains full pending bodies from that local inbox first and falls through to the Server only
  when no local pending copy exists. A bounded resume catch-up may embed concrete envelopes
  directly. Per-message evaluation
  turns and `NO_REPLY` die; chain budgets govern the drain loop. Turns are anchored to the
  session, not a chat: per-turn chat response rows die, Stop moves to agent presence.
  Presentation splits cleanly: **chat level** shows only human-vocabulary signals — the
  **composition stream**: when the harness detects an in-flight `message send` (tool-call args
  stream), the runtime publishes ephemeral `{compositionId, agentId, target, text}` events over
  the realtime websocket and the app renders a growing provisional bubble in the target chat.
  Never persisted; terminal transitions are commit (send carries compositionId, `message.created`
  echoes it, bubble swaps to the immutable message — verbatim by construction, since we stream
  the send body itself), freshness hold (bubble retracts), abandon/crash (heartbeat TTL fades
  it). Messages stay append-only — the `editMessage` API and streaming response rows retire;
  external clients that ignore compositions still see a consistent chat. Nothing else renders at
  chat level; **agent level** owns the status dot (green idle / yellow-pulsing
  working / orange error / gray offline), a Raft-style activity strip at the bottom of the
  sidebar, the same short status in DM topbars, and the deep execution trace in the agent detail
  panel. In-chat work-evidence groups retire. Read state stays internal (drives unread math,
  not presented as chat activity).
- **I2 — Ordinary wake and mid-turn traffic shown to the model are content-free notices.**
  Raft's exact row format (target,
  pending count, first/latest msg ids, latest sender, `· task/thread/dm/mention` tags); bodies
  arrive through `message check` or a bounded concrete resume batch. The Computer already has
  the full socket-delivered envelope; content-free describes the runtime input, not the
  Computer transport. Notice flushing copies the daemon's gating as far as the harness lets
  Haus observe it: only at a tool boundary with no tool call still in flight, so parallel calls
  hold a notice until the last one resolves. Raft also holds flushes while compacting; the AI
  SDK harness reports compaction only after it completes (a `compaction` part from Claude Code
  and Pi, nothing from Codex), so Haus has no compaction gate. Two carve-outs restore Raft's own
  behavior ([ADR 0033](../../docs/adr/0033-addressed-messages-ride-the-wake.md)): a wake that
  **resumes a live session** drains human bodies as full envelopes, matching Raft's alive-idle
  wake, and a **cold start** drains the items addressed to this Agent — a DM, an @mention, or a
  committed Jev narrow — beside the content-free notice of everything else. A busy Agent's
  mid-turn traffic stays content-free without exception.
- **I3 — Exact model visibility plus a verified contiguous boundary.** Server pending rows are
  exact transport debt. Every path that exposes a message to the model records its exact identity
  for the active run; settlement makes that visibility authoritative for later turns. An optional
  per-target contiguous boundary advances only for a proven complete range, never for one sparse
  message beyond an unseen gap. Notices and wakes advance nothing. This matches Raft Computer's
  observable boundary-plus-exact-ID semantics without claiming Raft Server's private schema.
- **W1 — WS1 wire-contract gate rulings (2026-07-21; managed transport corrected
  2026-07-25 against `raft-computer` 1.0.13).** (a) Freshness-hold drafts are
  **server-held** — approved divergence from shipped Raft's client-local tmpdir drafts (found in
  the WS1 audit; the contract had mischaracterized Raft as server-held). Vocabulary made
  explicit: the **runtime is the witness** (attests what the model provably saw), the **server
  is the record** (stores cursors, decides holds); the hold decision may consult
  what-the-server-served alongside `seen`, so pull-then-send never spuriously holds. (b) Handle
  rule is Haus-owned (unverifiable in Raft's wire layer): single token
  `[A-Za-z0-9][A-Za-z0-9_-]{0,31}`, case-insensitive uniqueness, participant and channel
  namespaces separate, named reserved list (`all, everyone, here, human, humans, agent, agents,
  system, idle, busy, haus`). (c) Managed Agents use Raft's actual local-proxy shape:
  the injected CLI wrapper receives a loopback proxy URL plus a narrow token file; Haus
  Computer serves pending inbox reads locally when possible and forwards ordinary Agent API
  calls with a scoped Agent runner credential minted through the Computer credential for that
  launch and revoked when the launch ends. The local proxy credential has no direct Server
  authority, and the Server-valid runner credential never reaches the Agent process.
  Full rationale + divergence table: `specs/haus-cli.md` §10.
- **W2 — Identity and skills go Raft-native (ruled 2026-07-21, post-WS2-prep).** (a) **SOUL is
  retired.** Adopted philosophy: identity accumulates in memory and other people's expectations,
  not in config — the agent **description** is the personality surface (it already rides every
  envelope per D6, is self-editable via `haus profile update`, and feeds `## Initial role`);
  the evolved role lives in MEMORY.md. `SOUL.md`, its prompt section, its injection mechanism,
  and its settings editor all retire at the flip; existing SOUL content folds into
  description/MEMORY.md at manual cutover. (b) **The Skills prompt section is dropped.** Skill
  discovery is harness-native (our engine drives Claude Code/Codex/Pi harnesses via AI SDK
  adapters; each Agent's local library materializes into its harness's own skill system) — listing
  it again in our prompt was redundant. There is no Server-owned skill assignment; the Agent's
  writable local library gates what the harness sees. `haus skill …` management verbs stay CLI
  family 9 (WS5); the
  save-as-a-skill habit teaching moves to WS8 seeded notes. Net: the composed prompt drops
  ~0.9k below Raft's own length.
- **I4 — Inbox visibility read-only; attention is agent-owned.** The agent detail panel gains a
  read-only inbox card (pending targets with counts, muted channels, followed threads;
  dev-mode: per-target cursors). No human-side mute/unfollow controls for agents — humans steer
  attention by asking in chat and own membership via existing channel management, Raft-pure.

## 1. System prompt: Raft as template

Adopt Raft's prompt structure and language near-verbatim, renamed to Haus. New sources stay in
the current files; the contract test gets a new `REQUIREMENTS` set + fresh snapshots reviewed as
one deliberate diff; `bun run eval:prompt` runs against a dev stack after the swap.

### Raft sections taken (verbatim modulo naming)

Identity + `## Who you are`; `## Current Runtime Context`; `## How these instructions apply`;
`## Communication — CLI ONLY` (Haus command families, including action cards and Manual);
Raft's credential-intent policy (minus the profile-resolution paragraph, until external agents);
CRITICAL RULES; `## Startup sequence`; `## Messaging` header contract;
`### Sending messages` + draft flow (`HAUSMSG` delimiter); `### Reminders`; `### Threads`;
`### Discovering people and channels`; `### Channel awareness`; `### Reading history`;
`### Capability and execution-surface selection`; `### Historical references`; `### Tasks` +
splitting (reconciled to D8); `## @Mentions`;
`## Communication style` + etiquette; Formatting sections; `## Workspace & Memory` + MEMORY.md +
compaction safety (now our entire memory story per D3); `## Capabilities`;
`## Message Notifications`; `## Initial role`.

### Raft sections not taken

| Section | Why |
| --- | --- |
| Profile credential resolution ladder | No per-agent credential profiles until external agents (WS6 era). |
| `### Third-party integrations` (Agent Login) | Plugins are Runtime-owned; revisit post-WS6. |
| `### Third-party app message safety` | No inbound third-party app events yet; adopt verbatim the day they exist. |
| PowerShell variant, `slock` aliasing, `## Runtime Profile Control` | N/A. |

### Haus sections added on top

Avatar generation (required by Haus's narrower `agent:create` action), Outputs & Visuals (the
landed rev3 skill pointer — `visual`/`artifact` fences ride send bodies,
taught by the seeded visuals skill; the widget catalog and `document` fence died pre-flip with
main a20acd0c); per-plugin CLI mentions; web-access lines. ~~SOUL~~ and ~~Skills listing~~ retired
by W2 — identity is description + memory; skill discovery is harness-native. Haus adds no
general security override or model-family steering.

### What dies

`NO_REPLY`; implicit final-reply delivery; outcome notes; the pushed `Your chats:` block; the
`## USER`/`## MEMORY`/`## Notes` injected sections; `## Memory` (Wiki) section; `## Automations`
section; `## Chat History` tool teaching; all prompt-taught tool catalogs.

## 2. Per-turn context (end-state)

| Surface | End-state |
| --- | --- |
| First session turn | Pending notice/attention when present; otherwise `Start.` (+ one fresh-session line after resets) |
| Trigger delivery | `New message received:` + envelopes + Raft's two-line trailer; unseen rows of the triggering chat ride along as additional envelopes |
| Envelope | `[target=… msg=… time=… type=…] @sender — <description>: …` (+ `[task #N status=… assignee=…]`, attachment suffix) |
| Mid-turn traffic | Content-free inbox notices, Raft row format (first/latest msg, sender, `· task/thread/dm/mention` tags) |
| Unread elsewhere | Per-target counts for chats no row of the frame represents, appended to every wake; `haus inbox check` for the rest (notice rows only when they change) |
| Identity/roster/description | Not pushed; `server info` / `channel info` pulls (D6) |
| Current time | Envelope timestamps only; home-timezone rule lives in the prompt |
| Freshness | Attested sends: bounded catch-up + revise / `--send-draft` / silent / `--anyway` paths. Drafts are held **server-side** — a decided divergence: shipped Raft parks drafts client-side (tmpdir, 10-min TTL, client-supplied cursors) on an API its own manifest calls interim |
| Visibility | Exact model-visible identities plus an optional verified contiguous boundary per I3; notices and wakes advance nothing |

## 3. Haus agent CLI

Per-Agent PATH wrapper injected by Haus Computer carrying Agent identity; talks through the
Computer's loopback proxy. One command per shell call; stdin bodies; canonical text out;
teach-at-point-of-use everywhere.

| Family | Verbs | Notes |
| --- | --- | --- |
| message | `check` `send` `read` `search` `resolve` `react` | send = attested, draft semantics; react ships with etiquette help text |
| inbox | `check` | target summaries, no drain; attention hints later |
| server / user | `info` | bounded facts, pagination |
| channel | `info` `members` `join` `leave` `mute` `unmute` (+ admin verbs later) | |
| thread | `unfollow` | WS3 |
| task | `list` `create` `claim` `unclaim` `update` | D8 model; board/priority/labels are app lenses |
| attachment | `upload` `view` | |
| profile | `show` `update` | self-edited descriptions |
| reminder | `schedule` `list` `snooze` `update` `cancel` `log` | Server-owned schedules; `--script` is opaque Computer execution data |
| skill | `list` `view` `create` `patch` `write-file` | replaces `skills_*` tools |

Not copied: `agent login`/`bridge` (external agents, WS6 era), `mention pending/notify/add`
(multi-human flows), `manual`, `integration`, `action`.

## 5. UX/UI alignment

Evidence: live recon of app.raft.build ([raft-ux-notes.md](raft-ux-notes.md), captured in the
operator's arcade server 2026-07-21) against our current frontend
([haus-ui-baseline.md](haus-ui-baseline.md)).

### Adopted as spec detail (no decision needed; lands in the owning workstream)

- **Composer**: "As Task" checkbox with `⌘⇧↵` send-as-task (WS5); draft pencil indicator on the
  sidebar row while text is unsent; attach buttons unchanged.
- **Message hover cluster**: Reply in thread / Add Reaction / Save Message; right-click menu
  with 6-emoji quick-react strip, Copy Link, Copy Markdown, Open Thread, Unfollow Thread,
  Convert to Task (WS3/WS5).
- **Reply-count pill** on anchors with inline unread qualifier ("2 replies · 1 new") (WS3).
- **Task chip** on origin message: status-colored icon + `#N @assignee`; clicking the chip opens
  the 5-status dropdown inline; creation receipts differ by path ("1 new task created: …" vs
  "[Actor] converted a message to task #N …") (WS5).
- **Task board/list toggle**: 5 status columns/groups (status-colored pills), Creator/Assignee/
  Channel filter popovers with "me"-shortcuts, task title = origin message body verbatim (WS5).
- **Presence signals** (WS2/I1, confirms our split): conditional bottom-of-rail activity strip
  (renders only mid-turn: avatar + dot + live state text "Starting… / Message received /
  Claiming tasks… / Editing file…"), the same state text in the DM/channel header, dot color
  green→amber during work. Notably Raft shows **no in-chat typing bubble at all** — our
  composition stream is a deliberate enhancement beyond observed parity.
- **Attention affordances**: per-channel mute bell in the header; "Stop all agents in this
  channel" header button; pinned section as a drag target; Saved bookmarks view (WS4/WS5).
- **Activity inbox**: All / Unread / Mentions segmented filter; "Channels, DMs, and followed
  threads stay here until they are done" model (WS4).
- **Search**: full-page view, From/Scope/Time/sort filters, thread-grouped results with hit
  counts and highlighted snippets (post-WS4 polish).
- **System receipts**: quiet centered muted lines with timestamp + icon (task creation,
  conversions); date dividers standard.
- Copy-bug to avoid: Raft reuses "SELECT A CHANNEL" placeholder on non-channel list+detail
  pages.

### UX decisions (walked and resolved 2026-07-21 unless noted)

- **U1 — Shell reorganization** (confirmed): rail becomes Search, Chat, Activity (inbox),
  Tasks (global), **Reminders** (global cross-agent index of scheduled work per D4, script
  watchdogs included), **Members** (humans + agents directory — the agent panel's home),
  Settings; Computers joins post-WS6 (runtime page stays in Settings until then). Wiki rail tab
  retires with D3b; the automations tab is renamed and re-pointed, not dropped.
- **U2 — Agent panel**: replace the drawer/settings split with Raft's list+detail Members page
  and 6-tab agent profile: **Profile** (identity, description, role, computer link, runtime
  config pills, env vars, created-agents, skills), **Activity** (raw timestamped diagnostics
  log incl. shell commands, file edits, task transitions, errors; "Copy Diagnostic Info"),
  **Chat** (channels + agent-to-agent DM activity), **Reminders** (read-only; "just tell your
  agent"), **Workspace** (real file tree + Raw/Preview viewer), **Apps** (per-agent
  connections). Confirmed, with: per-agent settings (model, env, web access, session reset)
  fold INTO the Profile tab as editable fields; and from chat the profile renders in the **side
  pane** (same right-pane system as threads/artifacts, one-at-a-time, resizable) — never a
  drawer. The Members rail page is the full list+detail home of the same 6-tab component;
  clicking an agent name anywhere opens it. Persistent header actions: Message / Stop /
  Restart.
- **U3 — Per-conversation tabs** (confirmed): every channel AND DM gets Chat | Tasks | Files
  tabs. Composition principle: there is ONE task query surface and ONE board/list component
  family — the global rail view is the unscoped instance; a conversation's Tasks tab is the
  same component with the conversation filter pinned. No parallel APIs/hooks/UI.
- **U4 — DM tasks in aggregates** (confirmed, resolved by U3's composition principle): the
  global view is the unfiltered query, so DM-anchored tasks appear automatically — Raft's
  silent exclusion (verified live) is impossible by construction. Post-WS6, per-viewer
  visibility scoping trims the same query.
- **U5 — Thread presentation** (confirmed): threads open in a right side pane — which
  desktop-width re-verification showed is Raft's actual design too (the recon's
  "replaces-the-pane" observation was an 800px responsive fallback; see the corrections
  section of raft-ux-notes.md). So T3 is parity, not divergence. Adopt with it: the anchor
  message highlights in the channel while its thread pane is open; "View in channel"
  jump-with-highlight; and Raft's responsive model — at narrow widths the pane collapses to a
  full-pane takeover with a back-chevron. Detail also confirmed at width: avatar-click opens
  the agent profile pane, name-click inserts an @mention (adopted).


**Backlog (observations, not workstreams):** stall-state presence (orange-dot "stalled"
distinct from "working", per Raft's runtime_stalled taxonomy — WS4-era); session-age
economics (track cost/turn vs session age post-flip before touching compaction cadence);
Computer upgrades stay operator-TRIGGERED (Raft: an update button in the app fires the
server-staged upgrade — not automatic); the Computer reports checking, available, installing,
restarting, complete, and failed states. Our existing update surface (Settings → Updates /
sidebar update item) becomes the implementation parts shelf and, on update, regenerates per-Agent CLI
wrappers so agents pick up the new `haus` in their next turn shell — today CLI and runtime
are one binary, so wrapper regeneration IS the CLI update; revisit if an npm-shaped external
CLI ships with WS6. Heartbeat: skipped by ruling — future path is a server-side recurring
wake gated on `delivered > seen`.

## Existing specs impacted

Rewritten or retired by this program (each within the workstream that lands the change; until
then they describe the pre-Raft system): `specs/tasks.md` (superseded by D8), `specs/cron.md`
(D4), `specs/memories.md` + memory specs (D3), Wiki specs (D3b), `specs/steering.md` (I2 —
notices replace body pushes), `specs/sessions.md` (I1/I3 — floating turns, exact visibility ledger;
global-session core survives), the retired Runtime CLI and skill specs, ADR 0011 (amended by I1),
prompt contract + snapshots (WS2). New ADRs accompany each landing per `docs/adr/` convention.

## 4. Workstreams

Every issue inherits the program principles (no migration code; manual cutover checklist;
operator approval on destructive steps).

**Sequencing.** Everything before WS2 is additive; WS2 is the flip (CLI-only, zero tools,
floating turns) after which the old reply/tool path is gone. Three phases:
1. **Additive substrate**, parallel: WS1 (CLI + the shared wire contract: D2 names/handles,
   envelope/target grammar — spec written first, everything consumes it), WS3 (threads), WS9
   (shell reorg + composition-bubble UI shell).
2. **The flip**, one coordinated landing window with a single manual-cutover checklist:
   WS2 + WS4 + WS7 — the new turn model IS the inbox delivery model, and the prompt must stop
   referencing memory/wiki/cron the same day they're deleted.
3. **Post-flip**, parallel: WS5 (tasks/reminders/affordances), WS8 (onboarding + seeded
   knowledge); then WS6 as its own program once the CLI-mediated model is proven locally.

Specs are written just-in-time per workstream, except the WS1 wire-contract spec and the WS2
contract-test REQUIREMENTS plan, which are shared interfaces and get drafted first.

**Flip gap (ruled 2026-07-21):** CLI families 5–9 — including reminders — stay prompt-gated
until WS5, while the flip's WS7 half deletes the cron product. The window between flip and WS5
therefore has NO agent scheduling primitive, and the automations→reminders cutover conversion
happens at WS5, not at the flip. Accepted deliberately: the entire program lands before
deployment, so intermediate brokenness is not a constraint.

- **WS1 — Agent-facing `haus` CLI v1.** Wrapper injection, agent-scoped tokens, message
  family + `server info` + draft/attested-send semantics, output/error contract. Wire contract
  = the server API. Shippable while tools still exist.
- **WS2 — System prompt + turn rewrite.** Raft template per §1, turn shapes per §2, unique
  name/handle layer (D2), zero-tool cutover (D5), kill `NO_REPLY`/outcome notes/evaluation
  dispatch, floating turns + per-turn response-row removal (I1), typing-from-in-flight-send
  streaming UX, agent status dot + sidebar activity strip, new contract REQUIREMENTS +
  snapshots + 28k budget, `eval:prompt`. Depends on WS1.
- **WS3 — Threads.** Child-container thread model per T1 (own seq domain, anchor + parent
  pointers, follows per participant), immutability posture per T2, side-panel UI + badges +
  rail rollup per T3, `thread unfollow`, auto-follow semantics, inline-reply retirement.
  Unblocks full target grammar and D8's work surfaces.
- **WS4 — Agent inbox.** Delivery planner + attention rules per I1 (Channel mute bypass and Thread
  follow restoration), content-free notice pipeline with tool-boundary flush gating per I2, exact
  visibility ledger per I3 (exact identities plus a verified contiguous boundary, wake-advances-nothing contract
  test), `inbox check` + `message check` — **replacing WS1's honest stubs** (haus-cli.md §7
  marks them; their outputs teach that cursor semantics arrive with WS4) — read-only inbox card
  on agent detail per I4; retire pushed "Unread elsewhere" (restored as Raft's per-wake count
  digest by ADR 0033). Security note riding the program:
  PRD-105 (cross-agent FS isolation; token custody is contract-level until it lands) is a named
  WS6 blocker.
- **WS5 — Tasks + reminders + affordances.** D8 tasks (with board view, priorities, labels),
  D4 reminders (+ script payloads; Automations page → Reminders view), reactions, profile
  self-editing. **UI ports, not rewrites** (operator ruling): the polished pre-flip surfaces
  are the parts shelf — tasks board/list/calendar/label/priority components repoint onto
  task-messages; the automations page anatomy (filter sidebar, status rows, run-history
  drawers ≈ `reminder log`, editor panes) is retired rather than ported. Agent profiles own
  reminder visibility. Port source = the last pre-flip main sha (pin it in the WS5 kickoff when
  the flip merges).
- **WS6 — haus.chat server split.** Move the chat surface to the single-node Mac mini Server,
  local PostgreSQL, and local attachment filesystem behind Cloudflare Tunnel (with asynchronous
  off-machine backup and a tested restore procedure); use fresh-schema Drizzle bootstrap; extract Haus
  Computer as the machine service (inline-authorized setup, wake delivery,
  lifecycle); Clerk human authentication; Haus Owner/Admin/Member roles and Server-owned,
  email-bound, seven-day, single-use invites that always create Members; confirmed human removal
  immediately revokes access while preserving former-member history, leaves Server-owned
  Agents/Computers intact, and never restores prior roles/private memberships on re-invite; action
  cards and third-party events remain later work. External Agents, direct Agent login, hosted
  Agent credential profiles, and an external wake bridge are explicit non-goals. Existing seams:
  `@haus/api` chat/admin split,
  `haus claim`, Clerk member forwarding, `docs/api/auth.md` member model. **Data cutover:
  haus.chat starts completely fresh — existing local chat history and Agent workspaces are
  discarded, not migrated or adopted (decided).**
  **Integration credentials stay on Haus Server** (D9): MCP is a hosted service and Computer
  receives only safe schemas plus scoped invocation. Agent deletion requires a Haus App confirmation,
  immediately retires Server membership/assignments/reminders/task claims while preserving
  tombstoned authored history, and queues Computer-local workspace cleanup without waiting for an
  offline Computer; deletion has no restore path. Each Agent's creation-time Computer assignment is
  immutable: offline Agents resume only when that same Computer reconnects, and a Computer cannot
  be removed until every assigned Agent is explicitly deleted. There is no Agent migration,
  adoption, reassignment, or unhosted-Agent recovery state. Stopping Haus Computer preserves
  attachments and workspaces; Haus App may remove a confirmed, Agent-free Computer even while it is
  offline, without waiting for impossible local cleanup. There is no detach/forget/reclaim flow.
  Agent workspaces, skills, queues, sessions, and effective state are isolated to one Computer
  attachment. MCP connections and grants are Server-owned and available to that Server's Agents
  regardless of which Computer executes them.
  `haus-computer setup /server` is additive and idempotent: it starts a new Server attachment daemon
  without disturbing current attachments, or validates and starts that Server's existing valid
  attachment. A manual `stop` persists across reboot until an explicit `start`; absent that pause,
  the service starts automatically at boot. Replacing a Computer means creating a new Computer and
  new Agents; the replacement may be brought online before the old Agents and Computer are deleted.
  Server deletion is an Owner-only permanent cascade with Raft's strict danger-zone modal: list the
  destroyed data, require the exact immutable slug (with `/` rendered as a fixed prefix), keep the
  destructive button disabled until an exact match, and recheck both slug and Owner authority on the
  Server. Hosted deletion does not wait for offline Computers and cannot guarantee erasure from a
  lost machine.
- **WS7 — Memory/Wiki/Automations retirement.** Delete extraction/dreaming/core-memory
  injection, Wiki, cron product + `cron_*`/`wiki_*`/memory surfaces (D3/D3b/D4); manual cutover
  seeds existing core memory into agent workspaces. Coordinated cut, likely folded into WS2's
  landing window.
- **WS-MCP — MCP servers, per-agent grants, plugin retirement** (supersedes the former
  "WS5.5 — Plugin CLIs"; see ADR 0017). The plugin concept is retired. Agents reach outside
  services through **MCP servers** the operator configures with explicit Server-owned per-Agent
  grants; the surviving non-MCP capabilities are **host tools** (Browser)
  and **model capabilities** (image generation, already codex-native). No `haus integration`
  CLI family — ever (evidence M1). Scope:
  - **Server relay/broker.** Agents call granted remote MCP servers through Haus Server,
    authenticated by scoped runner credentials. Server holds upstream credentials, terminates MCP
    and auth, authorizes every call against `(Server, Agent, connection)`, and never logs secrets.
    Computer receives only safe schemas. Local and stdio MCP are not supported.
  - **Per-server auth is per-integration, not universal** (evidence M3): personal external
    accounts (e.g. Google Calendar) → operator completes OAuth once, relay holds the session;
    first-party services (MerchBase) → relay presents a Haus-issued badge the agent cannot
    mint. No Clerk M2M machine-per-agent, no static shared secret trusted by localhost alone.
  - **First-party service code leaves Haus.** MerchBase logic moves to an MCP server in
    `merchbase-core`; the Haus-side MerchBase and Google plugin code is deleted. Google is a
    **configuration example**, not a shipped feature — proving an operator can add it with zero
    first-party code is the acceptance test for the whole system.
  - **UI ports, not rewrites** (operator ruling, same as WS5): lift the polished plugin
    settings cards/dialogs/forms (`apps/website/src/features/settings/plugins/`) onto the
    existing MCP data layer (`apps/website/src/features/settings/mcp/`), then delete
    `settings/plugins/`. Keep `agent-engine/mcp-servers.ts` + `mcp-routes.ts` as the substrate.
  - **Delete:** the retired standalone plugin host/manifest/settings framework and server
    `api/plugin/**`, rehoming Browser's health/grant wiring onto the MCP-grants surface.
  - **Build on Haus Server.** Integrations are a Server feature and secrets never enter Computer.
  - The `## MCP` prompt section composes only for agents with at least one granted server.
- **Release blockers (flip → mini):** the flip may not ride a release to the mini without
  **WS5** (✅ landed — task surface ported from pre-flip components) and **WS-MCP** (MerchBase
  readouts are live daily usage on the mini; blocker is satisfied when Blippy reaches MerchBase
  via its MCP server and the Google-as-configured-server path is proven). Also riding that
  release: mini cutover (Blippy/Tiny tokens, operator handle, retired-skill-id SQLite edit —
  strip `visuals-charts`, `visuals-diagrams`, `page-design`, and `tasks` from agent
  `enabledSkillIds` and delete their stale seeded skill directories,
  PRD-89 mini verification). **External MCP-client exposure** (letting Claude.ai/ChatGPT reach
  first-party services as an OAuth resource server) is explicitly **deferred** — not required to
  validate the local relay, and additive later with no rework.
- **WS9 — Shell + agent panel reorganization.** U1 rail taxonomy, U2 Members page + 6-tab agent
  profile (absorbs the agent drawer and per-agent settings), per-conversation Chat|Tasks|Files
  tabs (U3), Activity inbox page (with WS4), Search page. Largely parallel to WS3–WS5; shares
  the same design language pass.
- **WS8 — Onboarding Agent + seeded knowledge.** Cove's root `MEMORY.md`, three onboarding files
  under `notes/`, and 12 applicable seeded summaries are adapted from Cindy; the shared Manual
  holds 32 captured Raft recipe cards after omitting `login-with-raft`. Product references such as
  `agent` and `action-cards` stay outside the recipe corpus. The 7 archetype cards remain optional
  guidance for team-shape discussions. Cindy's local factory files are the reference.
