---
summary: Inline replies keep conversation in its channel while scoped subscriptions control Agent attention independently of task ownership; solo step-by-step progress goes in a thread on the Agent's acknowledgment (amended 2026-10-02); the acknowledgment is a signature-emoji pickup reaction plus a one-line note (amended 2026-10-06).
read_when:
  - changing inline replies, Agent inbox recipients, or task conversation placement
  - changing where Agents post acknowledgments, progress, questions, or cloud review rounds
---

# ADR 0029: Inline replies preserve the conversation

## Status

Accepted, 2026-09-16; amended 2026-10-02 (progress threads) and 2026-10-06 (pickup acknowledgment), below. Implemented in the worktree; release remains gated by
[the implementation plan](../plans/inline-replies.md).

Amends ADR 0013's removal of inline replies and ADR 0015's task completion and
thread-based task visibility rules. Existing child threads remain supported.

## Decision

An inline reply belongs to the same channel or DM as its parent message. It carries a direct
parent reference and a Server-derived root. These relationships do not create another Chat.
The App presents the reference beside the reply, in the ordinary transcript.

Agent attention is separate from task ownership. Root authors, explicitly mentioned Agents,
reply authors, and successful task claimants subscribe to the reply chain. Explicit unfollow
persists until a new post, claim, or direct mention restores participation. Completion of a
task does not end the conversation or unsubscribe its assignee.

Ordinary top-level messages retain existing channel delivery. An inline reply goes to eligible
chain participants and direct mentions, excluding its author. Human replies to an exchange that
has never had an Agent participant retain ordinary channel delivery. Leaving a chain does not
restore that fallback. Access still derives from the parent Chat.

The existing inbox remains responsible for durable queuing, deduplication, idle and busy
delivery, retries, reading, and session serialization. Reply context travels with message reads.
ADR 0030 adds semantic narrowing for unaddressed human top-level channel messages.
Explicit replies and mentions retain these deterministic rules. Agents interpret delivered
follow-ups using their own continuous sessions and current work ownership.

A task is still one canonical message with one assignee. It belongs to one channel or DM;
reply chains can contain several distinct requests, each with its own task. Tasks acquire no
cross-channel message associations. Agents explicitly complete tasks; posting an answer is not
completion evidence. Unresolved claims retain existing settlement visibility. A thread reply
alone no longer promotes background bookkeeping into tracked work.

Dedicated threads provide a separate place for a discussion. Humans and Agents can use them
deliberately; tool usage and task claims do not choose that location. Cloud cards retain their
detail threads and targeted completion notifications; coordinating Agents return outcomes to
the requesting conversation.

## Consequences

The change adds message ancestry and Agent subscriptions, not an Exchange UI, a second inbox,
or a new execution-session model. Existing message history and thread links remain valid.
The shared message contracts, CLI, App, and iOS must preserve reply references. Server validates
same-chat ancestry and computes recipients atomically with the send. Human unread counts stay
on the channel timeline. Explicitly completing tasks is required for successful work; forgotten
completion stays observable rather than being guessed from prose.

## Amendment, 2026-10-02: progress goes in a thread on the acknowledgment

Operator-approved. The original placement rule kept acknowledgments, progress updates, and
answers where the request arrived. In production `#tech-ops` that flooded channels: one Agent
answered a single human ask with seven inline channel replies, six of them narrating its own
investigation, and a cloud agent pull-request review loop produced about fourteen inline channel
replies while both cloud work threads stayed empty.

The refined rule:

- **The main chat** (an inline reply to the request) gets the acknowledgment or plan, anything
  that needs the human (a question, a decision, a correction of something already said), and the
  final answer, sent with `--done`.
- **A thread on the Agent's own acknowledgment** (target `#channel:<ackShortId>`) gets
  step-by-step progress of work the Agent drives alone. Opening that thread already shows the
  parent reply chain (request, acknowledgment, thread posts, final inline answer) in time order,
  so no product change is needed. Never a thread on the request itself (the task thread): its
  human author follows it, so each progress post would land as their unread. The `haus task
  claim` receipt therefore names the inline-reply command for each granted task, not the task
  thread, which had steered Agents into posting their whole run there.
- **Cloud agent work** keeps review rounds and revisions in the cloud work thread; the
  requesting conversation gets one line per real state change (pull request ready, blocked,
  done).
- When a human joins a thread, the Agent follows them there. Short one-step work needs no thread.

The managed prompt's Sending messages paragraph carries the rule; the `replies` and
`cloud-agents` Manual topics carry the mechanics. Coverage: `test:agents
solo-progress-threads-on-ack` (new), with `task-conversation-routing` and
`conversation-natural-followups` guarding that one-step work and ordinary answers create no
thread.

## Amendment, 2026-10-06: the acknowledgment is a pickup reaction

Operator-approved. For a request that needs real work before the Agent can answer (changing
files, running commands, or digging in, rather than one quick look-up), the
acknowledgment is now the Agent's signature-emoji reaction on the request (default 👀) plus, when
the work has several steps, a one-line note that it is on it. That note is the "acknowledgment"
the progress thread above hangs under. The note carries no plan, and progress threads under it as meaningful
steps land. A request the Agent can answer from what it has or one quick look-up gets the answer
with no reaction first.
The managed prompt's pickup bullet carries the rule; see
[Agents](../features/agents.md#identity-and-instructions) for the signature emoji.
[Agent conversation behavior](../features/agent-conversation-behavior.md) lists the guards that keep this placement from regressing.
