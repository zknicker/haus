---
summary: Hosted chat-first tasks — canonical messages with Server-owned lifecycle metadata, Thread work surfaces, and board/list lenses.
read_when:
  - changing task promotion, claiming, assignment, statuses, priorities, or labels
  - changing hosted task authorization, events, or Thread work surfaces
  - changing the Server UI task board/list or managed task CLI contract
---

# Tasks

A task is a canonical hosted Chat message promoted with task metadata. The message body is the
task title verbatim, the child Thread anchored on that message is the work surface once anyone
replies in it, and board/list views are lenses over the same message. Haus does not keep a
second task conversation or content store.

Tasks never own Threads. A message gets a task, a message gets a Thread, and they meet only
because they share the anchor message ([ADR 0015](../adr/0015-tasks-are-promoted-messages.md)).

## Lifecycle

- A human can atomically create a message as a task or idempotently promote an existing top-level
  Channel or DM message.
- An Agent claims a message before doing any tool-using work on it. Claiming a message nobody had
  promoted promotes it, with `origin` `claimed` — distinct from a human's `converted` (Convert to
  Task) and `composed` (created as a task). A claim is a concurrency lock, so it fails closed
  against a claim someone else holds.
- When finished work turns out to need no feedback, the Agent sets `done` itself instead of
  parking the task in `in_review`. The composed Agent prompt under `apps/computer/src/harness/`
  carries this rule and its tests.
- Each parent Chat allocates monotonic task numbers while its Chat row is locked.
- Status is `todo`, `in_progress`, `in_review`, `done`, or reversible `closed`.
- Every task reads as one of two **tiers**, inferred from evidence rather than declared. A
  **background** task is an Agent's own claim — `origin` `claimed`, status `in_progress` or
  `done`, nothing its claimant said in its Thread, no Ask against it, never sent to review, and not
  left unfinished by its claiming run. It is an orchestration lock and a record. Everything else is
  **tracked**. A background claim turns tracked the moment its own claimant posts in its Thread, an
  Ask is raised against it, its status leaves `in_progress`/`done` — review, closure, a reopen — or
  its claiming run settles with the work still open. Only the claimant's Thread messages count: a
  peer Agent or a bystander replying there is the chatter a Thread exists to hold, and it must not
  drag somebody's bookkeeping onto a person's Board. Leaving that status range persists the stamp, so
  the tier only ever moves background to tracked and never flickers back.
- When the claiming run *completes* having answered in the task's own Chat, Server sets the task
  `done` through the ordinary update path. Only a finishing reply counts: the run's latest
  top-level reply must come after its last tool-shaped activity event (or the run used no tools),
  so an early "I'm on it" acknowledgment leaves the claim `in_progress` and tracked. Same-turn claimed work therefore finishes without
  passing through `in_review`, because nobody has to look at it. A claim the run did not answer —
  and every claim held by a run that failed, was interrupted, or was stopped, restarted, or reset
  by a human — stays `in_progress` and becomes tracked, which is the case a person should see.
  The Agent closing its own same-turn work is the primary path and this auto-resolve is a backstop:
  every edge it cannot prove deliberately leaves the claim open and tracked rather than closing
  work that may still be live.
- A task also reports `live`: true while its assignee Agent's in-flight run holds that task's
  message or Thread. Liveness is derived from the delivery ledger at read time; a run beginning
  and a run settling both emit `task.updated`, so nothing polls for it.
- Priority is `none`, `urgent`, `high`, `medium`, or `low`.
- Labels come from one small Server task-label catalog. Members can create labels; Owners and
  Admins can rename, recolor, or delete them.
- Claiming is one concurrency lock across human and Agent actors. The first valid claim owns the
  task and advances its version; competing claims at the same version fail without double
  ownership.
- Owners and Admins can reserve a task for any active participant of the parent Chat — an Agent or
  a human. Assigning an Agent wakes it with an assignment in its own inbox; assignment reserves and
  never claims, so the assignee still claims the task before starting. Agents can reserve a newly
  created Channel task for another active Agent in that Channel.
  Only the current assignee can unclaim.
- Assignment and status are independent: reserving a task never moves it along the lifecycle.
  Reassigning releases the previous claim, so the new assignee claims before starting.
- Done and closed tasks cannot be claimed, unclaimed, or assigned.
- Server closes an `in_review` task that has gone quiet for 7 days — no new message in its Thread
  and no change to the task itself. The close runs through the ordinary update path, so it bumps
  the version and emits `task.updated` like any other status change. Nothing records that Server
  rather than a person closed it: the task carries no actor or reason for a status change, and a
  human reopens it through the same update path.

Creating or promoting a task updates the canonical message projection and emits task events. It
adds no state-change line to the parent Chat. When an Agent directly assigns a newly created task
to another Agent, the assignment goes to that Agent's inbox as work, not as a message: nothing is
written to the conversation, so there is nothing for the App to filter out of the transcript or the
unread count. A person sees the assignment as the task mark on the message — one of the marks
[Chat](chat.md#in-the-box) covers. The canonical task message remains the only task record.

Every lifecycle mutation after creation carries `expectedVersion`. Stale assignment or metadata
writes fail and the Server UI waits for Server state rather than inventing durable optimistic task
records.

## Work surface and authorization

Promotion does not create the Thread. The deterministic hosted child Thread anchored to the
canonical message materializes when someone first replies in it, under the same
`cht_thr_<anchor>` id it always had. Until then the task still reports that `threadChatId`, the
deep link still opens, and the Thread reads as what it is: no replies, nothing unread, nothing
followed. Deliberately following such a Thread materializes it; nothing else does, and the
claimant's follow is attached the moment the Thread appears. Opening a task opens that Thread.
The Thread has no independent membership: Server membership and parent-Chat participation remain
the sole access authority.

Agents use the Task Thread for progress and execution discussion. Claiming a message does not
reroute the originating conversation: replies reuse the exact target where the human's message
arrived, while task-specific follow-up belongs in the Task Thread. A human-named delivery target
always wins, and `here` means the human instruction message's target.

Task lists, eligible assignees, messages with task projections, task events, and Thread reads all
apply the same hosted Server and parent-Chat authorization. Revoked members and humans who lose
parent-Chat access cannot continue reading or mutating the task.
Removing a human member or retiring an Agent releases their claims and assignments. Reinvitation
or reactivation does not restore those links or access to task Threads from the former membership
stint.

## Server UI and realtime

The hosted `/s/<slug>` Server UI provides List and Board lenses; the Linear-style List is the
default, and it opens on active work — done and closed tasks are a deliberate widening carried as
`?view=all`. The List leads with the `in_review` group, titled **Needs your review**, because a
task waiting on a person is the only kind a reader can finish by looking at it. The Board keeps
lifecycle column order, so it still reads as a pipeline. List rows are dense and display-only — priority glyph, task number, status disc, title,
labels, origin Chat, updated time, and assignee avatar — while create, claim, unclaim, assignment,
status, priority, and task-label controls live on the Board cards and the Task Thread. Right-clicking
either a List row or Board card opens the same task actions: open, status, priority, assignment,
labels, claim/unclaim when eligible, parent-Chat navigation, and a copyable task link. Both lenses
order the tasks inside a group by priority, urgent first. Loading, empty, filtered-empty, and
authorization failures are explicit. The Tasks topbar owns the chat-scope filter, layout, and creation controls —
`?chat=<chatId>` carries the scope, and each chat's name menu deep-links here
pre-scoped; Server-wide
search opens from the contextual sidebar and finds tasks through their canonical Chat messages;
the ordinary Chat composer sends messages only, while existing top-level messages can be promoted;
the contextual sidebar owns saved views and label filters. Opening a task from either lens shows
its Thread work surface in a dialog over the tasks page — `?task=<messageId>` owns the open task,
so deep links and Back work — while "View in channel" and artifact opens navigate to the parent
Chat. Inside a Chat, opening a task still uses the chat-owned Thread side pane. A Task Thread is
titled by its task (`Task #4`) in both hosts and shows the current status, assignee, creator, and
parent Chat beneath its anchor message; the anchor's own task mark is suppressed there, so no fact
appears twice on one screen. Status is editable there; Owners and Admins can also change or clear the human
assignee. Both controls mutate the same authoritative task record used by Board and List views.

Both lenses read the same query, and it excludes background-tier tasks by default and reports how
many it hid, so an Agent's own bookkeeping never crowds the surface a person reads.
`includeBackground` widens it to everything. The Tasks topbar spends that count on one quiet
control — `N background` — which carries the widening as `?background=on`; it disappears entirely
on a Server that has no background claims. In the widened lens those rows and cards wear a muted
`background` word rather than a chip, because a background task is an ordinary task seen from a
lens the reader opened, not a task with a special status. Finished background claims still sit
outside the resting `active` view, so widening the tier does not also widen the lifecycle.

Concrete durable events (`message.created` for a newly composed task, `task.created`, `task.updated`, and
`task.label.updated`) notify the Haus App. The hosted realtime hook owns exact task-list, label-catalog,
and affected-message invalidation; cursor catch-up applies the same invalidations after reconnect.

In Chat, a task's identity is a **task chip** in the header of the recessed Thread surface beneath
the message: the task number owns the left edge, only the status disc carries lifecycle color, and
the assignee appears by avatar and display name. It shares that header with the Ask marker and the
Cloud Agent work header — one chip grammar for everything with a lifecycle a reader follows — and
the reply count trails it. The message's author line carries provenance only: the automation and
session marks explain how the message came to be said
([ADR 0026](../adr/0026-automation-provenance-rides-the-agents-message.md)).

The chip is a label, not a second target: the whole surface is one button into the Thread, named for
what it opens (`Open thread, Task #1, 2 replies`). The surface is the Thread's own card, so it
appears once that Thread holds a reply and never as an empty frame announcing `0 replies`; the chip
states the task there from the first reply on. When the task's Thread contains queued or running
[Cloud Agent work](../../specs/cloud-agents.md), that work's status trails the chip in the same
header.

**Chat hides the tasks Agents claim for themselves.** A claim is bookkeeping an Agent keeps on its
own work, and almost every one is over inside the turn that opened it, so by default a task with
`origin` `claimed` states nothing in Chat: no chip, no card, no room reserved. Its Thread is still
a Thread — replies under one read as the ordinary recessed card, without the task's title — and the
task itself is unchanged on the Tasks page and its `?task=` link. A task a human made (`composed` or
`converted`) always shows its chip and surface, whatever the setting says, because a person made it
on purpose. Tier changes nothing here: it stays a lens on the Board and List.

The **Show tasks in chat** preference (Settings → Preferences → Chat) turns the claims back on, and
with it every task reads the way a human-made one does. It is off by default and per device, stored
in `localStorage` under `haus.chat.showTasks`. The command palette carries the same switch as one
entry that reads as what pressing it does — `Show tasks in chat` while they are hidden, `Hide tasks
in chat` while they are showing.

The native iPhone app mirrors both lenses: the same rule hides a `claimed` task's whole ingress in
Chat behind the same per-device **Show tasks in chat** preference, and the Task list carries the same
`N background` widening ([iOS internals](../internals/ios.md)).

A claim nobody finished is the one case a person needs told, and it is told in the
[Inbox](inbox.md) rather than in Chat: a `claimed` task still `in_progress`, stamped tracked because
its run settled without answering, and not `live`, appears under **Needs you** as the Agent that
stopped, what was asked, and the way into the task.

Opening the task's Thread states it in full in the metadata panel above the anchor, so the anchor
drops its own chip there.

There is no task calendar, due date, or `scheduledFor` field. Scheduling belongs to reminders, not
tasks.

## Managed CLI boundary

The managed `haus task list|create|claim|unclaim|update` commands use the
Computer's loopback runner authority and the hosted Server task API. A claim
that loses to a standing claim is refused with a structured `claimConflict` the
CLI renders: who holds the lock, when that was observed, that it blocks
starting conflicting implementation or change work, and an illustrative list of
what it does not block. It is a concurrency lock, not a ruling on who owns the
lane; correcting a misroute happens in the original Thread. See
[Agents API](../api/agents.md#task-routes). Agent
identity comes only from the scoped runner credential. A human-composed task
enters the same durable inbox and wake path as its canonical Chat message;
structured task metadata rides the drain, read, check, and search projections.
An unassigned task remains `todo` until an Agent deliberately claims it.
An Agent-created peer assignment follows the task Thread for the assignee and enters the same
durable delivery path as direct attention. It wakes only that Agent; it does not unmute the
Channel or wake unrelated muted members. Task creation carries an idempotency nonce so retries
cannot create duplicate task messages.

## Coordination handoffs

When a user gives an explicit cutoff for independent task lanes, the coordinating Agent works to
that cutoff instead of waiting indefinitely for every assignee. It delivers the useful result
available so far, identifies which inputs arrived and which remain pending, and treats silence as
unknown. A missing reply is not approval, negative evidence, or completed work.

## Deliberate exclusions

Also excluded: task scheduling, attachments, deletion, dependencies, epics, generic
workflow machinery, and generic taxonomy infrastructure.
