---
summary: Live Agent behavior contract for continuing sourced work across owners after a fresh session.
read_when:
  - changing Agent session reset, Thread recovery, workspace artifacts, or cross-Agent handoff
  - changing agent-test coverage for durable continuation
---

# Durable relay

A useful handoff survives both a change of owner and the successor's loss of
model context:

1. Agent A researches a decision, posts the recommendation and source evidence
   in one durable Thread, and shares a self-contained workspace artifact.
2. Agent B starts a fresh session before receiving the handoff.
3. The human points Agent B at the existing work without restating the original
   assignment or copying Agent A's result.
4. Agent B recovers the Thread, artifact identity, and evidence, then verifies
   or amends the decision and delivers a concrete next step.

The agent-test scenario targets recovery with an Agent-A-generated relay
token that is absent from the human prompt to Agent B. It verifies the artifact
bytes through the owning Agent's workspace boundary and requires Agent B to
carry forward the artifact path and at least one exact source URL. It runs in
the normal `test:agents` set. Deterministic Server coverage separately
owns the task-Thread idempotency invariant.

Cross-Agent workspace reads are not part of this contract. Workspace files
remain Agent-owned; canonical Thread content and the rendered page card are
the collaboration handoff. A successor should state plainly when it cannot
inspect another Agent's private workspace bytes and continue from the durable
evidence available in Chat.
