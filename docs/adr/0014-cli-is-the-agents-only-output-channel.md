---
summary: Decision to make the haus CLI the agent's only output channel, with floating turns and inbox delivery replacing reply-based dispatch.
read_when: changing agent turn scheduling, delivery, cursors, notices, or the agent tool surface; changing chat timeline projection or agent status UI; reading the history behind the memory/wiki/cron retirements
---

# 14. The CLI is the agent's only output channel

Date: 2026-07-22

## Status

Accepted. Implements decisions D1/D5/I1–I4 of the Raft-alignment program
contract ([specs/raft-alignment/README.md](../../specs/raft-alignment/README.md));
supersedes the reply-based turn model of ADR 0007/0011 (the global-session
core of ADR 0011 survives).

## Decision

Agents speak only by running `haus message send`. The engine gets no Haus
output tool; web search and fetch are the runtime's native tools, and Haus
product actions are a CLI on PATH. Consequences adopted together as one landing:

- **No final replies.** Text a model emits outside a `haus` command is
  delivered to no one. `NO_REPLY`, outcome notes, per-message evaluation
  dispatch, and per-turn chat response rows are gone.
- **Floating turns.** A turn anchors to the agent's global session, never a
  chat. Ordinary idle wakes and busy steering carry content-free notice
  metadata; Computer-local bodies enter context only when the Agent pulls.
  A pending notice is the first prompt of a fresh session; bare `Start.` is
  used only when no delivery is pending. Startup never races a second input.
- **Inbox delivery.** A delivery planner listens on `message.created` and
  queues per attention rules: joined channels, followed threads, and DMs
  deliver ordinarily; a channel mute suppresses the channel itself while followed threads remain active;
  personal @mentions pierce Channel mutes, while direct Thread mentions restore the follow.
- **Exact delivery and visibility.** Pending work is exact transport debt, not a scalar
  delivered horizon. Exact message identities record model visibility for the active run; settled
  visibility plus an optional verified contiguous boundary answer later freshness checks without
  consuming unseen gaps. Notices and wakes advance nothing.
- **Content-free notices.** Idle and busy agents see only batched target rows —
  counts, ids, latest sender — never bodies.
- **Chat level shows humans human things.** The timeline is durable messages plus the ephemeral,
  message-bound composition stream. ADR 0023 rejects inferring typing from general Agent work;
  execution evidence remains separate Agent-level state.

The same landing retires the systems the CLI-only model replaces: the memory
pipeline (extraction, dreaming, core-memory injection), the Wiki, the cron
product, SOUL injection (the agent description was then the personality surface;
voice now comes from the house personality and the private conversation style),
first-party plugin engine tools, and the first task tracker (chat-first tasks
return with the tasks workstream). ADR 0017 later replaced the retired plugin
model with standard MCP connections and Runtime-relayed exact tool grants.

## Why

One decision carries the design: with the CLI as the only output channel,
silence is the default and speaking is an act, the freshness gate lives on
the send path exactly once, one prompt works on every runtime because it
needs only a shell, and every capability arrives as a CLI verb instead of a
tool-schema change. The full rationale and the Raft evidence audit live in
the program contract; the wire contract is
[specs/haus-cli.md](../../specs/haus-cli.md).
