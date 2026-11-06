---
summary: Decision to split today's message tasks in two — the claim (a hidden, Agent-only concurrency lock on a message) and the Task (a standalone, assignable work item on a shared board with custom columns mapped to fixed categories) — with no comments or attachments, discussion by reference, Agents working their queue one task at a time, a person's assignments arriving as Inbox items, one sidebar Tasks row that expands to its boards, and Reminders tied to Tasks by reference rather than anchor. Supersedes ADR 0015's "no separate work tracker" stance; implemented.
read_when:
  - changing task storage, boards, columns, numbering, assignment, or the task CLI
  - changing claims, claim-before-work, or the `message_tasks` table
  - changing the Tasks page, task chips, task references, or Convert to Task
  - deciding how an Agent picks up, paces, or splits work, or what it does with a blocked Task
  - deciding whether a Reminder can anchor on something other than a message
  - changing what the Inbox shows besides unread Chats and Threads, or the sidebar's Tasks row
---

# ADR 0051: Tasks Are Boards; Claims Are the Lock

## Status

Accepted 2026-11-03. Implemented 2026-11-04, with the deviations listed below; the rules the Server
enforces live in [specs/tasks.md](../../specs/tasks.md). Supersedes
[ADR 0015](0015-tasks-are-promoted-messages.md)
in two respects: a separate work tracker now exists, and its "a dated follow-up is a reminder
anchored on the task message" line is replaced by decision 8 below. ADR 0015's claim mechanics —
claim before work, origin, tiers, `tracked_at`, auto-resolve, `live` — stand, now under the name
*claim*. Amends [ADR 0037](0037-humans-are-addressed-by-mention.md): a person can be assigned a
Task, though still never a claim. Amends [ADR 0050](0050-the-inbox-renders-what-is-waiting.md):
a Task assigned to a person is an Inbox item beside unread Chats and Threads.

## Context

Haus tasks are messages promoted with metadata. Their real job is a lock: when a request lands in
a Channel, one Agent claims it so no other Agent works it too. Most claims are background
bookkeeping, hidden from the default Board and from Chat, and only Agents can hold one.

That primitive is right, but it is not a work tracker. On the production Server, Zero filed about
40 security issues and assigned them across several Agents and Zach. That is a queue: items that
stand on their own, outlive any one request, go to people as well as Agents, and are triaged on a
board. A message-anchored, Agent-only, per-Chat-numbered lock cannot hold it, and stretching it to
would put weeks-long work on top of a primitive whose value is that nobody has to look at it.

The built-in Linear integration covered this but was too heavy for Haus and was removed
(2026-11-03). Haus needs a small tracker of its own: no workspaces, no teams, every member and
Agent can see it.

## Decision

1. **Two nouns.** A **claim** is a lock on a message: today's `message_tasks` row, its claim rules,
   and its tiers, renamed. A **Task** is a standalone Server record on a board. They never share a
   row, a number, or a status. Claims leave the nav entirely; *Tasks* in the nav is the board
   product. An Agent's stopped-before-finishing claims move to its Agent profile.

2. **A Task is not a Message.** It carries a title, a markdown description, a board and column, at
   most one assignee (a person or an Agent), a creator, created and updated times, and a priority
   and labels (the existing task-label catalog moves here; claims lose priority and labels). A
   display-only due date is allowed: it sorts and badges, and it wakes nothing. There is no
   deletion; a Task ends in a done or canceled column. Every mutation carries `expectedVersion`.

3. **Boards with keys, columns with categories.** The Server has any number of boards. Each has a
   short key (`SEC`), so its Tasks read as `SEC-12`, numbered per board. Any member, human or
   Agent, can create a board and add, rename, reorder, or remove its columns. Every column maps to
   one fixed **category**: `backlog`, `todo`, `active`, `done`, or `canceled`. Category is what code
   and Agents reason about ("what is open and mine?"); the column name is presentation. A board
   always has at least one `todo`, `active`, and `done` column. A new board starts with Backlog,
   Todo, In progress, Done, and Canceled. A Task stays on its board; moving across boards is out of
   scope.

4. **No comments, no attachments.** Discussion happens in Channels and Threads, as for everything
   else in Haus. A message that references `SEC-12` records a `task://` rich reference when it is
   written, and the Task shows those messages as **Mentioned in**, newest first. That is the Task's
   activity, computed, never a second conversation store. Files attach by link in the description.

5. **Assignment wakes through the Agent inbox.** Assigning a Task to an Agent writes a
   `task_assignment` inbox item keyed by the assignment identity; reassigning or unassigning before
   delivery withdraws it. Assignments coalesce like any inbox item: ten assignments wake an idle
   Agent once with one notice ("10 tasks assigned to you"), and assignments that land while it is
   busy fold into the notice at its next safe boundary. Assigning a person puts one item per
   Task in their **Inbox**, in the same feed as unread Chats and Threads; assignments never
   bundle there, because the Inbox is worked one item at a time. An item shows the board, the
   key, who assigned it, the title, priority, due date, and current column, and under that its
   **context message**: the newest message that references the Task, which is usually the one
   that assigned it or last acted on it. The item's composer replies in a Thread on that message,
   so discussion stays where the Task already lives and lands in its Mentioned in. The item
   resolves the Task in place: **Start**, **Done**, and **Won't do** move it to the board's first
   `active`, `done`, or `canceled` column, a status picker reaches any column, and each clears the
   item with an Undo. Mark read clears it without moving the Task, and opening the Task clears it
   too; being seen never does. Reassigning before it clears withdraws it. There is no separate
   Assigned to me page. An assignment from someone else also pushes to the person's iPhone and,
   while Haus is in the background, raises a desktop notification. A burst does not raise one alert
   per Task: assignments landing together collapse to one ("Zero assigned you 6 tasks") that opens
   the Inbox, which still holds a card per Task.

6. **One active Task at a time.** An Agent already runs one turn at a time
   ([sessions](../../specs/sessions.md)). The prompt adds the pacing: list your assigned Tasks, pick
   by priority then age, move that one into an `active` column, and work it. Moving the card is
   the status update; the Agent posts in a conversation only when it needs a person or has a
   result worth sharing. The Server does not lock a second active Task; the board flags an Agent
   holding more than one. Parallelism is deliberate: an Agent may hand a Task to a Cloud Agent run,
   which already reports back as a typed continuation. A Task **blocked on a person** gives up its
   turn: the Agent @mentions them with its key where the work lives, moves the card back to `todo`,
   takes the next Task, and leaves it until they answer.

7. **Finishing pulls the next.** Moving a Task into `done` returns a CLI receipt that names what is
   still waiting ("3 more assigned to you in todo"), so an Agent works through its queue without a
   scheduler. The daytime heartbeat is the backstop: its report names assigned Tasks that have sat
   in `todo` with the Agent idle. Chat requests interleave freely between turns; the active card
   holds the Agent's place. A blocked card sits in `todo` with no status or field to mark it, and
   the receipt still counts it. That is behavior guidance, not Server state: the Agent stops when
   only blocked Tasks remain, and a heartbeat reads its @mention under Mentioned in and leaves that
   Task out, since waiting on a person is not a stalled queue.

8. **Reminders stay message-anchored and tie to Tasks by reference.** A Reminder's anchor is where
   the Agent answers when it fires ([ADR 0016](0016-reminders-are-the-scheduling-primitive.md)), and
   a Task has no Chat to answer in. "Come back to `SEC-12` Friday" anchors on a message where that
   work lives (its Thread, or the Agent's DM) and names `SEC-12` in its description. The Server
   records that reference at write time, so the Task shows its Reminders the same way it shows
   Mentioned in. Reminders, Triggers, and Tasks stay three things: a time to wake, an outside event
   to wake on, and work that exists.

9. **Claims keep their machinery and lose their human surface.** Humans no longer create or convert
   claims. **Convert to Task** on a message creates a Task whose description links back to the
   message, and records the reference. Existing human-composed and converted `message_tasks` rows,
   which were backlog items all along, migrate onto a default board; Agent claims stay claims.

10. **One sidebar row.** The sidebar carries a single **Tasks** row. While a Tasks page is open it
    expands to list the boards and New board; everywhere else it stays one row. Boards are never
    pinned in the sidebar, and a person's own work reaches them through the Inbox (decision 5).

## Agent surface

Prompt text for each primitive stays one line: work to do is a Task; a time to wake is a Reminder;
both is a Reminder that references the Task. The CLI splits accordingly:

- `haus claim` — today's `haus task claim`, `unclaim`, `update`, `assign`, `unassign`, unchanged in
  behavior.
- `haus task` — `list` (defaults to mine, open categories), `show`, `create --board`, `move
  --column`, `update`, `assign`. `haus board` — `list`, `create`, and column edits.

Raft's `### Tasks` section and command family describe what Haus will call claims. Renaming them
diverges from Raft-verbatim text: the Tasks, command-family, envelope-marker, and open-task claim
line rows in the [divergence register](../../specs/raft-alignment/prompt-divergences.md) each change,
and the prompt cap moves with the new `haus task` and `haus board` text. The alternative — keep
`task` as the claim and name the board product something else (Issues) — keeps Raft parity but puts
the plain word *task* on the thing nobody looks at. The product name wins.

Splitting work follows the same line. Raft's section tells an Agent to split big work into tasks
for others to claim; shared queued work now belongs on boards, so in Haus a subtask for another
Agent is a Task, created on a board and assigned. Claims stay for work inside a conversation: the
lock on a message, including a split that stays there. This is a deliberate divergence from Raft,
with its own register row.

## Consequences

- ADR 0015's `read_when` warning about "a separate work tracker" no longer applies; this ADR is
  that tracker's contract.
- Server: new `boards`, `board_columns`, and `tasks` tables through checked-in migrations; a
  `haus-api/tasks` and `haus-api/boards` feature pair; one subscription per event type
  (`task.onCreated`, `task.onUpdated`, `board.onUpdated`), with React Query owning recovery.
- `message_tasks` becomes the claim store. Its priority, label, and board/list lens columns and
  queries go; renaming the table itself is left to the implementation.
- Every member and Agent sees every board. Like Channels, boards have no private mode.
- Tasks add no Chat messages. Creation, moves, and assignment write nothing into a conversation;
  a person sees an assignment in their Inbox, and an Agent in its agent inbox.
- The Inbox read (`chat.unreadPreviews` today) gains Task assignment items, still one read for
  the whole feed.
- `CONTEXT.md` carries **Claim**, **Task**, **Board**, and **Column category**.

## Deviations

What shipped differs from the decisions above in five places:

- **The General board is fixed.** Every Server has a General board, key `GEN`, that cannot be
  re-keyed or archived, so a Task always has a board to land on. It can be renamed. Any other board
  keeps decision 3's rules.
- **Heartbeats read Tasks and never write them.** Decision 7's backstop stays a report: a heartbeat
  run lists and shows Tasks and boards, and a write answers `403 REGULAR_TURN_REQUIRED`. Its
  throwaway session changes nothing other people see.
- **Assignments by Agents spend the automation chain.** An Agent assigning another Agent counts as
  Agent-to-Agent automation, like any Agent wake; a person's assignment resets the chain. Decision
  5 did not say.
- **Closed Tasks lose a departing assignee.** Deleting an Agent or removing a member unassigns every
  Task they hold, closed ones included, so no Task names an assignee who is gone.
- **Chat menus do not link to Tasks.** Boards are not chat-scoped, so a Channel or DM menu carries
  no View tasks item. The sidebar's Tasks row (decision 10) is the way in.

## Resolved questions

- Does a person's assignment push? Yes, as decision 5 says, with bursts collapsed. The push window
  is the read grace, per person; the desktop window is one `taskInbox.list` read.
- Can a Task move between boards, keeping its old key as an alias? Not in v1. A Task stays on its
  board.
- Should claims trim their status set (drop `todo` and `in_review`) once humans no longer create
  them? No: claim statuses are unchanged.
