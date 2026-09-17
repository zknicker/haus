---
summary: Provider-hosted Cloud Agents as Agent-delegated work carried by durable Messages and executed through Computer-local provider access.
read_when:
  - adding or changing Cloud Agent tools, providers, lifecycle, cards, results, or completion delivery
  - changing Cursor runtime discovery, Cursor Cloud Agent authentication, or Cursor usage reporting
  - changing typed Message bodies, the `agent-created` body, or record-backed Message rendering
  - deciding whether delegated work belongs to a Haus Agent, Harness subagent, Task, or provider-hosted Cloud Agent
---

# Cloud Agents

Cloud Agents let any Haus Agent delegate bounded development work to a provider-hosted agent.
The delegating Agent starts the work, receives completion through its inbox, inspects the result,
and decides what to say or do next. Cursor is the first provider.

This spec is the canonical implementation plan. Earlier Fable and architecture reviews under
`~/.claude/plans` are research inputs and may describe superseded designs.

The product and architecture grill closed on 2026-09-02. Provider notes below are implementation
facts and compatibility risks, not unresolved product decisions.

## Product contract

- **Agent CLI verbs.** `haus cloud-agent start`, `send`, `inspect`, and `stop` are the Agent
  surface, not a harness tool, because the Agent CLI is an Agent's only output channel
  (ADR 0014). Every supported execution runtime may call them; the caller does not need to be a
  Cursor-backed Agent. `start` takes `--target`, `--repo`, an optional `--ref`, `--title`, and
  `--say` — the Agent's own words, which become the Message content — with the provider
  instructions on stdin.
  `send --work <workId>` takes another prompt on stdin and continues the same hosted agent;
  a busy agent queues it, and `--interrupt` stops active work and discards older queued prompts
  before processing it.
  `inspect` lists the caller's work, or reads recorded details with `--work <workId>`.
  `stop --work <workId>` requests cancellation. The published `cancel` spelling remains a CLI
  compatibility alias for existing callers.
- **Provider-neutral capability.** Cursor is the only initial implementation, so an Agent does not
  pass a provider on every call. Computer configuration chooses the default if a second provider
  arrives; an explicit selector is added only when per-execution choice becomes useful.
- **Agent-held repository context.** The Agent supplies the repository, starting ref, title,
  instructions, and any other provider input it knows. Haus adds no repository registry.
- **One durable Message.** Launch posts one Agent-authored Message in the initiating Chat. Its
  immutable `content` is the Agent's response to the request, supplied as `--say` in the same
  invocation that starts the work. Its typed body is `cloud-agent-work`.
- **One work conversation.** A top-level work Message receives a child Thread immediately. Work
  launched inside an existing Thread stays in that Thread because Threads do not nest. Replying to
  the Message is the human steering and discussion surface; the card has no separate reply model.
- **One updating presentation.** Haus App renders the Message's Cloud Agent work body as one
  Thread surface header in the parent Chat and one detailed card inside the Thread. Both update from
  queued or running into a terminal report without creating automatic progress or completion
  Messages.
- **Inbox completion.** Every terminal provider run creates at most one durable inbox attention for
  the delegating Agent. Completion does not keep the launch turn open. The resumed Agent owns any
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
Instructions are removed once launched or cancelled and never reach Server.
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
or board lifecycle, and a structured work Message cannot be promoted to a Task.

**Delegation from a Task.** A human creates or promotes a Task, an Agent claims it, and the Agent
delegates inside the Task Thread. The work Message is a reply in that Thread. The Task keeps the
human lifecycle: the Agent advances it — to `in_review` when a pull request exists, to `done` when
that pull request merges — through the ordinary versioned task mutation. A work Message is never
itself promoted to a Task.

## Messages and cards

A Message is the only Chat transcript item. Every Message has stable identity, authorship,
conversation placement, sequence, and meaningful immutable content. A typed body augments that
content; it never replaces the Message's authored meaning.

```ts
type MessageBody =
    | { kind: 'text' }
    | { kind: 'agent-created'; agent: CreatedAgentSummary }
    | { kind: 'cloud-agent-work'; work: CloudAgentWork }
    | { kind: 'ask'; ask: Ask };

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
};
```

An `ask` body carries one human decision request; see [Asks](asks.md).

Body kinds name concrete Haus product acts, not generic mechanisms, rendered entities, or
providers. Haus has no generic `prepared-action`, `cards[]`, or arbitrary JSON-block body. Agent
creation uses `agent-created`; delegated hosted work uses `cloud-agent-work`; Cursor is a
provider field on that work. A pull request becomes a Message body only when a real workflow needs
to author a pull-request Message independently.

A card is presentation, not a durable noun. It owns no id, placement, lifecycle, authorization, or
data. Haus App renders a card from the Message and the Server-owned record projected through its
typed body.

In the parent Chat — a Channel or a DM — Haus App renders Cloud Agent work as the header of the
Message's recessed Thread surface, the same surface and the same chip grammar a Task and an Ask use:
provider glyph and name, title, a status disc with elapsed or total duration, and the reply count.
One optional line shows `activity` while the work runs, and the latest Run summary or error once the
work is terminal. The surface opens the Thread. Open in Cursor and Cancel live in the surface's
overflow menu.

**Web attachments before replies.** A top-level work Message with no replies uses a content-width
button containing provider, work title, and status, followed by the activity line when present.
The adjacent menu retains the work actions. Once replies exist, the same facts move into the
Thread card; zero replies never reserves an empty Thread card. Full work details inside the Thread
remain unchanged. iOS retains its existing presentation until a separate native update.

**Thread preview.** Each Cloud Agent work inside a Thread gets an informational row below the
anchor's Task/Ask header: provider, title, and status with elapsed or total duration. Completed work
stays visible. The entire preview opens the Thread; individual work rows are not click targets.
Server's conversation-scoped `cloudAgentWork.listForChat` read includes all statuses, grouped by
Thread anchor. The Inbox's separate active-work read remains active-only.

**Inside the Thread**, each delegation Message renders its prose followed by one full work card
in the scrolling conversation. The Message's sequence fixes its position; status, PR, and follow-up
updates change the same card in place. New delegations get their own Messages and cards. There is
no pinned Cloud Agents section or carousel. Task metadata remains above the conversation.
The card is presentation derived from the work record and is never a Chat row, and nothing on it is
named after any one provider: the provider's own mark, the title with a status chip (`Queued`,
`Running` with the in-progress disc, `Done` in success, `Failed` and `Expired` in danger, `Cancelled`
muted, `Cancelling`), the repository, a branch row carrying the branch the run wrote and `PR #<n>`
when it opened one, a diff row of `<n> files changed` with additions in success and deletions in
danger whenever the branch carries a pull-request snapshot, and one split-button control band — View
PR when there is a pull request and Open in `<provider>` until then, with Open in `<provider>`, Copy
link, and Cancel run for Owners and Admins while the run is live behind the chevron — plus a
`Delegated by <Agent> · <time>` receipt. The Run report is not on the card: the branch, the pull
request, and the diff are the evidence, and provider prose only crowded them out. It updates in place
from the same event.
Multiple Cloud Agents may run inside one Task or Thread. The presentation imposes no one-to-one
workflow restriction. Meaningful result announcements may be new conversation Messages; work
observations update existing records rather than automatically posting channel chatter.

Only status discs and the card's status chip carry lifecycle color. A running work whose `updatedAt`
is older than ten minutes shows a last-update note rather than gating on Computer connection state.
iOS mirrors this presentation in its Thread preview and inline work cards. Older clients and
unknown body kinds render the Message `content` and the ordinary Thread preview.
Compact Thread-preview rows on web and iOS show the work title until completion, then the newest
Run's primary PR file/addition/deletion counts. Without a recorded PR snapshot, they show only
Done, never inferred zero changes. Lifecycle status remains visible; full work cards keep their title.

Server has one Message reader that projects authors, attachments, Tasks, and typed bodies for every
consumer: Chat history, Threads, search, send receipts, Agent delivery, web, and iOS. Clients do not
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

## Durable Cloud Agent work

Server stores one lifecycle-rich `CloudAgentWork` record for each work Message. The Message owns
authorship and Chat placement; the work owns mutable execution state.

```ts
type CloudAgentWork = {
    id: string;
    messageId: string;
    chatId: string;
    agentId: string;
    computerId: string;
    provider: 'cursor';
    providerAgentId: string | null;
    providerUrl: string | null;
    title: string;
    repository: string;
    startingRef: string | null;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';
    startedAt: string | null;
    terminalAt: string | null;
    cancelRequestedAt: string | null;
    cancelRequestedBy: { kind: 'agent' | 'user'; id: string } | null;
    activity: { summary: string; at: string } | null;
    runs: CloudAgentRun[];
    createdAt: string;
    updatedAt: string;
};

type CloudAgentRun = {
    runId: string;
    providerRunId: string | null;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';
    rawStatus: string | null;
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
substantively separate assignment creates a new Message and Cloud Agent work record. Cursor permits
only one active Run per provider Agent; Computer queues accepted follow-ups until preceding work
settles. `send --interrupt` stops active work and discards older queued prompts before the follow-up
runs. `stop` stops active work and discards the pending queue. Revisions reuse
the same Work ID and Thread, including when the work belongs to a Task.
A cancelled Run cannot resume, so continuing after cancellation creates another Run in the same
work and retains the cancelled Run's partial evidence. `runs` is ordered newest first and is bounded
at twenty; the work keeps recent Runs for inspection rather than an unbounded execution history.
Each accepted follow-up adds a Run to the existing work without creating another Message or Task.

`activity` is one bounded line of at most 120 characters. Computer may update it from provider
events no more than every few seconds. It is the work's current state in a sentence, never a
transcript, and it yields to the latest Run summary once the work settles.

`branches` and `pullRequestUrl` are Cursor's own terminal Run report, retained as evidence for the
in-Thread work card's branch row. They are not a Haus product relation: Haus stores no branch or pull-request
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
states the branch's pull-request state and diff counts, and the work Message reads back with
`pr=#<n>` wherever messages are shown. The in-Thread card shows the branch row and `PR #<n>`
with files changed, additions, and deletions when GitHub evidence is available. Missing evidence
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

The physical relationship is one-to-one: the work's `message_id` is unique and references the
Message. Creation is one Server transaction. `chat_messages.body_kind` and the related record must
agree; a missing or duplicate record is a mapping failure, never an empty card.

The Server record stores provider-safe identifiers and bounded state only. Provider prompts,
credentials, raw transcripts, tool traces, and hosted workspace files remain on Computer or with
the provider. Safe Server observations are the provider Agent id and Run ids, normalized and raw
terminal status, bounded result or error summary and error code, timestamps and duration, per-Run
token and cost usage when present, the provider URL, and the Git branches and pull-request URLs
Cursor reports. Streamed thinking, tool arguments, shell output, and interaction deltas are
execution evidence, not collaboration state.

Lifecycle changes emit a durable `cloud-agent-work.updated` event carrying the Message and work
identities. Events notify; refetching the Message recovers. The delegating Agent may cancel through
`haus cloud-agent stop`; human Owners and Admins may cancel through
`cloudAgentWork.cancel`, reached from the Thread surface's overflow menu or the in-Thread work
card. Other Chat participants request cancellation in the Thread. Reply and follow-up
work use the work Thread rather than surface-local conversation controls.

## Results are ordinary Messages

Cloud Agent work is a lifecycle record. It has no outputs relation. When a Run settles, the
delegating Agent receives the inbox attention with that Run's summary and evidence, inspects the
work, and posts what it learned as ordinary Thread replies: text, a pull-request reference,
attachments such as screenshots, or an artifact. Haus adds no output framework and no automatic
result Message.

A pull request is a rich reference (see [Rich References](../docs/features/rich-references.md) and
[Rich References](mentions.md)). Anyone can paste one and any Agent can post one, so it stands on
its own outside Cloud Agent work. A Server-owned GitHub connection in Settings → Connections
resolves each pull-request reference into a cached snapshot — title, state, additions, deletions,
and files changed — that the compact and card-like renderings show. Without a connection the
reference renders from its URL alone. Cursor never supplies these facts; the public Cloud Agents
API reports no diff statistics.

The Thread preview under the work Message shows the latest replies, so a lone pull-request reference
reply surfaces the pull request in the parent Chat without new storage. V1 hoists no pull-request
reference onto the work header; that is a later read if the preview line proves insufficient.

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
opens Cursor's browser flow and stores a revocable, expiring user API key in the SDK credential
store. In its disconnected state, Computer settings presents Cursor Cloud Agent as an optional
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

The SDK does not surface the hosted Agent's own `url`, so the adapter builds the "Open in Cursor"
link as `https://cursor.com/agents?id=<agentId>`.

Haus supplies Cursor's Agent and Send idempotency keys, but Cursor does not document exactly-once
replay semantics for those headers. Haus's own nonce, durable ids, conflict handling, and
reconciliation provide the product guarantee; provider idempotency is defense in depth.

Cursor's Cloud Agents API is public beta. The adapter isolates provider requests, responses, and
status mapping from Haus's durable contracts. Repository validation happens at that adapter: a
repository is usable only when the Cursor account has the required source-control access.

## Settings and usage

Computer settings report Cursor runtime and Cursor Cloud Agent as separate capabilities even when
they use the same Cursor account. Cursor appears alongside other detected execution runtimes, and
the Cloud Agent capability is one row beside them reading Not connected, Connecting, Expired, Ready,
or Unavailable, with Connect on the row and Disconnect behind its overflow menu once connected.

The App reaches it through `cloudAgentProvider.get`, `.connect`, and `.disconnect`, which Server
authorizes to Owners and Admins and relays to the selected Computer over the attachment protocol —
the same shape Browser settings use. No provider credential exists on Server to store or leak; only
readiness and the account it resolves to cross the boundary.
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
- No Server-hosted Cursor credential or raw provider transcript in Chat history.
- No provider selector until a second implementation creates a real choice.
- No GitHub-owned PR state, checks, reviews, or merge actions in v1.
- No automatic completion Message; the delegating Agent decides whether the result deserves one.
- No outputs relation, output table, or produced-by provenance; results are ordinary Messages and
  references.
- No pull-request facts sourced from Cursor. A Run's own `pullRequest` snapshot is the Computer
  reading GitHub directly for the branch row's state and diff counts; the pull-request reference's
  title and cached presentation still come only from the Server GitHub connection.
- No per-launch human approval card. Launch approval, when a Server wants it, is an Ask
  ([Asks](asks.md)), not a card.

## Implementation sequence

1. Canonicalize Messages: add `body_kind`, the exhaustive `Message.body` contract, and the single
   Server Message reader. Cloud Agent work blocks on this step. This landed with
   [Asks](asks.md): `body_kind` defaults to `text`, the shipped union is `text | ask`, and
   `toChatMessage` projects the typed record for every consumer that returns a Message.
2. **Landed.** ADR 0028 retired prepared actions entirely: Agents create Agents directly, the
   `agent-created` body joined this union, and the top-level `preparedAction` field is gone.
3. Add Cursor runtime discovery and AI SDK harness support.
4. Add Cursor Cloud Agent readiness, SDK bootstrap guidance, and truthful usage reporting.
5. **Landed.** The `haus cloud-agent` verbs, the `CloudAgentProvider` boundary with an in-memory
   fake, the durable work and Run records, the work Message, and the eager Thread.
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
