---
status: accepted
summary: Cloud Agent work is its own Agent-owned record that Messages link to; every link renders the same live card with the same actions, anyone who can read a linking Message can see the work, the `cloud-agent-work` body kind retires, and launch placement (work Thread, receipts, completion target) stays exactly as it is, except that a launch never opens a new Thread (amended 2026-10-12).
read_when:
  - changing Cloud Agent work storage, its link to Messages, or the `cloud-agent-work` body kind
  - adding or changing the Cloud Agent work rich reference, its card, or who may see Cloud Agent work
  - showing Cloud Agent work in another Chat or Thread, or in more than one place
  - changing launch placement, the work Thread, the start receipt, or completion notice targets
---

# ADR 0044: Cloud Agent work is referenced, not embedded

## Status

Accepted, 2026-10-11; amended 2026-10-12 (a launch never opens a Thread), below. Amends [ADR 0025](0025-messages-carry-typed-product-bodies.md) for Cloud
Agent work. [ADR 0041](0041-cloud-agent-cards-mirror-cursor.md) still governs what the card shows.

## Context

Cloud Agent work is welded to the Message that launched it. `cloud_agent_work.message_id` is a
unique foreign key with `ON DELETE CASCADE`, and the Message carries body kind
`cloud-agent-work`. That has four costs:

- The work cannot follow the conversation when the conversation moves.
- The work cannot appear anywhere except one Message.
- Who can see the work is decided by one Chat.
- Losing that Message loses the tracking.

On 2026-10-11 Forge launched Cloud Agent work in `#joy-haus-ops`. Zach then moved the
conversation to `#tech-ops`. Forge could only post a Thread reference chip there. The live card,
with its status, pull request, and actions, stayed in the first channel. (The same incident
exposed a missing launch freshness hold, fixed separately on this branch.)

## Decision

**Cloud Agent work simply exists.** It is its own Agent-owned record with its delegating Agent,
provider Runs, and lifecycle. It does not belong to a Message or a Chat.

**Messages link to it.** A new rich reference kind, the Cloud Agent work reference, names the work
by immutable id, using the same typed Markdown link mechanism as Agent, Chat, and Thread
references. Wherever Cloud Agent work appears in a Chat or Thread, a Message has linked it there.
Every link renders the same live card with the same header, PR row, status slot, and actions
(cancel, Open in Cursor, View PR). No link is primary and none is a copy.

**The launch Message is just the first link.** `haus cloud-agent start` posts an ordinary `text`
Message: the Agent's `--say` words plus a link to the new work. Any later Message, in any Chat or
Thread, can link the same work and gets the same card. This is the path ADR 0025 already names
("rich references remain readable content"), so no new body kind is needed.

**The `cloud-agent-work` body kind retires.** A checked-in migration rewrites every existing
`cloud-agent-work` Message into a `text` Message that links its work, per ADR 0025's one current
shape per kind. No legacy reader remains.

**Visibility follows links.** Anyone who can read a Message that links Cloud Agent work can see
that work. The Server records links at send time. Those records answer "may this viewer see this
work?" and drive live updates: a lifecycle change reaches every Chat that links the work. A link
grants nothing on its own: an author may link only work they can already see.

**Cancel authority does not change.** Owners and Admins, and the delegating Agent, may cancel, as
today. Everyone else asks for cancellation in whichever conversation they see the work in.
Rendering a card grants no action; the Server authorizes each action exactly as now.

**Placement does not change.** Agents keep today's channel and Thread behavior, so the managed
prompt and the `cloud-agents` Manual topic keep their placement rules, and "work Thread" stays
true:

1. Launch still creates the launch Message's Thread at launch, and the launching Agent follows it,
   so human replies there wake it.
2. The start receipt still prints `Work thread: "<target>:<shortId>"`, or the enclosing Thread
   target for a launch inside a Thread. `send` keeps the same Thread.
3. The work keeps a plain `launch_message_id` pointer, with no uniqueness, ownership, or cascade,
   so Happening now and the per-Chat work lists can still find the work Thread.
4. The Thread-summary filter that leaves launch Messages out of Thread previews keys on the work's
   `message_id` today. It keys on `launch_message_id` instead.
5. The completion notice `target=` stays the conversation that asked for the work. Inline
   `--reply-to`, in-Thread launches, and Task-Thread launches behave exactly as now. If that
   conversation has since been deleted, the work settles without a notice; it is never
   retargeted to another link.

## Considered and rejected

- **Let Agents delete or edit a Message to re-post the card.** Overturns append-only Messages
  (`specs/realtime-events.md` rule 4) for one feature.
- **Start the work again in the new conversation.** Duplicates the Cursor agent, the pull request,
  and the cost.
- **Re-point the work's `chat_id` and `message_id`.** Orphans the work Thread and its history, and
  still allows only one place.
- **Use a Thread reference to stand in for the work.** Ambiguous when one Thread holds several
  pieces of Cloud Agent work, which ADR 0041's per-work Thread rows already allow.

## Consequences

- Cloud Agent work no longer disappears with a single Message. Losing one Message, or the whole
  Chat that requested the work, loses its links, not the tracking. The work's requesting Chat and
  launch Message ids stay as historical pointers with no cascade.
- Removing a Computer keeps the work it launched: `computer_id` is a historical pointer too, and
  that work can no longer be cancelled or followed up.
- Realtime events change source: `cloudAgentWork.updated` fans out once per linking Message
  instead of naming one owning Message.
- These docs move to the new model with the implementation, not before:
  `specs/cloud-agents.md` ("One durable Message" and the one-to-one storage rule),
  `specs/realtime-events.md` (the card as a Message annotation), the CONTEXT.md entries for
  Message body and Cloud Agent work, `docs/features/rich-references.md`, and the `cloud-agents`
  Manual topic's start-receipt wording.
- Behavior must match before and after. Baseline on commit `fde78e3da`: the live scenario
  `cloud-conversation-handoff` and the four placement scenarios `solo-progress-threads-on-ack`,
  `task-thread-routing`, `thread-reply-stays-in-thread`, and `inline-reply-followups` all pass on
  current code. One gap stands: short Cloud Agent work posts no progress in its work Thread today,
  so preservation means no leaks into other conversations, not required Thread posts. The
  implementation also reruns `eval:prompt`, `test:prompt-contract`, and the Server, Computer,
  App, and iOS suites.
- Note, 2026-10-15: `cloud-conversation-handoff` became `cloud-launch-and-link` (launch as an
  inline reply, then the cross-channel link, without the provider round trip), and
  `inline-reply-followups` and `eval:prompt` retired in favor of `bun run eval` (`tools`,
  `attention`, `placement`).

## Amendment, 2026-10-12: a launch never opens a Thread

Placement item 5 changes for one case. A launch whose `<target>:<shortId>` anchor has no Thread
yet, or only an empty one (a Follow alone materializes it), no longer creates or fills that
Thread; the Server refuses it with `CLOUD_AGENT_NEW_THREAD` before
writing anything, whoever authored the anchor. Agents kept opening fresh Threads to hold one card,
hiding it behind "1 reply". The card is the inline reply (`--reply-to`) and gets its own work
Thread. Launches into a Thread that already holds conversation, including a Task Thread with conversation,
behave as before. `specs/cloud-agents.md` carries the current contract.
