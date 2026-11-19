---
status: accepted
summary: Haus has two kinds of place, Channels (and DMs) for conversation and Tasks for work. A Task is a Channel for one piece of work, started by an Agent from a Message in a Channel, with a state (todo, open, done, canceled), attached cloud agents and pull requests that report to it, followers who see it unread, and a key from a per-Channel ledger. Threads are migrated into inline replies and deleted; boards and custom columns go. Supersedes ADR 0013, ADR 0043, and the proposed Open Threads ADR 0051; amends ADR 0051 (Tasks), 0044, 0041, 0029, and 0026. Accepted 2026-11-17, shipped in Haus 19.0.0.
read_when:
  - deciding where an Agent posts work, progress, or a cloud agent outcome
  - changing Tasks, their states, origin Message, followers, keys, or the Tasks page
  - launching or attaching cloud agents or pull requests, or changing what wakes the delegating Agent
  - touching Threads, work Threads, the Open Threads lens, or the Thread migration
  - changing the sidebar's Task rows, Task unread, or Task presentation on iPhone
  - changing the Agent prompt's placement text
---

# ADR 0053: Channels and Tasks Are the Only Places

## Status

Accepted 2026-11-17. Shipped in Haus 19.0.0. Supersedes
[ADR 0013](0013-threads-are-child-conversation-containers.md),
[ADR 0043](0043-threads-are-unread-on-their-own.md), and the proposed
[ADR 0051 Open Threads](0051-open-threads-are-a-lens.md). Amends
[ADR 0051 Tasks](0051-tasks-are-boards-and-claims-are-the-lock.md),
[ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md),
[ADR 0041](0041-cloud-agent-cards-mirror-cursor.md),
[ADR 0029](0029-inline-replies-preserve-conversation.md), and
[ADR 0026](0026-automation-provenance-rides-the-agents-message.md). Consequences lists each change.

## Context

Three things each tried to be the home of a piece of work. Threads held work conversation, and
the Open Threads lens listed them. Cloud Agent work was a record any Message could link, with a
card, a Work panel, and a Runs list. Tasks lived on boards. An Agent had to pick a destination for
every message under about a dozen placement rules in prose, and a human had to hunt across all
three to find an outcome.

On 2026-11-16 in production, an Agent launched a cloud agent from a Thread and said it would
report there. It reported at the Channel root instead, 31 minutes after the last Run settled,
because a reminder fire must be answered top-level. All three run notices had been delivered and
seen; the rules sent the answer to the wrong place. Separately, Haus never wakes the delegating
Agent when a pull request becomes ready after its Run settles, so that moment passes silently.

## Decision

1. **Two kinds of place.** Channels and DMs hold conversation. Tasks hold work. There are no
   Threads. A side conversation stays in its Channel as inline replies.

2. **A Task is a Channel for one piece of work.** It has a title, a state (`todo`, `open`,
   `done`, `canceled`), an end, and attached work. It behaves like a Channel: messages, mentions,
   unread, notifications, and a composer. Priority, labels, and due date stay as they are today.
   A Task keeps a single assignee, human or Agent.

3. **A Task starts from a Message in a Channel.** The top of the Task shows a "started from"
   element that points at that Message. One Message can carry several Tasks. Tasks have no
   parents or children: an Agent that finds five issues posts one Message and starts five Tasks
   from it.

4. **Only Agents create Tasks.** A human asks an Agent. There is no create UI for humans, and
   Convert to Task goes away. Reminders and Triggers never create a Task themselves; they wake an
   Agent, which decides. When no suitable Message exists (a reminder fire, a Trigger event, the
   Agent's own finding, a request made in a DM), the Agent posts an origin Message in the Channel
   where the work belongs, mentions whoever asked, and starts the Task from it. For a reminder or
   Trigger, that is the Channel it is anchored in. Tasks never start in DMs: a request made in a
   DM gets a reply carrying the Task chip.

5. **An Agent starts a Task when its reply will not finish the work.** The work needs more steps,
   more time, or a cloud agent. When the reply is the whole of the work, the Agent just replies.
   A Task does not mark ownership; the claim, the hidden Agent-only lock on a Message, still does,
   unchanged. The prompt teaches this by saying what a Task is and how people see it, not with an
   if/else ladder.

6. **Work attaches to a Task and reports to it.** Cloud agents and pull requests attach to a
   Task. The CLI refuses to launch a cloud agent without a Task, and says why. A Task can hold
   several cloud agents or none. Run notices, pull request changes, and reminders set while
   working a Task all wake the Agent on that Task, and a plain send in that turn goes to the Task.
   A pull request becoming ready or its checks finishing after a Run settled is a new wake. Cloud
   agents stay a visible unit of work, and the Agent stays the human's liaison to them. Haus keeps
   the stored pull request readings built for the Open Threads work; attached pull request cards
   and the ready-after-settle wake read from them.

7. **The Channel previews its Tasks.** Under the origin Message, each Task shows a preview of its
   recent conversation, shaped like today's Thread preview, with its state.

8. **The sidebar lists every open Task on the Server.** Todo Tasks are not listed. A Task leaves
   the sidebar as soon as it is done or canceled; recently closed Tasks are on the Tasks page.

9. **A Task is unread only for its followers.** Followers are the author of the origin Message,
   anyone mentioned in it, anyone who has posted in the Task, and its assignee: being assigned
   makes you a follower. Anyone can follow or unfollow by hand. An unread Task appears in a
   follower's Inbox the same way an unread Channel does. For everyone else a Task is a quiet
   sidebar row showing its state, and never appears in their Inbox. There is no attention tier;
   [ADR 0038](0038-inbox-is-unread-not-attention.md) stands.

10. **One Tasks page.** It lists todo, open, done, and canceled Tasks on one flat page, with no boards and no
    custom columns. Humans can change a Task's state and reassign it, but not create one.

11. **Keys come from a ledger.** The Server keeps a ledger of Task keys (`SEC`, `TECH`, ...), each
    numbered on its own. Each Channel is configured with one key, and Channels can share a key. A
    Task takes the key of the Channel its origin Message is in. Existing boards become ledger
    entries, so their keys and numbers carry over.

12. **The Task page.** Conversation on the left. Attached-work cards for cloud agents and pull
    requests sit in a right-hand panel with no dividing border. The Runs list goes; the card shows
    the newest Run's summary in full with a status a person can read.

13. **A Task ends when someone says so.** An Agent or a human marks it done or
    canceled. A merged pull request never closes it. Posting in a done or canceled Task reopens it.

14. **Existing Threads become inline replies.** A one-time migration turns each Thread's messages
    into inline replies on its anchor Message in the parent Channel. Production had about 257
    Threads holding about 1,350 messages at rehearsal time. Then all Thread code is deleted, and no history-only
    Thread surface remains.

15. **iPhone ships in the same release, minimally.** A Task opens as a chat with a simple
    attached-work header, and Channels render the origin preview. iPhone has no Tasks page at
    first.

16. **A Task can hold a one-time reminder.** It wakes the Agent on that Task and shows on the Task
    page, for example "checks back at 7:35". Recurring reminders cannot be set on a Task; they
    anchor on a Channel, and a fire that turns up real work starts a Task as in decision 4.
    Closing a Task, done or canceled, cancels its pending reminders, and reopening does not
    restore them. If a check must happen after the work lands, the Task stays open until the
    check passes.

## Considered and rejected

- **Keep Threads as the unit and write better placement rules.** The rules were the problem; the
  2026-11-16 report followed them and still landed in the wrong place.
- **Treat cloud agents as execution evidence and hide them.** People need to see them as a unit
  of work: what is running, what it produced, and its pull request.
- **One Agent session per piece of work, as Claude Code does.** Each Agent keeps one long-lived
  session, the Raft model ([ADR 0011](0011-agents-own-one-global-session.md)).
- **A temporary "work channel" beside Tasks.** It collapsed into the Task: a Channel for one piece
  of work is what a Task now is.
- **Parent and child Tasks.** One origin Message carrying several Tasks covers splitting work
  without a hierarchy to maintain.
- **Human-created Tasks.** A human asks an Agent, so every Task has an Agent working it and an
  origin Message in a Channel.
- **A "Needs you" tier.** ADR 0038 deleted it for good reason; followers and unread carry the
  signal.

## Prior art

Devin Bots, launched 2026-11-17, pair a persistent Bot with parallel coding sessions and
coordinate in project channels. Cursor and Devin bind one unit of work to one Slack thread and
announce completion there. Linear attaches agent sessions to an issue and derives session state
from activity. Haus takes the binding of one unit of work to one place, makes that place a Task
rather than a thread, and keeps one session per Agent.

## Consequences

Superseded:

- [ADR 0013](0013-threads-are-child-conversation-containers.md) and
  [ADR 0043](0043-threads-are-unread-on-their-own.md): Threads, Thread follows, and Thread unread
  are gone. Task unread follows decision 9.
- [ADR 0051 Open Threads](0051-open-threads-are-a-lens.md), never accepted: the sidebar lists open
  Tasks instead, and the Task page replaces the Work panel. Its stored pull request readings are
  kept (decision 6).

Amended:

- [ADR 0051 Tasks](0051-tasks-are-boards-and-claims-are-the-lock.md): boards and custom columns
  give way to the flat Tasks page and the key ledger. "No comments" is reversed: a Task holds its
  own conversation. Humans no longer create Tasks, and Convert to Task goes. The claim stays as
  decided there. The separate Inbox assignment item is replaced by following: the assignee is a
  follower (decision 9). "A Task has no Chat" is reversed for reminders: a one-time reminder may
  anchor on a Task (decision 16). Columns reduce to the four states.
- [ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md) and
  [ADR 0041](0041-cloud-agent-cards-mirror-cursor.md): cloud work attaches to a Task, not to
  Messages or Threads. The card moves to the Task page's attached-work panel, and the Runs list
  gives way to the newest Run's summary.
- [ADR 0029](0029-inline-replies-preserve-conversation.md): its Thread placement text (progress
  Threads on the acknowledgment, cloud work Threads) no longer applies. Inline replies stand.
- [ADR 0026](0026-automation-provenance-rides-the-agents-message.md): a fire that starts real work
  creates a Task and reports there. A fire whose reply is the whole of the work still answers
  top-level.

Deleted:

- Work Threads and every other Thread, after the migration in decision 14.
- The launch placement rules, and the `CLOUD_AGENT_NEW_THREAD` refusal.
- The Work panel on Threads, the sidebar Threads section, and the peek dialog.

Follow-up:

- `specs/cloud-agents.md`, `specs/open-threads.md`, and `specs/tasks.md` need rewriting to this
  model.
- The Agent prompt's placement text shrinks. Every prompt change goes through the guarded prompt
  contract: the size cap, the divergence register, and `bun run test:prompt-contract`.
