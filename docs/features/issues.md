---
summary: Issues in the App — the Issues page with Capy's For you, Assigned to me, Created by me, Mentioned and All tabs, Project, assignee and label filters, a list grouped by status and a board by status with drag to move; the Issue page with its property chips, linked Tasks, description, sub-issues, activity and comment box.
read_when:
  - changing the Issues page, its tabs, filters, list or board
  - changing the Issue page, its property chips, sub-issues, linked Tasks, activity or comment box
  - changing how the App reads or refreshes Issues
---

# Issues

An Issue is the backlog card ([specs/issues.md](../../specs/issues.md)). The App shows Issues at
`/s/:slug/issues` and each one at `/s/:slug/issues/<code>`. Issues sit in the sidebar footer
beside Tasks, in Cmd+K, and as their own desktop tab section.

## The Issues page

- **Tabs**, as in Capy: For you (Issues you subscribe to), Assigned to me, Created by me,
  Mentioned (your `@handle` in the description or a comment), and All. For you and Mentioned are
  `issue.list`'s `reader` lens; the others are its `assignee` and `creator` filters.
- **Filters**: Project and assignee narrow the read; label filters the rows. Tab, filters and
  layout live in the URL (`?view=`, `?project=`, `?assignee=`, `?label=`, `?layout=board`).
- **List**: one collapsible group per status (In progress, Todo, Backlog, Done, Canceled) with its
  count. A row shows the status, code, title, sub-issue progress ("3/6"), labels, due date,
  priority, assignee and age, and its menu changes the status or copies the code or link.
- **Board**: one HeroUI Pro `Kanban` column per status. Dragging a card, or its keyboard drag
  handle, to another column sets that status with `issue.update`; the card moves at once and
  settles to the Server's answer, or springs back on a refusal.
- **New issue** files one in a Project; Owners and Admins manage the label catalog from the band's
  menu.

## The Issue page

The code and age, the title, then chips for status, priority, assignee (a person, a Captain, or a
Task), due date and labels; each edits with `issue.update` under the Issue's version. Below:
the description, the linked Tasks with their activity, the linked Tasks' pull requests,
sub-issues with "x/y closed", and the activity feed (All or Comments) with its comment box. The
band carries Subscribe and the Issue menu.

## Freshness

Each Issue event has its own stream (`issue.onCreated`, `issue.onUpdated`, `issue.onCommented`,
`issue.onSubscriptionUpdated`, under `hooks/realtime/`), which invalidates the lists and the
details that hold the Issue. A mutation's answer writes the acked Issue into the cached reads
(`hooks/issues/issue-cache.ts`).
