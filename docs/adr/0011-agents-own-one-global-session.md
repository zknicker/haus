---
summary: Decision to give every agent one persistent global harness session spanning all its chats, superseding per-seat session ownership.
read_when:
  - changing agent session ownership, rotation, reset, or model switching
  - changing how agent turns are scheduled across chats
  - changing the seen-ledger, catch-up, or action-gating contracts
  - reading the history behind ADR 0007
---

# ADR 0011: Agents Own One Global Session

## Status

Accepted. Supersedes the session-ownership decision of
[ADR 0007](0007-chat-participants-own-agent-sessions.md); that ADR's
chat/participant/turn-evidence contracts remain in force.

Amended by [ADR 0026](0026-automation-provenance-rides-the-agents-message.md): a
rotation no longer lands a Server-authored receipt in the Agent's DMs. It is a
durable rotation record plus a `session_generation` stamp on the Agent's
messages ([specs/sessions.md](../../specs/sessions.md#generation-in-the-transcript)).
Everything else below stands.

## Context

ADR 0007 made the agent's chat participant row (the Agent seat) the owner of
the current harness session: one agent in three chats had three independent
model contexts, rotated daily. That bought strong chat isolation and per-chat
concurrency, at the cost of the product thesis — an agent that cannot
remember a DM while answering in a channel is a disposable assistant, not a
teammate.

Raft ships the alternative at production quality and we verified its
mechanics against the installed runtime: one persistent harness session per
agent across every channel, DM, thread, and task; a per-target model-seen
ledger between canonical history and model context; no scheduler beyond the
inbox itself; no scheduled rotation; human-only resets. Haus already
landed the delivery groundwork (busy delivery, freshness gate,
default-evaluate addressing).

Haus is a single-operator product today with small trusted teams as the
likely multi-human future.

## Decision

**One agent owns one persistent harness session spanning all its chats.**

- The Agent seat remains the durable routing identity for membership,
  addressing, authorship, and evidence. It no longer owns a session.
- **No trust domains.** The agent is an entity: what it learns anywhere is
  its own knowledge, available wherever it speaks. Confidentiality is taught
  discretion (prompt rules, memory notes), not architecture. Hard isolation,
  when genuinely required, is a separate agent — the boundary that already
  isolates everything. Product norm for multi-human spaces: do not tell an
  agent what you would not tell everyone who can talk to it.
- **Full serialization.** One turn at a time per agent, across all chats.
  Mid-turn traffic reaches the live turn through busy delivery; dedicated
  turns queue. Parallelism is achieved with more agents, not forked context.
- **Offer once per pending set.** Ordinary pending traffic starts or steers a
  turn with a content-free notice. Unpulled rows remain queryable but do not
  immediately start another turn for the unchanged set. A new identity, Human
  Start/Restart, or session reset offers the pending set again.
- **Seen ledger + action gating.** Runtime keeps a durable per-(session,
  chat) record of what has provably been model-visible. Outbound actions
  against a stale chat are held with the unseen rows embedded
  (specs/steering.md's freshness gate, generalized).
- **No age- or idle-based rotation.** Sessions live until a manual reset,
  an Agent runtime/model switch, or automatic recovery from unusable executor
  resume state. A switch or recovery starts a fresh session while workspace,
  memory, identity, and skills persist. Engine-native compaction plus Memory
  carry long-horizon continuity.
- **Managed instruction drift refreshes in place.** Computer fingerprints both the composed
  instructions and adapter bootstrap. The Harness supplies current instructions on every turn;
  bootstrap drift additionally parks and updates the adapter at the next turn boundary. Recognized
  prior Cove factory guidance is reconciled before the turn with a one-turn re-read notice. Durable
  Agent activity exposes the outcome; failure preserves the stale receipt and generation for retry.
  Only a rejected native resume state uses Server-authorized recovery.
- **Resume recovery is automatic and explicit.** When an executor reports
  that its stored runtime session is missing or replay is rejected, Runtime
  rotates the Agent session generation and cold-starts once. Activity and the
  fresh context state that earlier runtime context was not restored and direct
  recovery from Haus history plus `MEMORY.md`/notes. Only a failed cold start
  leaves the Agent offline with an error.
- **Reset is a human-initiated, agent-scoped contract** living in agent
  settings: restart (recreate the executor, resume the current native
  conversation, and apply current instructions once on its next delivery),
  session reset (fresh context; workspace, `MEMORY.md`, and skills persist),
  and full reset (fresh context plus a wiped workspace, including
  `MEMORY.md`, canonical Agent skills, and runtime-local state). Full reset
  keeps the Agent's
  Server identity, memberships, authored history, Computer assignment,
  runtime/model configuration, and MCP grants. The chat drawer shows session
  status read-only.
- **Stop is persistent lifecycle state.** It interrupts the live turn and
  prevents messages or reminders from waking the Agent until a human starts it
  again. Pending inbox work remains durable. Start resumes the current session
  and drains that work.
- **Model selection is agent-scoped.** Per-chat model overrides are removed.

## Consequences

- specs/sessions.md is the normative session contract; ADR 0007's session
  shape is historical.
- An agent busy with a long task is genuinely busy everywhere — that is the
  intended presence model, with stop and busy delivery as the interrupts.
- Greenfield cutover: existing per-seat sessions become inert history; every
  agent starts one fresh global session. No migration machinery.
- Chain-guard budgets and turn-outcome semantics move from per-seat to
  per-agent accounting.
- Prompt teaching gains cross-chat awareness and DM-discretion rules; the
  prompt contract suite tracks them.
- The privacy caveat is documented, not engineered: models resist deliberate
  extraction less reliably than humans.
