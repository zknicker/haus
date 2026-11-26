---
summary: The Tasks contract (ADR 0062). A Task is one fresh agent session with its own chat, a Machine and a model, started by a person or by a Captain as crew, active or archived, with Capy's activity status (working, waiting, idle, failed, plus needs-you) and no backlog fields or code; it is known by title and a short id. Covers the hidden Task agent, the shared agent base with Captains and the shared Captain chat, starting a Task, what it reads, delivery modes (steer, interrupt, queue), unarchive on message, Tasks messaging each other, crew briefs and reports, Machine access, background processes, the desktop lease, worktrees, trailers and pull requests, followers, the side panel, and archive as retire. Folds in what survives from specs/workers.md.
read_when:
  - changing what a Task is, its record, its short id, its activity status, or archive and unarchive
  - changing how a person or a Captain starts a Task, its Machine, its model, or `haus task start`
  - changing the `task` agent kind, how Task agents stay out of rosters, or Task credentials
  - changing the Captain kind, the shared Captain chat, its owner, visibility, member or subscribed flags
  - changing what a Task reads (rules, WORKER.md, the brief), crew reports, or `haus task report`
  - changing message delivery to a Task (steer, interrupt, queue) or `haus task send`
  - changing Machine access for Tasks, background processes, or the desktop lease
  - changing Task worktrees, branches, commit trailers, pull requests, or the Task side panel
  - changing Task followers, Task unread, Task references (`task://` links), or reminders on a Task
---

# Tasks

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) decides the model.
A **Task** is one agent session with its own chat. You talk to it directly. It works on one
Machine with one model, and it is active or archived. The backlog card is the
[Issue](issues.md); a Task links the Issues it works on. The Captain, the long-lived orchestrator,
shares the agent base with Tasks ([Captains](#captains-and-the-captain-chat)).

This spec is the target contract built by steps 2 to 7 of ADR 0062's release order. Each section
says what is new. Behaviour that stays cites today's code. There are no migration or
compatibility rules here (ADR 0062 decision 16).

## The model

- A Task is a `tasks` row, its own Chat of kind `task` under its Project's channel
  (`parent_chat_id`, `apps/server/src/postgres/schema/chats.ts:37,43`), and a hidden agent of kind
  `task` (new, step 5). The three are one to one.
- A Task belongs to one [Project](projects.md), fixed at start, which gives it its rules and its
  default Machine.
- A Task is started by a person (from Home or a Project) or by a Captain as **crew**. Tasks never
  start Tasks. A crew Task has exactly one Captain (`tasks.captain_id`), fixed at start.
- A Task has no state, priority, due date, labels, assignee or code (step 2 deletes those columns,
  `apps/server/src/postgres/schema/tasks.ts:29-53`). Backlog fields live on Issues.
- A Task has no subagents in v1.

## Record

```ts
type TaskActivity = 'working' | 'waiting' | 'idle' | 'failed';

type Task = {
    id: string; // `tsk_`
    shortId: string; // 8 characters, unique per Server
    projectId: string;
    chatId: string;
    agentId: string; // the hidden `task` agent
    title: string; // 1–200; titleCustom marks a person's rename
    titleCustom: boolean;
    starter: { kind: 'user'; userId: string } | { kind: 'captain'; agentId: string };
    captainId: string | null; // set for crew, null for a Task a person started
    origin: { chatId: string; messageId: string } | null;
    computerId: string; // its Machine, fixed at start
    model: string; // as chosen; the harness follows the model
    activity: TaskActivity;
    needsYou: boolean;
    archived: boolean;
    issueIds: string[]; // linked Issues
    lastActivityAt: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
};
```

Wire shapes live in `packages/haus-api/src/task.ts`. The tRPC surface is
[docs/api/tasks.md](../docs/api/tasks.md), which step 2 rewrites to this shape.

### Identity

- The Server mints the `tsk_` id and its **short id**, the first 8 characters of the id body,
  stored as `tasks.short_id`, unique per Server (`tasks_short_id_key`). A mint whose prefix is
  taken mints again, so a short id never becomes ambiguous later (new, step 2).
- Task id bodies are lowercase base32 (`[a-z2-7]`), not the base64url of `createOpaqueId`
  (`apps/server/src/postgres/opaque-id.ts:9`), because the short id lands in git branch names,
  and macOS stores refs case-insensitively, so two ids differing only in case would collide.
- The short id is the Task's handle: `haus task show k3mq7xta`, the agent target
  `task:k3mq7xta`, the URL `/tasks/k3mq7xta`, the branch `haus/k3mq7xta-<slug>`, and the
  trailer `Haus-Task: k3mq7xta`. Full ids resolve everywhere a short id does.
- People refer to a Task by title. The @ picker searches active Tasks by title, shows each with
  its Project, age and activity, and inserts a `task://<taskId>` link
  (`apps/server/src/tasks/task-reference-links.ts:33`). A crew Task working one Issue displays as
  "GEN-12 · title".
- A bare code such as `GEN-12` always means an Issue, never a Task ([issues.md](issues.md#references)).

### Activity status

Capy's thread status, derived by the Server from the Task's session and never written by hand
(new, step 5):

| Activity | When |
| --- | --- |
| `working` | A turn is running, or admitted and waiting for a runner slot ("starting") |
| `waiting` | No turn runs, and a wake is pending on something the agent waits for: a background process, a one-time reminder, a pull request's checks, or its Machine coming back online |
| `idle` | The last turn settled and nothing is pending. Its last message holds the result or a question |
| `failed` | The last turn ended in an error. The chat shows how far it got |

`needsYou` is true while the Task's newest report is `needs-you` and no person has posted in the
Task since. `archived` is separate from activity: an archived Task shows its last activity, greyed.

## Captains and the Captain chat

**The shared base.** Every agent row gets `kind: 'captain' | 'task'` (new, step 5). Today's agents
are all Captains (`apps/server/src/postgres/schema/agents.ts:75-78`). Task rules key on
`kind = 'task'` and never catch a Captain:

- Task agents have a Server-minted handle (`task-<shortId>`) and no display in people lists,
  mention pickers, `haus server info --agents`, rosters, `#all` greetings, hearing candidates
  (`listHearingCandidates`, `apps/server/src/agent-delivery/hearing.ts:33`), or Computer access
  lists. A shared test fixture seeds one Task agent so every roster test must exclude it.
- A Task agent's run credential reaches its own chat, its linked Issues, the Drive reads, and the
  `haus task` and `haus issue` verbs. It cannot post in another chat, start a Task, or edit a
  Project. A person's or Captain's message elsewhere never reaches it except through
  [`haus task send`](#tasks-messaging-each-other).
- A Captain keeps memory, its home Project and hearing it, its crew, recurring reminders, claims,
  its changeable Machine ([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)
  amendment 2026-11-23) and its one session across every chat ([sessions.md](sessions.md)). It has
  no number and never archives. Retiring a Captain is today's delete path; its crew Tasks stay
  open and Captain-less.

**The Captain chat** (new, step 5) replaces per-person Captain DMs
(`apps/server/src/chats/ensure-agent-dm.ts:16`):

- Each Captain has exactly one Chat of kind `captain`, created with the Captain. It has no parent
  and is not a Project.
- `owner` is one human member, the Captain's creator by default. `visibility` is `org` (everyone
  on the Server, the default) or `private` (its owner and its members). Only the owner changes it.
- Each person has two flags on it, Capy's `member` and `subscribed`. A member has joined it and
  sees it in their sidebar; a subscribed member gets unread and push for every message. Posting
  makes you a member and subscribes you. Anyone who can see the chat can join or leave, and
  subscribe or unsubscribe.
- Every message shows its author. The Captain's envelope names the sender of each message, so it
  knows who asked.
- The chat always reaches its Captain, addressed as a DM is today
  (`apps/server/src/agent-delivery/message-recipients.ts:52`). No other agent hears it unless a
  message @mentions it.
- Only people and the Captain itself post there. Other agents reach a Captain by @mention in a
  Project, or as crew through reports.
- The agent target is `captain:@<handle>`. `dm:@<human>` is deleted for agents; person-to-person
  DMs are unchanged.
- Recurring reminders and claims may anchor in the Captain chat.
- The Captain page is the Captain chat plus its side panel (step 6).

## Starting a Task

### A person starts a Task

- The Home composer always starts a new Task. It asks for a Project (default: the person's last),
  a Machine (default: the Project's default Machine, [projects.md](projects.md#default-machine))
  and a model, and the first message is the person's prompt. `task.start` creates the Task, its
  chat, its agent and its first turn in one transaction, idempotent by `requestId` (new, step 6).
- From a Project, a person may start a Task from a message; that message becomes its origin.
- The person is its starter. It has no Captain, no `WORKER.md`, and its report wakes nobody but
  the starter's unread.

### A Captain starts crew

`haus task start --title <t> [--repo <owner/name>] [--ref <ref>] [--machine <name>] [--model <id>] [--issue <code>] [--request-id <id>]`
with the brief on stdin (new, step 5).

- The brief posts as the Task's first message, authored by the Captain.
- A Captain starts crew only in its home Project, refused `TASK_PROJECT_NOT_HOME` elsewhere, as
  today (`apps/server/src/tasks/task-start.ts`).
- The Machine defaults to the Captain's crew Machine, else the Project default. The model defaults
  to the Captain's crew model, else the Captain's own.
- `--issue` claims, links and assigns atomically ([issues.md](issues.md#claiming)).
- The start passes the freshness hold of the Captain's current chat, as `haus message send` does,
  carried over from Worker starts (`specs/workers.md`, The CLI).
- The receipt says the Task is queued or starting, never that it started, and prints its short id.

## What a Task reads

The Server composes a Task's turn input; the runner runs it (new, step 5, carried from the Worker
contract):

1. The Haus Task instructions: how to work, how to report, the trailer, where deliverables go.
   One checked-in text with its own size-cap test, under the guarded prompt contract.
2. `haus/AGENTS.md`.
3. `projects/<key>/AGENTS.md` for the Task's Project.
4. For crew, the Captain's `agents/<handle>/WORKER.md`.
5. For a Task working an Issue, the Issue's code, title and description.
6. The messages that woke it.

Each Drive file is inlined with its path and revision id, and a missing file is left out. A
changed `WORKER.md` rides the next turn once as a receipt, as memory is delivered
([ADR 0052](../docs/adr/0052-memory-is-one-capped-file-and-heartbeats-retire.md)); an unchanged
one is never sent again. The repo's own `AGENTS.md` comes from the worktree. A Task has no
`MEMORY.md` and no local `drive/` folder; it reads and writes Drive through the runner's `haus`
commands.

## Talking to a Task

- People post in the Task's chat. Anyone who can read the Project can.
- Each message to a working Task has a delivery mode, Capy's three (new, step 5):

  | Mode | What happens |
  | --- | --- |
  | `steer` (default) | The message lands at the agent's next safe tool boundary, and nothing is cancelled. Today's busy notice (`apps/server/src/agent-delivery/busy-notice.ts:23`) |
  | `interrupt` | The running step is stopped, and the message is the next turn's input |
  | `queue` | The message posts at once but reaches the agent only when the current turn settles, as the next turn's input |

  To an idle Task every mode starts a turn at once. The composer sends `steer`; its menu offers
  the other two.
- **Unarchive on message.** A message to an archived Task unarchives it and wakes it, as in Capy.
  The session was deleted at archive, so it wakes on a fresh session generation whose context is
  the composed input plus the chat's history.
- Stop ends the running turn and drops `queue`d messages from delivery; they stay in the chat.

## Tasks messaging each other

- `haus task send <shortId> [--delivery steer|interrupt|queue]` with the body on stdin posts a
  visible message in the receiving Task's chat, authored by the sender (a Captain or a Task), and
  wakes it under that delivery mode (new, step 5). It is the agent form of posting in a Task.
- A Task may send to any active or archived Task of its own Project; another Project's work goes
  through an Issue. A Captain may send to any Task.
- Agent-to-agent sends spend the inbox automation chain, so two Tasks cannot ping-pong; a
  person's post resets it ([inbox.md](inbox.md)).
- A `task://` link to a Task in any other chat is a reference (Mentioned in) and wakes nothing.

## Crew reports

- A crew Task ends each Captain-directed turn (the brief, or a Captain's `task send`) with
  `haus task report --outcome done|needs-you|failed [--ask <text>] [--person <handle>] [--pr <url>]...`
  and the report text on stdin, at most 8,000 characters (new, step 3; the shape is the Worker
  report's, `specs/workers.md` Reports).
- The report posts in the Task's chat as the Task's message and reaches the Captain as a
  `crew_report` inbox item ([inbox.md](inbox.md#crew-reports)).
- A Captain-directed turn that settles with no report sends the Captain one `crew_report` with
  outcome `unreported`, carrying the Task's last message and a link to the chat.
- A turn a person drove wakes the Captain only when it settles `failed`, or when its report is
  `needs-you` with no `--person`. Otherwise it reaches the Captain as context on its next turn.
- `needs-you --person` @mentions that person in the Task and does not wake the Captain, so they
  don't race. A handle that is not a human who can read the Task is refused
  `TASK_PERSON_UNKNOWN`, listing the Task's followers.
- `--pr` attaches each named pull request to the Task ([Pull requests](#pull-requests)).
- Any Task, crew or not, may report; a person-started Task's report wakes nobody.

## Machine and model

- A Task's Machine is one attached Computer, fixed at start: in v1 the MacBook or the Mac mini.
  There is no "no machine" option. Its tool calls run there; the agent loop runs on the runner
  ([runtime-drivers.md](runtime-drivers.md#session-kinds)).
- Its model is any model the Server's model logins can run
  ([model-connections.md](model-connections.md)). The harness follows the model, as for Captains.
- **Access** (new, step 5). A crew Task may use a Computer only where its Captain's Agent access
  allows the Captain, never more (`isAgentAllowedOn`, `apps/server/src/computer-access/agent-access.ts:7`).
  A person-started Task may use a Computer the starter attached, or one whose access is All
  Captains on this Server. The Server checks at dispatch, through the invocation gate
  (`apps/server/src/agent-invocations/invocation-gate.ts`), and a revoke fences queued calls as it
  does for Captains.
- **Offline.** A tool call to an offline Machine fails fast, as today. A Task whose Machine is
  offline parks at the turn boundary as `waiting` ("waiting for MacBook") without holding a runner
  slot, and wakes on reconnect.

## Long work and the desktop

- **Background processes** (new, step 4). `bash` with `background: true` starts a process on the
  Machine and returns its process id. `process_read { processId, afterSeq }` reads output after a
  cursor, and `process_kill` ends it. A process outlives the turn and is recorded in the Computer
  ledger under the session's agent id. When it exits, the Server queues a `process_exit` item that
  wakes its session ([inbox.md](inbox.md#process-exits)). Each Computer caps live background
  processes. Archive and access revocation kill them. Captains use them too. They replace Workers'
  long-running builds and must exist before step 7.
- **Desktop lease** (new, step 4). The first `desktop` call in a turn takes a Computer-wide lease
  for that session, held on the Server, which already routes calls. It is released at turn end,
  after 60 seconds without a desktop call, on archive, and on revoke. Another session's desktop
  call is refused `desktop-busy`, naming the holder. The Computer's per-command lock stays as a
  backstop ([computer-use.md](computer-use.md)).

## Worktrees, commits and pull requests

- A Task works in git worktrees of the Computer's repo folders at
  `<dataRoot>/servers/<serverId>/worktrees/<task-agent-id>/<owner>/<name>/`, keyed by its agent
  id as Captain worktrees are today (`apps/computer/src/invocations/worktree-use.ts`), through
  `haus repo checkout` ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)).
  `haus task start --repo` checks the repo out before the first turn.
- Its branch is `haus/<shortId>-<slug>`, the slug from the title, lower-cased and at most 40
  characters.
- Every commit ends with `Haus-Task: <shortId>`, plus `Haus-Issue: <code>` for each linked Issue.
  Trailers are for tracing; Haus never scans commits for them. The Worker trailer this replaces is
  `apps/server/src/workers/worker-instructions.ts:11`.
- It pushes and opens pull requests as the Server's Haus GitHub App bot, with the person who
  asked as co-author ([github-app-connection.md](github-app-connection.md#git-on-a-computer)).
- **Pull requests** attach in `task_pull_requests` when a report names them, or by
  `haus task attach-pr`. A pull request change after the turn settled wakes the active Task that
  attached it, once per change and head commit (`apps/server/src/github/pull-request-task-wakes.ts`,
  re-pointed from Task state to the Task being active).
- **Change summary.** At each turn boundary the Computer reports a `--stat` summary of each
  worktree the turn touched, with its Computer and repo. The side panel shows the newest one.

## Followers and unread

Unchanged except where noted (`apps/server/src/tasks/task-follows.ts`):

- A Task is unread only for its followers: its starter, the author of and anyone mentioned in its
  origin message, and anyone who posts in it. A crew Task's Captain does not follow it; it hears
  its crew through reports. Anyone can follow or unfollow by hand.
- An unread Task appears in a follower's lists as an unread Channel does. There is no attention
  tier ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).
- What reaches a Captain is [inbox.md](inbox.md#hearing). Project hearers no longer hear Tasks
  ambiently (new, step 3).

## Where Tasks show

Step 6 builds these:

- **Tasks list:** My (started by me, or crew of my Captains), All, Archived. Rows show title,
  Project, model, Machine, activity, needs-you, age and pull request count.
- **Task page:** the chat, and a side panel with the linked Issues, pull requests, and the newest
  change summary. No subagents section in v1.
- **Sidebar:** active Tasks the reader follows, then Captains (each opens its Captain chat), then
  Projects.
- **Channel previews:** a Task with an origin message still previews under it
  (`apps/server/src/tasks/task-previews.ts`).

## Reminders on a Task

A Task holds one-time reminders only (`--target task:<shortId>`); a recurring one is refused
`TASK_RECURRING_REMINDER`, as today ([reminders.md](reminders.md)). A reminder wakes the Task's own
agent and shows its activity as `waiting` until it fires. Archive cancels pending reminders
(`apps/server/src/tasks/task-close-reminders.ts`); unarchive does not restore them.

## Archive

Archive retires the Task (new, step 5). A person, the Task's Captain, or the Task itself archives
it. In one Server transaction it marks the Task archived, hands its open Issues back
([issues.md](issues.md#when-a-task-archives)), cancels pending reminders, releases the desktop
lease, and sends retire. Then:

1. The runner stops any live turn, kills the process, and deletes `/data/agents/<task-agent-id>/`.
2. The Computer kills the Task's background processes and removes each clean worktree, deleting
   its local branch. Clean means no uncommitted or untracked changes and every commit on a
   remote-tracking ref after a fresh fetch; a failed fetch is not clean (carried from Worker
   closing, `specs/workers.md` Closing).
3. An unpushed worktree stays with its branch. The archive dialog warns about it, and the Device
   page lists kept worktrees with their Task.

A runner or Computer offline at archive gets retire on reconnect: each reports the sessions or
worktrees it still holds (`runner-held`, today's `agent-held`), and the Server answers retire for
each archived one. Archive is not deletion; the chat and its history stay readable.

## Ownership

| Layer | Owns |
| --- | --- |
| Haus Server | Task, Captain and agent records, the Captain chat, short ids, composed turn input, delivery modes, reports, access checks, the desktop lease, retire |
| Runner | The Task's session, its turns, admission and parking |
| Haus Computer | Tool invocations, worktrees, background processes, change summaries |
| Haus App | The Home composer, Tasks list, Task page and side panel, Captain page |

## Regression guards

| Contract | Guard |
| --- | --- |
| A Task agent never appears in rosters, mention options, hearing candidates or access lists | `apps/server/test/task-agent-roster.test.ts` (shared fixture) |
| A Task credential cannot post outside its chat or start a Task | `apps/server/test/task-agent-credential.test.ts` |
| Steer, interrupt and queue deliver as their rows say | `apps/server/test/task-delivery-modes.test.ts`, `apps/runner/src/turn/turn-notices.test.ts` |
| A message to an archived Task unarchives it on a fresh generation | `apps/server/test/task-unarchive.test.ts` |
| A Captain-directed turn without a report sends one `unreported` crew report | `apps/server/test/crew-report-delivery.test.ts` |
| A crew Task never gets more Computer access than its Captain | `apps/server/test/task-machine-access.test.ts` |
| Archive deletes the session, kills processes, removes clean worktrees and keeps unpushed ones | `apps/server/test/task-archive.test.ts`, `apps/computer/src/invocations/task-retire.test.ts` |
| A second session's desktop call is refused `desktop-busy` | `apps/server/test/desktop-lease.test.ts` |
| The Captain chat reaches only its Captain, and private chats hide from non-members | `apps/server/test/captain-chat.test.ts` |
