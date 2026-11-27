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

An Agent starts a Task when its reply will not finish the work: the work needs more steps or more
time. A person can also start one from Home's composer, in a Project; it wakes
nobody. One message can carry several Tasks.

A Task is named by a short id, eight lowercase letters and digits like `k3mq7xta`. It has a
title, a description, and no state, priority, due date, labels, or assignee; those belong to an
Issue. A Task is active or archived. Archiving it cancels its pending reminders; a merged pull request
never does. Unarchiving it makes it active again.

## In the Channel

Under the message it started from, each Task shows a preview: its title and its newest messages,
shaped like a reply preview. Pressing it opens the Task.

## The Task page

`/tasks/k3mq7xta`. The conversation is on the left, with a "started from" element at the top that
points back at the origin message. It works like a Channel: messages, mentions, unread, and a
composer.

On a wide enough pane, a right-hand panel on the page background, with no dividing border, holds
the Task's description and its attached work: each attached pull request with its state, checks,
and review, and any reminder the Agent set on the Task, such
as "checks back at 7:35".

A counted **Pull requests** section lists the Task's pull requests.

**Mentioned in** lists the messages that reference the Task. A section with nothing to list is
absent. **Copy reference** copies a Markdown link to the Task, which is what a message
references.

A Task from before Tasks were places has no conversation and reads as history. An address that no
longer resolves says **Task not found**.

## Sidebar

The sidebar lists every active Task on the Server. A Task leaves the sidebar as soon as it is
archived.

## The Tasks page

One flat page lists Tasks under three tabs, as Capy's Threads: **My tasks** (the Tasks you
started), **All tasks**, and **Archived**, newest first. The tab lives in the URL (`?view=`), and
the tabs stay up on an empty tab, so Archived is always one click away. A row shows the title, the
code of each Issue linked to it, its Machine and model, its activity (Working, Waiting, Idle,
Failed, or Needs you), and its age. A person can archive or unarchive a Task from a row's menu;
Tasks start from Home. "Copy reference" escapes brackets in the title, so `[Bug] Crash` still
pastes as one `task://` link. Nothing paints until the list answers.

## Following and unread

A Task is unread only for its followers: whoever started it, the author of the origin message,
anyone mentioned in it, and anyone who has posted in the Task. Anyone can follow or unfollow a
Task by hand. An unread Task shows its unread state on a follower's sidebar row the way an unread
Channel does, and counts toward the desktop dock badge. For everyone else a Task is a quiet
sidebar row.

## iPhone

iPhone opens a Task as a chat with a small attached-work header, and Channels show the Task
previews. iPhone has no Tasks page.
