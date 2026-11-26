---
summary: Tasks in the App — a Task as a place an Agent starts from a message, named by a short id, active or archived; its page with conversation and attached work, the Channel preview under its origin message, the sidebar's active Tasks, the flat Tasks page, and following.
read_when:
  - changing the Task page, its started-from element, Details, or the attached-work panel
  - changing the Channel's Task previews under an origin message
  - changing the sidebar's Task rows or the Tasks page and its filter
  - changing how a person follows, unfollows, or sees a Task as unread
  - archiving or unarchiving a Task in the App
---

# Tasks

[ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) is the decision and
[specs/tasks.md](../../specs/tasks.md) the rules the Server enforces. This page is what a person
sees. Haus has two kinds of place: Channels and DMs for conversation, and Tasks for work. A claim
is a different thing: an Agent's lock on a message ([Claims](claims.md)).

## Where a Task comes from

An Agent starts a Task when its reply will not finish the work: the work needs more steps, more
time, or a Worker. A person can also start one from Home's composer, in a Project; it wakes
nobody. One message can carry several Tasks.

A Task is named by a short id, eight lowercase letters and digits like `k3mq7xta`. It has a
title, a description, and no state, priority, due date, labels, or assignee; those belong to an
Issue. A Task is active or archived. Archiving it cancels its pending reminders and closes its
Workers; a merged pull request never does. Unarchiving it makes it active again.

## In the Channel

Under the message it started from, each Task shows a preview: its title and its newest messages,
shaped like a reply preview. Pressing it opens the Task.

## The Task page

`/tasks/k3mq7xta`. The conversation is on the left, with a "started from" element at the top that
points back at the origin message. It works like a Channel: messages, mentions, unread, and a
composer.

On a wide enough pane, a right-hand panel on the page background, with no dividing border, holds
the Task's description and its attached work: one card per Worker, each attached pull request no
card names with its state, checks, and review, and any reminder the Agent set on the Task, such
as "checks back at 7:35".

A counted **Workers** section lists one two-line row per Worker: a status glyph and the title, then
its needs-you question or place, and its age. Selecting a row opens the Worker; the row itself never
expands. A
counted **Pull requests** section lists the Task's pull requests. Opening a Worker opens its own place
through the same Open path as an Agent profile: on desktop a tab in the right pane beside the Task,
on the web a navigation like any other place. The Worker's page reads like a channel: the brief from the Agent, the Worker's output as a
message from the Worker with its provider logo, centered "Finished, worked for 28m" rows between
turns, its tool steps as a collapsed "Worked for…" group of tool calls inside its message, and a
docked composer whose send button is Stop while a turn is live and the field is empty. In the
conversation, a report is a centered muted line ("Fix iPad composer baseline needs you, worked
for 17m") and a person's follow-up carries a "To Worker on Cursor" context line. Both open the
Worker's place.

**Mentioned in** lists the messages that reference the Task. A section with nothing to list is
absent. **Copy reference** copies a Markdown link to the Task, which is what a message
references.

A Task from before Tasks were places has no conversation and reads as history. An address that no
longer resolves says **Task not found**.

## Sidebar

The sidebar lists every active Task on the Server. A Task leaves the sidebar as soon as it is
archived.

## The Tasks page

One flat page lists Tasks, with no boards and no columns: active Tasks first, newest first, then
archived ones by archive time. One State filter (active or archived) lives in the URL
(`?state=`), so a link, a reload, and Back keep it. A person can archive or unarchive a Task here,
but not create one. Nothing paints until the list answers.

## Following and unread

A Task is unread only for its followers: whoever started it, the author of the origin message,
anyone mentioned in it, and anyone who has posted in the Task. Anyone can follow or unfollow a
Task by hand. An unread Task shows its unread state on a follower's sidebar row the way an unread
Channel does, and counts toward the desktop dock badge. For everyone else a Task is a quiet
sidebar row.

## iPhone

iPhone opens a Task as a chat with a small attached-work header, and Channels show the Task
previews. iPhone has no Tasks page.
