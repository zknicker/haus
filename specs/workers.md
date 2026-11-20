---
summary: Normative Workers contract (ADR 0056). A Worker is a quiet, scoped run attached to one Task, started by an Agent with `haus worker` on a place (`computer:<name>`, `cursor`, `claude`). It reads the rule stack at launch and WORKER.md on change, ends each turn with a typed report (done, needs-you, failed) that posts in the Task and wakes its Agent, takes follow-ups between turns, and is supervised with per-place limits, stop, and a missing report counted as failed. Covers the record, places, the Computer run in a worktree with that machine's logins, deliverables in Drive, the Haus-Task trailer, pull requests attached through reports, the card, and the migration from cloud agents.
read_when:
  - changing Workers, Worker turns, Worker reports, or the `haus worker` CLI family
  - changing where a Worker runs, the "Workers can run here" switch, the Project's default place, or concurrency limits
  - changing what a Worker reads at launch, WORKER.md delivery, or the Haus Worker instructions
  - changing how people or Agents send a Worker a follow-up or stop it
  - changing a Worker on a Computer, its worktree, its credential, or its drive/ folder
  - changing pull request readings, pull requests attached through reports, or the Haus-Task trailer
  - changing the Worker card, the Task's live Worker summary, or Happening now
  - migrating cloud agent work, Runs, or `haus cloud-agent` to Workers
---

# Workers

An Agent runs one turn at a time. A Worker is how it does parallel work: a scoped run attached to
one Task, briefed by the Agent, working where the work is, and reporting back.
[ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decides the model. This spec is
the contract. [Cloud places](cloud-agents.md) carries what is specific to `cursor` and `claude`.
[Tasks](tasks.md) owns the Task, and [Projects](projects.md) owns repos and the default place.

A Worker replaces the cloud agent. Its record is the cloud agent work record, its turns are the
former Runs, and its card is the former attached-work card. "Cloud agent" stops being a product
noun when W2 lands.

## The model

- A Worker belongs to one Task and one Agent, its delegating Agent. A Task holds any number of
  Workers.
- A Worker runs on one place for its whole life. Moving a Worker between places is out of scope.
- A Worker runs in turns. The first turn carries the Agent's brief. Each later turn carries
  follow-ups. Each turn ends with one report or with an outcome Haus records.
- A Worker has no inbox, no chat, and no participant identity. It never posts progress and never
  talks to another Worker or Agent.
- A Worker closes when its Task is done or canceled ([Closing](#closing)). A closed Worker takes
  no more turns.

A Worker is not a session of its Agent ([ADR 0011](../docs/adr/0011-agents-own-one-global-session.md)
stands) and not a Task. It has no assignee, state, or key of its own. The Task's state belongs to
the people and the Agent on it, and a merged pull request never closes it.

## Record

The Server is canonical. It mints every id, timestamp, and credential. Computers and providers
report evidence against those ids and never invent one.

```ts
type WorkerPlace =
    | { kind: 'computer'; computerId: string }
    | { kind: 'cursor' }
    | { kind: 'claude' };

type WorkerStatus = 'queued' | 'working' | 'done' | 'needs-you' | 'failed' | 'stopped';

type Worker = {
    id: string; // `wkr_`; migrated cloud agent work keeps its `caw_` id
    taskId: string | null; // null only for read-only history from before ADR 0053
    agentId: string; // the delegating Agent
    place: WorkerPlace;
    carrierComputerId: string; // runs it, or carries its cloud place
    title: string;
    repository: string; // owner/name, one of the Task's Project repos
    startingRef: string | null;
    branch: string | null; // reported by the Worker or the provider
    runtime: 'claude-code' | 'codex' | null; // Computer places only
    model: string | null; // as requested; null is the runtime's own default
    providerUrl: string | null; // cloud places only
    workerMdRevisionId: string | null; // the WORKER.md revision it last received
    status: WorkerStatus; // derived from the newest turn
    activity: { summary: string; at: string } | null;
    pullRequests: PullRequestReading[]; // every pull request its reports named
    turns: WorkerTurn[]; // newest first, at most 20
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

type WorkerTurn = {
    id: string; // `wkt_`; migrated Runs keep their `car_` id
    input: WorkerTurnInput[];
    status: 'queued' | 'working' | 'settled';
    queuedAt: string;
    startedAt: string | null;
    settledAt: string | null;
    stopRequestedAt: string | null;
    stopRequestedBy: { kind: 'agent' | 'user'; id: string } | null;
    outcome: WorkerOutcome | null; // set when settled
    providerRunId: string | null;
    usage: { inputTokens: number; outputTokens: number; costUsd: number | null } | null;
};

type WorkerTurnInput = {
    kind: 'brief' | 'follow-up';
    author: { kind: 'agent' | 'user'; id: string };
    messageId: string | null; // the Task Message a person's follow-up posted
    text: string; // at most 32,000 characters
    at: string;
};

type WorkerOutcome =
    | { kind: 'report'; report: WorkerReport }
    | { kind: 'stopped' }
    | { kind: 'failed'; reason: WorkerFailure; detail: string | null };

type WorkerReport = {
    outcome: 'done' | 'needs-you' | 'failed';
    text: string; // at most 8,000 characters
    ask: string | null; // required for needs-you, null otherwise
    personId: string | null; // the person a needs-you report names, or null for its Agent
    pullRequestUrls: string[];
    source: 'worker' | 'provider';
    messageId: string; // the Task Message the report posted
};

type WorkerFailure =
    | 'no-report'
    | 'machine-offline'
    | 'machine-removed'
    | 'place-off'
    | 'launch-refused'
    | 'harness-error'
    | 'provider-error'
    | 'provider-expired';
```

`status` is a projection of the newest turn, as the
[Run lifecycle](cloud-agent-run-lifecycle.md) projects work from its newest Run:

| Newest turn | `status` |
| --- | --- |
| `queued`, waiting for a slot, its carrier, or the provider | `queued` |
| `working` | `working` |
| Settled with a `done` report | `done` |
| Settled with a `needs-you` report | `needs-you` |
| Settled with a `failed` report, or a `failed` outcome | `failed` |
| Settled as `stopped` | `stopped` |

The Run lifecycle's transition function keeps owning how a turn moves from `queued` to settled.
W2 renames it to turns and maps its settled statuses onto `WorkerOutcome` (`completed` and
`pending_input` carry a report, `cancelled` is `stopped`, `failed` and `expired` are `failed`).

A turn's input lives on the Server, because a queued turn must survive its carrier being offline.
Anyone who can see the Worker can read it in `haus worker inspect` and the Worker detail. Raw
transcripts, tool traces, and provider credentials stay on the machine or with the provider.

## Places

A place is where a Worker runs. The CLI and every surface write it as a string:

| Place string | Meaning |
| --- | --- |
| `computer:<name>` | A native Claude Code or Codex session on that Computer ([Workers on a Computer](#workers-on-a-computer)) |
| `cursor` | A Cursor cloud agent ([Cloud places](cloud-agents.md)) |
| `claude` | A Claude Code cloud session ([Cloud places](cloud-agents.md)) |

`--on` also takes a bare Computer name. When two Computers share a name, `haus worker places`
prints `computer:<computerId>` for each, and only that form resolves.

**The switch.** A Computer runs Workers locally only while its **Workers can run here** switch is on. The
person who attached the Computer, or an Owner or Admin, sets it from the Computer's settings. The
switch is Server state on the Computer record, and the Server checks it at every start and
follow-up. It is off for a newly attached Computer. Turning it on lets Agents run unattended Claude
Code or Codex sessions there under that machine's logins ([Run](#run-a-turn)). Turning it off lets
working turns finish, refuses new starts and follow-ups with `WORKER_PLACE_OFF`, and settles turns
queued there as failed `place-off`. It also clears every Project default that names the Computer
([Projects](projects.md#default-place-for-workers)).

**Carrying a cloud place.** A cloud Worker's provider login lives on a Computer, as it does today.
So each cloud Worker has a carrier Computer: one whose provider capability is ready. Carrying needs
no switch, because the switch governs local execution and the provider login already belongs to
the person who connected it. At start the Server picks the Agent's own machine when it qualifies, else the qualifying
online Computer that has been attached longest. The carrier never changes. A Worker whose carrier
is offline reads **Status unconfirmed** while the hosted run keeps working, and reconciles when the
carrier returns. Because a cloud place needs no particular machine, an Agent whose machine is
offline still starts cloud Workers
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 6).

**The default place.** Each Project has a default place for its Workers, set in its settings
([Projects](projects.md)). A start without `--on` uses the Task's Project default. A Project
without one, or whose default is not usable now, refuses the start with `WORKER_PLACE_REQUIRED`
and lists the usable places. Haus never falls back to another place on its own.

**Limits.** Each Computer has a Worker limit, set beside its switch, default 4. Each cloud provider
has a limit per Server, set by an Owner or Admin beside the cloud model setting, default 10. A
limit counts working turns, not Workers, so an idle Worker between turns holds no slot. A turn past
the limit waits as `queued`, first come first served per place, and starts when a slot frees.

## The CLI

`haus worker` is the Agent surface. After R4 an Agent calls it through `execute`, and the Server
handles it. A Worker calls only `haus worker report`.

| Command | Who | What it does |
| --- | --- | --- |
| `haus worker places [--task <KEY-n>]` | Agent | Lists every place with its switch, readiness, runtimes, linked repos, and free slots, and marks the Task's Project default |
| `haus worker start --task <KEY-n> --title <t> [--on <place>] [--repo <owner/name>] [--ref <ref>] [--runtime claude-code\|codex] [--model <id>]` | Agent | Starts a Worker with the brief on stdin |
| `haus worker send --worker <id> [--interrupt]` | Agent | Queues a follow-up from stdin. `--interrupt` stops the working turn, drops older queued follow-ups, then sends |
| `haus worker stop --worker <id>` | Agent | Stops the working or queued turn and drops queued follow-ups |
| `haus worker inspect [--task <KEY-n>] [--worker <id> [--report]]` | Agent | Lists the Agent's Workers, or one Worker with its turns, inputs, reports, branch, and pull requests |
| `haus worker report --outcome done\|needs-you\|failed [--ask <text>] [--person <handle>] [--pr <url>]...` | Worker | Records the turn's report with its text on stdin |

**Start.** The Server refuses before writing anything when the Task is missing, closed, or one the
Agent cannot post in (`WORKER_TASK_REQUIRED`, `WORKER_TASK_CLOSED`), when the place is unusable
(`WORKER_PLACE_REQUIRED`, `WORKER_PLACE_OFF`, `WORKER_PLACE_UNAVAILABLE`), when the repo is not one
of the Project's (`WORKER_REPO_UNKNOWN`), or when a Computer place has not linked it
(`WORKER_REPO_NOT_LINKED`). `--repo` defaults to the Project's only repo and is required when it
has several. `--runtime` defaults to the first ready of Claude Code and Codex on that Computer.
`--runtime` and `--model` are refused for cloud places, whose model is the Server's
[cloud model setting](cloud-agents.md#model).

A start passes the freshness hold of the Task's chat, as `haus message send` does, because a newer
message there may change the brief. A held start writes nothing and prints the shown messages.
Otherwise the Server records the Worker and its first turn and returns at once. The receipt says
the Worker is queued or starting, never that it started. Launch outcomes land on the Worker.

Starting a Worker posts no Message. The card appears on the Task page, and the Agent says what it
started only when that is worth saying.

**Who may act.** An Agent starts Workers on open Tasks it can post in, and sends follow-ups to and
stops only its own Workers. A person who can read the Task can send a Worker a follow-up and stop
it from its card. Another Agent reaches a Worker only by @mentioning its Agent in the open
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decision 12).

## What a Worker reads

The Server composes every turn's input, because it holds the brief and Drive's current revisions.
The Computer or carrier runs that input and composes nothing.

The first turn carries, in this order:

1. The Haus Worker instructions: how to work quietly, how to report, where deliverables go, and
   the commit trailer.
2. `haus/AGENTS.md`.
3. `projects/<key>/AGENTS.md` for the Task's Project.
4. `agents/<handle>/WORKER.md` for the delegating Agent.
5. The brief.

Each Drive file is inlined with its path and revision id. A missing file is left out. The repo's
own `AGENTS.md` comes from the Worker's checkout. Codex and Cursor load it natively. For Claude
Code, local or cloud, the Haus Worker instructions tell the Worker to read it first, because
Claude Code loads `CLAUDE.md` instead.

A later turn carries its follow-ups. When `WORKER.md`'s current revision differs from
`workerMdRevisionId`, the turn's input starts with the whole new file as a receipt, as memory is
delivered ([ADR 0052](../docs/adr/0052-memory-is-one-capped-file-and-heartbeats-retire.md)).
Unchanged rule files are never sent again. A rule change reaches a working turn at its next turn,
because mid-turn steering is deferred.

The Server composes a turn's input when it dispatches the turn, not when it queues it, so a
`WORKER.md` change that lands while a turn waits rides that turn. A dispatch the place has not
acknowledged is composed again when it is sent again. `workerMdRevisionId` advances only when the
place acknowledges the input that carried the revision: the Computer once the harness accepted the
turn's input, the carrier once the provider accepted the send. A turn that fails before that
acknowledgement leaves the revision undelivered, so the next turn carries it again.

A cloud Worker has no Drive folder, so this inlining is how it gets its rules. A Worker on a
Computer gets the same inlined text and also has the files in its folder.

The Haus Worker instructions are one checked-in text with a size-cap test, like the Agent prompt.
The Agent prompt's delegation text goes through the [guarded prompt contract](../AGENTS.md#agent-system-prompt-changes).
Report-handling guidance rides the [Worker inbox items](inbox.md#worker-items), not the prompt.

## Reports

A report ends each turn. `haus worker report` records it during the turn. Calling it again in the
same turn replaces it. The turn settles when the Worker's process ends, after its Drive push
closes, and settlement posts the report.

- `done` says the brief is met.
- `needs-you` asks for something with `--ask`. With `--person`, the report @mentions that person.
  Without it, the ask is for the Agent. The Server refuses a handle that is not a human member who
  can read the Task, and the error lists the Task's followers, so the Worker fixes the call
  instead of the Server guessing.
- `failed` says why the brief cannot be met.

The text is at most 8,000 characters. Longer write-ups go to a Drive file under `reports/`, cited
from the text. `--pr` names each pull request the turn opened or updated.

**A report posts in the Task.** Settlement posts one Message in the Task's chat. Its author is the
delegating Agent, and its body is `{ kind: 'worker-report'; workerId; turnId; outcome }`, so every
surface shows it as the Worker's report ("Forge · Worker on mini"). Its content is the report text,
then the ask with its @mention, then the pull request links. The Agent never receives this Message
through ordinary delivery, because an author never does. Other recipients of the Task receive it as
ordinary Agent-authored traffic, and followers see the Task go unread.

**Drive citations.** A report cites files as `[label](drive://<path>)`, and the Message stores them
as [citations](artifact-drive.md#citations). Because the report posts after the push closes, each
citation binds to the revision the Worker's push left. The card shows the cited files at those
revisions.

**Outcomes nobody wrote post nothing.** When a turn settles without a report, the Server records a
`failed` outcome with a reason and posts no Message, because no one wrote one. The card shows it,
and the delegating Agent hears it through its inbox and tells people what matters.

| Reason | When |
| --- | --- |
| `no-report` | The harness process ended and the turn has no report |
| `machine-offline` | The Computer stayed disconnected for 30 minutes during the turn |
| `machine-removed` | The Computer was removed, or the cloud Worker's carrier was |
| `place-off` | The switch went off while the turn was queued |
| `launch-refused` | The runtime or provider definitely refused the launch |
| `harness-error` | The native harness failed to start or crashed |
| `provider-error` | The provider ended the run in error with no result text |
| `provider-expired` | The provider expired the run |

A stopped turn settles as `stopped` with no report and no Message.

**Cloud reports.** A cloud Worker cannot call `haus worker report`. Its report comes from the
provider's result, as [Cloud places](cloud-agents.md#reports-from-the-provider) describes, with
`source: 'provider'`.

## Quiet by default

A Worker writes to the Task only through its reports. Its credential cannot send messages, start
Workers, or reach another Task, so quiet is enforced, not requested. Live status, place, activity,
and the newest report show on the card and in `haus worker inspect`. Status changes, activity, and
follow-up delivery never post a Message and never make the Task unread.

## Follow-ups and stop

A follow-up is the next turn's input. A working turn is never steered mid-turn.

- **From the Agent.** `haus worker send` queues it. It posts nothing in the Task, and the card's
  follow-up note shows it waiting or running.
- **From a person.** The Worker card's composer posts an ordinary Message in the Task, authored by
  the person with body `{ kind: 'worker-follow-up'; workerId }`, shown as "Zach → Worker on
  macbook". The Message reaches the delegating Agent through ordinary Task delivery, and the same
  text queues as a follow-up. A plain post in the Task, not from the card, goes to the Agent only.

Follow-ups queued while a turn works wait for that turn to settle. Then all of them, in order and
labelled by author, become the next turn's input. A follow-up to an idle Worker starts a turn at
once, subject to the place's limit. A needs-you Worker answered from its card continues with that
answer as its next turn.

`stop` asks the place to end the working turn, or drops a queued one, and drops queued follow-ups.
The turn records who asked and reads **Stopping** until it settles as `stopped`. A stopped Worker
takes later follow-ups. A stop while the place is offline settles the turn on the Server at once,
and the Computer ends the process when it reconnects.

## Workers on a Computer

A Worker on a Computer is a native Claude Code or Codex session started by the Haus Computer
daemon. The Agent's own loop runs on the Server
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)). The
Worker keeps its harness on the machine.

### Layout

Everything a Worker owns on the machine sits under `workers/<worker-id>/` in the Computer's data
root:

```text
workers/<worker-id>/checkout/        git worktree of the Project repo
workers/<worker-id>/drive/           the Worker's drive/ folder
workers/<worker-id>/runtime/drive.json
workers/<worker-id>/runtime/turns.json
```

The checkout is a `git worktree` of the repo's linked clone on that Computer, on a new branch
`haus/<key>-<n>-<worker-id>` from `--ref`, or from the remote default branch after a fetch. The
drive folder sits outside the checkout ([Drive folder](drive-folder.md)), so the repo never sees
it. A new drive folder starts as a copy of the freshest folder already on the Computer, with its
records and with permissions reset for this writer, then pulls the delta. A Computer with no folder
pulls in full.

### Run a turn

1. The Server sends a turn-start frame with the turn id, the composed input, the runtime, the
   model, and a credential for that turn. The frame is idempotent by turn id.
2. The Computer journals the turn as accepted, then pulls the drive folder.
3. It runs the harness in the checkout under the machine user's own environment, so Claude Code,
   Codex, git, and `gh` use the logins already on that machine. The first turn starts a new
   session. Later turns resume it. Claude Code runs with `bypassPermissions`. Codex runs with its
   `workspace-write` sandbox and network access. Both run unattended.
4. The harness gets `haus` on `PATH` and the turn credential in `HAUS_WORKER_TOKEN`. The credential
   allows `haus worker report` for this turn and the Drive read commands, and nothing else. It dies
   when the turn settles.
5. The Computer reports a bounded `activity` line from the harness's events, at most every few
   seconds.
6. When the process ends, the Computer pushes the drive folder under the turn id, closes the push,
   and reports the turn ended. The Server settles it.

A turn whose outcome is unknown after a Computer crash is never run again. On restart the Computer
reports any accepted turn with no live process as ended, and the Server settles it with its report,
or as failed `no-report`. A dead machine is a failed turn, not a moved Worker.

### Closing

When a Task becomes done or canceled, the Server closes each of its Workers in this order:

1. It marks the Worker closing. From here every start, follow-up, and report for it is refused.
2. It settles each queued turn as `stopped` and drops queued follow-ups. Nothing was sent, so
   nothing runs.
3. It stops each working turn as `stop` does. The Computer ends the harness process, or the
   carrier cancels the hosted run. The Computer pushes the drive folder and closes the push. The
   turn settles with the report it already recorded, or as `stopped`.
4. It delivers each Worker's final outcome to the delegating Agent as one `worker_report` item
   ([inbox](inbox.md#worker-items)). A written report posts as usual. A `stopped` outcome posts
   nothing.
5. It sets `closedAt` and tells the place. Only then does the Computer run `git worktree remove`
   on the checkout and delete the drive folder. The branch stays, so committed work survives. The
   native session files stay where the harness keeps them.

A place that is offline gets steps 3 and 5 when it reconnects. The Server settles the turn on its
own side at step 3 and never waits on the place to deliver step 4.

## Deliverables

A Worker writes deliverables into its Agent's Drive area, under a folder per Task:

```text
agents/<handle>/reports/<KEY-n>/…
agents/<handle>/renders/<KEY-n>/…
agents/<handle>/handoffs/<KEY-n>/…
```

A Worker writes what its Agent writes ([Areas](artifact-drive.md#areas)). Each revision names the
Worker as author with the Worker's Task. Conflicts from a Worker's push go to its Agent's inbox as
`drive_conflict`. A cloud Worker writes nothing to Drive. Its deliverables are its pull requests
and its report.

## Commits and pull requests

**The trailer.** The Haus Worker instructions tell every Worker to end each commit message with
`Haus-Task: <KEY-n>`, so `git log` leads back to the Task. The trailer is for tracing only. Haus
never scans commits for it and never rewrites a commit that lacks it.

**Pull requests attach through reports.** Each URL a report names, and each pull request a cloud
provider reports, attaches to the Task ([Tasks](tasks.md)) and to the Worker's `pullRequests`. A
URL that is not a GitHub pull request is kept in the text and attaches nothing.

### Pull request readings

A reading is evidence of a pull request's state. Haus never writes to a pull request.

```ts
type PullRequestReading = {
    repository: string; // owner/name, lower-cased
    number: number;
    url: string;
    title: string | null;
    state: 'draft' | 'open' | 'merged' | 'closed';
    headSha: string | null;
    checks: 'none' | 'pending' | 'passing' | 'failing' | 'unknown';
    review: 'none' | 'approved' | 'changes-requested' | 'unknown';
    changedFiles: number;
    additions: number;
    deletions: number;
    settledAt: string | null;
    observedAt: string;
    source: 'github' | 'computer';
};
```

The readings contract carries over unchanged from cloud agents. One row per Server, repository,
and number. A report or a provider observation seeds a row from the Computer's `gh` reading, and
`haus task attach-pr` seeds one from GitHub. GitHub webhooks mark rows for refresh and never write.
One serial Server refresher reads marked rows with the installation token, never fans out, writes
source `github`, and emits `worker.updated` only when the reading changed. `checks` and `review`
roll up as before. A failed read never fabricates a reading. The Computer's `gh` token stays local.

**The change wake.** When a refresh moves a reading from `draft` to `open`, or its checks from
`pending` to `passing` or `failing`, the Server queues a `pull_request` item
([inbox](inbox.md#worker-items)) for the delegating Agent of each Worker that reported it whose
newest turn settled, and for the Task's assignee Agent when no Worker reported it. A working turn
reports on its own, so it wakes nobody.

## The card

The Task page lists its Workers in the attached-work panel, then attached pull requests no Worker
names, then pending reminders. W4 builds it, following how a Capy parent shows its children
(the note `w4-capy-research.md` in the program's notes folder).

- **The Workers section** is counted and collapsible. Each row has two lines: a status glyph and
  the title, then the needs-you ask or the place, and the age. A Worker reads Working while any turn
  runs. Expanding a row shows its tail (the last step line or activity), its report in a line, its
  ask, **Open full log**, and a compact composer. Pull requests sit in their own counted section.
- **Opening a Worker** (Open full log, or a Worker link in the Task chat) opens it as a tab in the
  Task's right pane beside **Overview**, as Capy opens a subagent, so the Task chat stays on
  screen. Several Workers can each have a tab. ✕ closes the selected Worker's tab, ••• beside it
  holds **Open in `<provider>`** and **Copy link**, and the open tabs ride the Task URL
  (`?worker=<id>&tab=<id>`). On a pane too narrow for the side pane it opens the Worker page
  (`/s/<slug>/workers/<workerId>`) instead.
- **The Worker's conversation** uses Haus channel message rows, left-aligned: the brief as a
  Message from the Agent that started it, follow-ups from their authors, and the Worker's output as
  a Message from the Worker (its place name, its provider logo as the avatar). Centered system rows
  separate turns ("Finished, worked for 28m"). Fenced code in a report renders through the
  transcript's code blocks.
- **Steps** sit inside the Worker's message for that turn as a stock HeroUI Pro `ChainOfThought`,
  collapsed, titled "Worked for 6m · 5 steps" (shimmering while the turn is live). Each step is a
  stock `ChatTool` (status icon, verb, path or command, +/− lines), and a run's output opens in
  the code block inside it.
- **The composer** is docked under the conversation, enabled while the Task has a chat, is open,
  and the Worker is not closed. While a turn is live and the field is empty, its send button is
  **Stop**.
- **In the Task chat** a report Message renders as a centered muted lifecycle line ("`<title>`
  needs you, worked for 17m") and a person's follow-up carries a "To Worker on `<place>`" context
  line. Both open the Worker, so the report text shows once.
- **Step summaries.** `WorkerTurn.steps` (`packages/haus-api/src/worker-steps.ts`) is a bounded
  list, the newest 40, of `{ kind: read | edit | run | search, label, state: running | done |
  failed, additions, deletions, output }` that a carrier reports per turn: a path for read and
  edit, the command line for run, the query for search, line counts only on edit, and `output`
  only on run, as the tail of its terminal output up to 4,000 characters. It never carries file
  contents. Each field drives one stock `ChatTool` prop. It is optional: without it the Worker's
  message shows its report and activity. W3b adds the carrier and Server side.

The Task summary exposes the count and place labels of its live Workers, and the people named by
needs-you reports that no later turn answered, for the sidebar row ("Forge · 6 workers · mini,
cursor, macbook", "waiting on Zach"). The human Inbox's Happening now lists queued and working
Workers through `worker.listActive`, and each row opens its Task. iPhone shows each Worker's
place, status, newest report, and Stop on the Task's attached-work header.

Liveness reads from the Worker's own `updatedAt`, never from Computer connection state, except for
**Status unconfirmed**, which the Server derives from the place or carrier being offline.

## Visibility and events

Anyone who can read a Worker's Task sees the Worker, its turns, and its reports. The delegating
Agent always sees its own Workers. Messages do not link Workers, except links kept on read-only
history ([Migration](#migration-from-cloud-agents)). A Message points at a Worker's
Task, and a report Message names its Worker in its body.

`worker.onUpdated` notifies with the Task and Worker ids on every record change. The App refetches
`task.get` and `worker.get`. Report and follow-up Messages arrive through `chat.onMessageCreated`
like any Message.

## Ownership

| Layer | Owns |
| --- | --- |
| Haus Server | Worker records, turn inputs and outcomes, place checks, limits and queues, credentials, composed turn input, report Messages, readings, inbox items, events |
| Haus Computer | The worktree, drive folder, and native harness for its Workers, the provider adapters for cloud Workers it carries, and evidence about both |
| Haus App | The Worker card, the Task's Worker summary, Happening now, the switch and limits in settings |
| Cursor and Claude | Hosted runs, their checkouts, transcripts, and billed usage |
| GitHub | Pull request identity and lifecycle |

## Migration from cloud agents

W2 migrates every caller and deletes the cloud agent path in one change.

- Each `cloud_agent_work` row with a Task becomes a Worker with the same id, place from its
  provider, and carrier from its `computer_id`. Each Run becomes a turn with the same id. A
  settled Run's summary becomes a provider report.
- Work with no Task, from before ADR 0053, becomes a closed Worker with `taskId: null`. It stays
  as read-only history, the way ADR 0053 kept pre-place records. Anyone who can read a Message
  that links it, and its delegating Agent, can read it. Every write refuses with
  `WORKER_HISTORY_READ_ONLY`. Nothing is deleted.
- Each Message link `cloud-agent://<id>` to work with a Task becomes a reference to that Task.
  Links to taskless history stay, and `cloud_agent_work_links` keeps only those rows.
- Pending follow-ups that exist only in a Computer's local file move to Server-owned turns before
  that file goes, in this order. The Server already holds each pending Run as a turn with no
  input. On reconnect the Computer sends each pending entry (its work id, Run id, preceding Run
  ids, and instructions) and its acknowledged provider ids from the launch journal. The Server
  writes each into its turn, recovering the provider ids, and acknowledges each item. The
  Computer removes an entry only after its acknowledgement. The Server dispatches a migrated turn
  only once it holds that turn's input. An offline carrier drains when it reconnects. W3 deletes
  the drain path once every attached Computer reports an empty file.
- `cloud_agent_work` inbox rows become `worker_report`, `worker_stall`, or `pull_request` items by
  their notice.
- Each Project's default place becomes the default provider of the Computer that launched the
  Server's newest cloud agent work. A Server with none leaves defaults unset. The migration never
  turns **Workers can run here** on. Cloud places keep working without it, and local execution
  stays off until the attaching person, an Owner, or an Admin turns it on.
- Deleted with no alias: `haus cloud-agent` and its `cancel` spelling, `--provider`, `--say`,
  `--cause` on start, the launch Message, **Make default** and `defaultProvider`, and the
  Computer-local pending follow-up file once drained. Until W3 moves the default onto Projects,
  **Make default** stays, and a start without `--on` runs on the Agent's Computer's ready default. The website's older `TranscriptWorker` row type is now `TranscriptSubagent`,
  so the word means one thing.

## Deferred

- Steering a working turn.
- Grok Build as a Worker runtime.
- A Worker with no repo, and Drive files written by cloud Workers.
- Moving a Worker between places.

## Regression guards

W2 to W4 add these.

| Contract | Guard |
| --- | --- |
| A report posts one Message in the Task and queues one `worker_report` item for the delegating Agent | `apps/server/test/worker-report-delivery.test.ts` |
| Reports from several Workers on one Task ride one Agent run | `apps/server/test/worker-report-delivery.test.ts` |
| A turn whose process ends without a report settles failed `no-report`, posts nothing, and wakes the Agent | `apps/server/test/worker-supervision.test.ts` |
| A turn past a place's limit queues and starts when a slot frees | `apps/server/test/worker-supervision.test.ts` |
| Stop settles a working or queued turn as `stopped` and drops queued follow-ups | `apps/server/test/worker-stop.test.ts` |
| A person's follow-up posts in the Task, reaches the Agent, and runs only after the working turn settles | `apps/server/test/worker-follow-up.test.ts` |
| A changed `WORKER.md` rides the next turn once, and an unchanged one never repeats | `apps/server/test/worker-turn-input.test.ts` |
| A start without a usable place, switch, or linked repo writes nothing | `apps/server/test/worker-start.test.ts` |
| The turn credential reports for its own turn only and cannot send a message | `apps/server/test/worker-credential.test.ts` |
| A pull request change wakes the Agent of each settled Worker that reported it, once per head commit | `apps/server/test/pull-request-wake.test.ts` |
| A `WORKER.md` change while a turn is queued rides that turn, and advances only on acknowledgement | `apps/server/test/worker-turn-input.test.ts` |
| Closing a Task stops and settles its Workers, delivers each outcome, then removes checkouts | `apps/server/test/worker-close.test.ts` |
| A pending local follow-up becomes a Server turn and leaves the Computer only after acknowledgement | `apps/computer/src/workers/follow-up-drain.test.ts` |
| A crash after acceptance never reruns the turn | `apps/computer/src/workers/turn-journal.test.ts` |
