---
summary: The Tasks product in the App — boards in the sidebar, the Board and List lenses, cards and cross-column moves, the Task page, Board settings, and what the App derives (the active warning, the Working mark).
read_when:
  - changing the Board or List lens, cards, column warnings, or the done cap
  - changing the Task page, its properties rail, Mentioned in, or Reminders rows
  - changing Board settings, the column editor, or archiving a board
  - changing the sidebar's Tasks row or New board
---

# Tasks

[ADR 0051](../adr/0051-tasks-are-boards-and-claims-are-the-lock.md) is the decision and
[specs/tasks.md](../../specs/tasks.md) the rules the Server enforces. This page is what a person
sees. A claim is a different thing: an Agent's lock on a message ([Claims](claims.md)).

## Sidebar

One **Tasks** row. While a Tasks page is open it expands to every board, each with its open count,
then **New board**; on any other page it stays one row, and its boards are not even read. The
expansion follows the route, so there is no chevron. `/tasks` is an address: it lands on the last
board viewed, or the first.

## A board

The band reads Haus › Tasks › board and ends with the lens toggle, **New task**, and the board's
options (Board settings, Manage labels for owners and admins, Archive board).

Under it sit the filters (assignee, label) and the board's one line of state, `19 open · 11 done`.
The lens and both filters live in the URL (`?view=list`, `?assignee=`, `?label=`), so a link, a
reload, and Back keep them. Filtering happens in the App over one `task.list` read, so a filter
never changes what the board warns about.

**Board** shows the columns in position order on the stock Kanban, each with its category disc,
name, and count. A card shows its key, assignee, title, priority, labels, and due date. Cards read
by priority then age, because that is the order an Agent picks in; done and canceled columns read
newest first. A Task has no position within a column, so a drag changes its column and nothing else.

- **Moving** is optimistic (`useMoveTask`): the card lands under the pointer, and a refusal puts it
  back and says why in a toast. Right-clicking a card reaches any column without a drag, and opens or
  copies the Task's reference.
- **Working** marks a card in an `active` column whose assignee Agent is running a turn right now. It
  reads the shell's one current-activity read, so it costs no request. It does not know which Task
  the turn is for.
- **`Forge holds 2 active tasks`** warns on the first active column holding one of that Agent's
  Tasks. An Agent works one Task at a time; the Server allows a second, and the board says so.
- **Done** columns show the newest ten, then **Show N more**.
- **Canceled** columns stay folded behind a `Canceled · N` button at the end of the filter row.

**List** shows the same columns as sections of dense rows, with the same fold and the same cap.

Nothing paints until the read answers: an unresolved board is not an empty one.

## A Task

`/tasks/SEC/12`. The title edits in place: press it, Enter or blur saves, Escape leaves. The
description is markdown, rendered until **Edit description** opens its source, because that source
is also what an Agent reads and writes. Files attach by a link in it.

The rail holds what can change, each fact its own control: Status (a column of the board), Assignee
(Agents, then people), Priority, Labels, and Due; then Board, Created, and Updated. A refused edit,
such as a stale version, shows in a toast.

**Mentioned in** lists the messages that reference the Task, newest first, and **Reminders** the
Reminders that name it. A section with nothing to list is absent. A mention opens the Thread on its
message; one that is a Thread reply opens that Thread. Its row says Thread and not the Channel,
because `task.get` names the Thread's Chat and reading each parent would fan out; the parent is read
when the row is pressed.

Opening a Task clears its Inbox item; a Task in a hidden desktop tab has not been opened yet. An
address that no longer resolves (a re-keyed board, a mistyped number) says **Task not found**.

**Copy reference** in the band copies the bare key, which is what a message references.

## Board settings

One modal, and nothing saves until **Save**: name, key, and the column list (drag to reorder, a name
and a category per row, **Add column**). The editor locks what the Server would refuse: the last
`todo`, `active`, or `done` column cannot be removed or recategorized. Removing a column that holds
Tasks asks which saved column they move to, and Save stays off until it knows. A conflict shows
plainly at the end of the dialog. Saving a new key moves the board's address, so its page falls back
through `/tasks` to the same board.

The General board keeps its key and cannot be archived. Archiving any other board takes it out of
every list and refuses it new Tasks.
