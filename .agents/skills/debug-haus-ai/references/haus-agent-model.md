# Haus Agent Model

This is a bootstrap, not a substitute for current repository docs and source. If it disagrees with
them, investigate the discrepancy and update the stale material.

## Product Nouns And Ownership

- **Chat**: durable conversation and routing surface. Channels, DMs, and Threads are Chats.
- **Agent session**: one Agent's continuous global execution context across every Chat it joins.
- **Turn**: one execution inside that global session.
- **Haus Server**: canonical Chats, messages, participants, pending delivery, cursors,
  reads, events, and Agent-presence routing.
- **Computer**: execution-runtime discovery, Agent session processes, local inbox projection,
  delivery notices, and the prompt/input surface.
- **Execution trace**: evidence about a turn, not the canonical product conversation.

Haus inherits Raft's session model. A Chat is never an Agent session boundary. Per-Chat sessions
would erase continuity and violate the current architecture.

## Core Invariants

1. One Agent has one persistent session and runs at most one turn at a time across all Chats.
2. A pulled envelope carries its exact target, message identity, timestamp, sender, and body.
3. When an Agent chooses to handle a notice, the turn must ground itself in those pulled envelopes
   even though prior cross-Chat state remains in session context.
4. Content-free notices are wake signals, not user requests and not message bodies.
5. An identity already made model-visible by delivery or an explicit read must not re-enter later as
   stale current work.
6. Delivery, model visibility, and freshness are distinct states. The seen ledger is the authority
   for what has reached the model; transport delivery alone is insufficient.
7. A pull may batch pending targets, but each target stays independently addressable.
8. Agents speak through the Haus CLI. A floating execution turn anchors to the Agent
   session, not an arbitrary Chat.
9. Canonical Chat history remains in Haus Server and is recoverable through read/search/check tools.
   Session continuity does not require replaying every Chat transcript on each turn.
10. Sends resolve Server-owned Agent routing and the assigned Computer. Frontends do not invent
    Computer, session, or execution-runtime routing ids.

## Read These First

Run `bun run docs:list`. For delivery, context, inbox, or session bugs, read this core set:

- `CONTEXT.md`
- `docs/agents/domain.md`
- `docs/adr/0011-agents-own-one-global-session.md`
- `specs/sessions.md`
- `specs/inbox.md`
- `docs/internals/agent-daemon-delivery.md`
- `docs/internals/architecture-overview.md`
- `docs/api/agents.md`
- `docs/api/realtime.md`
- `docs/features/chat.md`
- `docs/features/context-management.md`
- `docs/operations/development.md`
- `docs/operations/testing.md`

Then use `read_when` hints and the epic index to select only the workstream notes, prompts, evals,
recipes, or superseded ADRs implicated by the symptom. Read superseded ADRs only to understand
history; do not restore their old contract.

## High-Value Test Oracles

### Cross-Chat grounding

The Agent performs a task in Chat A. The same Agent then receives a simple greeting or unrelated
question in DM B. Its global session still contains A, but the new concrete envelope names B and is
presented exactly once as the current request. A deterministic test proves input structure and
ordering; a separate behavioral eval may prove the turn acts on B rather than volunteering A's task
status.

### Busy wake followed by deferred pull

While the Agent is busy, pending messages generate only content-free notices at a safe tool
boundary. If the turn ends first, the notice stays durable and starts the next turn. Idle wakes are
notice-only too: canonical bodies remain Computer-local until the Agent pulls them. A notice
advances no cursor and cannot become a phantom request. Record the resumed Harness inputs too:
cleaning a persisted notice is insufficient if the live runtime already accepted it.

### Multi-target batch

Messages pending in Chats A and B are pulled together. Each retains its own target and identity;
reading or responding to one cannot consume, redirect, or mark visible the other.

## Common False Fixes

- Replacing the global session with per-Chat sessions.
- Clearing session history whenever the target changes.
- Treating a wake notice as evidence that no concrete work exists.
- Replaying complete per-Chat histories to compensate for an inbox accounting bug.
- Merging or routing participants by display label.
- Teaching the prompt around malformed or duplicated delivery rather than repairing delivery.
- Using a spy-call assertion when a real temp database or focused state-machine test can prove the
  ledger behavior.
