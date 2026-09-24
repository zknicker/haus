# Chat Timeline And Turn Evidence

The chat timeline is the conversation. Agent execution is evidence at agent
level. They are separate models with separate contracts, and they never mix
in one projection. Amended by
[ADR 0014](../docs/adr/0014-cli-is-the-agents-only-output-channel.md): agents
speak only via `haus message send`, so the timeline carries no turn-shaped
rows at all.

## Product Expectations

- A chat reads like a conversation between participants, and nothing else. Every row is
  authored by a human or by an Agent — there are no Server-authored rows and no
  `system_author` — and every row is readable by every human who can read the Chat. A task
  assignment, an automation fire, and a session rotation are agent inbox items or durable
  records, never timeline rows (ADR 0026).
- What a human needs to know about those facts rides the message they explain, as a header
  mark: the task chip for an assignment, the fire mark for an automation
  ([automation-provenance.md](automation-provenance.md)), and the session mark for a
  rotation ([sessions.md](sessions.md#generation-in-the-transcript)). Marks are attached to
  a message; they are never units of their own.
- An agent message is an explicit send, immutable once committed. There are
  no edits, no streamed replacements, no silent-turn placeholders.

## Timeline Contract

- The chat timeline projection (`chat.log.list`) returns conversation units
  only: human and Agent messages with their attachments, thread anchors
  (reply counts), and date boundaries.
- Execution rows — tool calls, reasoning, narration, turn lifecycle —
  never appear. There are no work groups, no streaming message states, no
  per-turn response rows.
- Every timeline unit renders at its natural size; the timeline never
  contains units that render empty.
- The timeline is append-only from the reader's seat: a new unit only ever
  appears at the end, and no unit ever moves.

## Execution Evidence

- Summarized turn evidence anchors to the Agent's real `runId` and surfaces in Agent Activity
  History. Agent-authored messages retain that run identity so their Turn Details drawer can show
  the same access-safe summary.
- Server Owners and Admins may explicitly request the detailed Computer-local execution journal
  from Turn Details while Computer is online. Opening a Chat never performs that read.
- Execution rows never become transcript units. The drawer is inspection UI attached to a durable
  message, not part of the conversation projection.
- Live agent state (busy dot, current activity text) is presence
  ([presence.md](presence.md)), agent-scoped. The typing strip above the composer is the one
  Chat-scoped live signal, and it sits outside the timeline
  ([ADR 0035](../docs/adr/0035-chat-engagement-shows-as-typing.md)).

## Boundaries

- Runtime owns both models: canonical messages and durable turn records.
- The server exposes them through separate procedures with separate
  schemas.
- External frontends consume the timeline contract without needing volatile composition state.
