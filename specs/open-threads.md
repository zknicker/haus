---
summary: Proposed contract for Open Threads — a per-human sidebar lens over Threads still in motion, the Threads page, the Work panel on a full-page Thread, Server-owned pull request readings kept live by GitHub webhooks, Thread results in Search, and the phased implementation plan.
read_when:
  - implementing any slice of Open Threads, the Threads page, or the Work panel
  - changing which Threads count as open, a Thread's status line, or Close
  - changing how Haus reads a pull request's state, checks, or reviews after a Run settles
  - changing message search so it returns Thread messages, or adding Thread results to the command menu
  - adding a full-page Thread route on the web
---

# Open Threads

Status: proposed, 2026-11-05. Phases 1 to 4 are built. [ADR 0051](../docs/adr/0051-open-threads-are-a-lens.md) records the
decision. The [design board](https://claude.ai/artifact/K3g2MVRZPdkReZbkykP4vB) shows the prototype.
Where the board and this spec differ, this spec wins.

## Problem

The Inbox shows what is unread. Once a human reads a Thread, nothing shows it again, so a Thread
they answered an hour ago can only be found by scrolling its parent Chat. Cloud Agent work has the
same gap: it appears only in the Chats that link it, and Happening now drops it the moment the Run
settles, while its pull request still needs review. Three defects make this worse:

- `searchChatMessages` excluded every Thread message. Phase 1 fixed this.
- Haus reads a pull request only while a Run reports, and a settled Run stays final, so a pull
  request merged later reads Open forever.
- A Thread has no title, so a list of Threads has nothing to show.

## Product contract

- **A Thread is the unit.** Cloud Agent work, its pull request, and the conversation about it all
  meet in a Thread, so Open Threads lists Threads, not work. A Thread with no work is listed the
  same way. There is no separate Cloud Agents section or Work page.
- **A lens, not a store.** Open Threads owns one fact of its own, Close. Everything else derives
  from existing records.
- **Not an attention tier.** Open Threads has no badge, sends no notification, and never asks to be
  cleared. Rows leave by themselves. Close is optional. The Inbox, its badge, and the notification
  rule are unchanged ([ADR 0038](../docs/adr/0038-inbox-is-unread-not-attention.md)).
- **The card still mirrors the provider.** A Thread's status line is a rollup for this lens only.
  The job-state chip keeps [ADR 0041](../docs/adr/0041-cloud-agent-cards-mirror-cursor.md)'s
  vocabulary and gains no Haus state.

## Which Threads are open

A Thread is a **candidate** for a viewer when its parent is a Chat `chat.list` lists for them and
either:

- they follow it (`thread_follows.followed` is true), or
- it holds Cloud Agent work, and they have not explicitly unfollowed it.

The second clause is what surfaces work an Agent started on its own, from a Trigger or a heartbeat,
which nobody follows yet. It does not change follows, so it does not change unread.

A Thread holds work when a link sits on its anchor Message, as a work card's Thread does, or on a
Message inside it.

A candidate is **open** unless its state below has expired or the viewer closed it.

### State

`deriveOpenThreadState` in `packages/haus-api` is one pure function, so every client agrees. The
first matching row wins. A Thread with several jobs or pull requests reads them all and takes the
most urgent. `<d>` is relative time.

| State | When | Status line | Group | Expires |
| --- | --- | --- | --- | --- |
| `unread` | `threadUnreadCount` above zero | `<Author> replied · <d>`, or `<Author> mentioned you · <d>` | With you | Never |
| `job-failed` | A job's state is `failed` and no newer job is live | `Job failed` | With you | 24h after the last write |
| `checks-failing` | An open pull request's `checks` is `failing` | `Checks failing` | With you | Pull request settles |
| `changes-requested` | An open pull request's `review` is `changes-requested` | `Changes requested` | With you | Pull request settles |
| `approved` | An open pull request's `review` is `approved` and checks are not pending | `Approved` | With you | Pull request settles |
| `ready-for-review` | An open, non-draft pull request with `checks` `passing` or `none`, and `review` `none` | `Ready for review` | With you | Pull request settles |
| `working` | A job is live | `Working · <d>`, `No update in <d>` past ten minutes, or `<n> jobs · <m> working` | With agents | Job settles |
| `needs-input` | A job's state is `pending-input` | `Needs input` | With agents | Job settles |
| `checks-running` | An open pull request's `checks` is `pending` | `Checks running` | With agents | Pull request changes |
| `draft` | A draft pull request | `Draft` | With agents | Pull request settles |
| `waiting` | The viewer wrote the Thread's last message | `Waiting on <Agent> · <d>`, else `Waiting for a reply · <d>` | With agents | 24h after the last write |
| `merged` | Every pull request settled, at least one merged | `Merged · <d>` | Recent | 12h after it merged |
| `pr-closed` | Every pull request closed unmerged | `PR closed · <d>` | Recent | 12h after it closed |
| `done` | Every job settled, no pull request | `Done · <d>` | Recent | 24h after the last write |
| `recent` | Anything else | `<Author> replied · <d>` | Recent | 24h after the last write |

`needs-input` sits under With agents because the delegating Agent answers it, not the human. Its
question never appears here, matching the card. `<Agent>` in `waiting` is the Agent that last wrote
in the Thread.

Expiry uses fixed hours because the Server has no viewer timezone
([timezone contract](../docs/adr/0040-agents-resolve-human-timezones-explicitly.md)). An expired
Thread is no longer open and stays on the Threads page under Earlier.

A pull request read only from a Computer (see [Readings](#pull-request-readings)) cannot be trusted
as still open. After seven days without a reading, it counts as settled for this table.

### Close

Close hides a Thread from the sidebar and files it under Earlier. It keeps the follow, the unread
state, and every Inbox row. A later Message from anyone else reopens it. A pull request or job
change alone does not; the Agent says so in the Thread if it matters.

```ts
// thread_closures: at most one row per Thread and human
{ serverId; threadChatId; userId; closedAt; closedThroughSequence }
```

A Thread is closed while its newest Message from someone else is at or below
`closedThroughSequence`. Reopen deletes the row.

## Thread title

`threadTitle` in `packages/haus-api` derives the title at read time and stores nothing:

1. The title of the Thread's oldest Cloud Agent work.
2. Otherwise the anchor Message's first line, with reference markup rendered as plain text, cut at
   80 characters.

Agent-authored Thread titles are out of scope.

## Surfaces

### Sidebar

An **Open threads** section sits between the top menu and Channels, with **All threads** at the
trailing end of its header. Each row has a status glyph, the title, then the status line and the
parent's context label on a second line (`DM` for any direct message). Glyphs differ by shape as
well as color.

Rows sort by group (With you, With agents, Recent), then newest Thread first within a group, so a
row moves only when its group changes. The section shows at most twelve rows, filling from the top;
With you rows are never folded away. Past twelve, **All threads** carries `+<n>`. With no open
Threads the header stays and shows no rows. Nothing renders until the read settles.

Rows follow [ADR 0046](../docs/adr/0046-the-sidebar-goes-pages-open-to-the-right.md): a click is Go.
Each row reads its own entry, keeping the sidebar's render isolation.

### Threads page

`/s/:slug/threads`, band `Haus › Threads`, lists **With you**, **With agents**, **Recent**, and
**Earlier**, each only when it has rows. Earlier is newest activity first and paginates. A segmented
control picks **Following** (candidates) or **All** (every Thread the viewer can see). A filter field
narrows the loaded rows by title, parent, Agent, or pull request number. Rows Open, per ADR 0046.

### Full-page Thread

The page `threads/:chatId/:anchorMessageId` serves desktop and the web, sharing `ThreadContent`. On
the web the Thread header fills the shell's band, and an artifact opens in its Chat. Opening a Thread from a transcript still uses the web side pane, unchanged; Go
from a sidebar row or the command menu uses the page.

### Work panel

A Thread page holding Cloud Agent work shows a Work panel beside the transcript, and a Thread
without work shows none. The panel is page-only: the web side pane never gets it. It needs a pane
at least 900px wide. Below that it does not render, and a **Work** button in the band is hidden.
The band's **Work** button toggles it, remembered per device.

For each job, in start order:

1. **Job:** the Cloud Agent work card itself, with its status line, pull request row, and actions.
2. **Pull request**, when one exists: title, checks, review, and `Last read <d>` when the reading is
   Computer-only.
3. **Runs**, when there is more than one: each Run's status, duration, and summary, newest first.

One **Linked from** block closes the panel, listing every other conversation that links the work and
is visible to the viewer (`cloudAgentWork.listLinks`). Each entry Opens.

While the panel is open, a linking Message inside that Thread shows a one-line reference (provider
mark and title) instead of the full card, so the page states each fact once. Pressing it scrolls
the panel to the job. With the panel closed or absent, the full card returns. Every other surface
keeps the card, including the web side pane and the parent Chat.

### Band

The Thread header's menu gains **Close** (or **Reopen**) beside the follow item, on Threads that are
on either list.

### Search

`searchChatMessages` drops the Thread exclusion. `visibleChats` already derives Thread access from
the parent. Each result gains `thread: { parentChatId, anchorMessageId } | null`, so opening one lands
on the Message inside its Thread.

The command menu's **In threads** group lists Message hits in Threads, above Messages. Phase 3 adds
a **Threads** group above it (title matches over the viewer's open Threads), where a row shows its
status.

## Pull request readings

This replaces "Haus stores no branch or pull-request entity" in
[Cloud Agents](cloud-agents.md#durable-cloud-agent-work). A reading is still evidence, not a Haus
lifecycle: Haus never writes to a pull request here, and a reading exists only for a pull request
some Cloud Agent work reported.

```ts
type CloudAgentPullRequestReading = {
    repository: string; // owner/name, lower-cased
    number: number;
    url: string;
    title: string | null; // null until GitHub is read
    state: 'draft' | 'open' | 'merged' | 'closed';
    headSha: string | null;
    checks: 'none' | 'pending' | 'passing' | 'failing' | 'unknown';
    review: 'none' | 'approved' | 'changes-requested' | 'unknown';
    changedFiles: number;
    additions: number;
    deletions: number;
    settledAt: string | null; // when GitHub merged or closed it
    observedAt: string;
    source: 'github' | 'computer';
};
```

`cloud_agent_pull_requests` holds one row per Server, repository, and number, plus
`refresh_requested_at`.

- **Seeding.** A Run observation carrying a snapshot of a GitHub pull request upserts its row, source
  `computer`, and marks it for a read. It replaces only an older Computer reading, never a `github`
  one. Computer readings fill `checks` and `review` as `unknown`. The Run's own snapshot stays as
  evidence. A pull request reported with no snapshot gets no row, because Haus cannot state its
  state.
- **Projection.** `CloudAgentWork` gains a Server-projected `pullRequest:
  CloudAgentPullRequestReading | null`: the row for the newest Run that reported one. The card's
  pull request row and iOS read it, so a merged pull request finally reads Merged there too.
- **Webhooks mark, they do not write.** After `ingestGithubDelivery` routes a delivery to an active
  installation, and before Trigger matching, a `pull_request` or `pull_request_review` event sets
  `refresh_requested_at` on the matching row by repository and number. `check_suite` and `check_run`
  match `pull_requests[].number`, else `headSha`. This step runs whether or not any Trigger matches,
  never changes `routed`, and ignores pull requests with no row.
- **One refresher.** A serial Server loop takes marked rows one at a time and reads
  `pulls/{n}`, `pulls/{n}/reviews`, `commits/{sha}/check-runs`, and `commits/{sha}/status` with the
  installation token. It coalesces repeated marks, and it never fans out, per the dev Server pool
  hazard. It writes source `github` and emits `cloudAgentWork.updated` for linked work only when the
  reading changed.
- **Rollups.** `checks` is `failing` if any completed check or status failed, else `pending` if any
  is unfinished, else `passing`, else `none`. `review` takes each reviewer's latest non-comment
  review: `changes-requested` beats `approved`.
- **Failures.** A retryable failure keeps the mark and ends the pass. Any other failure keeps the
  last reading and clears the mark. Nothing is fabricated. A
  repository no active installation covers stays source `computer`, and the panel says `Last read
  <d>`. The Computer token stays local and is never sent to the Server.
- **Recovery.** Existing [delivery recovery](github-triggers.md#recovery-and-the-development-pull)
  replays missed deliveries through the same step. The migration seeds rows from each work's newest
  Run snapshot and marks every non-settled row for one refresh.

The App already has every permission this needs (Pull requests, Checks, Commit statuses). Its webhook
does not subscribe to `status`, so a commit status from outside GitHub Checks reaches a reading on the
next `pull_request` or `check_*` event. `CloudAgentWork.pullRequest` is an additive field, so it
needs no [Computer protocol](haus-cli.md#8-server-api-apiagent) bump.

## API

Procedures live in `apps/server/src/haus-api/thread/`, contracts in `packages/haus-api`.

```ts
thread.listOpen({ serverId }) => { threads: OpenThread[]; closedThreadChatIds: string[] }
thread.listEarlier({ serverId, scope: 'following' | 'all', cursor }) => { threads: OpenThread[]; nextCursor }
thread.setClosed({ serverId, threadChatId, closed }) => void
thread.onClosedUpdated // one human's closes, across their devices
```

`OpenThread` carries `threadChatId`, `parentChatId`, `anchorMessageId`, `title`, `state`,
`group`, `expiresAt`, the facts its status line needs, and `lastActivityAt`. A fixed number of
queries read the candidates and their inputs; there is no per-Thread read. Both lists read every
candidate and filter in the Server, which is fine at today's size; add a recency bound if it stops
being.

The App hook owns invalidation from the events that already exist: `chat.onMessageCreated`,
`thread.onFollowUpdated`, `cloudAgentWork.onUpdated`, plus `thread.onClosedUpdated`. Events notify
and React Query owns recovery. Expiry adds no poll: a row past `expiresAt` hides on its next render,
and the next read drops it.

## Implementation plan

Each phase ships on its own.

1. **Threads in Search.** Remove the exclusion, add `thread` to results, open results in their
   Thread. Proof: Server search test and a scoped App e2e.
2. **Pull request readings.** Table, migration, seeding, ingest step, refresher, `CloudAgentWork.pullRequest`,
   card and iOS reads. Proof: Server tests with recorded payloads, a dev-App delivery pull, and a
   real merged pull request reading Merged.
3. **Open Threads.** `threadTitle`, `deriveOpenThreadState`, `thread_closures`, `listOpen`,
   `listEarlier`, sidebar section, Threads page, Close. Proof: table-driven state tests,
   `sidebar-render-isolation`, `render-budget.spec.ts`, `idle-silence.spec.ts`.
4. **Work panel.** Web Thread page, panel, card swap, Runs, Linked from. Proof: website gate and
   scoped App e2e in the real desktop App and on the web.
5. **iPhone.** Designed separately. Phase 2's card change reaches iOS earlier.

On landing, update `specs/cloud-agents.md`, `specs/threads.md`, `docs/features/chat.md`,
`docs/features/inbox.md`, `CONTEXT.md` (Open Thread, pull request reading), and `.design/guidelines.md`
if the panel adds a composition.

## Out of scope

Merging or commenting on a pull request from Haus, Agent-authored Thread titles, pinning, grouping
rows by repository, notifications for pull request changes, and any change to Tasks.
