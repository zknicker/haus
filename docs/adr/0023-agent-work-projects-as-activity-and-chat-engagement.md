---
summary: Decision to project Agent work as durable semantic Server activity and Computer-local detailed execution evidence; its no-typing decision is superseded by ADR 0034.
read_when:
  - changing Agent activity or status presentation
  - revisiting why typing was once rejected (current typing contract is ADR 0034)
  - changing Server/Computer ownership of execution evidence
  - changing inbox visibility or Chat-scoped realtime events
---

# ADR 0023: Agent Work Projects as Activity and Local Evidence

## Status

Accepted 2026-08-11. Amends ADR 0014's work-status presentation and ADR 0019's execution
evidence boundary without changing CLI-only output or Agent-global sessions.

Partly superseded 2026-09-23 by [ADR 0034](0034-chat-engagement-shows-as-typing.md): Chats
now show typing from run visibility, and the sidebar activity strip is removed. The split
between the Server activity journal and the Computer execution journal stands.

## Context

Haus previously exposed ongoing Agent work primarily through one global status dot. Its durable
Activity feed retained only coarse turn outcomes. A provisional transcript bubble attempted to
represent an in-flight `haus message send`, but hosted Server emitted its `sending` phase after
message commit and immediately moved on, so users normally saw the final response appear at once.

Literal Agent composition cannot be detected reliably across Codex, Claude, and Pi. Haus turns
float on one Agent-global session, may read several Chats, and speak only through a generated CLI
command. Harness text deltas have no trustworthy Chat target, while complete tool-call arguments
arrive too late to serve as useful typing state.

At the same time, moving raw tool arguments and results into Server persistence would break the
existing boundary: Server owns collaboration, while Computer owns detailed execution, workspaces,
provider state, and raw evidence.

## Decision

Haus exposes Agent work through two distinct projections:

1. **Agent activity** is safe semantic execution metadata. Computer maps only known tool identities
   and structured product boundaries into a small category catalog; unknown tools use a generic
   fallback. Server persists this journal and projects it into Activity History and the live
   sidebar strip.
2. **Agent execution journal** is detailed tool evidence stored on Computer. Owners and Admins may
   inspect it through an authorized live relay. Server does not persist it, and detail is unavailable
   while Computer is offline.

Haus does not show a typing indicator. Human draft activity is not needed for the core work
surface, and Agent composition cannot be identified accurately across supported runtimes. An
accepted turn may continue reading, creating Threads, or using tools long after it first handles
work from a Chat, so inbox engagement is not presented as typing.

The first-party human draft-text stream and general typing presentation are removed. The explicit,
message-bound Agent composition bubble may still preview an in-flight CLI send; it does not stand
in for the Agent's broader work status.

## Consequences

- The sidebar can show current work across the Server without exposing raw execution.
- A committed Agent message changes that run's current sidebar activity to `Finishing up…`.
  Canonical Agent availability and sidebar-row membership both remain working until terminal
  lifecycle proof, so the row exits when the Agent's status dot leaves working. Trailing completion
  events preserve the finishing state; a later started operation replaces it.
- Activity History survives Computer downtime and reloads.
- Turn Details can show summarized Server evidence to authorized Chat readers and detailed local
  evidence only to Owners/Admins while Computer is online.
- Tool classification must be explicit and conservative; MCP and unknown tools default to
  `Using a tool…`.
- Computer must create a queryable local execution journal and a typed inspection relay.
- This work adds no retention or cleanup behavior. PRD-216 owns that policy holistically.

## Rejected alternatives

- **First model text delta:** a floating turn has no trustworthy Chat target and CLI-only output
  makes model text non-canonical.
- **First streamed `message send` argument:** not consistently observable across Harness adapters
  and still arrives late.
- **Explicit Agent typing command:** provider-neutral but adds a model-taught round trip for a fact
  already available from inbox visibility.
- **Turn-start typing:** marks a seed Chat even when the Agent handles unrelated pending work.
- **Inbox-engagement typing:** starts too early and remains visible while the Agent performs work
  that is not message composition.
- **Server-persisted raw tool evidence:** violates the established Server/Computer privacy boundary.
- **Computer lookup for Activity History:** makes an ordinary collaboration surface unavailable
  offline and turns history reads into remote machine operations.
