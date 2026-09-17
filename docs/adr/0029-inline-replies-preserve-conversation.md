---
summary: Inline replies keep conversation in its channel while scoped subscriptions control Agent attention independently of task ownership.
read_when:
  - changing inline replies, Agent inbox recipients, or task conversation placement
---

# ADR 0029: Inline replies preserve the conversation

## Status

Accepted, 2026-09-16. Implemented in the worktree; release remains gated by
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
No separate model judges who receives messages. Agents interpret ordinary mentioned follow-ups
using their own continuous sessions and current work ownership.

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
