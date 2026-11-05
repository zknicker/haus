# Claims

Chat-first claims implement D8 from `specs/raft-alignment/README.md`, where they were called tasks;
[ADR 0051](../docs/adr/0051-tasks-are-boards-and-claims-are-the-lock.md) renamed them to claims so
the coming board Tasks product can own the word *task*. A claim is one canonical hosted
message plus Server-owned lifecycle metadata. Conversation continues inline in its channel or DM,
or in a deliberately chosen child Thread. All claim views project the canonical message and metadata.

Claims are Agent work ([ADR 0037](../docs/adr/0037-humans-are-addressed-by-mention.md)). Only an
Agent holds a claim; humans assign to Agents and change status, but never claim or hold one, and the
App no longer creates or promotes one (ADR 0051 decision 9). An Agent that needs a person @mentions them in an inline reply where
the request arrived (or in the Thread if it arrived inside one), never in a Thread on the claim
message itself.

## Hosted model

`message_claims` keys metadata by `(server_id, message_id)` and also binds the canonical
`chat_id`, always the top-level Channel or DM: monotonic per-Chat claim number (`chats.last_claim_number`), status, optional Agent assignee (`assignee_agent_id`) and claim time,
origin, creator, monotonic version, and a nullable `tracked_at`. The work-surface Thread
id is derived deterministically from the message id; it is not stored on the claim row, and the
Thread itself does not exist until someone replies in it. A claim on a Thread message also records
that Thread in `thread_chat_id`; the message's own Chat is the generated
`message_chat_id = coalesce(thread_chat_id, chat_id)`, which the message foreign key uses, and a
foreign key to `chats (id, parent_chat_id)` keeps the Thread a child of `chat_id`. The Thread it
sits in is its work surface (`threadChatId` on the wire), since Threads never nest. Only an Agent's
claim creates one; the number comes from the parent's counter.

`origin` is `composed` (created as a claim for someone else: unassigned, or reserved for a peer),
`converted` (`claim.promote` on an existing message), or `claimed` (an Agent claimed a message
nobody had promoted, or created one already assigned to itself). Reads derive two
more fields. `tier` is `background` for a `claimed` claim in `in_progress` or `done` that carries
has no `tracked_at`. Inline and Thread messages leave the tier alone; everything else is `tracked`,
and only the default Board and List lenses distinguish them. `live` is true while the assignee
Agent's in-flight run holds the claim's message or Thread. `tracked_at` records what the current row
cannot show — the status left `in_progress`/`done`, or the claiming run settled with the work open
— so the tier predicate stays a pure function of one row, and only ever
moves a claim from background to tracked.

An explicit status update completes the claim. Posting a message never sets it `done`. Agents set
their own finished work `done`, using `in_review` only for a requested sign-off or a pending human
decision; claims left open when a run settles remain
`in_progress` and become tracked, including completed, failed, interrupted, and stopped runs.

A claim has no priority or labels; those belong to board Tasks ([tasks.md](tasks.md)). Composite
foreign keys keep claim, message, Chat, and assignee in one Server tenant. `chat_messages.claim` and
claim-list reads project the same row.

Channel or DM messages, including inline replies, can be promoted; an Agent can also claim a
Thread message. Promotion is idempotent by canonical
message identity. Atomic create uses the message nonce for replay and creates the message, claim,
and durable events in one transaction — not the Thread. Creation and promotion do not append a
user-visible state-change message; the canonical claim message is the record. A claim whose Thread was never needed still answers
`thread.get`, `chat.messages`, and its `threadSummary` as an empty Thread, so deep links keep
working; deliberately following such a Thread materializes it, and the claimant's follow attaches
the moment it appears.
A direct Agent-to-Agent assignment writes no Chat message at all. It enqueues one `agent_inbox`
item for the assignee — kind `claim_assignment`, keyed by the assignment identity, carrying
`mentioned=true` — which reaches that Agent through the ordinary inbox ([inbox.md](inbox.md)) and
never touches the transcript, search, the Chat list, or `lastActivityAt`. Haus has no hidden Chat
message to filter, and the human's view of the same fact is the claim chip on the canonical claim
message (ADR 0026).

## Authority and concurrency

- Status is member-level. Humans with write access to the claim's Chat can update status using
  `expectedVersion`. Any Agent in the Chat may change status too, holder or not, along the
  transition table: `todo` → `in_progress`
  / `closed`; `in_progress` → `in_review` / `done` / `closed`; `in_review` → `done` /
  `in_progress` / `closed`; `done` → `todo` / `in_progress` / `in_review` / `closed`; `closed`
  → `todo` / `in_progress`. Humans in the App are not limited by the table. Moving `todo` or
  `closed` to `in_progress` needs an assignee (claim first) and stamps the claim; a `todo` that
  already carries a claim stamp is refused as a concurrent start; returning to `todo` clears the
  stamp. Haus has no claim deletion.
- Claiming is self-only and Agent-only; a human has no claim or release. Claim writes lock the Server before membership, Chat, and claim rows. The
  first valid claimant wins; a second claimant cannot acquire ownership at the same version.
- An Agent claim conflicts only with the current holder, never with an unrelated status edit. A
  batch claim is one transaction answering per claim — claimed, already yours, or refused with a
  reason — so every granted claim commits and emits `claim.updated` together.
- A successful Agent claim follows the request's inline reply chain in the same transaction.
  A reply to a human's original request therefore reaches its claimant. Completion preserves
  attention; subsequent work can be claimed on a later reply without reopening the old claim.
- Only the current assignee can release.
- Assignment is member-level. Any human or Agent who can write in the claim's Chat can assign it
  to any Agent of that Chat or clear it, including over another Agent's hold. The assignee must
  be an active Agent that already participates in the parent Chat; a human is never an assignee.
  Agents name the assignee by `@handle`; a human, missing, retired, or out-of-Chat handle answers
  one uniform "not assignable in this chat" refusal.
  Assignment never changes status and clears the claim stamp; re-assigning the current owner is
  a no-op that keeps the version. An optional expected revision makes a stale assign lose.
  Assigning another Agent enqueues its typed assignment pending work and wakes it. In every case
  the recipient must claim before working, and a finished claim cannot be assigned.
- Revoked Server membership, lost parent-Chat access, cross-Server ids, and stale versions fail
  closed.
- Agent retirement releases that Agent's claims and assignments with versioned `claim.updated`
  events. Reinvitation or reactivation restores no old assignment or Thread access.

Assignee and status are independent. Claiming an unassigned `todo` claim moves it to
`in_progress`; releasing preserves status. Done claims cannot be claimed or released.

## Events and recovery

Claim transactions emit small concrete durable events:

- `message.created`: the canonical message's Chat sequence and cursor when composing a new claim
- `claim.created`: Server, parent Chat, canonical message, sequence, and cursor
- `claim.updated`: the same ids for lifecycle changes

Both claim events ride the `claim.changed` topic (`claim.onChanged`). Events notify; PostgreSQL
claim and message reads remain authoritative. The App uses the same event targeting for live
delivery and cursor catch-up after reconnect.

## Surfaces

- Hosted App: claims have no page. `claim.list` excludes background-tier claims by default and
  reports how many it hid (`includeBackground` widens it). The Agent profile lists `claimed` claims
  whose run settled with the work open under **Stopped before finishing**. Opening a claim opens the
  canonical message's hosted Thread, where a claim metadata header projects the number, status,
  assignee, and creator. Status and assignment edits use the versioned claim mutations.
- Managed CLI: `haus claim` (claim) and `haus claim list|create|release|assign|unassign|update` use
  the Computer's scoped runner authority and hosted Server claim API (`/api/agent/claims/*`). Agent
  identity comes from that runner credential. An Agent
  claims a message before any tool-using work on it, and a claim row that loses to a standing
  claim carries the structured `claimConflict` documented in
  [Agents API](../docs/api/agents.md#claim-routes). `claim list` defaults to unfinished work,
  accepts `--status all` and `--mine`, and caps its rows with an explicit truncation count.

The App has no calendar or scheduling fields. The word “calendar” in PRD-140's original acceptance
text is stale relative to ADR 0015, D8, and the accepted WS6 plan; reminder/scheduling work belongs
to PRD-141. Production activation of the managed CLI belongs to PRD-145.

## Non-goals

No priority, labels, due dates, claim-owned reminders, attachments, claim deletion, claim-specific
queue, per-claim conversation store, or generic workflow engine. Reminders may
separately anchor to claim messages. Claim delivery and peer assignment use the ordinary Agent inbox
path.
