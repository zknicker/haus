---
summary: Superseded decision that previously split per-Agent Memory from a shared Wiki.
read_when:
  - understanding the history of Agent memory, extraction, dreaming, or Wiki
  - changing the current Agent workspace knowledge contract
---

# ADR 0009: Memory And Wiki Are Separate Markdown Knowledge Surfaces

**Status:** Superseded by
[Raft alignment D3](../../specs/raft-alignment/README.md), then by
[ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md) for the current
workspace and Manual contract. Memory delivery follows
[ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md).

## Historical decision

This ADR originally defined injected core-memory files, automatic extraction
and dreaming workers, and a separate shared Wiki. That product model is no
longer current.

## Current contract

Each Agent owns its durable local knowledge:

- `MEMORY.md` is the Agent's memory: one capped file the Computer delivers in the
  turn input whenever it changed
  ([ADR 0052](0052-memory-is-one-capped-file-and-heartbeats-retire.md)).
- `notes/` and the rest of the workspace are the Agent's to organize.
- The Agent reads and writes these files directly while working.

Haus does not inject core-memory sections or run extraction, dreaming,
recall, Wiki, or Memory-worker jobs; the nightly dream that once consolidated
memory retired with ADR 0052. Shared conversation history remains
canonical Server data. Reminders wake the Agent when scheduled, and the Agent
recovers relevant context from its workspace and Server history.

Session reset preserves the workspace. Full reset restores the Agent-kind
factory workspace described by
[ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md): minimal
`MEMORY.md` for an ordinary Agent or Cove's four-file onboarding seed.
See [ADR 0011](0011-agents-own-one-global-session.md) for session continuity.
