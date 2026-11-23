---
summary: Normative Workers contract (ADR 0056). A Worker is a quiet, scoped run attached to one Task, started by an Agent with `haus worker` on a place (`computer:<name>`, `cursor`, `claude`). It reads the rule stack at launch and WORKER.md on change, ends each turn with a typed report (done, needs-you, failed) that posts in the Task and wakes its Agent, asks structured questions through its harness's own question tool (the turn ends and any follow-up answers), takes follow-ups between turns, and is supervised with per-place limits, stop, and a missing report counted as failed. Covers the record, places, the Computer run in a worktree with that machine's logins, deliverables in Drive, the Haus-Task trailer, pull requests attached through reports, the card, and the migration from cloud agents.
read_when:
  - changing Workers, Worker turns, Worker reports, or the `haus worker` CLI family
  - changing where a Worker runs, the "Workers can run here" switch, the Project's default place, or concurrency limits
  - changing what a Worker reads at launch, WORKER.md delivery, or the Haus Worker instructions
  - changing how people or Agents send a Worker a follow-up or stop it
  - changing a Worker on a Computer, its worktree, its credential, or its drive/ folder
  - changing pull request readings, pull requests attached through reports, or the Haus-Task trailer
  - changing the Worker card, the Task's live Worker summary, or Happening now
  - changing how a Worker's harness question (AskUserQuestion, request_user_input) is captured, settled, shown, or answered
  - migrating cloud agent work, Runs, or `haus cloud-agent` to Workers
---

# Workers

An Agent runs one turn at a time. A Worker is how it does parallel work: a scoped run attached to
one Task, briefed by the Agent, working where the work is, and reporting back.
[ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decides the model. This spec is
the contract. [Cloud places](cloud-agents.md) carries what is specific to `cursor` and `claude`.
[Tasks](tasks.md) owns the Task, and [Projects](projects.md) owns the default place and where repos are listed.

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
    repository: string; // GitHub owner/name, lower-cased since ADR 0060; any repo, one per Worker
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
    questions?: WorkerQuestion[]; // the harness's structured questions; only on needs-you
    questionsClosed?: { reason: 'dismissed' | 'stopped'; by: { kind: 'agent' | 'user'; id: string }; at: string };
    source: 'worker' | 'provider';
    messageId: string; // the Task Message the report posted
};

type WorkerQuestion = {
    question: string;
    header: string | null;
    options: { label: string; description: string | null }[]; // empty takes a typed answer only
    multiSelect: boolean;
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
| `computer:<computerId>` | A native Claude Code or Codex session on that Computer ([Workers on a Computer](#workers-on-a-computer)) |
| `cursor` | A Cursor cloud agent ([Cloud places](cloud-agents.md)) |
| `claude` | A Claude Code cloud session ([Cloud places](cloud-agents.md)) |

`computer:<computerId>` is the stored and printed form. `--on` also takes `computer:<name>` or a
bare Computer name, and the Server resolves it. When two Computers share a name, the start refuses
with `WORKER_PLACE_AMBIGUOUS` and lists their `computer:<computerId>` forms, and only those
resolve. The Worker record shows the place as `workerPlaceViewSchema`, which adds the Computer's
reported name (`computerName`, null when unknown). Inputs, frames, and storage never carry the
name.

> **Amended 2026-11-22 by
> [ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)
> decision 4:** only the attacher turns the switch on. The attacher, Owners and Admins can turn it
> off.

**The switch.** A Computer runs Workers locally only while its **Workers can run here** switch is on. The
person who attached the Computer, or an Owner or Admin, sets it from the Computer's settings
(`computer.setWorkers`, with the Worker limit; the App control is W4). `computer.list` shows
`workersEnabled`, `workerLimit`, and `canChangeWorkers`, whether the viewer may set them. Owners
and Admins see every Computer there, and a plain member sees only the Computers they attached. The
switch is Server state on the Computer record (`computers.workers_enabled`), and the Server checks it at every start and
follow-up. It is off for a newly attached Computer. Turning it on lets Agents run unattended Claude
Code or Codex sessions there under that machine's logins ([Run](#run-a-turn)).

**What turning it on trusts.** A Worker runs as the machine user, and a Claude Code Worker runs
unsandboxed, so it can read anything that user can, including the Computer's own Haus credential.
With it, a Worker can act as the Computer and as every Agent the Computer hosts, beyond its Task.
Turning the switch on therefore gives that Server's Agents the machine user's full local access:
the same trust as the machine's GitHub and model logins, which is why only the attacher, an Owner,
or an Admin may set it. The turn credential scopes what a Worker is handed, not what the machine
user can reach. OS isolation is the follow-up
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md) decision 7). Turning it off lets
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
and lists the usable places. Haus never falls back to another place on its own. Until the Project
settings UI ships, a Project with no default falls back to the Agent's Computer's ready cloud
default ([Migration](#w3-transitional-decisions)). A default that is set but unusable still
refuses.

A Computer place is usable when its switch is on, it is online, and some runtime it reports in
`workerRuntimes` is ready. A cloud place is usable when an online Computer can carry it.

**Limits.** Each Computer has a Worker limit, set beside its switch, default 4. Each cloud provider
has a limit per Server, set by an Owner or Admin beside the cloud model setting, default 10. A
limit counts working turns, not Workers, so an idle Worker between turns holds no slot. A turn past
the limit waits as `queued`, first come first served per place, and starts when a slot frees.

## The CLI

`haus worker` is the Agent surface. After R4 an Agent calls it through `execute`, and the Server
handles it. A Worker calls only `haus worker report` and the Drive read commands.

| Command | Who | What it does |
| --- | --- | --- |
| `haus worker places [--task <KEY-n>]` | Agent | Lists every place with its switch, readiness, runtimes, repo folders, and free slots, and marks the Task's Project default |
| `haus worker start --task <KEY-n> --title <t> --repo <owner/name> [--on <place>] [--ref <ref>] [--runtime claude-code\|codex] [--model <id>]` | Agent | Starts a Worker with the brief on stdin |
| `haus worker send --worker <id> [--interrupt]` | Agent | Queues a follow-up from stdin. `--interrupt` stops the working turn, drops older queued follow-ups, then sends |
| `haus worker stop --worker <id>` | Agent | Stops the working or queued turn and drops queued follow-ups |
| `haus worker inspect [--task <KEY-n>] [--worker <id> [--report]]` | Agent | Lists the Agent's Workers, or one Worker with its turns, inputs, reports, branch, and pull requests |
| `haus worker report --outcome done\|needs-you\|failed [--ask <text>] [--person <handle>] [--pr <url>]...` | Worker | Records the turn's report with its text on stdin |

**Start.** The Server refuses before writing anything when the Task is missing, closed, or one the
Agent cannot post in (`WORKER_TASK_REQUIRED`, `WORKER_TASK_CLOSED`), when the place is unusable
(`WORKER_PLACE_REQUIRED`, `WORKER_PLACE_OFF`, `WORKER_PLACE_UNAVAILABLE`, `WORKER_PLACE_AMBIGUOUS`),
or when the requested runtime, or every runtime, is not ready there (`WORKER_RUNTIME_UNAVAILABLE`).
`--repo` is required and takes one GitHub `owner/name`, lower-cased; a start without it is a CLI
usage error ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) decision 5). Any repo works on any place. A Computer with no folder
for it clones it once into the Server's partition ([Layout](#layout)), and that clone puts the
repo on the Server's list. A cloud Worker's start puts it there once the provider starts.
`--runtime` defaults to the first ready of Claude Code and Codex
on that Computer. `--model` must be one the Computer reports that runtime can run (Claude Code's
`opus`, `sonnet`, and `haiku` aliases included), or the start is refused with
`WORKER_MODEL_UNAVAILABLE` listing the ones it can. Left out, it is the delegating Agent's own
model when that runtime runs it there, else the first the Computer reports. A Worker never inherits
the machine's own runtime default, because that default may be a model the login cannot run. Both
are refused for cloud places
with `WORKER_OPTION_CLOUD`, whose model is the Server's [cloud model setting](cloud-agents.md#model).
`--ref` defaults to the remote's default branch.

Each refusal's message says what to do, and the CLI adds the step that resolves it, usually
`haus worker places --task <KEY-n>`.

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
own `AGENTS.md` comes from the Worker's worktree. Codex and Cursor load it natively. For Claude
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
place acknowledges the input that carried the revision: the Computer with `worker-turn-input-accepted`
once the harness accepted the turn's input (Claude Code: spawned, stdin written, first stream
event; Codex: `turn/start` returned), for the turn's current attempt only, and the carrier once
the provider accepted the send. A turn that fails before that
acknowledgement leaves the revision undelivered, so the next turn carries it again.

A cloud Worker has no Drive folder, so this inlining is how it gets its rules. A Worker on a
Computer gets the same inlined text and also has the files in its folder.

The Haus Worker instructions are one checked-in text with a size-cap test, like the Agent prompt.
The Agent prompt's delegation text goes through the [guarded prompt contract](../AGENTS.md#agent-system-prompt-changes).
Report-handling guidance rides the [Worker inbox items](inbox.md#worker-items), not the prompt.

## Reports

A report ends each turn. `haus worker report` records it during the turn as the turn's report
draft (`worker_turns.report_draft`), through `POST /api/worker/report`. Calling it again in the
same turn replaces it. After the turn settles it refuses with `WORKER_TURN_SETTLED`. Once the
Worker is closing it refuses new reports, but a draft recorded before that still settles as the
report ([Closing](#closing)). The turn settles when the Worker's process ends, after its Drive push
closes, and settlement posts the report.

- `done` says the brief is met.
- `needs-you` asks for something with `--ask`. With `--person`, the report @mentions that person.
  Without it, the ask is for the Agent. The Server refuses a handle that is not a human member who
  can read the Task with `WORKER_PERSON_UNKNOWN`, and the error lists the Task's followers, so the Worker fixes the call
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
| `no-report` | The harness process ended, or a Computer restart lost it mid-run, and the turn has no report |
| `machine-offline` | The Computer stayed disconnected for 30 minutes during the turn |
| `machine-removed` | The Computer was removed, or the cloud Worker's carrier was |
| `place-off` | The switch went off while the turn was queued |
| `launch-refused` | The runtime or provider definitely refused the launch, or the launch fence refused the turn credential |
| `harness-error` | The native harness failed to start, or the Computer stopped between the credential and the launch |
| `provider-error` | The provider ended the run in error with no result text |
| `provider-expired` | The provider expired the run |

A stopped turn settles as `stopped` with no report and no Message.

### Questions

A Worker asks a person a structured question with its harness's own question tool: Claude Code's
`AskUserQuestion`, Codex's `request_user_input`, or the hosted session's `AskUserQuestion` on
`claude`. Haus never waits inside the tool call. Settings grant permissions, and Workers only ask
questions ([ADR 0037](../docs/adr/0037-humans-are-addressed-by-mention.md), amended 2026-11-21).

1. **Capture.** The driver validates the questions (one to four, each with up to ten options) and
   journals them on the turn before anything else. It sends `worker-turn-question` with the turn's
   attempt, and again before `worker-turn-ended`, so a lost frame is resent.
2. **End the turn.** Claude Code gets a deny with `interrupt: true` to its `can_use_tool` request.
   Codex gets `turn/interrupt`, then an error answer to the request. A second question in the same
   turn is refused, and questions Haus cannot read are refused without ending the turn.
3. **Settle.** The first current-attempt frame settles the turn at once as a `needs-you` report
   with `source: 'worker'` (`'provider'` on `claude`), `questions`, the questions as its text, and
   the first question as its ask. A report draft's pull requests carry over. The turn holds no slot
   from here, and the owed-stop fence holds later turns until the process ends. A process that dies,
   a restart, or an offline Computer after capture never settles it again. A question the
   Computer replays after the turn settled failed `machine-offline` replaces that failure while
   the turn is still the Worker's newest.
4. **Notify.** The report @mentions the newest person whose follow-up was in the asking turn's
   input, when they can still read the Task. Then the delegating Agent gets no `worker_report`, so it
   doesn't race the person. Otherwise the report names no one and wakes the Agent, which answers or
   @mentions someone in the Task.
5. **Answer.** Any follow-up answers the newest turn's open questions and becomes the next turn's
   input. The harness resumes the same session. The Worker card's answer is the person's follow-up
   with `answersTurnId`: a numbered "**question** → answer" list (`workerAnswersText`). It is
   refused (CONFLICT) once a later turn exists ("Answered by @zach."), the questions were dismissed
   or stopped, or the Task closed.
6. **Dismiss and Stop.** `worker.dismissQuestion` closes the questions for everyone, attributed in
   `questionsClosed`, and starts no turn. The Worker stays `needs-you`. Stop on a Worker with open
   questions and no live turn closes them the same way, with reason `stopped`.

Every other prompt a Worker's harness raises is denied: Claude Code's other `can_use_tool`
requests, so its own dangerous-`rm` checks stay closed, and Codex's command, file and permission
approvals, which `approvalPolicy: never` keeps from arising inside the `workspace-write` sandbox. A Claude cloud `requires_action` that is not an
`AskUserQuestion` settles as a plain needs-you report with no `questions`. Cursor has no question
tool and keeps the `Haus-Outcome: needs-you` footer.

**Support per harness.** The Claude Code driver turns questions on from Claude Code 2.1.317
(`claudeWorkerQuestionsMinVersion`) by allowing `AskUserQuestion` and adding
`--permission-prompt-tool stdio`. Below that, the tool stays disallowed and the Worker uses the
needs-you report. The Codex driver turns on the experimental `default_mode_request_user_input`
feature only on the versions it was proven on (`codexWorkerQuestionVersions`, today 0.159.0), and
re-proving it is part of every Codex bump. Neither reports support in the Computer inventory yet.

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
answer as its next turn. Any follow-up, from a person or the Agent, answers open
[questions](#questions).

`stop` asks the place to end the working turn, or drops a queued one, and drops queued follow-ups.
The turn records who asked and reads **Stopping** until it settles as `stopped`. A stopped Worker
takes later follow-ups. A stop while the place is offline settles the turn on the Server at once,
and the Computer ends the process when it reconnects. Every launched turn the Server settles on its
own side, a stop or a `machine-offline` failure alike, owes the harness that stop: until the
Computer reports the turn ended, reconcile keeps carrying it and no later turn of the Worker
dispatches or launches.

## Workers on a Computer

A Worker on a Computer is a native Claude Code or Codex session started by the Haus Computer
daemon. The Agent's own loop runs on the Server
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)). The
Worker keeps its harness on the machine.

### Layout

Everything a Worker owns on the machine sits under its Server attachment's partition of the
Computer data root ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)):

```text
servers/<serverId>/worktrees/<worker-id>/<owner>/<name>/    the Worker's git worktree of the repo folder
servers/<serverId>/repos/<owner>/<name>/                    Haus's own clone, when the Computer has no folder
servers/<serverId>/workers/<worker-id>/drive/               the Worker's drive/ folder
servers/<serverId>/workers/<worker-id>/drive-refused/       files a push refused
servers/<serverId>/workers/<worker-id>/runtime/drive.json   the folder's bookkeeping
servers/<serverId>/workers/<worker-id>/runtime/turns.json   the turn journal
servers/<serverId>/workers/<worker-id>/runtime/report/      the last report receipt
servers/<serverId>/workers/<worker-id>/runtime/bin/         the Worker's haus wrapper
servers/<serverId>/workers/<worker-id>/runtime/tmp/         the harness's TMPDIR
```

The worktree is a `git worktree` of the Computer's repo folder for the Worker's repo
([Projects](projects.md#repos)): the folder in the start's `checkoutPath`, used after its `origin`
is the repo on `github.com`, or Haus's own clone at `servers/<serverId>/repos/<owner>/<name>`,
cloned once with the machine's `gh` or git login through a temp sibling and a rename. A clone
becomes the Computer's folder for that repo: the Computer reports its clones with `repo-clones` on
every connect and after each new clone. A failed clone fails the launch and names the repo. A
folder that is gone or whose `origin` names another repo fails the launch with its path.

The worktree sits outside the folder, so the person's `git status`, editor and watchers never see
it, and shares the folder's `.git`. The branch is `haus/<worker-id>/<key>-<n>` with the key in
lower case, so it is in the person's repo from the first commit. It starts from that branch when
it already exists, else from `--ref`, else from the remote default branch, after the folder
fetches. Fetching moves the person's remote-tracking refs. Later turns reuse the worktree.
Worktree add and remove for one folder run one at a time, and the Computer's own git steps retry
a lock error a bounded number of times, because the person and other Workers share
`packed-refs.lock` and `config.lock`. The drive folder sits outside the worktree
([Drive folder](drive-folder.md)), so the repo never sees it. A new drive folder seeds from a
byte-checked copy of the freshest Worker folder on the machine before its first pull
([Drive folder](drive-folder.md#workers)).

### Run a turn

The Server dispatches a Computer-place turn only while the switch is on, the Computer is online,
and the Computer has a free slot under its `worker_limit`. Any repo can run on any Computer place.

1. The Server sends `worker-turn-start` with the turn id, the attempt, the composed input, the
   `WORKER.md` revision it inlines, the runtime and model, the checkout (repository, the
   Computer's folder for it as `checkoutPath` or null for Haus's own clone, branch, starting
   ref), and, from the second turn, `resumeSessionId`.
   The frame is idempotent by turn id. Each send or resend is a new attempt
   (`worker_turns.dispatch_attempt`), and only the current attempt may launch.
2. The Computer journals the turn and answers `worker-turn-accepted` with the attempt. From here
   the turn is never run twice. A resent start for a turn it already holds past `accepted` answers
   with the attempt it is actually running. The Server records that as the turn's
   `accepted_attempt`, and from then on frames for that attempt are current, so a lost accept and a
   resend still let the running attempt settle the turn.
3. It mints the turn credential with its own Computer credential,
   `POST /computer/workers/turn-credential { turnId, attempt }`. This is the launch fence. The
   Server refuses when the turn is settled, a stop was requested, the attempt is stale, the Worker
   is closing, the switch is off, or the turn is not dispatched to that Computer. A refused mint
   ends the turn `refused`, and nothing launches. A re-mint for the same attempt revokes the
   earlier token. The Server keeps only the token's hash, and the Computer journals the newest
   token before it launches.
4. It adds or reuses the worktree, then pulls the drive folder with the turn credential.
5. It runs the harness in the worktree under the machine user's own environment, so Claude Code,
   Codex, git, and `gh` use the logins already on that machine. The first turn starts a new
   session. Later turns resume it. Claude Code runs with `bypassPermissions`, the machine user's
   HOME, every settings layer, and no Haus MCP or system prompt. Codex runs with its
   `workspace-write` sandbox and network access, the user's `CODEX_HOME`, native `AGENTS.md`
   loading, and the worktree, the repo folder's whole git common dir (which Codex otherwise keeps
   read-only), the drive folder, the report folder, and `runtime/tmp` as writable roots. The
   narrowed roots #424 tried could not fetch, keep a push's upstream, delete the Worker's own
   branch or `gc`, so a Codex Worker can move the person's `main`, delete their branches, or write
   `.git/hooks` and `.git/config` that run the next time they use `git` there. That is the risk
   [ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md) accepts and the "Add folder" disclosure names. `/tmp` and the inherited `$TMPDIR` are excluded. Both
   harnesses get `TMPDIR`, `TMP`, and `TEMP` pointed at the Worker's `runtime/tmp`. Both run
   unattended and use none of the Agent host tools, warm pool, or background work.
6. The harness gets `haus` on `PATH` and the turn credential in `HAUS_WORKER_TOKEN`. That `haus`
   runs only `haus worker report` and the Drive read commands, and the credential reaches only
   `POST /api/worker/report` for this turn and the Drive reads (changes, by-path, download). It
   dies when the turn settles.
7. The Computer sends `worker-turn-session` as soon as the harness allocates its session, and the
   Server stores it once in `workers.native_session_id`. It sends `worker-turn-input-accepted`
   once the harness accepted the input. It sends `worker-turn-activity`, one line of at most 120
   characters from the harness's events, at most every 5 seconds.
8. When the process ends, the daemon mints a push credential with its Computer credential,
   `POST /computer/workers/push-credential { turnId }`, pushes the drive folder under the turn id,
   and closes the push. The push credential reaches only the push routes for that turn and the
   Drive reads, and never enters the harness environment. The Computer then takes bounded
   `gh pr view` readings of the pull requests the report names and sends `worker-turn-ended` with
   the attempt, the exit, the session id, the branch, and those readings. The Server settles it.

The Computer journals each turn's phase, `accepted`, `credentialed`, `running`, `pushing`,
`ended`, and a restart resumes from the phase it reached. It never runs a turn again. A turn that
asked also journals its [questions](#questions), and every resend of its end sends them first.

| Phase on restart | What the Computer does |
| --- | --- |
| `accepted` | Goes on to the mint, because nothing has run and the fence still decides |
| `credentialed` | Ends it `crashed-before-launch` |
| `running`, no live process | Pushes, then ends it `uncertain` |
| `pushing` | Finishes the push, then reports the exit it recorded |

A Computer that lost its journal still answers reconcile. Each entry carries the turn's current
attempt, and a Computer-place turn the Computer holds no record of and runs no process for is
reported ended `uncertain` with detail `journal-missing`. A turn the Server already settled
records its end, so the turns behind it dispatch; an unsettled one settles through the table
below. A turn whose process is still live is never reported missing. A live process whose journal
is gone ends on an owed stop, from `worker-stop` or a reconcile entry, and on its own exit; either
way the Computer reports it ended with detail `journal-missing`, `stopped` when it was stopped and
`uncertain` otherwise, because nothing it journaled survives to push.

Settlement is one locked transaction through one table:

| Exit | Report draft | Stop requested | Outcome |
| --- | --- | --- | --- |
| `exited` | yes | any | the report, `source: 'worker'` |
| `exited` | no | yes | `stopped` |
| `exited` | no | no | failed `no-report` |
| `crashed-before-launch` | any | any | failed `harness-error` |
| `uncertain` | yes | any | the report |
| `uncertain` | no | yes | `stopped` |
| `uncertain` | no | no | failed `no-report` |
| `refused` | any | any | failed `launch-refused` |
| `stopped` (the Computer killed it on `worker-stop`) | yes | yes | the report |
| `stopped` | no | yes | `stopped` |

A failed outcome keeps the ended frame's detail, so the turn shows why it failed.

A Computer-place turn whose Computer stays disconnected for 30 minutes settles as failed
`machine-offline`. A dead machine is a failed turn, not a moved Worker.

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
5. It sets `closedAt` and sends the Computer place `worker-close { workerId }`. The Computer
   removes the Worker's worktree when it is clean, and deletes its local branch, which the remote
   keeps. Clean means no uncommitted or untracked changes and every commit on the branch on a
   remote-tracking ref, checked against a fresh fetch; a failed fetch counts as not clean.
   Otherwise the worktree stays with its branch, so unpushed work is never deleted. The drive
   folder and journal go either way. The native session files stay where the harness keeps them.
   `worker-close` is idempotent.

A place that is offline gets steps 3 and 5 when it reconnects. The Server settles the turn on its
own side at step 3, through the settlement table's `stopped` rows: a recorded draft posts as the
report with its citations and pull requests, and no draft settles `stopped`. It never waits on the
place to deliver step 4. A `stop` of an offline Worker settles the same way. On every connect the Computer
sends `worker-held { workerIds, keptWorktrees }`, the Workers whose worktree or drive folder it
still holds, even when the list is empty, and the Server answers with `worker-close` for each one
that is closed. `keptWorktrees` names each closed Worker's kept worktree. The Server stores the
path (`workers.kept_worktree_path`) and the Worker card shows it, because the final
`worker_report` (step 4) went out before step 5 kept it. Each resent `worker-close` removes a kept
worktree once it is clean, and forgets it once the person removed it. A worktree whose folder is
gone is broken, and the Computer never deletes it on its own.

## Deliverables

A Worker writes deliverables into its Agent's Drive area, under a folder per Task:

```text
agents/<handle>/reports/<KEY-n>/…
agents/<handle>/renders/<KEY-n>/…
agents/<handle>/handoffs/<KEY-n>/…
```

A Worker writes what its Agent writes ([Areas](artifact-drive.md#areas)): the folder's writer is
the delegating Agent. Each revision names the Worker as author with the Worker's Task. Conflicts
from a Worker's push go to its Agent's inbox as `drive_conflict`, naming the Worker. A Worker push
(`drive_pushes.worker_id`, push id = turn id) never closes its Agent's own run push or another
Worker's. A cloud Worker writes nothing to Drive. Its deliverables are its pull requests
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
  runs. A row is a stock `ListView` item, like Capy's child rows: selecting it opens the Worker, and
  it never expands in place. Pull requests sit in their own counted section.
- **Opening a Worker** (a Worker row, a Worker link in the Task chat) opens its
  place, `/s/<slug>/workers/<workerId>`, through the same Open path as an Agent profile or a Drive
  file ([ADR 0046](../docs/adr/0046-the-sidebar-goes-pages-open-to-the-right.md)): on desktop a tab
  in the right pane, titled with the Worker's title, with that pane's own tab strip; on the web it
  navigates like any other place. The Task page and its Overview panel stay as they are. The
  Worker page's band holds **Open in `<provider>`** and **Copy link** behind •••.
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
- **The question card.** While the newest turn's [questions](#questions) are open, Capy's
  composer takeover replaces the Worker page's composer, never the Task's: "1 of 3", numbered
  options picked with number keys, checks for multi-select, "Or type an answer", Later, Dismiss
  and Next, then Review (Capy's plain list) and Send answers (⌘↵). Later hides the card on that
  device only. A refused answer keeps the draft and says who got there first. Rows read
  **Waiting on an answer** for a needs-you report that carries open questions. iPhone has no card
  yet: it shows the report text, and a typed follow-up answers.
- **In the Task chat** a report Message renders as a centered muted lifecycle line ("`<title>`
  needs you, worked for 17m") and a person's follow-up carries a "To Worker on `<place>`" context
  line. Both open the Worker, so the report text shows once.
- **Step summaries.** `WorkerTurn.steps` (`packages/haus-api/src/worker-steps.ts`) is a bounded
  list, the newest 40, of `{ kind: read | edit | run | search, label, state: running | done |
  failed, additions, deletions, output }` that a carrier reports per turn: a path for read and
  edit, the command line for run, the query for search, line counts only on edit, and `output`
  only on run, as the tail of its terminal output up to 4,000 characters. It never carries file
  contents, and the Computer redacts known secret patterns (tokens, keys, credentials, the turn
  credential) from `output` and `label` before sending. Each field drives one stock `ChatTool` prop. It is optional: without it the Worker's
  message shows its report and activity. W3b adds the carrier and Server side for Computer
  places, through `worker-turn-steps`. Cloud places report the same summary on the carrier's
  `worker-observation` as `steps`, and the Server keeps the newest one on the turn. The Cursor
  carrier builds it from the SDK stream's `tool_call` messages (`shell`, `read`, `edit`, `grep`,
  `glob`, `ls`, `delete`, with their args and result), and the Claude carrier from the session
  log's `tool_use` and `tool_result` blocks in the Run's window. A Cursor Run the carrier only
  reads, never streams, shows no steps.

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
  only once it holds that turn's input. An offline carrier drains when it reconnects. The drain
  path stayed through W3 and was deleted on 2026-11-21, once production held no turn still
  waiting on a drained input. A Computer that still finds a pending entry in its launch journal
  deletes it and treats the turn as unjournaled.
- `cloud_agent_work` inbox rows become `worker_report`, `worker_stall`, or `pull_request` items by
  their notice.
- Each Project's default place becomes the default provider of the Computer that launched the
  Server's newest cloud agent work (migration 0144, in W3). A Server with none leaves defaults
  unset. The migration never
  turns **Workers can run here** on. Cloud places keep working without it, and local execution
  stays off until the attaching person, an Owner, or an Admin turns it on.
- Deleted with no alias: `haus cloud-agent` and its `cancel` spelling, `--provider`, `--say`,
  `--cause` on start, the launch Message, **Make default** and `defaultProvider`, and the
  Computer-local pending follow-up file once drained. **Make default** stays as a fallback
  ([W3 transitional decisions](#w3-transitional-decisions)). The website's older
  `TranscriptWorker` row type is now `TranscriptSubagent`, so the word means one thing.

### W3 transitional decisions

W3 (Workers on Computers) ships the Server and Computer halves with no App UI. People have no App
control yet for a Computer's switch or a Project's default place, so W3 keeps these
until W4 and the Project settings UI replace them. Each says what retires it.

- **Start precedence.** A start runs on `--on`. Otherwise on the Task's Project default, and a
  default that is set but unusable refuses with `WORKER_PLACE_REQUIRED`, never falling through.
  Otherwise on the Agent's Computer's ready cloud default. Otherwise it refuses with
  `WORKER_PLACE_REQUIRED` and lists the usable places. The third step retires with
  **Make default**, below, which leaves the order this spec's [default place](#places) names.
- **Make default as the last fallback.** The per-Computer **Make default** cloud provider is the
  third step above. It retires when the Project settings UI ships the default place.
- **Repos until the Project settings UI ships them.** Retired 2026-11-22 with `project_repos`
  ([ADR 0060](../docs/adr/0060-repos-belong-to-the-server-and-agents-work-in-worktrees.md)). Repos belong to the Server and `--repo` is required.
- **New Worker drive folders pulled in full** until a seed copied only files whose bytes match
  their records. That seed now runs ([Drive folder](drive-folder.md#workers)), so this decision
  is retired.
- **Two credentials.** The turn credential is model-visible, so it carries only the report and the
  Drive reads. The Drive push runs in the daemon under a separate host-only push credential minted
  with the Computer credential. This replaces the single "credential for that turn" this spec
  named before W3, and it is not transitional: nothing retires it, because any push authority in
  `HAUS_WORKER_TOKEN` would let the model write the Agent's area outside the turn's push.

W3 also bumps the Computer protocol to 42. Older Computers take the existing update-required path.

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
| A start without a usable place or switch writes nothing | `apps/server/test/worker-start.test.ts` |
| The turn credential reports for its own turn only and cannot send a message | `apps/server/test/worker-credential.test.ts` |
| A pull request change wakes the Agent of each settled Worker that reported it, once per head commit | `apps/server/test/pull-request-wake.test.ts` |
| A `WORKER.md` change while a turn is queued rides that turn, and advances only on acknowledgement | `apps/server/test/worker-turn-input.test.ts` |
| Closing a Task stops and settles its Workers, delivers each outcome, then removes clean worktrees | `apps/server/test/worker-close.test.ts` |
| A pending local follow-up left from the W2 migration is dropped, and the Server's start still runs | `apps/computer/src/workers/pre-worker-journal.test.ts` |
| A crash after acceptance never reruns the turn | `apps/computer/src/workers/turn-journal.test.ts` |
| A Computer that restarts ends each turn it left mid-launch without running it, and finishes a push it left | `apps/computer/src/workers/computer/computer-place-recovery.test.ts` |
| The launch fence mints only for the current attempt, and the turn token reaches only report and the Drive reads | `apps/server/test/worker-credential.test.ts` |
| A start without `--on` takes the Project's Computer default before the Agent's cloud default, and an unusable Computer start writes nothing | `apps/server/test/worker-computer-start.test.ts` |
| Switching Workers off refuses new work, settles queued turns `place-off`, and clears Project defaults | `apps/server/test/worker-computer-settings.test.ts` |
| A Worker push writes as the Worker and never closes its Agent's run push | `apps/server/test/worker-drive-push.test.ts` |
| A question settles needs-you at once, posts once, notifies the asker or the Agent, and survives the process, the Computer going offline, and a stale attempt | `apps/server/test/worker-question.test.ts` |
| The first answer wins, Dismiss and Stop close questions attributed, and a closed Task refuses answers | `apps/server/test/worker-question-answer.test.ts` |
| Claude Code captures AskUserQuestion once, denies every other prompt, and keeps the tool off below the minimum version | `apps/computer/src/runtime/claude-code/claude-worker-driver.test.ts` |
| Codex captures request_user_input once, interrupts, and resumes on the same thread | `apps/computer/src/runtime/codex/codex-questions.test.ts` |
| A question is journaled and resent before the end, also after a restart | `apps/computer/src/workers/computer/computer-place-question.test.ts` |
