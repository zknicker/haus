---
summary: The Issues contract (ADR 0062). An Issue is the backlog card of one Project, coded with that Project's key (GEN-12) from the Project's key ledger, with fixed states (Backlog, Todo, In progress, Done, Canceled), Capy's priorities, one assignee (a person, a Captain or a Task), a due date, labels, a parent, linked Tasks and pull requests, comments, and an activity timeline. The woken agent is derived from the assignee, claiming is compare-and-swap with `--expect-assignee`, and state changes only by explicit edits. Covers the record, codes, wakes, `issue_assignment`, references, the CLI and Agent routes, and what an archived Task hands back.
read_when:
  - adding or changing the Issue record, its states, priorities, assignee, due date, labels, parent, or links
  - changing Issue codes, the Project key ledger, or how numbers are allocated
  - changing who is woken by an Issue change, `issue_assignment`, `issue_event`, or Captain queues
  - changing `--expect-assignee`, `ISSUE_TAKEN`, or `haus task start --issue`
  - changing Issue comments, the activity timeline, sub-issues, or bare `GEN-12` references
  - changing `haus issue` or the `/api/agent/issues` routes
  - changing what happens to an Issue when its Task archives
---

# Issues

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) decides the model.
An **Issue** is the backlog card: what needs doing, who is on it, and where it stands. A
[Task](tasks.md) is the agent session that does the work; an Issue links the Tasks working on it.
Capy's issue API is the reference for every field below that this spec does not call a
divergence. Everything here is new in step 2 unless it cites current code.

## The record

```ts
type IssueState = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
type IssueStateType = 'open' | 'closed'; // backlog, todo, in_progress are open
type IssuePriority = 'urgent' | 'high' | 'normal' | 'low';

type IssueAssignee =
    | { kind: 'user'; userId: string }
    | { kind: 'captain'; agentId: string }
    | { kind: 'task'; taskId: string };

type IssueActor =
    | { kind: 'user'; userId: string }
    | { kind: 'captain'; agentId: string }
    | { kind: 'task'; taskId: string };

type Issue = {
    id: string; // `iss_`
    code: string; // `<key>-<number>`, e.g. GEN-12
    number: number;
    projectId: string; // the Project's channel Chat id
    title: string; // 1–500
    description: string; // markdown, ≤ 20,000
    state: { id: IssueState; type: IssueStateType };
    priority: IssuePriority; // default 'normal'
    assignee: IssueAssignee | null;
    dueOn: string | null; // a date, display only
    labelIds: string[]; // ≤ 20, from the Server's label catalog
    parentId: string | null;
    subIssueCount: number;
    closedSubIssueCount: number;
    creator: IssueActor;
    taskIds: string[]; // linked Tasks, newest first
    pullRequests: { repository: string; number: number; state: 'draft' | 'open' | 'merged' | 'closed' }[];
    version: number;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null; // set exactly while the state type is closed
};
```

- Wire shapes live in `packages/haus-api/src/issue.ts`, one schema per type above, validated at
  every boundary. The tRPC feature is `apps/server/src/haus-api/issue/`.
- `closedAt` is set exactly while the state is `done` or `canceled`, the same check the Task row
  enforces today (`apps/server/src/postgres/schema/tasks.ts:98-101`).
- Every mutation takes `expectedVersion` and fails closed with a conflict. Agent routes may omit
  it and take last-write-wins after bounded retries, as Task routes do today
  (`withImplicitVersion` in `apps/server/src/agent-api/task-route-shell.ts`).
- There is no deletion. Canceled is the end state for work nobody will do.
- The label catalog is today's `task_labels` table renamed `issue_labels`
  (`apps/server/src/postgres/schema/task-labels.ts`).
- Issues have no visibility field. Projects are open, so anyone who can read the Project reads
  its Issues.

### States

The five states are fixed and ordered. Nothing moves an Issue between them except an explicit
edit by a person or an agent: not a merged pull request, not a Task archiving, not its last
sub-issue closing.

| State | Type | Meaning |
| --- | --- | --- |
| `backlog` | open | Filed, not yet planned. Assigning here wakes nobody |
| `todo` | open | Planned and ready to start. The default for a new Issue |
| `in_progress` | open | Someone is on it |
| `done` | closed | Finished |
| `canceled` | closed | Will not be done |

### Priority

Capy's four: `urgent`, `high`, `normal`, `low`. `normal` is the default. Queues order by priority,
then by age.

## Codes

- An Issue's code is its Project's key and its number, `GEN-12`. Numbers come from the Project's
  key ledger, which becomes the Issue counter: the `task_keys` table renamed `project_keys`, one
  row per Project key with its `next_number`, allocated under the entry's row lock after the
  Server row lock, as `allocateTaskNumber` does today
  (`apps/server/src/tasks/task-key-ledger.ts:17`).
- `issues` is unique on `(key_id, number)`, written in the same transaction as the allocation.
- A number is never reused. The ledger's `next_number` only rises, so a new Issue never takes a
  code that a Task, a commit trailer or an older Issue once carried.
- An Issue keeps its code for life, including when its Project's key changes later; the key is
  fixed once the first Issue is filed ([projects.md](projects.md#key)).
- Tasks take no numbers ([tasks.md](tasks.md#identity)).

## Assignee and wakes

An Issue has at most one assignee. Assigning a Task links it; linking does not assign.

**The woken agent is derived, never stored.** On each change that wakes, the Server computes it
from the assignee in the same transaction:

| Assignee | Woken |
| --- | --- |
| An active Task | That Task's agent |
| A Captain | That Captain |
| An archived Task (only on a closed Issue, see [Archive](#when-a-task-archives)) | Its Captain, else nobody; its starter gets human unread |
| A person | Nobody; the person gets human unread and push |
| None | Nobody |

- The actor never wakes itself.
- Assigning while the Issue is in `backlog` wakes nobody. Moving an assigned Issue from `backlog`
  to `todo` or `in_progress` wakes as an assignment.
- A Captain auto-follows each Issue it creates or assigns. A follower sees the Issue in its lists
  and gets human unread if it is a person; an agent follower is woken by comments that @mention
  it and by state changes to `done` or `canceled`, and by nothing else.
- Other linked Tasks wake only when a comment @mentions them by link.
- A change made by a Captain's own crew Task rides that Task's crew report instead of waking the
  Captain separately ([inbox.md](inbox.md#crew-reports)).

**What wakes the derived agent.** An assignment to it, a state change, a comment, a sub-issue
closing when it was the parent's last open one (one wake), and a pull request change on a linked
pull request when no active Task owns that pull request. Title, description, priority, label and
due-date edits are activity only.

**Inbox items** ([inbox.md](inbox.md#issue-items)):

- `issue_assignment` replaces `task_assignment`. Identity `issue-assign:<issueId>:<version>`.
  Every queued assignment for one agent rides one run, up to 50, by priority then age, and a busy
  agent gets a count. Reassigning or unassigning before a run takes it retires it, as
  `applyTaskAssignmentChange` does today (`apps/server/src/tasks/task-assignment.ts:45`).
- `issue_event` carries a comment, a state change, or a closed last sub-issue. Identity
  `issue-event:<issueId>:<timelineEventId>`. Coalesced per agent per run, up to 50.
- An assignment or event from another agent spends the automation chain; a person's resets it.

**People.** Assigning someone other than yourself notifies them in the App and by iPhone push
after the read grace, as Task assignment does today (`taskAssignmentNotifiedUserId` in
`@haus/api`).

## Claiming

- `haus issue update GEN-12 --assignee <me|@handle|task:<id>|none> --expect-assignee <none|me|@handle|task:<id>>`
  writes only when the current assignee equals the expected one, else fails `ISSUE_TAKEN` naming
  the holder. Without `--expect-assignee` the write is last-write-wins under `expectedVersion`.
- The verb is `update --expect-assignee`, never `claim`, because a claim is the message lock
  ([claims.md](claims.md)).
- `haus task start --issue GEN-12` runs, in one transaction: check the Issue is open and its
  assignee is the caller or none (`--expect-assignee` defaults to that), create the Task, link it,
  assign the Issue to it, move a `backlog` or `todo` Issue to `in_progress`, and queue the Task's
  first turn. A retry with the same `requestId` returns the same Task. Two Captains can never
  staff the same Issue.

## When a Task archives

Archiving a Task ([tasks.md](tasks.md#archive)) hands each open Issue assigned to it back to the
Task's Captain, else to the person who started it, in the archive transaction, with an
`assignee_changed` activity row whose actor is the Server. A closed Issue keeps its archived Task
as assignee for history.

## Sub-issues

- `parentId` names another Issue in the same Project. A parent in another Project is refused with
  `ISSUE_PARENT_PROJECT`. Cycles are refused with `ISSUE_PARENT_CYCLE`.
- A sub-issue may have sub-issues. The App shows one level under each Issue, with
  "`closed`/`total` closed".
- A parent's state never moves on its own. When its last open sub-issue closes, the parent's
  derived agent gets one `issue_event`.

## Links

- **Tasks.** `issue_task_links (issue_id, task_id, linked_at, linked_by)`. A Task may link several
  Issues and an Issue several Tasks. A crew Task working one Issue displays "GEN-12 · title".
- **Pull requests.** An Issue shows the pull requests of its linked Tasks, plus pull requests
  linked by hand with `haus issue link GEN-12 --pr <url>`. Readings come from the Server's stored
  pull request readings ([github-app-connection.md](github-app-connection.md)).
- A pull request change wakes the active Task that reported the pull request, and falls back to
  the Issue's derived agent only when no active Task owns it.

## Comments and activity

**Comments.** `issue_comments (id, issue_id, author, body, reply_to_comment_id, created_at,
edited_at)`. A body is markdown with `@handle` mentions, `task://` links and bare codes resolved
at write time. Replies stay one level deep, as in Capy's `CommentIssueRequest.replyTo`. Authors
edit their own comments.

**Activity.** The timeline is append-only `issue_events`, Capy's `IssueTimelineEventEncoded`
kinds Haus uses: `created`, `state_changed`, `priority_changed`, `assignee_changed`,
`title_changed`, `description_edited`, `parent_set`, `sub_issue_added`, `sub_issue_removed`,
`linked`, `unlinked`, `due_changed`, `labels_changed`. Each row has an actor (an `IssueActor`, or
null for the Server), `from` and `to` where they apply, and the time. The Issue page shows All,
Comments, and Agents filters over comments plus events.

## References

- A bare code (`GEN-12`) in a message, comment, or description links an Issue: case-sensitive,
  word-bounded, ignored inside code, fences, Markdown links and URLs, as the Task scan works today
  (`apps/server/src/tasks/task-reference-scan.ts:23`). It must match an Issue on the Server.
- Messages resolve at write time and record `issue_message_links`, the Issue's **Mentioned in**,
  replacing `task_message_links` (`apps/server/src/tasks/task-reference-links.ts:105`). A
  reference wakes nobody; to reach the assignee, comment on the Issue.
- `issue://<issueId>` is the rich link the @ picker inserts.

## Where Issues show

The App surfaces are step 6: the Project's Issues list (For you, Assigned to me, Created by me,
Mentioned, All) grouped by state, the board by state, the Issue page (code, title, linked Task
chip, state, priority, assignee, due date, labels, description, sub-issues, activity, and its
comment box), and the sidebar. A person's assigned open Issues show in their lists; there is no
attention tier ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).

## CLI and Agent routes

`haus issue` ([haus-cli.md](haus-cli.md#7a-issue-and-task-families)), served by
`apps/server/src/agent-api/issue-routes.ts`:

| Command | What it does |
| --- | --- |
| `issue create --title <t> [--project <KEY>] [--state] [--priority] [--assignee] [--due] [--labels] [--parent <code>]` | Files an Issue with the description on stdin. Defaults: the caller's Project, `todo`, unassigned |
| `issue update <code> [--title] [--state] [--priority] [--assignee] [--expect-assignee] [--due] [--labels] [--parent] [--expected-version]` | Edits one Issue |
| `issue list [--assignee <me\|crew\|none\|@handle>] [--state <states>] [--project <KEY>] [--parent <code>] [--query <text>]` | Defaults to open Issues assigned to the caller or its crew, by priority then age, at most 50 rows |
| `issue show <code>` | The Issue, its sub-issues, links, and newest activity |
| `issue comment <code> [--reply-to <commentId>]` | Comments with the body on stdin |
| `issue link <code> (--task <id> \| --pr <url>)` / `issue unlink …` | Links or unlinks a Task or pull request |

An agent creates Issues in any Project; a Captain may file an unassigned `backlog` Issue into
another Project as a durable hand-off.

## Regression guards

| Contract | Guard |
| --- | --- |
| Codes are unique per key and never reused, under concurrent allocation | `apps/server/test/issue-codes.test.ts` |
| The woken agent follows the assignee table, never the actor, and Backlog wakes nobody | `apps/server/test/issue-wakes.test.ts` |
| `--expect-assignee` refuses a taken Issue with `ISSUE_TAKEN` naming the holder | `apps/server/test/issue-claim.test.ts` |
| `task start --issue` is atomic and idempotent by request id | `apps/server/test/task-start-issue.test.ts` |
| Archiving a Task hands its open Issues back with an activity row | `apps/server/test/task-archive-issues.test.ts` |
| Assignments coalesce into one run up to 50, and reassigning retires a queued item | `apps/server/test/issue-assignment-delivery.test.ts` |
