# Tasks

Chat-first tasks implement D8 from `specs/raft-alignment/README.md`. A task is one canonical hosted
message plus Server-owned lifecycle metadata. Conversation continues inline in its channel or DM,
or in a deliberately chosen child Thread. All task views project the canonical message and metadata.

## Hosted model

`message_tasks` keys metadata by `(server_id, message_id)` and also binds the canonical
`chat_id`: monotonic per-Chat task number, status, optional human or Agent assignee and claim time,
priority, origin, creator, monotonic version, and a nullable `tracked_at`. The work-surface Thread
id is derived deterministically from the message id; it is not stored on the task row, and the
Thread itself does not exist until someone replies in it.

`origin` is `composed` (a human composed the message as a task), `converted` (a human promoted an
existing message), or `claimed` (an Agent claimed a message nobody had promoted). Reads derive two
more fields. `tier` is `background` for a `claimed` task in `in_progress` or `done` that carries
no Ask and has no `tracked_at`. Inline and Thread messages leave the tier alone; everything else is `tracked`,
and only the default Board and List lenses distinguish them. `live` is true while the assignee
Agent's in-flight run holds the task's message or Thread. `tracked_at` records what the current row
cannot show — the status left `in_progress`/`done`, or the claiming run settled with the work open
— so the tier predicate stays a pure function of one row plus Ask evidence, and only ever
moves a task from background to tracked.

An explicit status update completes the task. Posting a message never sets it `done`. Same-turn
work can finish directly without `in_review`; claims left open when a run settles remain
`in_progress` and become tracked, including completed, failed, interrupted, and stopped runs.

`task_labels` is the small Server task-label catalog; `message_task_labels` links catalog entries
to tasks. Composite foreign keys keep task, message, Chat, assignee, and labels in one
Server tenant. `chat_messages.task` and task-list reads project the same row.

Channel or DM messages, including inline replies, can be promoted. Promotion is idempotent by canonical
message identity. Atomic create uses the message nonce for replay and creates the message, task,
and durable events in one transaction — not the Thread. Creation and promotion do not append a
user-visible state-change message; the canonical task message is the record. A task whose Thread was never needed still answers
`thread.get`, `chat.messages`, and its `threadSummary` as an empty Thread, so deep links keep
working; deliberately following such a Thread materializes it, and the claimant's follow attaches
the moment it appears.
A direct Agent-to-Agent assignment writes no Chat message at all. It enqueues one `agent_inbox`
item for the assignee — kind `task_assignment`, keyed by the assignment identity, carrying
`mentioned=true` — which reaches that Agent through the ordinary inbox ([inbox.md](inbox.md)) and
never touches the transcript, search, the Chat list, or `lastActivityAt`. Haus has no hidden Chat
message to filter, and the human's view of the same fact is the task chip on the canonical task
message (ADR 0026).

## Authority and concurrency

- Authorized humans can create/promote a task and update status, priority, or task labels using
  `expectedVersion`. An Agent can update lifecycle state only while it owns the task.
- Claim is self-only. Task writes lock the Server before membership, Chat, and task rows. The
  first valid claimant wins; a second claimant cannot acquire ownership at the same version.
- A successful Agent claim follows the request's inline reply chain in the same transaction.
  A reply to a human's original request therefore reaches its claimant. Completion preserves
  attention; subsequent work can be claimed on a later reply without reopening the old task.
- Only the current assignee can unclaim.
- Server Owners and Admins can reserve or clear assignment for an Agent or a human. A human
  assignee must have active Server membership and parent-Chat access; an Agent assignee must be
  active and already participate in the parent Chat. Assigning an Agent enqueues its typed
  assignment pending work and wakes it. An Agent can also create a new Channel task reserved for
  another active Agent in that Channel. In every case the recipient must claim before working,
  and a finished task cannot be assigned.
- Members can create task-label catalog entries. Owners and Admins can rename, recolor, or delete
  catalog entries.
- Revoked Server membership, lost parent-Chat access, cross-Server ids, and stale versions fail
  closed.
- Human removal or Agent retirement releases that actor's claims and assignments with versioned
  `task.updated` events. Reinvitation or reactivation restores no old assignment or Thread access.

Assignee and status are independent. Claiming an unassigned `todo` task moves it to
`in_progress`; unclaiming preserves status. Done tasks cannot be claimed or unclaimed.

## Events and recovery

Task transactions emit small concrete durable events:

- `message.created`: the canonical message's Chat sequence and cursor when composing a new task
- `task.created`: Server, parent Chat, canonical message, sequence, and cursor
- `task.updated`: the same ids for lifecycle changes
- `task.label.updated`: Server, label, and cursor

Events notify; PostgreSQL task/message/label reads remain authoritative. The App uses the same
event targeting for live delivery and cursor catch-up after reconnect.

## Surfaces

- Hosted App: Server Board and List lenses, which exclude background-tier tasks by default and
  report how many they hid (`includeBackground` widens them), with create, claim, unclaim, human assignment, status,
  priority, and task-label controls. Opening a task opens the canonical message's hosted Thread,
  where a task metadata header projects the number, status, assignee, and creator. Status and
  authorized human-assignment edits use the same versioned task mutations as the other lenses.
- Managed CLI: `haus task list|create|claim|unclaim|update` uses the Computer's scoped runner
  authority and hosted Server task API. Agent identity comes from that runner credential. An Agent
  claims a message before any tool-using work on it, and a claim that loses to a standing claim is
  refused with the structured `claimConflict` documented in
  [Agents API](../docs/api/agents.md#task-routes).

The App has no calendar or scheduling fields. The word “calendar” in PRD-140's original acceptance
text is stale relative to ADR 0015, D8, and the accepted WS6 plan; reminder/scheduling work belongs
to PRD-141. Production activation of the managed CLI belongs to PRD-145.

## Non-goals

No due dates, task-owned reminders, attachments, task deletion, task-specific queue, per-task
conversation store, generic workflow engine, or generic label/taxonomy framework. Reminders may
separately anchor to task messages. Task delivery and peer assignment use the ordinary Agent inbox
path.
