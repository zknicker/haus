---
summary: Provider-hosted Cloud Agents (Cursor and Claude) as Agent-delegated work, stored as a standalone record that Messages link to and executed through Computer-local provider access.
read_when:
  - adding or changing Cloud Agent tools, providers, lifecycle, cards, results, or completion delivery
  - changing Cloud Agent work links, who may see Cloud Agent work, or what survives Chat deletion
  - changing Cursor runtime discovery, Cursor Cloud Agent authentication, or Cursor usage reporting
  - changing the Claude Cloud Agent adapter, its Claude Code sign-in, polling, or status mapping
  - changing the default Cloud Agent provider, the `--provider` flag, or the `pending_input` Run status
  - changing the Cloud Agent model setting, the per-provider model, the Cursor model catalog, or the model a Run requests
  - changing typed Message bodies, the `agent-created` body, or record-backed Message rendering
  - changing the freshness hold on `haus cloud-agent start` or the start response union
  - deciding whether delegated work belongs to a Haus Agent, Harness subagent, Task, or provider-hosted Cloud Agent
---

# Cloud Agents

Cloud Agents let any Haus Agent delegate bounded development work to a provider-hosted agent.
The delegating Agent starts the work, receives completion through its inbox, inspects the result,
and decides what to say or do next. Cursor and Claude are the providers.

This spec is the canonical implementation plan. Earlier Fable and architecture reviews under
`~/.claude/plans` are research inputs and may describe superseded designs.

The product and architecture grill closed on 2026-09-02. Provider notes below are implementation
facts and compatibility risks, not unresolved product decisions.

## Product contract

- **Agent CLI verbs.** `haus cloud-agent start`, `send`, `inspect`, and `stop` are the Agent
  surface, not a harness tool, because the Agent CLI is an Agent's only output channel
  (ADR 0014). Every supported execution runtime may call them; the caller does not need to be a
  Cursor-backed Agent. `start` takes `--target`, `--repo`, an optional `--ref`, an optional
  `--provider`, `--title`, and
  `--say` — the Agent's own words, which become the Message content — with the provider
  instructions on stdin.
  `send --work <workId>` takes another prompt on stdin and continues the same hosted agent
  (it is also how the Agent answers a `pending_input` question);
  a busy agent queues it, and `--interrupt` stops active work and discards older queued prompts
  before processing it.
  `inspect` lists the caller's work, or reads recorded details with `--work <workId>`.
  `stop --work <workId>` requests cancellation. The published `cancel` spelling remains a CLI
  compatibility alias for existing callers.
- **Provider-neutral capability.** `cursor` and `claude` are the providers
  (`packages/haus-api/src/cloud-agent-provider.ts`), and every Computer ships both adapters. Each
  Computer keeps a local default provider in `${dataRoot}/cloud-agents.json` (`{ defaultProvider }`),
  Cursor until a human changes it from Computer settings (**Make default** on a provider row, the
  `make-default` capability operation behind `cloudAgentProvider.makeDefault`). Capability state
  and the Computer inventory report `isDefault`. `haus cloud-agent start` uses that default unless
  the Agent passes `--provider cursor|claude`.
- **Agent-held repository context.** The Agent supplies the repository, starting ref, title,
  instructions, and any other provider input it knows. Haus adds no repository registry.
- **Standalone work, linked from Messages.** Cloud Agent work is its own Agent-owned record. It
  belongs to no Message or Chat ([ADR 0044](../docs/adr/0044-cloud-agent-work-is-referenced-not-embedded.md)).
  Messages link it with the `cloud-agent://<workId>` rich reference, and every linking Message
  shows the same live card. See [Links](#links).
- **The launch Message is the first link.** Launch posts one ordinary `text` Message in the
  initiating Chat. Its immutable `content` is the Agent's `--say` words, supplied in the same
  invocation that starts the work, followed by a blank line and a Server-written link to the new
  work.
- **One work conversation.** A top-level launch Message receives a child Thread immediately. Work
  launched inside a Thread that already holds conversation stays in that Thread because Threads
  do not nest. A launch never opens a new Thread: the launch Message is the Agent's inline reply
  to the request (`--reply-to`), and a `<target>:<shortId>` whose Thread does not exist or holds
  no Messages yet (a Follow alone materializes an empty Thread) is refused with
  `CLOUD_AGENT_NEW_THREAD` before anything is written, whoever authored the anchor. Replying to
  the Message is the human steering and discussion surface; the card has no separate reply model.
- **One updating presentation.** Haus App renders each work a Message links as one work card,
  the same in the parent Chat, inside the Thread, and in any other conversation that links it. It
  updates from
  queued or running into a terminal report without creating automatic progress or completion
  Messages.
- **Inbox completion.** Every settled provider run, including one that stopped to ask a question
  (`pending_input`), creates at most one durable inbox attention for the delegating Agent. Completion does not keep the launch turn open. The resumed Agent owns any
  follow-up and may post an ordinary Message when it has useful judgment to add.
  Cloud Agent instructions explicitly explain this automatic wake: the Agent does not need a
  reminder or polling to learn when the work finishes. The work Thread holds implementation details
  and revisions. The coordinating Agent keeps the requester informed where they asked for the work
  and brings back a concise outcome with a link, following their lead when they join the work Thread.
  General reminder guidance is unchanged.
- **Provider-hosted lifecycle.** Cloud Agent work may outlive a turn, App session, or Computer
  connection. Computer reconciles provider state after reconnect and reports bounded observations
  to Server idempotently.
- **Truthful launch failures.** Invalid input, unavailable capability, and missing authorization
  fail before creating a Message. Once Server accepts and records a launch, a definite provider
  refusal settles the same card as failed. A lost response leaves the launch unconfirmed, not failed:
  the provider may already be running it. Replaying that request never blindly launches another run.

Computer journals launch intent and acknowledged provider IDs in its private data directory,
without credentials. Pending follow-ups retain their instructions and preceding Run IDs in a
Computer-local file with mode `0600`, so reconciliation can resume the queue after restart.
Instructions are removed once launched, cancelled, or refused and never reach Server.
Reconnect recovers acknowledged IDs even if their Server report
was lost. An intent without an acknowledgement requires inspecting the provider; it cannot prove
whether the launch occurred. The daemon owns monitoring, retry delays and cancellation retries.
Disconnect joins local monitoring without cancelling the hosted run.

Cursor SDK 1.0.30 has a pinned Bun patch bounding otherwise unbounded finite fetches to 30 seconds
per request. Streams retain their caller-owned abort signal. The adapter joins local stream disposal;
sequential SDK requests can take longer than one deadline. Recheck the patch and internal stream
disposal bridge on SDK upgrades, and remove them when the public SDK supports bounded requests
and abortable, joined subscriptions. Installed-SDK tests cover both contracts.

Cloud Agent work is task-like but is not a Haus Task. It has no assignee, claim, priority, label,
or board lifecycle, and a launch Message cannot be promoted to a Task.

**Delegation from a Task.** A human creates or promotes a Task, an Agent claims it, and the Agent
delegates on the Task. When the Task Thread already holds conversation, the launch Message is a
reply in that Thread; otherwise it is an inline reply to the Task Message. The Task keeps the
human lifecycle: the Agent advances it — to `in_review` when a pull request exists, to `done` when
that pull request merges — through the ordinary versioned task mutation. A launch Message is never
itself promoted to a Task.

## Automatic wakes in Automations

An Agent's Automations page includes **Cloud agents**, marked **Managed by Haus**. These
rows are a read-only projection of visible, Agent-owned work and its per-Run inbox identities;
no Trigger is created, so there is no separate trigger lifecycle to reconcile or clean up.

- Queued/running work remains current while its automatic completion notification is possible.
  Offline or stale tracking reads **Status unconfirmed**, with its last update.
- Any unsettled `cloud_agent_work` inbox identity keeps the work current as **Result queued**,
  including an older Run's handoff while a follow-up runs. A result is delivered when its
  identity reaches `seen`, after the Agent turn settles successfully, not merely when offered.
- Delivered work moves to history. Retired Agents, removed tracking Computers, and deleted
  requesting conversations move impossible future notifications to history with an explanation.
  The recorded provider lifecycle is preserved; loss of tracking never fabricates a terminal state.
- Current rows are unbounded by history; history reads the latest 100 records. Visibility follows
  existing work links, and row navigation opens a visible work conversation, including settled work.
- Reassignment of the Haus Agent does not change the work's launching Computer or delegating Agent.
  Computer reconnection retains the existing provider reconciliation and durable, per-Run deduplication.
- Work observations, Chat deletion, Computer/Agent changes, and Agent turn settlement refresh the
  projection through existing event owners. Stream recovery refreshes it without a polling loop.

## Messages and cards

A Message is the only Chat transcript item. Every Message has stable identity, authorship,
conversation placement, sequence, and meaningful immutable content. A typed body augments that
content; it never replaces the Message's authored meaning.

```ts
type MessageBody =
    | { kind: 'text' }
    | { kind: 'agent-created'; agent: CreatedAgentSummary };

type Message = {
    id: string;
    chatId: string;
    author: MessageAuthor;
    sequence: number;
    createdAt: string;
    content: string;
    body: MessageBody;
    attachments: Attachment[];
    task?: MessageTask;
    /** Every Cloud Agent work this Message links and the viewer can see, in link order. */
    cloudAgentWork: CloudAgentWork[];
};
```

Haus has no question body. An Agent asks a person by @mentioning them in an ordinary `text`
Message ([ADR 0037](../docs/adr/0037-humans-are-addressed-by-mention.md)).

Body kinds name concrete Haus product acts, not generic mechanisms, rendered entities, or
providers. Haus has no generic `prepared-action`, `cards[]`, or arbitrary JSON-block body. Agent
creation uses `agent-created`. Delegated hosted work has no body kind: it is a record that `text`
Messages link, and the provider is a field on that work. A pull request becomes a Message body
only when a real workflow needs to author a pull-request Message independently.

A card is presentation, not a durable noun. It owns no id, placement, lifecycle, authorization, or
data. Haus App renders a Cloud Agent work card from the Message's `cloudAgentWork` annotation,
which the Server projects from the Message's recorded links.

**One card everywhere.** Haus App renders Cloud Agent work as one full work card under each
linking Message, the same card in the parent Chat — a Channel or a DM — inside the Thread, and in
any other conversation that links it. No link is primary and none is a copy. A Message that links
several pieces of work shows one card per work in link order. Where the card names the delegating
Agent, as in the follow-up note, it reads the work's `agentId`, never the linking Message's
author.
There is no compact header, pill, or detached overflow menu: every work action sits inline in the
card's control band. The card is content-sized up to the in-chat card measure (34rem) on the
`nested-surface` chat card background, never full transcript width.

**In the parent Chat**, the card carries no way into the Thread of its own. Before any reply the
Thread would hold nothing but the same card, so the Message's ordinary hover thread action is the
way in; once replies exist, the ordinary Thread preview below the card is. The preview never
repeats the work's header or actions. Zero replies never reserves an empty Thread preview.

**Thread preview.** Cloud Agent work inside a Thread gets one informational row per job below the
anchor's Task header, always named after the job's title (never its diff). Each row carries the
provider's mark, the title, `#<n>` once the job has a pull request, and the job state in the card's
vocabulary: `Working · <elapsed>` with the spinner, `Done`, `Failed`, `Cancelled` or `Expired`
(dimmed), or the warning `No update in <d>` for a live job quiet for ten minutes. It never says
queued. Rows keep the order the jobs were started — oldest work `createdAt` first, ties in the
Server's order — so a row never moves while its job changes state. Done work stays listed. The preview's reply rows exclude work announcements, so each work appears once. The
entire preview opens the Thread; summary rows are not click targets.
Server's conversation-scoped `cloudAgentWork.listForChat` read includes all statuses, grouped by
Thread anchor. The Inbox's separate active-work read remains active-only.

**Inside the Thread**, each linking Message renders its prose followed by the same work card
in the scrolling conversation. The Message's sequence fixes its position; status, PR, and follow-up
updates change the same card in place. New delegations get their own Messages and cards. There is
no pinned Cloud Agents section or carousel. Task metadata remains above the conversation.
The card is presentation derived from the work record and is never a Chat row, and nothing on it is
named after any one provider. It has four parts and one type size (weight and color carry the
hierarchy):

1. **Header** — the provider's own mark, the title with a job-state chip, and the repository.
2. **Pull request row**, once a Run reports one — `PR #<n>`, the pull request's own state
   (Draft, Open, Merged, Closed) and `<n> files` with additions in success and deletions in danger
   when the Computer's GitHub reading carries them. The newest Run that reported a pull request
   supplies it, so a follow-up Run that has not reported yet never hides it.
3. **Exactly one status line**, always present, one line, truncated. The most urgent fact wins:
   the failure reason (danger: the failed Run's summary, else its error code); `No update in <d>`
   (warning) when the newest Run is queued or running and the work's `updatedAt` is older than ten
   minutes (an observation from any of the work's Runs advances `updatedAt`, so an earlier Run
   still reporting while a follow-up waits keeps the work fresh); `Stopping · requested <relative>` while a cancel is pending; the follow-up note
   `<Agent> asked for changes · waiting <d>` or `· running <d>`; otherwise the latest `activity`
   or `Updated <relative>` while working, `Updated <relative>` (muted, `settledAt` else `updatedAt`) when the job
   needs input, `Finished <relative>` when done, and
   `Cancelled · <relative>` or `Expired · <relative>` when the job was cancelled or expired.
4. **Actions**, always present — **View PR** first once there is a pull request URL, then a split
   button whose primary half is **Open in `<provider>`** and whose chevron holds Copy link, plus
   Cancel run for Owners and Admins while a Run is live. There is no restart action.

**Job state mirrors the provider.** The chip states the Server-derived `job` (`deriveCloudAgentJob` in
`packages/haus-api`): the provider's own status for the newest Run the provider has received (the
Run carries a `providerRunId`), with no Haus logic layered on top. `Working · <elapsed>` with HeroUI's
spinner for CREATING or RUNNING, `Done · <duration>` in success for FINISHED (pull request merge
state stays on the pull request row), `Failed` in danger for ERROR, and `Cancelled` or `Expired`
muted for CANCELLED or EXPIRED, and `Needs input` in the warning tone for a Run that stopped to
ask a question (Claude only; see [Claude provider](#claude-provider)). The card never shows the
question: it is for the delegating Agent, which the inbox wakes to answer it, and a person who
wants it opens the session in the provider. Once that answer is sent, the follow-up note replaces
the `Updated <relative>` line, so the card keeps the same rows across every state. A follow-up still in Haus's local queue is not a provider Run yet:
it never moves the headline and only shows as the follow-up note, so one cancelled before delivery
leaves a done job Done, while one cancelled after delivery reads Cancelled. `Queued` is never a
headline: a first Run not yet received or still queued reads working.
The Inbox's Happening now list shows only live work, so a job listed there only because a
follow-up waits behind a settled Run reads `Follow-up waiting · <d>` with the working spinner. Because the status line never appears or disappears, the card
changes height only when the pull request row first appears. There is no delegation receipt: on
the launch Message, the author line and timestamp directly above the card already say who
delegated it and when.
The Run report is not on the card. It updates in place from the same event.
Multiple Cloud Agents may run inside one Task or Thread. The presentation imposes no one-to-one
workflow restriction. Meaningful result announcements may be new conversation Messages; work
observations update existing records rather than automatically posting channel chatter.

Only status glyphs, the card's job-state chip, and the status line's danger and warning tones carry
lifecycle color. Liveness reads from the work's own `updatedAt`, never from Computer connection
state.
iOS renders the same one card (`CloudAgentCard.swift`) in the parent Chat and the Thread from the
same `job` and status-line priority. Its Thread preview shows cards instead of text rows, in the
same per-job order (`ThreadCloudAgentRow`): one job is its card; two or more collapse into a
notification-style stack — `N cloud agents`, a counts line with problems first and tinted, Show
all, the job that most needs attention on top (the first failed job, else the first with no
update, else the first started), and up to two peeking edges for the next jobs in start order —
that expands to every job in start order, with calm working jobs as compact header-only cards.
Expansion is remembered per Thread anchor for the signed-in session; stacks start collapsed. The card itself has three platform
deviations: it fills the iPhone message column rather than a fixed measure; the
job-state chip trails the one-line repository row instead of the title, so its ticking width can
only truncate the repository and never rewrap the title; and **Open in `<provider>`** is a bordered
button beside a chevron `Menu` rather than a split button. Working uses the native indeterminate
`ProgressView`. Copy link builds the App link from the configured Server origin, which is the App
origin in production. An older client that does not read the annotation renders the Message
`content`, link included, and the ordinary Thread preview.

Server has one Message reader that projects authors, attachments, Tasks, typed bodies, and linked
Cloud Agent work for every consumer: Chat history, Threads, search, send receipts, Agent delivery, web, and iOS. Clients do not
join feature records into the transcript or infer a body kind from optional top-level fields.

## Canonical representation and migrations

Haus stores and emits exactly one current representation for each body kind. Body payloads carry
no per-kind schema version, and readers do not retain historical variants indefinitely.

- Checked-in PostgreSQL migrations rewrite obsolete stored representations before new code depends
  on them. A failed canonical migration blocks activation rather than hiding history.
- Haus has no production users yet. The Message canonicalization ships as one breaking release
  with a fresh production database; there is no expand/contract window, transitional wire field,
  or staged client cutover.
- Unknown body kinds degrade through immutable Message `content`. This supports a client that has
  not yet learned a kind; it is not a historical payload reader.
- Raw provider evidence may retain the provider's own revision at the Computer adapter. Provider
  revisions never enter the Message domain.

The prerequisite Message migration:

1. Adds `body_kind` to `chat_messages`, defaulting existing Messages to `text`.
2. Renames the Agent-creation domain, tables, routes, events, shared contracts, App and iOS types,
   and documentation away from the legacy generic action terminology.
3. Backfills Agent-creation Message rows and replaces historical empty content with Agent-authored
   content. Agent-creation and Cloud Agent tools require Agent-authored Message content.
4. Introduces the exhaustive `Message.body` contract and one Server Message reader, and deletes
   the old top-level proposal field in the same change.
5. Moves web and iOS to the body union and removes every client-side empty-content or copy
   fallback.

Cloud Agent work lands only after this pipeline is canonical so it cannot copy the empty-anchor
pattern.

Migration `0079_cloud_agent_work_links` moved Cloud Agent work to links (ADR 0044). It rewrote
every `cloud-agent-work` Message into a `text` Message whose content ends with its work's link,
recorded that link, and dropped the work's foreign keys to its Message and Chat. Migration
`0080_message-body-drop-cloud-agent-work` then narrows `chat_messages.body_kind` to `text` and
`agent-created`.

## Durable Cloud Agent work

Server stores one lifecycle-rich `CloudAgentWork` record for each delegation. The work owns its
delegating Agent, provider Runs, and mutable execution state. Messages own authorship and Chat
placement and point at the work through links.

```ts
type CloudAgentWork = {
    id: string;
    messageId: string; // the launch Message: a historical pointer, stored as `launch_message_id`
    chatId: string; // the requesting Chat: a historical pointer, no foreign key
    agentId: string;
    computerId: string;
    provider: 'cursor' | 'claude';
    providerAgentId: string | null;
    providerUrl: string | null;
    title: string;
    repository: string;
    startingRef: string | null;
    status: 'queued' | 'running' | 'pending_input' | 'completed' | 'failed' | 'cancelled' | 'expired';
    startedAt: string | null;
    terminalAt: string | null;
    cancelRequestedAt: string | null;
    cancelRequestedBy: { kind: 'agent' | 'user'; id: string } | null;
    activity: { summary: string; at: string } | null;
    runs: CloudAgentRun[];
    /** Server-derived from `runs`: how the whole job reads, never `queued`. */
    job: CloudAgentJob;
    createdAt: string;
    updatedAt: string;
};

type CloudAgentFollowUp = { state: 'waiting' | 'running'; since: string };

// The state is the provider's status for the newest Run it has received (`providerRunId` set),
// else the first Run's; a waiting or live newest Run that is not the work's first is the
// follow-up. `startedAt`/`settledAt` belong to the Run the state comes from.
type CloudAgentJob =
    | { state: 'working'; startedAt: string | null; followUp: CloudAgentFollowUp | null }
    | { state: 'pending-input'; question: string | null; startedAt: string | null; settledAt: string | null; followUp: CloudAgentFollowUp | null }
    | { state: 'done'; startedAt: string | null; settledAt: string | null; followUp: CloudAgentFollowUp | null }
    | { state: 'failed'; summary: string | null; errorCode: string | null; settledAt: string | null; followUp: CloudAgentFollowUp | null }
    | { state: 'cancelled' | 'expired'; settledAt: string | null; followUp: CloudAgentFollowUp | null };

type CloudAgentRun = {
    runId: string;
    providerRunId: string | null;
    status: 'queued' | 'running' | 'pending_input' | 'completed' | 'failed' | 'cancelled' | 'expired';
    rawStatus: string | null;
    createdAt: string; // when the Run was queued

    startedAt: string | null;
    terminalAt: string | null;
    summary: string | null;
    errorCode: string | null;
    branches: {
        repository: string;
        branch: string;
        pullRequestUrl: string | null;
        pullRequest: {
            number: number;
            state: 'draft' | 'open' | 'merged' | 'closed';
            changedFiles: number;
            additions: number;
            deletions: number;
            observedAt: string;
        } | null;
    }[];
    usage: { inputTokens: number; outputTokens: number; costUsd: number | null } | null;
};
```

One work may contain several provider Runs. A follow-up, correction, or retry adds a Run to the
same work, reactivates the same surface, and preserves earlier Run outcomes for inspection. A
substantively separate assignment creates a new launch Message and Cloud Agent work record. Cursor permits
only one active Run per provider Agent; Computer queues accepted follow-ups until preceding work
settles. `send --interrupt` stops active work and discards older queued prompts before the follow-up
runs. `stop` stops active work and discards the pending queue. Follow-up delivery never retries
silently forever; see [Follow-up delivery](#follow-up-delivery). Revisions reuse
the same Work ID and Thread, including when the work belongs to a Task.
A cancelled Run cannot resume, so continuing after cancellation creates another Run in the same
work and retains the cancelled Run's partial evidence. `runs` is ordered newest first and is bounded
at twenty; the work keeps recent Runs for inspection rather than an unbounded execution history.
Each accepted follow-up adds a Run to the existing work without creating another Message or Task.

`pending_input` is settled, like `completed`: the cloud agent stopped to ask a question and the
Run's `summary` is that question. It creates the same one `cloud_agent_work` inbox attention as any
settled Run, so the delegating Agent wakes once, and the inbox item tells it to answer with
`haus cloud-agent send --work <workId>`. The answer is an ordinary follow-up Run. The derived job
reads `pending-input` with the `question`; while the answer has not been taken by the provider (no
`providerRunId` yet) the job still reads pending-input with the follow-up waiting. Active work
(`cloudAgentWork.listActive`, Happening now) includes `pending_input`.

`activity` is one bounded line of at most 120 characters. Computer may update it from provider
events no more than every few seconds. It is the work's current state in a sentence, never a
transcript, and it yields to the latest Run summary once the work settles.

`branches` and `pullRequestUrl` are Cursor's own terminal Run report, retained as evidence for the
work card's pull request row. They are not a Haus product relation: Haus stores no branch or pull-request
entity, and a reported pull-request URL claims no ownership of GitHub lifecycle.

`pullRequest` is the Computer's own reading of that URL, and it is evidence on the Run for exactly
the same reason. Cursor's API carries no diff statistics, so the Computer reads
`GET https://api.github.com/repos/{owner}/{repo}/pulls/{n}` when an observation names a GitHub pull
request, caching completed reads for 30 seconds, under one four-second deadline covering credential
discovery, response consumption, and one retry on a 5xx. A failed read does not fail the Run; it
reports without a snapshot after the bounded wait.
The read happens before the observation is reported, because Server settles a Run on
its first terminal observation and evidence arriving after that is correctly ignored. Server merges
by `observedAt`: a report carrying no snapshot never erases a recorded one, a newer reading replaces
an older one, and a settled Run stays final. The credential is the Computer's own: it asks the
locally installed `gh` CLI for the token the human already signed in with, cached per attachment
daemon and held in memory without being logged, stored, or reported to Server. The daemon owns
the reader and its Effect deadline; cancellation aborts and joins the HTTP request, kills and
reaps any credential subprocess, and suppresses the detached observation. Cancellation does not
cache a missing credential or snapshot. A Computer without `gh` reads public pull requests
unauthenticated, and an unreadable pull request simply has no snapshot.

The snapshot's consumers today are the delegating Agent's surfaces: the terminal inbox attention
states the branch's pull-request state and diff counts, and each Message linking the work reads
back with `pr=#<n>` wherever messages are shown. The work card's pull request row shows `PR #<n>`, its state,
and files changed, additions, and deletions when GitHub evidence is available. Missing evidence
does not become a fabricated zero-line diff.

A cancel request records `cancelRequestedAt` and `cancelRequestedBy`, and the presentation reads as
cancelling until the Run settles. Inside Haus every hop is push: Computer reports
observations over the attachment protocol, Server emits the durable event, and the App refetches
the Message. Reconnect follows the same direction — Server pushes `cloud-agent-reconcile` frames
of at most 200 entries naming every non-terminal Run that Computer still owns, including preceding
Runs hidden by the bounded card history, along with any cancel recorded while it
was offline, rather than adding a Computer-authenticated read. Only the provider edge pulls. Computer subscribes to Cursor's per-Run event stream
while a Run is active and treats polling as reconciliation: a Run read every 5 seconds only while
no stream is attached, backed off to 60 seconds after a provider failure, one full Run read on
reconnect or restart, and nothing further once the Run is terminal.

### Links

`cloud_agent_work_links` records every link: one row per `(Message, work)` with the link's
first-occurrence `ordinal` in the content. A row cascades from both its Message and its work, so
losing a Message loses its links and never the work. The work's `chat_id` and
`launch_message_id` (wire `chatId` and `messageId`) are plain historical pointers to the requesting
Chat and launch Message, with no uniqueness, foreign key, or cascade. Purging the requesting
Channel leaves the work and its other links intact. `computer_id` (wire `computerId`) is the same
kind of pointer, so removing a Computer keeps its work, Runs, and links: live work there simply
stops updating and reads as quiet, and cancel or follow-up refuses with `CLOUD_AGENT_COMPUTER_REMOVED`.

Every Message writer resolves links at the Message boundary, in the transaction that inserts the
Message: human send, Agent `haus message send`, human and Agent Task creation, and launch. Each
`cloud-agent://` link is kept only when the work exists and the author can already see it; any
other link is rewritten to its plain label text, so a link grants nothing on its own. Duplicates
collapse to the first occurrence. Humans and Agents may both link; Agents copy the `Link:` line
that `haus cloud-agent start` and `inspect` print rather than building one. A nonce replay
rebuilds the expected content from the links recorded on the original Message, not from current
authorization, so an identical retry stays idempotent and different content under the same nonce
still conflicts.

**Launch.** Launch keeps today's placement. Creation is one Server transaction that writes the
launch Message, the work, its first Run, and every link row. A top-level launch creates the launch
Message's Thread and the launching Agent follows it, so human replies there wake it; a launch
inside a Thread that already holds conversation stays in that Thread. Target resolution never
creates a Thread for a launch (`haus message send` still does); an anchor without one, or whose
Thread holds no Messages, fails before the transaction writes anything. The start receipt prints `Work thread:` with the
`"<target>:<shortId>"` Thread target, or the enclosing Thread target. Only the `--say` text is
authored. The Server appends `\n\n` and the new work's link itself, outside the authorization
path, as the Message's last link. Authored content stays capped at 32,000 characters; stored
content may exceed that by the generated link. Thread previews leave out any Message that is some
work's `launch_message_id`.

**Visibility.** A viewer may see Cloud Agent work when they can read a live Message that links it:
the linking Chat, and a Thread's parent, are not tombstoned, and the viewer can read that Chat by
the canonical rule (a human also needs an active Server membership). The delegating Agent always
sees its own work. One predicate (`cloud-agents/cloud-agent-work-visibility.ts`) answers this for
link authorization, Message annotations, `cloudAgentWork.listForChat`,
`cloudAgentWork.listActive`, and event delivery.

**Completion target.** A settled Run's inbox notice goes to the requesting Chat, `chatId`, only
while that Chat and its parent are live. Once the requesting Chat is deleted, the work settles
without a notice. The notice is never retargeted to a later link.

A launch posts a Message, so it passes the same freshness hold as `haus message send`, inside the
creation transaction. When the target Chat (a channel or Thread) has newer human or other-Agent
messages this run has neither seen nor been served, `POST /api/agent/cloud-agents` returns
`{ state: 'held', newMessageCount, omittedMessageCount, formalMentionCount, shownMessages }`
instead of the `{ state: 'started', … }` receipt. A held launch creates no Message, work, Run, or
Thread, and the Computer never asks the provider. The CLI prints the shown messages the way a held
send does and says the launch did not start; the Agent re-runs the command when the launch still
belongs there. There is no launch draft and no `--anyway`: the hold marks the shown messages served
to the run (and the Computer proxy attests them like any held send), so the re-run, with any
nonce, is not held for them again. A nonce that already committed replays its receipt before the
check, and a held attempt writes nothing under its nonce, so a retry is never poisoned.

The Server record stores provider-safe identifiers and bounded state only. Provider prompts,
credentials, raw transcripts, tool traces, and hosted workspace files remain on Computer or with
the provider. Safe Server observations are the provider Agent id and Run ids, normalized and raw
terminal status, bounded result or error summary and error code, timestamps and duration, per-Run
token and cost usage when present, the provider URL, and the Git branches and pull-request URLs
Cursor reports. Streamed thinking, tool arguments, shell output, and interaction deltas are
execution evidence, not collaboration state.

Lifecycle changes and new links emit `cloudAgentWork.updated` once for each linking Message in a
live Chat, carrying that Message's and the work's ids. Events notify; refetching the Message
recovers. Cancel authority does not follow links: the delegating Agent may cancel through
`haus cloud-agent stop`, and human Owners and Admins may cancel through `cloudAgentWork.cancel`,
reached from the work card's control band. Rendering a card grants no action. Other participants
ask for cancellation in whichever conversation they see the work in. Reply and follow-up work use
the work Thread rather than surface-local conversation controls.

### Follow-up delivery

Computer delivers a queued follow-up only after every preceding Run is terminal. Waiting behind a
Run Cursor still reports running is unbounded: hosted Runs can be long, and Cursor expires them
itself. A predecessor that is terminal in any way — completed, failed, cancelled, expired, refused,
or settled locally before reaching Cursor — unblocks the queue.

Once predecessors are terminal, each send uses the Run id as the provider idempotency key, so a
retry after a lost response never starts a second provider Run. The Cursor adapter classifies a
failed send:

- **Definite refusal** — authentication, unknown Agent, invalid input, or any other 4xx except
  request timeout (408), busy (409), too early (425), and rate limiting (429). The Run settles `failed` at once with
  `followup-delivery-rejected` and a summary carrying Cursor's message and code. It has no
  `providerRunId`, because Cursor never received it. A first launch refused the same way settles
  with `provider-launch-rejected`.
- **Retryable** — those four statuses, 5xx, network, or SDK unavailable. Computer retries with
  backoff (5 seconds, doubling, capped at one minute) and journals the attempt count, first
  attempt, and last error with the pending prompt. Thirty minutes after the first failed attempt,
  the Run settles `failed` with `followup-delivery-timeout` and a summary carrying the last error.
  The clock starts at the first attempt, not at queueing: with predecessors terminal, a busy agent
  frees within seconds, so busy for half an hour means a Run Haus does not track holds the agent,
  and an outage that long deserves the delegating Agent's judgment rather than silence.

A Run Server recorded but this Computer never journaled — the sender timed out or crashed between
the two — never reached Cursor. Its monitor settles it `failed` with `launch-record-missing` after a
two-minute grace window that covers an in-flight sender, or `cancelled` at once when stopped, and
an interrupting follow-up claims it as cancelled. Each settlement is an exclusive journal claim, so
a late sender loses and the outcome survives restart. A `launching` record without an
acknowledgement stays unconfirmed, because the provider may already be running it.

The delegating Agent, not the card, surfaces delivery failures. Every settled Run creates one inbox
attention carrying its `errorCode` and `summary`; the Agent explains the failure in the work's
conversation and decides whether to send again or `start` fresh work. The card keeps reading from
the newest Run Cursor received, so an undelivered follow-up leaves it as the earlier Run reads.

## Results are ordinary Messages

Cloud Agent work is a lifecycle record. It has no outputs relation. When a Run settles, the
delegating Agent receives the inbox attention with that Run's summary and evidence, inspects the
work, and posts what it learned as ordinary Thread replies: text, a pull-request reference,
attachments such as screenshots, or an artifact. Haus adds no output framework and no automatic
result Message.

A pull request is a rich reference (see [Rich References](../docs/features/rich-references.md) and
[Rich References](mentions.md)). Anyone can paste one and any Agent can post one, so it stands on
its own outside Cloud Agent work. The reference renders from its URL alone; a Server-side
pull-request snapshot is not built, and when it is it reads through the built-in GitHub
connection ([GitHub App connection](github-app-connection.md#not-built)). Cursor never supplies
these facts; the public Cloud Agents API reports no diff statistics.

The Thread preview under the launch Message shows the latest replies, so a lone pull-request reference
reply surfaces the pull request in the parent Chat without new storage. V1 hoists no pull-request
reference onto the work header; that is a later read if the preview line proves insufficient.

## Claude provider

The Claude adapter (`apps/computer/src/cloud-agents/claude/`) drives Claude Code's cloud sessions.

- **Sign-in.** It uses this Computer's own Claude Code sign-in (`claude auth status`, the claude.ai
  login). Haus stores no Claude credential and never signs Claude Code out. No hook, callback,
  network secret, or Haus credential runs inside Claude's environment; an earlier design that did
  was dropped.
- **Launch.** `claude --cloud <prompt>` runs in a throwaway checkout of the repository at the
  starting ref; the folder-trust prompt is accepted automatically and the checkout is deleted
  afterwards. Follow-ups run `claude -p --cloud <session> --output-format json <prompt>`.
- **Run tag.** Each prompt's first line is `HAUS_CLOUD_RUN=<workId>/<runId>`. Launch returns no Run
  id, so the tagged prompt's event id becomes the Run's `providerRunId` once Computer observes it.
- **Monitoring.** Computer polls Claude's session controller API about every 10 seconds: session
  `worker_status` (`running`, `idle`, `requires_action`), `status` (`active`, `archived`), and the
  session event log.
- **Mapping.**

  | Claude session state | Haus status |
  | --- | --- |
  | Tagged prompt not yet in the log | `queued` (`expired` if the session is archived) |
  | `requires_action` | `pending_input`; the open AskUserQuestion, or the tool Claude asks to use, is the summary |
  | `idle` with no open background tasks after a result | `completed`, or `failed` with `errorCode` `claude-<subtype>` |
  | Haus's own interrupt acknowledged and the worker not running | `cancelled` |
  | Session archived | `expired` |
  | Otherwise | `running`, with the latest activity |

- **Cancel and answers.** Cancel stops open background tasks, then sends an interrupt with request
  id `haus-cancel-<runId>`. Before delivering an answer to a session waiting on a question, Computer
  interrupts the pending question and waits for the worker to go idle.
- **Links.** Claude has no desktop-app deeplink, so **Open in Claude** opens claude.ai/code.

Known limits:

- A human answering directly in Claude's own UI is not observed, because the `pending_input` Run is
  already settled.
- Claude's branch and pull request are inferred from its own `git push` command and the GitHub pull
  request URL it writes, so they can be missed.

## Cursor readiness and authentication

Cursor runtime readiness and Cursor Cloud Agent readiness are related but independent Computer
capabilities:

| Capability | Ready when | Purpose |
| --- | --- | --- |
| Cursor runtime | `cursor-agent` is installed and its native session is usable | Local Cursor execution through an AI SDK harness adapter |
| Cursor Cloud Agent | `@cursor/sdk` resolves a user API key from `CURSOR_API_KEY` or `~/.cursor/sdk/auth.json` | Provider-hosted execution |

Readiness reports one of three reasons when it is not ready. `not-connected` — no credential
resolves. `expired` — a stored credential resolved but its own expiry has passed, so reconnecting is
the fix rather than installing anything. `provider-unavailable` — `@cursor/sdk` itself cannot be
loaded or reached on this Computer, which is a platform fact, not a credential one. `CURSOR_API_KEY`
is Cursor's own variable, read by the SDK and outside Haus's environment contract; a Computer that
sets it is connected and carries no expiry Haus can date.

Haus reuses provider-native state already present on the Computer. It does not scrape Cursor's
Keychain entries, copy credentials into Server, or invent a Haus credential format.
`Cursor.auth.login()` is Cursor's supported one-time bootstrap when SDK authorization is absent; it
supplies a Cursor sign-in link and stores a revocable, expiring user API key in the SDK credential
store after approval. Haus disables Computer-local browser launch and opens the link on the user's
current device. Computer polls Cursor for completion; no code needs to be pasted back. In its disconnected state, Computer settings presents Cursor Cloud Agent as an optional
capability available to connect. An explicit human action starts the provider-owned browser flow;
Haus never opens it during an Agent turn.

A user API key bills SDK and Cloud Agent work to the user's Cursor plan. Cursor runtime and Cloud
Agent readiness remain separate because the CLI and SDK use different credential stores even when
they belong to the same account. Cloud Agent providers form a Computer-specific capability category
separate from runtime harnesses; each Computer reports and onboards its own readiness.

## Ownership

| Layer | Owns |
| --- | --- |
| Haus Server | Messages, Cloud Agent work records, authorization, lifecycle projection, durable events, and inbox completion |
| Haus Computer | Provider discovery, SDK credential access, launch, reconciliation, cancellation, and detailed provider evidence, all behind the `CloudAgentProvider` boundary in `apps/computer/src/cloud-agents/` |
| Haus App | Message and card presentation, Thread discussion, progress and terminal outcomes, and Computer capability status |
| Cursor | Hosted Agent and Run lifecycle, repository checkout, workspace, transcript, branches, pull requests, artifacts, and billed usage |
| GitHub | Pull-request identity and lifecycle |

## The provider boundary

`CloudAgentProvider` is the whole provider surface: `readiness()`, `start()`, `read()`,
`subscribe()`, `cancel()`, plus `connect()` and `disconnect()` for the credential the other five
depend on. Everything above it — the Agent CLI, the Server record, the durable
events, the inbox attention — is provider-neutral, and everything below it, including credentials,
prompts, and raw status mapping, belongs to the adapter. An in-memory fake with scripted transitions
covers the whole path without a provider account.

`haus cloud-agent start` runs on the Computer rather than upstream: it checks readiness before
Server records anything, so an unavailable capability creates no Message, and it keeps the stdin
instructions local. Once Server has accepted the launch the work exists, so a provider refusal is
reported as a failed observation against that same work.

## Cursor implementation

The Cursor adapter uses the public `@cursor/sdk`, not Grok Bot's private services and not an
inferred CLI cloud command. `Agent.create()` returns a handle before provider persistence; the
initial `CloudAgent` operation performs the first `send()` that creates the hosted Run. Follow-ups
call `send()` on the same provider Agent.

Cursor Agent state and Run state remain distinct. An `IDLE` Agent does not prove successful
completion. Haus settles work from the corresponding Run's `FINISHED`, `ERROR`, `CANCELLED`, or
`EXPIRED` result. Computer may consume provider events for live progress but always reconciles with
a Run read after missed events, reconnect, or restart.

One status table owns the mapping, and it is the only place Cursor's vocabulary appears:

| Cursor Run status | Haus status |
| --- | --- |
| `QUEUED` | `queued` |
| `CREATING`, `RUNNING` | `running` |
| `FINISHED` | `completed` |
| `ERROR` | `failed` |
| `CANCELLED` | `cancelled` |
| `EXPIRED` | `expired` |

The raw string is preserved on every observation. The public SDK's `Run` handle normalizes `EXPIRED`
into `error`, so a **read** recovers expiry only from the terminal error Cursor reports with it,
while the per-Run **event stream** carries the unambiguous raw status on its `status` message. A Run
that expires while nothing is streaming and is then read fresh after a Computer restart can
therefore settle as `failed` rather than `expired`; that is a provider limit, not a mapping choice.

The end of a stream is never a settlement. The SDK's run handle stops streaming after its own
client-side wait deadline and locally marks itself errored while the hosted Run keeps working, so a
detached stream hands off to reconciliation instead: a Run read every 5 seconds until it is
genuinely terminal, backed off to 60 seconds after a provider failure, and nothing further once it
settles. A streamed terminal status does settle the Run, because that is where `EXPIRED` survives,
but it settles through one observation carrying both that raw status and the Run's own evidence —
Computer stops watching a Run the moment it settles, so a bare status followed by an evidence read
would lose the evidence.

Cancellation retries still read and report the Run's status when the stop request fails. Cursor can
reject a repeated stop with `run_not_cancellable` after the Run has already stopped; that rejection
must not block terminal reconciliation. A failed stop against a still-active Run retains the
60-second retry backoff.

The SDK does not surface the hosted Agent's own `url`, so the adapter builds the "Open in Cursor"
link as `https://cursor.com/agents?id=<agentId>`.

Haus supplies Cursor's Agent and Send idempotency keys, but Cursor does not document exactly-once
replay semantics for those headers. Haus's own nonce, durable ids, conflict handling, and
reconciliation provide the product guarantee; provider idempotency is defense in depth.

Cursor's Cloud Agents API is public beta. The adapter isolates provider requests, responses, and
status mapping from Haus's durable contracts. Repository validation happens at that adapter: a
repository is usable only when the Cursor account has the required source-control access.

## Model

A human picks the Cloud Agent model once per Server for each provider; the default is **Auto**.
For Cursor, Auto is the per-run model router. Haus sends Auto as Cursor's catalog id `default` on every Run, so the setting means
the same thing whatever default model the Cursor account configured (sending no model would mean
that account default, and no SDK API reports which model it is). For Claude, Auto sends no model,
so the account default applies: Claude's catalog lists sonnet, opus, and haiku with
`autoAvailable: false`. Agents cannot choose
or override it: no Agent route, CLI flag, or start input carries a model.

**Catalog.** Cursor is the source of truth for which models exist. The Computer that holds the
Cursor connection reads `Cursor.models.list()`, maps it, and reports the result inside its ordinary
inventory, on the Cloud Agent provider line: `cloudAgentProviders[].models = { autoAvailable,
models, refreshedAt }`, or `null` when it has none. Each model is `{ id, displayName, description, family,
order, effort, fast }`. Cursor publishes no price or tier, so Haus carries none. The mapping
(`apps/computer/src/cloud-agents/model-catalog-mapping.ts`):

- turns Cursor's own `default` ("Auto") entry into `autoAvailable: true` instead of a model, since
  Haus offers Auto as its own option;
- keeps Cursor's order as `order`, the first valid listing of each id, and at most 200 models;
- strips zero-width characters and collapses whitespace in every label;
- derives `family` from the id and name: `claude`, `gpt` (Codex included), `gemini`, `grok`,
  `composer`, `glm`, `kimi`, or `other`;
- keeps only two user-facing parameters. `effort` normalizes Cursor's three spellings (`effort`,
  `reasoning`, `reasoning_effort`) into `{ options: [{ value, displayName }], defaultValue,
  providerParamId }`, where `providerParamId` is the spelling that model takes on the wire. `fast`
  is `{ defaultValue }` when the model offers `fast` as true/false. Each `defaultValue` comes from
  Cursor's `isDefault` variant. Context, thinking, and every other parameter are not offered and
  never sent, so Cursor's defaults apply. A malformed parameter drops only that control.

Computer caches the catalog per connected account and reads it again on start, whenever the
account changes (a reconnect mints a key with a new expiry), and on a daily loop per attachment
connection. A failed read keeps the previous catalog for the same account with its own
`refreshedAt`; disconnecting reports `null`. Server stores it with the rest of the reported
inventory on `computers.reported_inventory`.

**Setting.** The contract is the union `{ kind: 'auto' } | { kind: 'model', id, params: { effort?,
fast? } }`. `auto` is Auto. An absent param means the model's own default, so `params: {}`
is "this model as Cursor configures it". `cloud_agent_model_settings(server_id, provider,
model_id, model_params)` holds one row per Server and provider; no row means Auto. (Migration
`0089_cloud-agent-claude` moved the former `servers.cloud_agent_model_id` and
`.cloud_agent_model_params` into the Cursor row.) Any member reads it through
`cloudAgentSettings.get({ serverId, provider })`; only an Owner or Admin writes it through
`cloudAgentSettings.setModel({ serverId, provider, model })`; `provider` defaults to `cursor`.
The write refuses (`BAD_REQUEST`) an id that the
freshest catalog on any of the Server's Computers does not list, an `effort` value that model does
not offer, or `fast` on a model without it. The read returns `{ model, catalog,
savedModelUnavailable }`. `catalog` is that freshest catalog, or `null` when no Computer has
reported one. `savedModelUnavailable` is true when a saved model is missing from it.

**Launch.** Server resolves the model whenever it creates a Run, for a first launch and for each
follow-up. It sends the saved model only when the **launching Computer's** newest catalog lists it.
Otherwise it falls back to Auto. Auto, chosen or fallen back to, is sent as `default` when that
catalog has `autoAvailable`; without it (or without a catalog) Haus sends no model, the only
option left. With a listed model it sends each saved
param that model still offers, under the model's own `providerParamId`. A saved param it no longer
offers (value gone, or control gone) is dropped, so that Run takes the model's default. Unset params
are never sent. Every Run records the outcome as `model: { id, params, fallbackFrom, droppedParams }`
(`cloud_agent_runs.model_id`, `.model_params`, `.model_fallback_from`, `.model_dropped_params`).
`id` is the model Haus sent: a catalog id, `default` for Auto, or `null` when it sent none. `params` are
`[{ name: 'effort' | 'fast', providerParamId, value }]` as sent. `fallbackFrom` names the saved model
that fell back, so it sits only beside `default` or `null`, and `droppedParams` names the saved
params that were dropped. A Run without a catalog model has neither params nor drops. Runs that predate the setting read
`{ id: null, params: [], fallbackFrom: null, droppedParams: [] }`, which is accurate because Haus sent
no model then either. Computer passes `agent.send(..., { model: { id, params: [{ id:
providerParamId, value }] } })`, leaves out `params` when there are none (Auto sends `{ id: 'default' }`), and leaves out the
option when the id is `null`. Computer protocol 26 carries the catalog and the Run model.

## Settings and usage

Settings → Models shows one model row per provider. Computer settings report Cursor runtime and Cursor Cloud Agent as separate capabilities even when
they use the same Cursor account. Cursor appears alongside other detected execution runtimes, and
the Cloud Agent capability is one row beside them with Connect and Disconnect behind its overflow
menu once connected. Pending sign-in can be resumed from the row. The dialog offers Continue in
Cursor, Copy sign-in link, cancellation, automatic completion, and retry after expiry or failure.

The App reaches it through `cloudAgentProvider.get`, `.connect`, `.cancelSignIn`, and `.disconnect`, which Server
authorizes to Owners and Admins and relays to the selected Computer over the attachment protocol —
the same shape Browser settings use. No provider credential exists on Server to store or leak; only
readiness, account metadata, and the public sign-in link cross the boundary. The link and status
are ephemeral Computer state, with a five-minute lifetime and one active attempt per provider.
The App polls the capability only while waiting; closing or reloading the App preserves the
Computer-owned attempt. Computer protocol 21 requires this headless sign-in contract.
Haus reports per-Agent and per-Run tokens and optional cost available through the public SDK; it
does not claim personal plan capacity, remaining allowance, or reset time because Cursor exposes no
supported public personal-account surface for them. Interactive CLI `/usage` reports activity and
streak statistics, not billing capacity. Team or Organization Admin usage requires a separate
administrative integration and is outside this Computer capability.

## Intentionally missing

- No repository registry, repository setup flow, or per-Server repository allowlist in v1.
- No requirement that the delegating Agent use the Cursor runtime.
- No representation of a Cloud Agent as a named Haus teammate or Harness subagent.
- No product-wide generic action, card, output, or provider framework.
- No Server-hosted Cursor or Claude credential or raw provider transcript in Chat history.
- No per-Server default provider: the default is Computer-local, and the Agent's only override is
  `--provider`.
- No GitHub-owned PR state, checks, reviews, or merge actions in v1.
- No automatic completion Message; the delegating Agent decides whether the result deserves one.
- No outputs relation, output table, or produced-by provenance; results are ordinary Messages and
  references.
- No pull-request facts sourced from Cursor. A Run's own `pullRequest` snapshot is the Computer
  reading GitHub directly for the pull request row's state and diff counts; the pull-request
  reference itself renders from its URL.
- No per-launch human approval card. Launch approval, when a Server wants it, is an @mention:
  the Agent @mentions the human with what it will launch and waits for an explicit yes in reply
  before launching ([ADR 0037](../docs/adr/0037-humans-are-addressed-by-mention.md)).

## Implementation sequence

1. Canonicalize Messages: add `body_kind`, the exhaustive `Message.body` contract, and the single
   Server Message reader. Cloud Agent work blocks on this step. `body_kind`
   defaults to `text`, and `toChatMessage` projects the typed record for every consumer that
   returns a Message. The retired `ask` kind first introduced the column; ADR 0037 removed it.
2. **Landed.** ADR 0028 retired prepared actions entirely: Agents create Agents directly, the
   `agent-created` body joined this union, and the top-level `preparedAction` field is gone.
3. Add Cursor runtime discovery and AI SDK harness support.
4. Add Cursor Cloud Agent readiness, SDK bootstrap guidance, and truthful usage reporting.
5. **Landed.** The `haus cloud-agent` verbs, the `CloudAgentProvider` boundary with an in-memory
   fake, the durable work and Run records, the launch Message, and the eager Thread.
6. **Landed.** Lifecycle reporting, reconnect reconciliation, cancellation by Agent and by
   Owner/Admin, `cloud-agent-work.updated`, and the terminal inbox attention. The combined Effect
   and Cloud Agent contract uses Computer protocol 16.
7. **Landed.** The Cursor adapter behind `CloudAgentProvider`, its readiness detection, and the
   Computer settings connect flow. Every SDK type stops at a transport seam inside the adapter, so
   the deterministic lanes run against recorded provider responses; one opt-in live lane
   (`HAUS_RUN_LIVE_CURSOR_TEST=1` with `HAUS_LIVE_CURSOR_REPOSITORY=owner/name`) proves the
   recordings still describe Cursor.
8. **Web landed.** The Thread-surface header with its activity and last-update line, the hoisted
   status on an anchor whose Thread holds live work, the surface's overflow menu with cancel, the
   in-Thread work card with its branch and pull-request row and its View PR, Open in Cursor, and
   Cancel run actions, the `?work=` peek, and the
   Inbox "Happening now" section over `cloudAgentWork.listActive`. iPhone supports the Thread preview,
   inline work card, PR/provider links, cancellation, and Computer-scoped Cursor connection settings.
   The web Inbox's active-work section and `?work=` peek remain web-only.
9. Run deterministic Server, API, Computer, App, and iOS coverage, then one opt-in live Cursor
   lifecycle smoke.

## Provider contract notes

- Pin the public-beta `@cursor/sdk` version and isolate all status and field mapping in the Cursor
  adapter. Live documentation and one downloadable OpenAPI snapshot currently disagree about the
  raw `IDLE` Agent status; Haus reads no Agent status at all, so the disagreement cannot reach it.
- The pinned version is `1.0.30`. The SDK carries platform-specific optional dependencies with
  native binaries and still bundles into the Computer's `bun build --compile` artifact.
- Cursor names a branch's repository in whatever shape its Git metadata carries: a live Run reports
  the scheme-less `github.com/owner/name`, while other surfaces report an HTTPS clone URL or an SSH
  remote. Every form reads back to one label — `owner/name` on GitHub, and the host-qualified
  `host/owner/name` off it, so branch evidence survives on any host. A reference that names no
  repository at all is dropped rather than reshaped. The work's own `repository`, which the Agent
  supplies and Haus starts a Run against, stays `owner/name`.
- Git metadata is an Agent-workspace snapshot, not guaranteed per-Run diff attribution.
- Optional provider cost can arrive eventually and does not represent account-plan allowance.
