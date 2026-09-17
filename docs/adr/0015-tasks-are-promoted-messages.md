---
summary: Decision to model tasks as chat messages promoted with task metadata, with claim-before-work as the concurrency lock and board/priority/labels as lenses.
read_when:
  - changing task storage, numbering, claiming, statuses, assignment delivery, or the task CLI
  - changing the Tasks views, task creation, task chips, or Convert to Task
  - considering a separate work tracker, dispatch queue, or task scheduling
---

# ADR 0015: Tasks Are Promoted Messages

## Status

Accepted (2026-07-22, WS5 of the Raft-alignment program; decision D8 in
`specs/raft-alignment/README.md`, ruled 2026-07-20/21). Supersedes the retired
pre-flip tracker (tasks/epics/T-numbers/dispatch).

Amended 2026-09-16 by [ADR 0029](0029-inline-replies-preserve-conversation.md): explicit status
updates complete tasks; run output no longer implies completion. Inline or Thread messages do
not affect task tier. Work may continue in its channel or DM, with replies following the request.
The earlier completion and Thread-tier rules below are historical.

Amended 2026-09-08 by the background-claim decision recorded below: the claim
rule returns, promotion stops creating the Thread, and claimed tasks carry a
tier. Amended 2026-09-04 by ADR 0026 in one respect: the private assignment receipt
this decision describes as a Server-authored system message is no longer a Chat
message. It is an `agent_inbox` item in the assignee's inbox, keyed by the
assignment identity and still carrying the personal mention that pierces a mute;
the human's view of the assignment is the task chip on the canonical message.
Everything else below stands, and the filters that used to hide the receipt from
the App transcript, search, Chat list, and unread counts are gone with it.

## Decision

A task is a chat message promoted with task metadata stored in a
`message_tasks` row keyed by the message id: a per-conversation number,
status (`todo → in_progress → in_review → done`, reversible `closed`),
assignee + claim timestamp, priority, and label references. The message body
is the task title, verbatim. The message's Thread, once someone replies in
it, is the work surface.
Claim-before-work is one human-or-Agent concurrency lock: a claim held by
someone else fails closed. Board, list, priority, label, and filter views are
lenses over task-messages — never a second store. Task state changes do not
create receipt messages.

**Tasks never own Threads.** Messages get tasks; messages get Threads; they
meet only because they share the anchor message. Promotion allocates the task
number and writes the `message_tasks` row and nothing else: the Thread
materializes on the first reply, under the same deterministic
`cht_thr_<anchor>` id it always had, and every read resolves that id against
the anchor whether or not the Chat row exists yet.

**Claim before work, in two tiers.** An Agent claims a message before any
tool-using work on it, and claiming a message nobody had promoted promotes it —
`origin: 'claimed'`, distinct from a human's `converted` or `composed`. The
tier is inferred from evidence, never declared:

- A **background claim** is `origin: 'claimed'`, status `in_progress` or
  `done`, with nothing its assignee said in its Thread, no Ask against it, and
  no `tracked_at` stamp. It is an orchestration lock and a record, so it stays
  queryable but off the default Board and List, which report how many they
  hid.
- Everything else is **tracked**. A background claim becomes tracked the
  moment its own assignee posts in its Thread, an Ask is raised against it, its
  status leaves the claim's own `in_progress`/`done` lifecycle, a human creates
  or converts it, or its claiming run settles with the work unfinished. Only
  the assignee's Thread messages count: a Thread is where everybody else's
  chatter about a message is meant to land, so a peer Agent or a bystander
  replying there says nothing about whether the claimant's work needs
  watching. Status
  is the one tier input that can move backwards and a settled run leaves no
  trace on the row, so both stamp the one thing persisted: a nullable
  `message_tasks.tracked_at`. Tier is therefore one-way.

**Server closes a background claim its own run answered.** When the claiming
run completes having posted at least one top-level message in the task's anchor
Chat, Server sets the task `done`. The reply must be a *finishing* one — written
after the run's last tool-shaped operation on the activity ledger, or by a run
that used no tools at all — so the early "I'm on it" acknowledgment the managed
prompt asks for cannot close work the run is still doing; an acknowledgment
stamps the claim tracked instead. Only a completed turn counts: a run that
failed, was interrupted, or was stopped, restarted, or reset proves nothing
about the work, so its claims are stamped tracked instead. This is a deliberate divergence from Raft:
same-turn claimed work resolves to `done` without passing through
`in_review`, because `in_review` means a person has to look and nobody does.
A claim the run does not answer is not closed — it is stamped tracked, which
is exactly the case a person should be able to see. The Agent setting its own
same-turn work `done` is the primary path; this auto-resolve is a backstop, and
every one of its edges deliberately errs toward leaving a claim open and tracked
rather than closing work that may still be live.

**Chat shows an Agent's own claims only behind a setting.** A `claimed` task states nothing under
its message by default — Chat is a conversation, and a claim is bookkeeping — while a task a human
composed or converted always shows; the per-device **Show tasks in chat** preference turns the
claims back on, and a claim whose run stopped without finishing is surfaced in the Inbox instead.

A task also carries `live`: true while the assignee Agent's in-flight run
holds the task's message or Thread. It is derived at read time from the
delivery ledger, never stored, and a run beginning or settling emits
`task.updated` so no client polls for it.

Direct assignment to an Agent is the one private handoff exception, whether a
peer Agent or an Owner or Admin makes it: the canonical task message remains
the durable Chat work item, and the assigned Agent also receives a
Server-authored task assignment system message through its inbox. The
assignment receipt is not part of the App Chat transcript or human unread
count.

## Consequences

- Nothing schedules tasks. Agents normally pull and claim work, while direct
  peer assignment of a newly created task wakes only the assigned Agent through
  the ordinary durable delivery path. The assigned Agent receives both the
  canonical task envelope and a private assignment receipt; the receipt is a
  handoff cue, not a second task record. A dated follow-up is a reminder
  anchored on the task message (ADR 0016), so `scheduledFor` and the calendar
  lens died.
- Epics, dependency edges, per-task work chats, attachment promotion, and the
  `tasks_*` engine tools all retired with the old tracker.
- Thread and system messages cannot become tasks; task numbers are
  per-conversation and rendered `task #N`.
- The noise that got the claim rule removed was the eager Thread, not the
  claim: promotion rendered a full work surface for work that was over in one
  turn. Splitting the Thread from the task removes the surface without
  removing the lock, and the two tiers keep an Agent's bookkeeping out of the
  lens a person reads.
- `tracked_at` is the only new column. Tier is otherwise a pure function of
  the task row plus two facts read at query time — did the assignee post in the
  Thread, is there an Ask — so there is one predicate and no second store. The
  assignee comparison is correlated to `message_tasks` inside the same query,
  so every read, the Board and List lens, and claim settling share it.
- A task whose Thread was never needed still answers `thread.get`,
  `chat.messages`, and its `threadSummary` as an empty Thread, so
  `?task=<messageId>` deep links keep working. Following such a Thread
  deliberately materializes it; nothing else does.
- The ordinary Chat composer sends messages only. Humans create tasks from the
  Tasks surface or promote an existing top-level message with Convert to Task.
- The old `tasks`/`task_*` tables and their repair/migration machinery were
  deleted from the fresh schema; live databases drop the orphaned tables at
  the WS5 manual cutover.
