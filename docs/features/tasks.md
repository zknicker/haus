---
summary: Tasks in the App — a Task as a place started by an Agent from a Channel message, its page with conversation and attached work, the Channel preview under its origin message, the sidebar's open Tasks, the flat Tasks page, following, and Task keys on Channels.
read_when:
  - changing the Task page, its started-from element, Details, or the attached-work panel
  - changing the Channel's Task previews under an origin message
  - changing the sidebar's open Task rows or the Tasks page and its filters
  - changing how a person follows, unfollows, or sees a Task as unread
  - changing a Channel's Task key setting
---

# Tasks

[ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md) is the decision and
[specs/tasks.md](../../specs/tasks.md) the rules the Server enforces. This page is what a person
sees. Haus has two kinds of place: Channels and DMs for conversation, and Tasks for work. A claim
is a different thing: an Agent's lock on a message ([Claims](claims.md)).

## Where a Task comes from

An Agent starts a Task when its reply will not finish the work: the work needs more steps, more
time, or a Worker. A person asks an Agent; there is no button to create a Task. The Task
starts from a message in a Channel and takes that Channel's key, so the first Task from
`#security` might be `SEC-12`. One message can carry several Tasks.

A Task is `todo`, `open`, `done`, or `canceled`. It ends only when someone says so: an Agent or a
person marks it done or canceled, and a merged pull request never does. Posting in a done or
canceled Task reopens it.

## In the Channel

Under the message it started from, each Task shows a preview: its key, title, state, and its
newest messages, shaped like a reply preview. Pressing it opens the Task.

## The Task page

`/tasks/SEC-12`. The conversation is on the left, with a "started from" element at the top that
points back at the origin message. It works like a Channel: messages, mentions, unread, and a
composer.

On a wide enough pane, a right-hand panel on the page background, with no dividing border, holds
the Task's Details (state, assignee, priority, labels, due date) and its attached work: one card
per Worker, each attached pull request no card names with its state, checks, and review, and any
reminder the Agent set on the Task, such as "checks back at 7:35".

A Worker card names its place and repository, wears its status as a chip, and links the pull
request its reports named. Under that sit the newest report in full, the ask with the person it
names, and the Drive files it cites, each opening at the cited revision. One muted line states the
most urgent live fact: why an unreported turn failed, a working turn gone quiet, a stop in flight,
a follow-up waiting on the working turn, the wait for a slot, or the latest activity. A settled
report has no line. The card ends in a composer while its Worker is open. What a person sends posts
in the Task and becomes the Worker's next turn, and while a turn is live and the field is empty
the send button is Stop. In the conversation, a report and a person's follow-up each carry a
context line naming the Worker and its place; pressing it shows the card.
On a narrower pane, the band's Details control opens the same Details.

**Mentioned in** lists the messages that reference the Task. A section with nothing to list is
absent. **Copy reference** copies the bare key, which is what a message references.

A Task from before Tasks were places has no conversation and reads as history. An address that no
longer resolves says **Task not found**.

## Sidebar

The sidebar lists every open Task on the Server, each with its state. Todo Tasks are not listed,
and a Task leaves the sidebar as soon as it is done or canceled.

## The Tasks page

One flat page lists todo, open, done, and canceled Tasks, with no boards and no columns. Open work
comes first, then todo, then ended Tasks newest first. Filters for state, key, assignee, and label
live in the URL (`?state=`, `?key=`, `?assignee=`, `?label=`), so a link, a reload, and Back keep
them. A person can change a Task's state and reassign it here, but not create one. Nothing paints
until the list answers.

## Following and unread

A Task is unread only for its followers: the author of the origin message, anyone mentioned in
it, anyone who has posted in the Task, and its assignee. Anyone can follow or unfollow a Task by
hand. An unread Task appears in a follower's [Inbox](inbox.md) the way an unread Channel does. For
everyone else a Task is a quiet sidebar row and never reaches their Inbox.

## Task keys

The Server keeps a ledger of keys, each numbered on its own. Every Server starts with `GEN`. A
Channel's settings choose its key, and Channels can share one. A Task keeps the key it started
with.

## iPhone

iPhone opens a Task as a chat with a small attached-work header, and Channels show the Task
previews. iPhone has no Tasks page.
