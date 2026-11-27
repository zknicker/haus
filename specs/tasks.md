---
summary: The Tasks contract (ADR 0062). A Task is one fresh agent session with its own chat, a Machine and a model, started by a person or by a Captain as crew, active or archived (`tasks.archived_at`), with Capy's activity status (working, waiting, idle, failed, plus needs-you) and no backlog fields or code; it has an auto title and a separate 8-character short id. Covers the hidden Task agent, the shared agent base with Captains, the org-visible Captain chat and its owner, starting a Task, what it reads and writes in Drive, delivery modes (steer, interrupt, queue), archive, restore and unarchive on message, Tasks messaging each other, crew reports, Computer access (always the Captain's or starter's grant), background processes, the desktop lease, worktrees, trailers and pull requests, followers, and the side panel. Folds in what survived from the deleted Workers contract.
read_when:
  - changing what a Task is, its record, its title, its short id, its activity status, or archive, restore and unarchive
  - changing how a person or a Captain starts a Task, its Machine, its model, or `haus task start`
  - changing the `task` agent kind, how Task agents stay out of rosters, or Task credentials
  - changing the Captain kind, its crew Machine and model, the Captain chat, its owner, or member and subscribed flags
  - changing what a Task reads (rules, WORKER.md, the brief), what it writes to Drive, crew reports, or `haus task report`
  - changing message delivery to a Task (steer, interrupt, queue) or `haus task send`
  - changing Computer access for Tasks, per-call targets, background processes, or the desktop lease
  - changing Task worktrees, branches, commit trailers, pull requests, or the Task side panel
  - changing Task followers, Task unread, Task references (`task://` links), or reminders on a Task
---

# Tasks

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) decides the model.
A **Task** is one agent session with its own chat. You talk to it directly. It works on one
Machine with one model, and it is active or archived. The backlog card is the
[Issue](issues.md); a Task links the Issues it works on. The Captain, the long-lived orchestrator,
shares the agent base with Tasks ([Captains](#captains-and-the-captain-chat)).

This spec is the target contract. Steps 2 to 6 of ADR 0062 land on main one by one and release
together, so it describes the released state; "step N" says which step builds a rule. Behaviour
that stays cites today's code. There are no migration or compatibility rules here (ADR 0062
decision 16).

## The model

- A Task is a `tasks` row, its own Chat of kind `task` under its Project's channel
  (`parent_chat_id`, `apps/server/src/postgres/schema/chats.ts:37,43`), and a hidden agent of kind
  `task` (step 5). The three are one to one.
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
    id: string; // `tsk_`, from createOpaqueId, unchanged
    shortId: string; // 8 lowercase Crockford base32 characters, its own column
    projectId: string;
    chatId: string;
    agentId: string; // the hidden `task` agent
    title: string; // 1–200
    titleCustom: boolean; // true once a person or agent renamed it
    starter: { kind: 'user'; userId: string } | { kind: 'captain'; agentId: string };
    captainId: string | null; // set for crew, null for a Task a person started
    origin: { chatId: string; messageId: string } | null;
    computerId: string; // its Machine, fixed at start
    model: string; // fixed at start; the harness follows the model
    activity: TaskActivity;
    needsYou: boolean;
    archivedAt: string | null; // the only archive state
    issueIds: string[]; // linked Issues
    lastActivityAt: string | null;
    createdAt: string;
    updatedAt: string;
};
```

Wire shapes live in `packages/haus-api/src/task.ts`. The tRPC surface is
[docs/api/tasks.md](../docs/api/tasks.md), which step 2 rewrites to this shape.

- **Archive state** is only `tasks.archived_at` (step 2). The Task's Chat keeps
  `chats.archived_at` null, because `chats_archive_shape` requires a human archiver
  (`apps/server/src/postgres/schema/chats.ts:103-106`) and an archived Chat refuses posts.

### Identity

- **Short id** (step 2). `tasks.short_id` is its own column: 8 random characters of lowercase
  Crockford base32 (`0-9a-hjkmnp-tv-z`, no `i l o u`), unique per Server (`tasks_short_id_key`),
  minted again on a uniqueness conflict. It is not derived from the `tsk_` id, which stays as
  `createOpaqueId` mints it (`apps/server/src/postgres/opaque-id.ts:9`); `@haus/api` validates Task
  ids only as strings, so nothing there changes. Lowercase keeps it safe in macOS git refs, which
  ignore case, and fits the agent handle grammar
  (`apps/server/src/postgres/schema/agents.ts:173-174`). Migration 0161 gives existing Tasks
  short ids through a random column default it drops in the same statement batch; a collision
  fails the migration rather than retrying.
- The short id is the Task's handle: `haus task show k3mq7xta`, the URL `/tasks/k3mq7xta`, the
  branch `haus/k3mq7xta-<slug>`, and the trailer `Haus-Task: k3mq7xta`. Full ids resolve
  everywhere a short id does.
- **Title.** A Task gets its title automatically from its first message (Capy's
  `regenerate-title`): its first line, cut at a word to at most 80 characters, with
  `titleCustom: false`. A title given at start (`--title`, `task.start`'s `title`) is custom. A
  person, its Captain, or the Task itself may rename it (`task.rename`, `haus task rename`), which
  sets `titleCustom: true`; a later regenerate never replaces a custom title.
- People refer to a Task by title. The @ picker searches active Tasks by title, shows each with
  its Project, age and activity, and inserts a `task://<taskId>` link
  (`apps/server/src/tasks/task-reference-links.ts`); a `task://<shortId>` link an Agent writes
  resolves the same way. A crew Task working one Issue displays as
  "GEN-12 · title".
- A bare code such as `GEN-12` always means an Issue, never a Task ([issues.md](issues.md#references)).

### Activity status

Capy's thread status, derived by the Server from the Task's session and never written by hand
(step 5):

| Activity | When |
| --- | --- |
| `working` | A turn is running, or admitted and waiting for a runner slot ("starting") |
| `waiting` | The Task is blocked on a person's answer (its newest report is `needs-you` and no person has posted since), or a turn is due and its Machine is offline ("waiting for MacBook") |
| `idle` | The last turn settled and nothing blocks it. Its last message holds the result |
| `failed` | The last turn ended in an error. The chat shows how far it got |

`needsYou` is true exactly while the Task waits on a person's answer. Passive waits (a pull
request's checks, a background process, a reminder) are `idle`: their wake starts a turn when it
comes. Archive is separate from activity: an archived Task shows its last activity, greyed.

The Server reads activity from the Task agent's delivery state
(`apps/server/src/tasks/task-activity.ts`): an active run is `working`; queued work is `working`
while the Machine is online and `waiting` while it is offline; a last turn that failed is
`failed`; anything else is `idle`. `needsYou` is true while the Task's newest report
(`task_reports`) is `needs-you` and no person has posted in its chat since; it then reads `waiting`.

## Captains and the Captain chat

**The shared base.** Every agent row gets `kind: 'captain' | 'task'` (step 5). Today's agents are
all Captains (`apps/server/src/postgres/schema/agents.ts:75-78`). Task rules key on
`kind = 'task'` and never catch a Captain:

- Task agents have a Server-minted handle (`task-<shortId>`) and no display in people lists,
  mention pickers, `haus server info --agents`, rosters, `#all` greetings, hearing candidates
  (`listHearingCandidates`, `apps/server/src/agent-delivery/hearing.ts:33`), or Computer access
  lists. A shared test fixture seeds one Task agent so every roster test must exclude it.
- A Task agent's run credential reaches its own chat, its Project's Issues (create, edit,
  comment) and Issues assigned to it, Drive reads and its own [Drive writes](#drive), and the
  `haus task` verbs a Task may call. It cannot post in another chat, start a Task, or edit a
  Project. Reads stay open; the agent API refuses a Task credential `TASK_CREDENTIAL_SCOPE` (403)
  on every route that changes agents, profiles, channels, claims, connections, Triggers, or
  Drive outside `haus drive write` (`apps/server/src/tasks/task-credential-scope.ts`), and the
  routes it may call check their own targets.
- A Captain keeps memory, its home Project and hearing it, its crew, recurring reminders, claims,
  its changeable Machine ([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)
  amendment 2026-11-23, changed in its settings) and its one session across every chat
  ([sessions.md](sessions.md)). It has no number and never archives.
- **Crew defaults.** A Captain has a crew Machine (`agents.crew_computer_id`) and a crew model
  (`agents.crew_model`), Capy's "Crew runs on", set in the Captain's settings (step 5). Null falls
  back to the Project's default Machine and to the Captain's own model.
- **Owner.** Every Captain has an active human owner (`agents.owner_user_id`). A person who
  creates a Captain owns it; a Captain created by another Captain (`haus agent create`) takes the
  creating Captain's owner. When the owner leaves the Server, ownership moves to the Server
  owner, in the same transaction.
- **Retiring a Captain** is today's delete path (`apps/server/src/server-agents/delete-agent.ts`).
  It also archives its crew Tasks, and their open Issues hand back to the Captain's owner.

**The Captain chat** (step 5) replaces per-person Captain DMs
(`apps/server/src/chats/ensure-agent-dm.ts:16`):

- Each Captain has exactly one Chat of kind `captain`, created with the Captain: the
  `agents_captain_chat` trigger (migration 0166) inserts it with every Captain row, whichever path
  writes the row, opens the Captain's read of it and joins its owner. It has no parent and is not
  a Project. It is visible to everyone on the Server; there is no private Captain chat
  in v1.
- Each person has two flags on it, Capy's `member` and `subscribed`. A member sees it in their
  sidebar; a subscribed member gets unread and push for every message. Posting makes you a member
  and subscribes you. Anyone can join or leave, and subscribe or unsubscribe. An @mention of a
  person who is not a member notifies them and does not join them.
- Every message shows its author. The Captain's envelope names the sender of each message, so it
  knows who asked.
- The chat reaches its own Captain always, addressed as a DM is today
  (`apps/server/src/agent-delivery/message-recipients.ts:52`), and **no other agent**: an @mention
  of another Captain there wakes nothing.
- Only people and the Captain itself post there. Other agents reach a Captain by @mention in a
  Project, or as crew through reports.
- The agent target is `captain:@<handle>`. `dm:@<human>` is deleted for agents; person-to-person
  DMs are unchanged. The shared chats start fresh; the one-off script handles old Captain DM rows
  and the reminders, Triggers and claims anchored in them.
- Recurring reminders and claims may anchor in the Captain chat.
- The Captain page is the Captain chat plus its side panel (step 6), at `/captain/<agentId>`, which
  lands on the chat. The chat shows its crew's finishes, failures and archives as quiet lines
  ([agent-panel.md](agent-panel.md#crew-lines-in-the-captain-chat)).

## Starting a Task

### A person starts a Task

- The Home composer always starts a new Task. It asks for a Project (default: the person's last),
  a Machine (default: the Project's default Machine, [projects.md](projects.md#default-machine))
  and a model, and the first message is the person's prompt. `task.start` creates the Task, its
  chat, its agent and its first turn in one transaction, idempotent by `requestId` (step 6).
- From a Project, a person may start a Task from a message; that message becomes its origin.
- The person is its starter. It has no Captain and no `WORKER.md`.

### A Captain starts crew

`haus task start --title <t> [--target <current-chat>] [--from <messageId>] [--repo <owner/name>] [--ref <ref>] [--machine <name>] [--model <id>] [--issue <code>] [--request-id <id>]`
with the brief on stdin (step 5).

- The Task is always in the Captain's home Project. With `--issue`, an Issue in another Project
  is refused `TASK_PROJECT_NOT_HOME`; that is the refusal's only use.
- `--target` names the chat the Captain is answering in, as `haus agent create --target` does.
  The start passes that chat's freshness hold, as `haus message send` does, because a newer
  message there may change the brief; a held start writes nothing and prints the shown messages.
  With `--from`, that message in the target chat becomes the Task's origin.
- The brief posts as the Task's first message, authored by the Captain.
- The Machine defaults to the Captain's crew Machine, else the Project default. The model defaults
  to the Captain's crew model, else the Captain's own.
- `--issue` links and assigns atomically, and never changes the Issue's state
  ([issues.md](issues.md#claiming)).
- The receipt says the Task is queued or starting, never that it started, and prints its short id.

## What a Task reads

The Server composes a Task's turn input; the runner runs it (step 5, carried from the deleted Worker
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
`MEMORY.md` and no local `drive/` folder.

## Drive

A Task reads Drive with the existing read commands (`haus drive versions view share`) and writes
its deliverables through the runner (step 5), as Capy threads edit their drive:

- `haus drive write <path> [--from <file>]` writes one file, from stdin or from a file on the
  Task's Machine, whose path follows the call's target as every `haus` file path does
  ([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)). It
  creates a new revision attributed to the Task (its author is the Task agent and the revision
  names the Task), replacing whatever revision is current, and prints its `drive://` citation.
  One write carries at most 50 MB.
- A Task writes only under its own folders: for crew, its Captain's
  `agents/<handle>/reports/<shortId>/`, `renders/<shortId>/` and `handoffs/<shortId>/`; for a
  person's Task, `projects/<key>/tasks/<shortId>/`. Anything else is refused
  `DRIVE_WRITE_OUTSIDE_TASK`. The session policy names these folders, so the Task prompt does.
- Captains keep editing Drive in their `drive/` folder; `haus drive write` from a Captain is
  refused `DRIVE_WRITE_USE_FOLDER`.

## Talking to a Task

- People post in the Task's chat. Anyone who can read the Project can.
- Each message to a Task has a delivery mode, Capy's three (step 5), stored on the Task agent's
  inbox row ([inbox.md](inbox.md#hearing)) and sent as `delivery` on `chat.send` for a Task chat:

  | Mode | What happens |
  | --- | --- |
  | `steer` (default) | A busy Task gets the message at its next tool boundary, with nothing cancelled, as today's busy notice (`apps/server/src/agent-delivery/busy-notice.ts:23`). If the turn ends before a boundary, the message starts the next turn |
  | `interrupt` | The running turn is aborted, its unseen items return to the queue as Stop does today, and the next turn runs with this message first: the start frame lists `interrupt` rows ahead of the rest (`apps/server/src/agent-delivery/interrupt-lead.ts`) |
  | `queue` | The message posts at once and reaches the agent as the next turn's input, after the current turn settles |

  To an idle Task every mode starts a turn at once. The composer sends `steer`; its menu offers
  the other two.
- **Unarchive on message.** A message from a person or a Captain to an archived Task unarchives
  it and wakes it, as in Capy. A Task's `haus task send` to an archived Task is refused
  `TASK_ARCHIVED`; only people and Captains bring a Task back.
- **Restore.** Unarchive is also an action of its own (`task.unarchive`, `haus task unarchive`),
  Capy's `/threads/{id}/unarchive`, that starts no turn; the next message wakes it.
- Unarchive and restore are refused `TASK_PROJECT_ARCHIVED` while the Task's Project is archived.
- Stop ends the running turn and drops `queue`d messages from delivery; they stay in the chat.

## Tasks messaging each other

- `haus task send <shortId> [--delivery steer|interrupt|queue]` with the body on stdin posts a
  visible message in the receiving Task's chat, authored by the sender (a Captain or a Task), and
  wakes it under that delivery mode (step 5). It is the only way an agent messages a Task:
  `haus message send --target task:<id>` resolves only for a Task agent posting in its own chat.
- A Task may send to any active Task of its own Project; another Project's work goes through an
  Issue. A Captain may send to any Task.
- Agent-to-agent sends spend the inbox automation chain, so two Tasks cannot ping-pong; a
  person's post resets it ([inbox.md](inbox.md)).
- A `task://` link to a Task in any other chat is a reference (Mentioned in) and wakes nothing.

## Crew reports

- A crew Task ends each Captain-directed turn (the brief, or a Captain's `task send`) with
  `haus task report --outcome done|needs-you|failed [--ask <text>] [--person <handle>] [--pr <url>]...`
  and the report text on stdin, at most 8,000 characters (step 5; the shape was the deleted Worker
  report's).
- The report posts in the Task's chat as the Task's message and reaches the Captain as a
  `crew_report` inbox item ([inbox.md](inbox.md#crew-reports)).
- A Captain-directed turn that settles with no report sends the Captain one `crew_report` with
  outcome `unreported`, carrying the Task's last message and a link to the chat.
- A turn a person drove sends the Captain a `crew_report` only when it settles `failed`, or when
  its report is `needs-you` with no `--person`. Otherwise the Captain hears nothing of it.
- `needs-you --person` @mentions that person in the Task and does not wake the Captain, so they
  don't race. A handle that is not a human who can read the Task is refused
  `TASK_PERSON_UNKNOWN`, listing the Task's followers.
- `--pr` attaches each named pull request to the Task ([Pull requests](#worktrees-commits-and-pull-requests)).
- A person-started Task may report too; its report wakes nobody, and `needs-you` makes it
  `waiting` on its starter.

## Machine and model

- A Task's Machine is one attached Computer, fixed at start: in v1 the MacBook or the Mac mini.
  There is no "no machine" option. Its tool calls run there; the agent loop runs on the runner
  ([runtime-drivers.md](runtime-drivers.md#session-kinds)).
- Its model is any model the Server's model logins can run
  ([model-connections.md](model-connections.md)), fixed for the Task's life. The harness follows
  the model, as for Captains.
- **Access** (step 5). A Task never has access of its own:
  - A crew Task may use its Machine exactly while its Captain's **current** Agent access there
    allows the Captain.
  - A person-started Task may use its Machine exactly while its starter is that Computer's
    attacher, or the Computer allows All Captains on this Server.
  - The Task agent never gets the "own Machine" pass that Agent access gives a Captain whose
    `computer_id` is that Computer (`apps/server/src/computer-access/agent-access.ts`). Its
    Machine lives on the `tasks` row; the agent row repeats it as `computer_id` only because
    delivery dispatches a run to the agent's `computer_id`, and the access check keys on
    `kind = 'task'`, so the column grants nothing.
  - The invocation gate (`apps/server/src/agent-invocations/invocation-gate.ts`) checks this at
    every dispatch, on request and on resend. A revoke of the Captain's or starter's grant fences
    the Task's queued calls and stops its running one, as a revoke does for a Captain.
  - A per-call `computer` target other than the Task's Machine is refused `TASK_MACHINE_ONLY`.
- **Removed.** Removing a Machine archives its active Tasks and clears every Task's
  `computer_id` there; such a Task stays archived, since a Task's Machine never changes.
- **Offline.** A tool call to an offline Machine fails fast, as today. A Task whose Machine is
  offline when a turn is due parks as `waiting` without holding a runner slot, and the turn starts
  when the Machine reconnects.

## Long work and the desktop

- **Background processes** (step 4). `bash` (or `shell`) with `background: true` starts a process
  on the Machine, or the call's `computer`, and returns its process id (`prc_` plus 16
  characters). `process_read { processId, afterSeq }` reads up to 64 KiB of output after a byte
  cursor and names the next cursor and whether the process still runs, and `process_kill` ends it
  (SIGTERM to its process group, SIGKILL after 5 seconds). Both take `computer` like every
  machine tool, and only the session that started a process can reach it. A process outlives the
  turn and is recorded in the Computer's ledger (`runtime/processes/` under the agent's folder)
  with the session's agent id and generation, its output in a log beside it. When it ends on its
  own, the Computer sends `process-exit` and resends it on every connect until the Server
  acknowledges it, and the Server queues a `process_exit` item that wakes its session
  ([inbox.md](inbox.md#process-exits)). Each Computer caps live background processes at 8 and
  refuses a start past that. Archive (older generations only) and its own `process_kill` end a
  process silently; an access revocation ends it and reports the exit, and a process the Computer
  finds still running after its own restart is ended and reported with no exit code. A `haus`
  command cannot run in the background. Captains use them too. They replaced Workers'
  long-running builds, which step 7 deleted.
- **Desktop lease** (step 4). The first `desktop` call in a turn takes a Computer-wide lease for
  that session, held in memory on the Server, which already routes calls; a later turn of the same
  session takes it over. It is released when the turn settles, 60 seconds after the last desktop
  call started or finished, on archive, and on revoke. Another session's desktop call is refused
  `desktop-busy` before it reaches the Computer, naming the holder ("Studio's desktop is in use by
  Orbit."). The Computer's per-command lock stays as a backstop ([computer-use.md](computer-use.md)).

## Worktrees, commits and pull requests

- A Task works in git worktrees of the Computer's repo folders at
  `<dataRoot>/servers/<serverId>/worktrees/<task-agent-id>/<owner>/<name>/`, keyed by its agent
  id as Captain worktrees are today (`apps/computer/src/invocations/worktree-use.ts`), through
  `haus repo checkout` ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)).
  `haus task start --repo [--ref]` records the repo on the Task (`tasks.repo`, `tasks.repo_ref`),
  and the session policy carries it. Before a fresh session's first turn (the Task's first turn,
  after unarchive, or after a recovery reset) the runner runs `haus repo checkout <repo> [--ref]`
  for it on its Machine, through the same invocation path as the Task's own call, and opens the
  turn with the receipt (`apps/runner/src/turn/task-opening.ts`). A failed checkout opens the
  turn with the refusal and the command to run once its cause is fixed; the turn still runs.
- Its branch is `haus/<shortId>-<slug>`, the slug from the title, lower-cased and at most 40
  characters, fixed at the first checkout.
- Every commit ends with `Haus-Task: <shortId>`, plus `Haus-Issue: <code>` for each linked Issue.
  Trailers are for tracing; Haus never scans commits for them. They replaced the Worker trailer,
  which step 7 deleted.
- It pushes and opens pull requests as the Server's Haus GitHub App bot, with the person who
  asked as co-author ([github-app-connection.md](github-app-connection.md#git-on-a-computer)).
- **Pull requests** attach in `task_pull_requests` when a report names them, or by
  `haus task attach-pr`. A change after the turn settled reaches the active Task that attached it
  first through the existing `pull_request` item, once per change and head commit
  (`apps/server/src/github/pull-request-task-wakes.ts`, re-pointed from Task state to
  `archived_at is null`); [issues.md](issues.md#links-and-pull-requests) has the fallback. The wake
  goes to the Task agent itself.
- **Change summary.** At each turn boundary the Computer reports a `--stat` summary of each
  worktree the turn touched, with its Computer and repo. The side panel shows the newest one.
  Not built yet: the Computer reports no summary, so the Task panel has no Changes section.

## Followers and unread

Unchanged except where noted (`apps/server/src/tasks/task-follows.ts`). Followers are Capy's
`subscribed` for Task chats:

- A Task is unread only for its followers: its starter, the author of and anyone mentioned in its
  origin message, and anyone who posts in it. A crew Task's Captain does not follow it; it hears
  its crew through reports. Anyone can follow or unfollow by hand.
- An unread Task appears in a follower's lists as an unread Channel does. There is no attention
  tier ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).
- What reaches a Captain is [inbox.md](inbox.md#hearing). Project hearers do not hear Tasks
  ambiently (step 3).

## Where Tasks show

Step 6 builds these:

- **Tasks list:** My (started by me, or crew of Captains I own), All, Archived. Rows show title,
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
agent: one anchored in a Task's chat belongs to the Task agent whoever set it, so it lists under
the Task's `haus reminder list`, not its Captain's. A Task sets reminders only in its own chat;
anywhere else is `INVALID_TARGET`. Archive cancels pending reminders (`apps/server/src/tasks/task-close-reminders.ts`);
unarchive does not restore them.

## Archive

A person, the Task's Captain, or the Task itself archives it (step 2 for the record, step 5 for
the session). Archive frees the Task's resources; it is **not** the runner's retire, which bars an
agent id for the runner's lifetime (`apps/runner/src/turn/agent-sessions.ts:26-28,61-66`).

Step 2 ships the record only: `task.archive` and `haus task archive` set `archived_at`, cancel
pending reminders, and archiving an archived Task changes nothing.
`task.unarchive` clears `archived_at` and starts no turn. A post in an archived Task leaves it
archived, and nothing refuses unarchive under an archived Project yet; both arrive with step 5.

In one Server transaction archive sets `tasks.archived_at`, hands its open Issues back
([issues.md](issues.md#when-a-task-archives)), cancels pending reminders, releases the desktop
lease, and bumps the Task agent's session generation. Then:

1. The runner gets a generation-stamped `archive` reset ([runtime-drivers.md](runtime-drivers.md#session-kinds)).
   It stops any live turn, closes the process, deletes `/data/agents/<task-agent-id>/`, and
   advances the agent's generation, without adding the id to the retired set. A run stamped with
   an older generation is refused by `enter`, as for a session reset today.
2. The Computer gets `task-archive { agentId, generation }`. It refuses any invocation stamped
   with an older generation, kills the Task's background processes, and removes each clean
   worktree, deleting its local branch. Clean means no uncommitted or untracked changes and every
   commit on a remote-tracking ref after a fresh fetch; a failed fetch is not clean (carried from
   the deleted Worker closing rule). Cleanup for a generation never touches a worktree
   used by a later generation.
3. An unpushed worktree stays with its branch. The archive dialog warns about it, and the Device
   page lists kept worktrees with their Task.

A runner or Computer offline at archive gets the reset on reconnect: each reports the agent
directories or worktrees it still holds with their generation (today's `agent-held`), and the
Server answers with the newest reset for each. Until that report is built, archive and unarchive
leave the agent's `session_reset_kind` at `full`, so the first run of the newer generation
deletes whatever an offline runner still held. Archive also holds the agent's delivery and drops
its queued chat work, so a restored Task starts no turn until a message reaches it. Archive is not
deletion; the chat and its history stay readable.

**Unarchive** clears `archived_at` and bumps the generation again (step 5). The next turn starts a
fresh session whose first input is the composed Task input ([What a Task reads](#what-a-task-reads))
plus the newest 50 messages of the Task's chat, cut to at most 24,000 characters from the oldest
end, and the current state of its linked Issues. The runner rereads the chat on every fresh Task
session (`GET /api/agent/tasks/replay?before=<sequence>`, Task credentials only): the brief (the
chat's first message), always and apart, then the newest 50 messages after it and before the ones
that woke it, oldest first; the 24,000-character cut drops whole messages and never the brief.
The linked Issues ride the Task instructions, read fresh each turn. If a worktree was kept, the
checkout Haus runs resumes there on its branch; otherwise it makes a new one on the same branch
name from the remote.
Issues handed back at archive stay handed back.

**Project archive and delete.** Archiving a Project archives its active Tasks. Deleting a Project
deletes its Tasks and their chats, and retires their hidden agents with their queues and
credentials, as deleting a Captain retires it
([projects.md](projects.md#archiving-and-deleting)).

## Ownership

| Layer | Owns |
| --- | --- |
| Haus Server | Task, Captain and agent records, the Captain chat, short ids and titles, composed turn input, delivery modes, reports, access checks, the desktop lease, archive generations |
| Runner | The Task's session, its turns, admission and parking |
| Haus Computer | Tool invocations, worktrees, background processes, change summaries, generation fences |
| Haus App | The Home composer, Tasks list, Task page and side panel, Captain page |

## Regression guards

| Contract | Guard |
| --- | --- |
| A Task agent never appears in rosters, mention options, hearing candidates or access lists | `apps/server/test/task-agent-roster.test.ts` (shared fixture `task-agent.fixture.ts`) |
| Removing a Machine archives its Tasks and clears their Machine; deleting a Project stops its Task sessions before their agents retire | `apps/server/test/task-removals.test.ts` |
| A Task credential cannot post outside its chat, start a Task, or change what is not its own | `apps/server/test/task-agent-credential.test.ts` |
| Steer, interrupt and queue deliver as their rows say, an interrupting message first | `apps/server/test/task-delivery-modes.test.ts`, `apps/runner/src/turn/turn-notices.test.ts` |
| A fresh Task session opens with Haus's `--repo` checkout, then its chat so far within the bounds | `apps/runner/src/turn/task-opening.test.ts`, `apps/server/test/task-replay.test.ts`, `packages/agent-prompt/src/task-replay-format.test.ts` |
| A reminder on a Task belongs to the Task agent; a Task sets none outside its chat | `apps/server/test/haus-task-reminder-origin.test.ts` |
| Archive then unarchive runs a fresh generation, and a stale-generation dispatch is refused | `apps/server/test/task-archive.test.ts`, `apps/runner/src/turn/agent-sessions.test.ts` |
| A Captain-directed turn without a report sends one `unreported` crew report | `apps/server/test/crew-report-delivery.test.ts` |
| A Task's access follows its Captain's or starter's current grant, never its own Machine, and refuses other targets | `apps/server/test/task-machine-access.test.ts` |
| Archive deletes the session, kills processes, removes clean worktrees and keeps unpushed ones | `apps/server/test/task-archive.test.ts`, `apps/computer/src/repos/agent-worktrees.test.ts`; the generation fence and process kill, `apps/computer/src/invocations/session.test.ts`, `apps/computer/src/invocations/processes/processes.test.ts` |
| A Task is one start: its Chat, its agent, the brief as its first message and first turn, `--issue` without a state change | `apps/server/test/task-agent-start.test.ts` |
| A Task session parks for 5 minutes, reads the Haus and Project rules and its Captain's `WORKER.md`, and has no memory | `apps/runner/src/turn/warm-pool.test.ts`, `apps/runner/src/turn/rules-delivery.test.ts` |
| A Task writes Drive only under its own folders | `apps/server/test/task-drive-write.test.ts` |
| A second session's desktop call is refused `desktop-busy` | `apps/server/test/desktop-lease.test.ts` |
| The Captain chat reaches only its Captain, even when another Captain is @mentioned | `apps/server/test/captain-chat.test.ts` |
