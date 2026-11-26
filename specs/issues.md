---
summary: The Issues contract (ADR 0062). An Issue is the backlog card of one Project, coded with that Project's key (GEN-12) from the Project's key ledger, with fixed states (Backlog, Todo, In progress, Done, Canceled), Capy's priorities, one assignee (a person, a Captain or a Task), a due date, labels, a parent, linked Tasks and pull requests, comments, people's subscriptions, and an activity timeline. The woken agent is derived from the assignee, claiming is compare-and-swap with `--expect-assignee`, and state changes only by explicit edits. Covers the record, codes, wakes, `issue_assignment` and `issue_event`, pull request notices, references, the CLI and Agent routes, and what an archived Task hands back.
read_when:
  - adding or changing the Issue record, its states, priorities, assignee, due date, labels, parent, or links
  - changing Issue codes, the Project key ledger, or how numbers are allocated
  - changing who is woken by an Issue change, `issue_assignment`, `issue_event`, pull request notices, or Captain queues
  - changing `--expect-assignee`, `ISSUE_TAKEN`, or `haus task start --issue`
  - changing Issue comments, subscriptions, the activity timeline, sub-issues, or bare `GEN-12` references
  - changing `haus issue` or the `/api/agent/issues` routes
  - changing what happens to an Issue when its Task archives
---

# Issues

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) decides the model.
An **Issue** is the backlog card: what needs doing, who is on it, and where it stands. A
[Task](tasks.md) is the agent session that does the work; an Issue links the Tasks working on it.
Capy's issue API is the reference for every field below that ADR 0062's divergence table does not
name. This spec is the target contract; everything here is new in step 2 unless it names another
step or cites current code. Steps 2 to 6 release together (ADR 0062, Build order).

## The record

```ts
type IssueState = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
type IssueStateType = 'open' | 'closed'; // backlog, todo, in_progress are open
type IssuePriority = 'urgent' | 'high' | 'normal' | 'low';

type IssueActor =
    | { kind: 'user'; userId: string }
    | { kind: 'captain'; agentId: string }
    | { kind: 'task'; taskId: string };

type IssueAssignee = IssueActor;

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
    version: number;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null; // set exactly while the state type is closed
};
```

- Wire shapes live in `packages/haus-api/src/issue.ts`, one schema per type above, validated at
  every boundary; comments, activity and the detail read are in `issue-timeline.ts`, App inputs in
  `issue-input.ts`, and the Agent routes in `issue-agent.ts`. The tRPC feature is
  `apps/server/src/haus-api/issue/` (`list get create update comment editComment linkTask
  unlinkTask setSubscription`), with one stream per event: `issue.onCreated`, `issue.onUpdated`
  (edits, moves, assignment, links, and a parent's sub-issue changes) and `issue.onCommented` for
  every member, and `issue.onSubscriptionUpdated` for the subscriber only.
- `issue.get` answers the detail: the Issue, its sub-issues, comments, activity, the reader's
  subscription, and the pull requests of its linked Tasks (`state` null until the Server has a
  reading).
- `closedAt` is set exactly while the state is `done` or `canceled`, the same check the Task row
  enforces today (`apps/server/src/postgres/schema/tasks.ts:98-101`).
- Every mutation takes `expectedVersion` and fails closed with a conflict. Agent routes may omit
  it and take last-write-wins after bounded retries, as Task routes do today
  (`withImplicitVersion` in `apps/server/src/agent-api/task-route-shell.ts`).
- There is no deletion. Canceled is the end state for work nobody will do.
- The label catalog is today's `task_labels` table
  (`apps/server/src/postgres/schema/task-labels.ts`), shared with Tasks until they drop labels;
  renaming it `issue_labels` waits for that step.
- Issues have no visibility field. Projects are open, so anyone who can read the Project reads
  its Issues.

### States

The five states are fixed and ordered. **Nothing moves an Issue between them except an explicit
edit** by a person or an agent naming the new state: not a merged pull request, not a Task
starting on it or archiving, not its last sub-issue closing.

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
  key ledger, which becomes the Issue counter: the `task_keys` table, one row per Project key with
  its `next_number`, allocated by `allocateIssueNumber` under the entry's row lock after the
  Server row lock (`apps/server/src/tasks/task-key-ledger.ts`). Tasks draw from the same counter
  until they stop taking numbers; renaming the table `project_keys` waits for that step.
- `issues` is unique on `(key_id, number)`, written in the same transaction as the allocation.
- A number is never reused. The ledger's `next_number` only rises, so a new Issue never takes a
  code that a Task, a commit trailer or an older Issue once carried.
- An Issue keeps its code for life; a Project's key is fixed once its first Issue is filed
  ([projects.md](projects.md#key)).
- Tasks take no numbers ([tasks.md](tasks.md#identity)).

## Assignee and wakes

An Issue has at most one assignee. Assigning a Task links it; linking does not assign. Assigning
an open Issue to an archived Task is refused `ISSUE_ASSIGNEE_ARCHIVED`.

**The woken agent is derived, never stored.** On each change that wakes, the Server computes it
from the assignee in the same transaction:

| Assignee | Woken |
| --- | --- |
| An active Task | That Task's agent |
| A Captain | That Captain |
| An archived Task (only on a closed Issue, see [Archive](#when-a-task-archives)) | Nobody |
| A person | Nobody; the person gets human unread and push |
| None | Nobody |

- The actor never wakes itself, including a Captain whose own Task is the assignee.
- Assigning while the Issue is in `backlog` wakes nobody. Moving an assigned Issue from `backlog`
  to `todo` or `in_progress` wakes as an assignment. Assigning a closed Issue wakes nobody either.
- A Task assignee wakes the Task agent itself, never its Captain.
- No agent follows an Issue, and no other agent is woken by an Issue change. Linked Tasks other
  than the assignee are context only. To reach another agent, @mention it in a chat it hears.
- A change made by a Captain's own crew Task rides that Task's crew report instead of waking the
  Captain separately ([inbox.md](inbox.md#crew-reports)).

**What wakes the derived agent.** An assignment to it, a state change, and a comment, each made
by someone else, plus one wake when its Issue's last open sub-issue closes. Title, description,
priority, label and due-date edits are activity only.

**Inbox items** ([inbox.md](inbox.md#issue-items)). Each write derives its items, their recipient
and identity (`apps/server/src/issues/issue-wakes.ts`) and queues them in the same transaction
(`issue-inbox.ts`, through `settleIssueWrite` in `issue-write-effects.ts`); the agents are
dispatched after commit. A comment's `timelineEventId` is the comment id. A closed last sub-issue
is keyed by the parent's id and the child's `state_changed` event id.

- `issue_assignment` replaces `task_assignment`. Identity `issue-assign:<issueId>:<version>`.
  Every queued assignment for one agent rides one run, up to 50, by priority then age, and a busy
  agent gets a count. Reassigning, unassigning, or moving it to `backlog`, `done` or `canceled` before a run takes it retires it
  (`retireIssueAssignments`).
- `issue_event` carries a comment, a state change, or a closed last sub-issue. Identity
  `issue-event:<issueId>:<timelineEventId>`. Coalesced per agent per run, up to 50; a run carries
  assignments or events, never both.
- An assignment or event from another agent spends the automation chain; a person's resets it.

**People.** Assigning someone other than yourself notifies them by iPhone push after the read
grace (`issueAssignmentNotifiedUserId` in `@haus/api`, `apps/server/src/push/issue-push.ts`), and
a comment pushes every subscriber but its author (`issueCommentNotifiedUserIds`). Both ride the
Server-internal `issue.notified` fact; a push that stopped being news during the grace (the Issue
went to someone else, or the person unsubscribed) is dropped. The App's notification and an
`@handle` in a comment notifying a person are step 6. People subscribe to an Issue (Capy's Subscribe) in `issue_subscriptions
(issue_id, user_id)`: its creator, its assignee, anyone who comments, and anyone who subscribes by
hand. A subscriber gets human unread for comments and state changes. Subscriptions are for people
only.

## Claiming

- `haus issue update GEN-12 --assignee <me|@handle|task:<id>|none> --expect-assignee <none|me|@handle|task:<id>>`
  writes only when the current assignee equals the expected one, else fails `ISSUE_TAKEN` naming
  the holder. Without `--expect-assignee` the write is last-write-wins under `expectedVersion`.
- The verb is `update --expect-assignee`, never `claim`, because a claim is the message lock
  ([claims.md](claims.md)).
- `haus task start --issue GEN-12` (step 5) runs, in one transaction: check the Issue is open,
  in the caller's home Project, and assigned to the caller or to nobody, else fail `ISSUE_TAKEN`;
  create the Task; link it; assign the Issue to it; and queue the Task's first turn, which carries
  the Issue. It **never changes the Issue's state**. It takes no `--expect-assignee` flag, because
  the expected assignee is always "the caller or nobody". It queues no `issue_assignment`, since
  the brief turn already carries the Issue. A retry with the same `requestId` returns the same
  Task. Two Captains can never staff the same Issue.

## When a Task archives

Archiving a Task ([tasks.md](tasks.md#archive)) hands each open Issue assigned to it back to the
Task's Captain, else to the person who started it, in the archive transaction, with an
`assignee_changed` activity row whose actor is the Server. A closed Issue keeps its archived Task
as assignee for history. Unarchiving the Task does not take the Issues back; someone reassigns
them explicitly. The hand-back wakes and notifies as an assignment by whoever archived the Task
(`apps/server/src/issues/issue-handback.ts`), so a Captain archiving its own Task is not woken by
its own Issues. Reopening a closed Issue whose assignee is an archived Task is refused
`ISSUE_ASSIGNEE_ARCHIVED` too.

## Sub-issues

- `parentId` names another Issue in the same Project. A parent in another Project is refused with
  `ISSUE_PARENT_PROJECT`. Cycles are refused with `ISSUE_PARENT_CYCLE`.
- A sub-issue may have sub-issues. The App shows one level under each Issue, with
  "`closed`/`total` closed".
- A parent's state never moves on its own. When its last open sub-issue closes, the parent's
  derived agent gets one `issue_event`.

## Links and pull requests

- **Tasks.** `issue_task_links (issue_id, task_id, linked_at, linked_by)`. A Task may link several
  Issues and an Issue several Tasks. A crew Task working one Issue displays "GEN-12 · title".
- **Pull requests.** An Issue shows the pull requests of its linked Tasks, plus pull requests
  linked by hand with `haus issue link GEN-12 --pr <url>`. Readings come from the Server's stored
  pull request readings ([github-app-connection.md](github-app-connection.md)). Step 2 builds the
  Task links; hand links and their notices are not built yet, and `link` takes only `--task`.
- **Unlinking.** A Task that holds the Issue cannot be unlinked; reassign the Issue first.
- **Pull request notices.** A change on a pull request (ready for review, checks finished) reaches
  agents only through today's `pull_request` inbox item (`apps/server/src/github/pull-request-wake.ts`,
  identity `<repo>#<number>:<change>:<headSha>`), never as an `issue_event`. Recipients, once per
  identity:
  1. the active Task that attached the pull request first (`task_pull_requests`, oldest row),
     once however many linked Tasks share it;
  2. else, when no active Task holds it, the derived agent of each open Issue that links it by
     hand, once per agent across Issues.

## Comments and activity

**Comments.** `issue_comments (id, issue_id, author, body, parent_comment_id,
reply_to_comment_id, created_at, edited_at)`, Capy's `IssueCommentEncoded`. A body is markdown
with `@handle` mentions and bare codes resolved at write time as references. Replies stay one
level deep: a reply to a reply is stored under the same top-level comment
(`parent_comment_id`), with `reply_to_comment_id` naming the comment it answers. Authors edit their
own comments. An `@handle` in a comment notifies a person; it wakes no agent.

**Activity.** The timeline is append-only `issue_events`, Capy's `IssueTimelineEventEncoded`
kinds Haus uses: `created`, `state_changed`, `priority_changed`, `assignee_changed`,
`title_changed`, `description_edited`, `parent_set`, `sub_issue_added`, `sub_issue_removed`,
`linked`, `unlinked`, plus Haus's `due_changed` and `labels_changed`. Each row has an actor (an
`IssueActor`, or null for the Server), `from` and `to` where they apply, and the time. The Issue
page shows All, Comments, and Agents filters over comments plus events.

## References

- A bare code (`GEN-12`) in a message, comment, or description is a passive link: case-sensitive,
  word-bounded, ignored inside code, fences, Markdown links and URLs, as the Task scan works today
  (`apps/server/src/tasks/task-reference-scan.ts:23`). It must match an Issue on the Server.
- Messages resolve at write time and record `issue_message_links`, the Issue's **Mentioned in**,
  replacing `task_message_links` (`apps/server/src/tasks/task-reference-links.ts:105`). A
  reference wakes nobody and posts nothing on the Issue; to reach the assignee, comment on it.
- `issue://<issueId>` is the rich link the @ picker inserts.

## Where Issues show

The App surfaces are step 6 ([docs/features/issues.md](../docs/features/issues.md)): the Issues
list (For you, Assigned to me, Created by me, Mentioned, All) grouped by state, the board by
state, the Issue page (code, title, state, priority, assignee, due date, labels, description,
linked Tasks, sub-issues, activity, and its comment box), and the sidebar. For you is the Issues
the reader subscribes to, and Mentioned the ones whose description or a comment carries the
reader's `@handle`: `issue.list` takes `reader: 'subscribed' | 'mentioned'` for both, and the
lens matches nothing for an agent. A person's assigned open Issues show in their lists; there is
no attention tier ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).

## CLI and Agent routes

`haus issue` ([haus-cli.md](haus-cli.md#7a-issue-and-task-families)), served by
`apps/server/src/agent-api/issue-routes.ts`. Any Captain or Task may create Issues in its own
Project and edit any Issue there. In another Project it edits and comments only on Issues
assigned to it; any other write there is refused `ISSUE_PROJECT_NOT_HOME`. Everyone reads every
Issue.

| Command | What it does |
| --- | --- |
| `issue create --title <t> [--state] [--priority] [--assignee] [--due] [--labels] [--parent <code>]` | Files an Issue in the caller's Project with the description on stdin. Defaults: `todo`, unassigned |
| `issue update <code> [--title] [--state] [--priority] [--assignee] [--expect-assignee] [--due] [--labels] [--parent] [--expected-version]` | Edits one Issue |
| `issue list [--all] [--assignee <me\|none\|@handle\|task:<id>>] [--state <states>] [--project <KEY>] [--parent <code>] [--query <text>]` | Defaults to open Issues assigned to the caller, by priority then age, at most 50 rows; `--all`, `--project`, `--parent` or `--query` drop the assignee default. `--assignee crew` arrives with crew Tasks in step 5 |
| `issue show <code>` | The Issue, its sub-issues, links, and newest activity |
| `issue comment <code> [--reply-to <commentId>]` | Comments with the body on stdin |
| `issue link <code> (--task <id> \| --pr <url>)` / `issue unlink …` | Links or unlinks a Task or pull request |

## Regression guards

| Contract | Guard |
| --- | --- |
| Codes are unique per key and never reused, under concurrent allocation | `apps/server/test/issue-codes.test.ts` |
| The woken agent follows the assignee table, never the actor, and Backlog wakes nobody | `apps/server/test/issue-wakes.test.ts` |
| `--expect-assignee` refuses a taken Issue with `ISSUE_TAKEN` naming the holder | `apps/server/test/issue-claim.test.ts` |
| `task start --issue` is atomic, idempotent by request id, and leaves the state unchanged | `apps/server/test/task-start-issue.test.ts` |
| Archiving a Task hands its open Issues back with an activity row | `apps/server/test/task-archive-issues.test.ts` |
| Assignments coalesce into one run up to 50, and reassigning retires a queued item | `apps/server/test/issue-assignment-delivery.test.ts` |
| A pull request shared by several linked Tasks notifies once | `apps/server/test/pull-request-wake.test.ts` |
| A pull request a person's Task attached first still wakes the agent-started Task | `apps/server/test/pull-request-task-wakes.test.ts` |
| An assignment pushes the person, and a comment pushes every subscriber but its author | `apps/server/test/issue-push.test.ts` |
