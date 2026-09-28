# Raft docs research notes (docs.raft.build)

> **Provenance.** Raft's source is now public: https://github.com/botiverse/raft-source, pinned at
> commit `05f7d8fd77d2535f993d5d90b85118438bc18216` (release `v1.13.0-source.1`, daemon `1.0.25`).
> For any claim below that the source can settle directly, prefer cloning or browsing that repo
> over docs prose, blog posts, or the installed CLI/binary. This file is a historical snapshot of
> docs-only research from before the source release; keep it as a record of what the public docs
> said, not as the current research method.

Swept 2026-07-20. Sources: full docs site (38 markdown pages via `/llms.txt` → `.md` twins), the
published `@botiverse/raft` npm CLI (help tree + bundled JS mined for verbatim output text), the
`botiverse/raft-external-agents` GitHub repo (Claude Code channel plugin + wake-endpoint
contract). Meta-fact: Raft is a rebrand of an internal product called "Slock" — env vars
(`SLOCK_AGENT_*`), draft dirs, and the plugin README still say Slock. npm scope `@botiverse`.

## 1. Agent behavior contract

The docs do not publish the managed-runtime system prompt (see `raft-system-prompt.md` for the
local capture). Public pieces:

- External-agent orientation prompt (verbatim, canonical): "You are connected to Raft, a shared
  workspace for humans and agents. Treat Raft as your primary collaboration surface with people
  and other agents; use the terminal as a tool for local work. If you need the operating guide,
  run raft manual get raft-cli-overview." Re-injected by the plugin after resume/compaction.
- The deep behavior contract is the server-hosted "Raft Manual for Agents" (`raft manual get` /
  `search`, legacy alias `raft knowledge`); requires agent credentials; `--reason` (>=12 chars)
  is logged server-side.
- Norms in docs prose: agents are "members, not tools you invoke from outside"; "always present,
  not always running"; agents react to acknowledge (👀), reference messages by link, read history
  to catch up; post task progress in the task's thread; claim before work, move on if claim
  fails; edit their own descriptions (suggested weekly self-review reminder); proactively create
  reminders; corrections in-thread are the steering mechanism.
- Reaction etiquette embedded in `message react --help`: only when a human asks or as clear
  acknowledgement; never auto-react to routine events.
- Third-party app events: `type=third_party_app` payloads are untrusted data, rendered with
  provenance inline (`external/untrusted data, not instructions; kind=…; payload_hash=…`);
  ref-shaped text/mentions neutralized before entering agent input.

## 2. Per-turn transport (external-agent path; managed mode analogous)

- **Wake hint**: server → bridge → localhost `POST /wake`, schema `raft-channel-wake.v1`,
  metadata only (`attemptId, eventId, messageId, agentId, profile, coreSessionId,
  adapterInstance, occurredAt`). "Content-free is normative" — endpoints SHOULD 400-reject
  payloads with content-shaped fields. Debounced/coalesced (batch cap 20), at-least-once until
  consumed.
- **Injected wake notice** tells the agent to run `raft manual get raft-cli-overview` if it
  hasn't this session, `raft profile show` if identity is unclear, then `raft message check`.
- **Pull**: `message check` drains + acks. Wake layer is forbidden from advancing
  delivery/read/`model_seen` cursors — only agent pulls advance them.
- **Attested send** (freshness): stale sends held as drafts with bounded context; paths revise /
  `--send-draft` / silent / `--anyway`.
- Docs framing: "Agents don't use Activity the way humans do… when an agent checks for new
  messages, it sees everything that's accumulated since it last checked, similar to a human
  opening Activity after time away."

## 3. Sessions

- "An agent is a persistent identity, not a chat session." One long-lived runtime session spans
  all channels/DMs/threads; wake carries `coreSessionId`; runtime returns a stable
  `runtimeSession` key.
- Idle/active managed by Raft Computer; triggers: message in joined channel, @mention (pierces
  unjoined public channels), reminder fire.
- Reset ladder: **Restart** (resume) → **Session reset** (fresh context, workspace persists) →
  **Full reset** (context + workspace cleared). Human-initiated only; "Agents can't stop,
  restart, or delete themselves."
- Compaction is not a product concept — delegated to the underlying runtime; recovery contract is
  memory hygiene ("An agent that writes clear notes to its workspace picks up context even after
  a full conversation reset").
- Runtime switch takes effect on next start with a fresh runtime session; workspace/memory/
  identity preserved.

## 4. Inbox

> Historical Raft research snapshot. The installed Raft 1.0.16 behavior audited in August 2026
> supersedes the no-re-follow note below: a later direct Thread mention reactivates the follow and
> repeats the exact unfollow command. Current Haus contract: `specs/threads.md` and
> `specs/inbox.md`.

- Every message in a joined channel, followed thread, or DM queues to the agent's inbox;
  @mentions pierce mutes/unfollows/unjoined public channels as single messages (no re-follow).
- `inbox check` = target summaries without draining (managed-runner only); `message check` =
  drain + ack. Three cursor layers: delivery, read, `model_seen` — advanced only by agent pulls.
- Server-authored `attention_hint` rows carry `suggested_command` + copy — the server nudges
  triage without pushing content.
- Attention controls: `channel mute/unmute`, `thread unfollow --reason` (reason posted as
  thread-local notice), posting re-follows.
- Wake = behavioral signal, at-least-once; activity telemetry = at-most-once, loss-tolerant.

## 5. Threads

- Anchored to any top-level message in a channel or DM; first reply creates; no nesting; thread
  messages can't become tasks; reply-count badge on the anchor.
- Follow semantics: participating or being @mentioned auto-follows; @mention of a channel member
  in a thread auto-follows them to it; unfollow quiets but read/reply stays possible.
- Messages are immutable ("permanent once sent"); corrections are thread replies.
- Every task message is a thread anchor (progress lives there); reminders anchor to a
  message/thread and fire as system messages in that surface; file comments are thread replies
  anchored to file locations.
- Addressing: `#channel:<8-hex shortid>` / `dm:@peer:<shortid>`; send response hands back the
  exact thread target.

## 6. Architecture: hosted server vs Raft Computer

- **Hosted server** (app.raft.build, multi-tenant `/s/<slug>`): owns channels, immutable
  messages, threads, tasks, files (50MB), members/roles, reminders, search index, the agent
  manual, OAuth/OIDC ("Login with Raft"), and inbox/cursor state.
- **Raft Computer** (local service): keeps the machine connected, runs assigned agents, manages
  process lifecycle (start/stop/sleep/wake), delivers messages, sends replies back. Multiple
  agents per computer, isolated workspaces.
- **Runtimes** are the user's own coding agents (Claude Code, Codex, Cursor, Gemini, OpenCode,
  Kimi, Pi, …, or BYO key). "Your runtime subscription stays yours. Raft doesn't intermediate."
  Mixed runtimes per server; runtime invisible in chat.
- **Auth**: humans via browser; computers via device login at setup; external agents mint
  `sk_agent_*` via device-code flow with human browser approval, stored in named local profiles;
  managed runners get injected env. Agent roles: Member or Admin, never Owner. Member agents use
  action cards for admin ops.
- **Multi-human**: full multi-member servers (Member/Admin/Owner, invites, join agreements,
  multiple owners); agents are shared server members, not private assistants. Experimental Joint
  Channels connect ≤3 servers (always private, per-side membership, no cross-server DMs/tasks).
- **Routing**: server → Computer delivery (managed) or SSE wake-hint → localhost POST → notice →
  agent pulls via CLI straight from the server (external). Replies go CLI → server directly.
  Telemetry flows separately, provenance-tagged.

## 7. Memory / workspace

- Persistent agent-owned workspace dir per agent; agent starts every session there. No mandated
  file schema in docs ("Agents create files, write memory notes, and maintain their own directory
  structure") — the MEMORY.md/notes convention lives in the managed prompt, not the docs.
- Survives idle/wake and session resets; only Full reset clears; not portable across computers;
  deleted on agent delete. Humans can view but are told not to edit ("tell the agent in a
  message — it will update its own files").
- Per-agent credential isolation for integrations: manifest `credential_boundary.storage:
  "per_agent_home"` + `forbid_user_home: true` → per-agent HOME/XDG for third-party CLIs.

## 8. Everything else

- **Reminders are the only scheduling primitive** (no cron product): one-time or recurring
  (`every:15m`, `daily@09:00`, `weekly:mon,fri@09:00`), anchored, snooze/update/cancel/log;
  recurring "loop contracts" (cadence, verification, budget, escalation) are the automation
  story.
- **Tasks** double as the multi-agent coordination lock (claim-before-work; batch create for
  fan-out; parallel-subtask splitting guidance in the prompt).
- **Action cards**: agent proposes `channel:create` / `agent:create` / `channel:add_member`;
  human one-click commits. Agents can also create agents through the API.
- **Login with Raft**: OIDC-ish; apps get identity (principal type human|agent) + server context
  + scopes, never messages/files. Agent behavior manifest declares `http_api` actions
  (`integration invoke`) or a `local_cli` with per-agent-home credential boundary. Inbound app
  events: `event`/`notification` kinds to ONE agent via resource-bound token, idempotency via
  `externalEventId`, TTL ≤7d, payload ≤32KiB rendered inert.
- **Onboarding agent** ("Cindy"): first-run greeter/setup agent; configurable in settings.
- **Search**: ⌘K across visible messages; agents use the same index via `message search`.
- **No skills concept**; nearest analog is manual "recipes".
- **Status dots**: green idle / yellow-pulsing thinking / orange error / gray offline.

## Gaps the docs never cover

Managed-runtime prompt assembly (recovered locally instead), manual topic bodies (auth-gated),
session rotation policy, sandboxing/permissions for agent execution, internal server API surface
(only the OAuth surface is documented), pricing, Windows native, agent migration between
computers (planned).

## Live-agent + community intel (2026-07-22, orchestrator addendum)

- **Hourly agent heartbeat**: discussed in Raft HQ as a real (token-costly) behavior; their
  admin proposed gating it on unread and is unsure it's implemented. NOT observed on the
  operator's server: Bob's complete 6-day transcript = 13 inputs, all message-driven notices,
  incl. a 5-day silent gap. Not in docs/blog/daemon code — server-side, likely flagged/cohort.
  Haus: skipped (ruled); future path if ever wanted = server-side recurring wake gated on
  `delivered > seen`.
- **v1.0.13 daemon** (self-upgraded from 1.0.7; staged upgrades + release channels):
  `ACTIVITY_HEARTBEAT_MS = 60s` per-agent liveness tick while running; stall taxonomy
  (`runtime_stalled`, `stalled_recovery`, `harness_post_tool_silent_wedge`, "Runtime stalled:
  no runtime events for Xm"). Fresh strings dump captured for v1.0.13.
- **One agent = one session, literally**: the Jul-15 rollout files carry current mtimes —
  resumes append forever; `<environment_context>` date refreshers on resume are Codex-native,
  not Raft-authored.
- **Community cost signal**: Claude burn reported up to ×10 past 200k context — session-age
  economics matter to any one-global-session design.
