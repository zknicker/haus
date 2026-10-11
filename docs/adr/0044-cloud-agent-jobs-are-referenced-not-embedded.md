---
status: proposed
summary: A Cloud Agent job becomes its own Agent-owned record that Messages reference through a job reference rendering the full live card anywhere; the `cloud-agent-work` body kind retires, and launch placement (work Thread, receipts, completion target) stays exactly as it is.
read_when:
  - changing Cloud Agent work storage, its link to Messages, or the `cloud-agent-work` body kind
  - adding or changing the job rich reference, its card, or who may see a job
  - moving Cloud Agent work between conversations or showing it in more than one Chat
  - changing launch placement, the work Thread, the start receipt, or completion notice targets
---

# ADR 0044: Cloud Agent jobs are referenced, not embedded

## Status

Proposed, 2026-10-11. Amends [ADR 0025](0025-messages-carry-typed-product-bodies.md) for Cloud
Agent work. [ADR 0041](0041-cloud-agent-cards-mirror-cursor.md) still governs what the card shows.

## Context

Cloud Agent work is welded to the Message that launched it. `cloud_agent_work.message_id` is a
unique foreign key with `ON DELETE CASCADE`, and the Message carries body kind
`cloud-agent-work`. That has four costs:

- A job cannot follow its owner when the work moves to another conversation.
- A job cannot appear anywhere except its launch Message.
- Who can see a job is decided by one Chat.
- Losing the Message loses the tracking.

On 2026-10-11 Forge launched a job in `#joy-haus-ops`. Zach then moved ownership of the work to
`#tech-ops`. Forge could only post a Thread reference chip there. The live card, with its status,
pull request, and actions, stayed behind in the old channel. (The same incident exposed a missing
launch freshness hold, fixed separately on this branch.)

## Decision

**A Cloud Agent job is its own Agent-owned record.** It no longer belongs to a Message. It keeps
its delegating Agent, provider Runs, lifecycle, and a plain `launch_message_id` pointer with no
uniqueness, ownership, or cascade.

**Messages reference jobs.** A new rich reference kind, the job reference, points at a job by
immutable id, using the same typed Markdown link mechanism as Agent, Chat, and Thread references.
It renders the full live card wherever it appears: the same header, PR row, status slot, and
actions (cancel, Open in Cursor, View PR) in every Chat. Server authorizes each action exactly as
today; rendering a card grants nothing.

**The launch Message is ordinary text.** `haus cloud-agent start` posts a `text` Message whose
`--say` content ends with a job reference. That reference is simply the first one. Any later
Message, in any Chat, can reference the same job and get the same live card. This is the path
ADR 0025 already names ("rich references remain readable content"), so no new body kind is
needed.

**The `cloud-agent-work` body kind retires.** A checked-in migration rewrites every existing
`cloud-agent-work` Message into a `text` Message carrying a job reference, per ADR 0025's one
current shape per kind. No legacy reader remains.

**Visibility follows references.** Anyone who can read any Message that references a job can see
that job's card. The Server records job references at send time in a reference index. The index
answers authorization ("may this viewer read this job?") and drives live-update fan-out: a job
lifecycle change notifies every Message and Chat that references it.

**Placement does not change.** Agents keep today's channel and Thread behavior, so the managed
prompt and the `cloud-agents` Manual topic stay as they are, and "work Thread" stays true:

1. Launch still creates the launch Message's Thread at launch, and the launching Agent follows it,
   so human replies there wake it.
2. The start receipt still prints `Work thread: "<target>:<shortId>"`, or the enclosing Thread
   target for a launch inside a Thread. `send` keeps the same Thread.
3. `launch_message_id` lets Happening now and the per-Chat work lists find the work Thread.
4. The Thread-summary filter that hides launch Messages today keys on `body_kind`. It gets a
   replacement marker derived from the job record (the Message is some job's `launch_message_id`).
5. The completion notice `target=` stays the requesting conversation. Inline `--reply-to`,
   in-Thread launches, and Task-Thread launches behave exactly as now.

## Considered and rejected

- **Let Agents delete or edit a Message to re-post the card.** Overturns append-only Messages
  (`specs/realtime-events.md` rule 4) for one feature.
- **Respawn the job in the new conversation.** Duplicates the Cursor agent, the pull request, and
  the cost.
- **Re-point the work's `chat_id` and `message_id`.** Orphans the work Thread and its history, and
  still allows only one location.
- **Use a Thread reference as a job proxy.** Ambiguous when one Thread holds several jobs, which
  ADR 0041's per-job Thread rows already allow.

## Consequences

- A job no longer disappears with a single Message. Losing the launch Message loses one
  reference, not the tracking.
- Realtime events change shape: `cloud-agent-work.updated` stops refetching one owning Message and
  fans out through the reference index.
- Docs that describe one owning Message move to the new model when this is accepted:
  `specs/cloud-agents.md` ("One durable Message", the one-to-one storage rule),
  `specs/realtime-events.md` (the card as a Message annotation), the CONTEXT.md entries for
  Message body and Cloud Agent work, and `docs/features/rich-references.md`.
- Behavior must match before and after. Proof is the live scenario `cloud-conversation-handoff`
  (being baselined now) plus `solo-progress-threads-on-ack`, `task-thread-routing`,
  `thread-reply-stays-in-thread`, and `inline-reply-followups`; `eval:prompt`;
  `test:prompt-contract`; and the Server and Computer suites.

## Open for the implementation plan

These are not decided here: the reference index shape; what happens to a job whose only
reference was in a deleted Channel; and iOS parity for the job reference card.
