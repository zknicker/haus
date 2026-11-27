---
summary: Agent inbox — the `agent_inbox` item kinds and their one lifecycle, exact delivery planning, model-visibility accounting, notice turns, runner-local pulls, and cause inference on send. Supersedes steering.md and addressing.md.
read_when:
  - adding an agent inbox item kind, or changing an item's identity or lifecycle
  - changing the drive_conflict item, who receives it, or its wording
  - changing which agents wake for a chat message, Project hearing, follow semantics, or mentions outside its Project
  - changing exact model visibility, freshness catch-up, or pull acknowledgement
  - changing mid-turn notices, drain batching, or chain limits
  - changing how the Server infers which fire caused an Agent's message
  - changing Agent status surfaces derived from inbox delivery, including chat engagement (typing)
  - changing crew reports, `issue_assignment`, `issue_event`, `process_exit`, or what a Captain hears from Tasks (ADR 0062)
  - changing how the Captain chat or `haus task send` reaches an agent, or what an Issue reference wakes
---

# Agent Inbox

The Agent inbox is agent-only delivery state; humans see unread state on sidebar rows
([Capy shell](../docs/features/capy-shell.md)) and get [notifications](../docs/features/notifications.md).

The agent inbox is the only lane that carries work no human sees, and `agent_inbox`
is the table that holds it (ADR 0026). Everything an Agent is given to act on is an
inbox item: a delivery planner queues items per attention rules, notice turns preserve
Agent pull discretion, and exact visibility plus a verified contiguous boundary are the
only truth about what an agent has seen. Decisions I1–I4 of the Raft alignment program; wire surface in
[haus-cli.md](haus-cli.md).

**Delivery host.** Every Agent runs on the runner ([Runtime drivers](runtime-drivers.md), R4d), so
where this spec says the Computer accepts, caches, mirrors, or pulls local envelopes, read the
runner: its inbox store (`apps/runner/src/turn/inbox-store.ts`), turn input and composed drain
(`turn-input.ts`, `composed-drain.ts`), notices (`turn-notices.ts`, `pending-notice.ts`), and Haus
proxy (`apps/runner/src/haus/haus-proxy.ts`) own those jobs, and the Server sends `runner-start` and
notice frames over the runner socket. The Computer no longer holds an Agent inbox or accepts runs.

## Item kinds and lifecycle

Every row is one item with a stable identity that is never a message id except for
ordinary Chat work, the rendered envelope as its content, and the recipient Agent.

| Kind (`source`) | What it is | Identity | Lane |
| --- | --- | --- | --- |
| `human` | An ordinary Chat delivery of a durable message | The message id | Notice; concrete when addressed on a cold start, or on any wake of a live session |
| `pull_request` | A pull request on a Task became ready for review or its checks finished | `<repo>#<number>:<change>:<headSha>` | Concrete, in the Task, for the Task's agent |
| `claim_assignment` | A direct claim assignment to this Agent | The assignment identity | Concrete |
| `reminder` | One reminder fire | The fire id | Concrete |
| `trigger` | One Trigger fire | The fire id | Concrete |
| `onboarding` | Retired. Cove's one-shot bootstrap instruction from the removed Server onboarding flow ([ADR 0059](../docs/adr/0059-haus-starts-empty-without-cove.md)); nothing writes one, migration 0138 settled every unsettled row `seen`, and seen rows stay as history | Its own bootstrap identity | None |
| `greeting` | A newly created Agent's one-time `#all` greeting wake (ADR 0028) | `greeting:<agentId>`, so one per Agent | No lane of its own: attached to the next ordinary run whatever leads it (setting the start frame's `greets`), and leads a run only when nothing else waits (a sub-agent wake still leads, since it is never held and the greeting rides the next ordinary run). Retired as `seen`, queued or attached, once the Agent has a message in its `#all`, so neither a Stop nor a reconnect replay makes it show twice. Bodiless; never listed in a notice, the digest, or `haus inbox check` |
| `subagent` | A wake for background work the Agent started on its runtime that finished or stopped ([runtime-drivers.md](runtime-drivers.md#background-work)); no Chat | `subagent:<agentId>:<wake id>` | Concrete; at most one queued per Agent, only for the current session generation. Never in a notice, the digest, or `haus inbox check`. Spends the automation chain; refused, not queued, at the chain ceiling. Retired by Stop, a session reset, or a run that adopted the turn it was for |
| `drive_conflict` | One Drive push that kept both versions of a file, kept an edit over a delete, or refused a file ([artifact-drive.md](artifact-drive.md#pushes)). It lists every such file of the push. No Chat | `drive-conflict:<pushId>`, where the push id is the pushing run's id, so one per push | Concrete. Queued when the push closes. Never in a notice, the digest, or `haus inbox check`. Spends the automation chain, and at the ceiling it waits for the chain to reset instead of being refused. Retired as `seen` when its run settles |

Only ordinary Chat work is backed by a `chat_messages` row; the rest exist solely
here, because a fact only an Agent needs is never written to a transcript humans read
(ADR 0026). A human learns each of those facts from a representation on the content it
explains — the claim chip, or the cause line on an automation's answer — described in
[automation-provenance.md](automation-provenance.md).

One lifecycle covers every kind: `queued` when planned, `accepted` when the Computer
acknowledges the run carrying it, `served` when its body reaches the model — a pull for
notice-lane work, acceptance itself for concrete work, whose body is already in the run's
prompt — and `seen` when the turn settles with the item proven model-visible.
Retirement keeps the row as ledger evidence rather than deleting it. An item that cannot reach `seen` is re-offered on every wake, so
a new kind is only correct once it settles like the others, and deleting the automation
behind a queued fire retires that item rather than leaving it to replay.

## Cause inference (ADR 0026)

An Agent that answers a fire attributes the answer itself with `haus message send
--cause <fireId>`, which records `attribution = 'explicit'` and always wins. When a send
carries no `--cause`, the Server infers the cause under exactly one rule, and writes
nothing otherwise:

1. the sending run's served item set contains exactly one item and that item is a
   reminder or Trigger fire — a fire the run was woken with is served the moment the
   Computer accepts that run, so the rule holds without any pull; and
2. the send's target Chat is that fire's anchor Chat.

Then `message_causes` records that fire with `attribution = 'inferred'`. A run offered a
fire alongside anything else — another fire, a Chat message, an attention — infers
nothing, because the Agent had more than one reason to speak. Inference is deliberately
narrow: an unattributed answer is an ordinary message, which is a better outcome than a
mark that names the wrong cause.

## Delivery planning (I1)

### Hearing

[ADR 0055](../docs/adr/0055-projects-own-agents-and-tasks.md) narrows what reaches an Agent. Each
Agent has one home [Project](projects.md#agents), hears everything there, and elsewhere hears
only what is addressed to it or what it follows. A message reaches an Agent when any row holds:

| Where the message is | It reaches the Agent when |
| --- | --- |
| Its Project's channel | Always, as ordinary delivery |
| A Task of any Project | It @mentions the Captain, or the Captain follows the Task (ADR 0062: no ambient Task hearing) |
| Another Project's channel, top level | It @mentions the Agent |
| Another Project's channel, inline reply | It @mentions the Agent, or the Agent follows the reply chain |
| Its own Captain chat | Always, addressed (ADR 0062; replaces the DM row) |
| Another Captain's chat | Never, even when it @mentions the Agent |
| `#all`, the team room | Always, as in its home, for every active Agent |
| Its own Task chat (a Task agent) | Always, addressed; a Task agent hears nothing else |

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) sets the rows
for Tasks and Captain chats (steps 3 and 5, released together; step 3 built no ambient Task hearing):

- **No ambient Task hearing.** A Project's hearers do not hear its Tasks. A Captain hears a Task
  chat only when a message @mentions it, when it follows the Task, or through its own crew's
  [reports](#crew-reports). `hearersOf` (`agent-delivery/hearing.ts:26`) does not apply to `task`
  chats, and the Task branch of the recipient planner (`agent-delivery/message-recipients.ts:60-73`)
  keeps only mentions and follows.
- **Task agents hear their own chat only.** Every message in a Task's chat reaches its Task agent,
  addressed, as a DM reaches its Agent today. A Task agent is never a hearer anywhere else and is
  never @mentionable ([tasks.md](tasks.md#captains-and-the-captain-chat)).
- **The Captain chat** reaches its own Captain always, addressed (`addressedReason:
  'captain_chat'`, replacing `'dm'` at `message-recipients.ts:164`), so it drains on a cold start
  as a DM does today. It reaches no other agent: an @mention of another Captain there renders as a
  mention for people and wakes nothing. It never joins a Project's hearing, so two Captains in one
  Project never read each other's chats.
- **Delivery modes.** A message to a Task carries `steer`, `interrupt` or `queue`, stored on the
  Task agent's `agent_inbox` row (`delivery`) ([tasks.md](tasks.md#talking-to-a-task)). `steer`
  reaches a busy Task at its next tool boundary as today's busy notice does, then drains in full
  there; if the turn settles first, the item starts the next turn. `interrupt` aborts the live
  turn, whose unseen items return to `queued` as Stop does today, and the next run offers the
  interrupting item first. `queue` is never in a busy notice and is offered when the live turn
  settles.
- **Mentions by number.** A bare Issue code (`GEN-12`) or an `issue://` link records a passive
  "Mentioned in" reference and wakes nobody. A `task://` link records a reference and wakes
  nobody. A Task is woken by posting in its chat or by `haus task send`, which spends the
  automation chain like any agent-authored message.

- `#all` is no Agent's home and no Project, but every active Agent on the Server hears it the way
  it hears its home: its top-level messages, and its inline replies before anyone has
  participated. Its ADR 0030 candidates are every active Agent, and Jev narrows there as in any
  channel. A retired Agent never hears it, and an Agent never hears its own message. One
  function decides hearers for both cases (`hearersOf` in `agent-delivery/hearing.ts`), keyed on
  `chats.is_all`. Decided by Zach 2026-11-20, so team-wide updates reach every Captain.
- Delivery splits in two. Every active Agent on the Server is **reachable**: it can be
  @mentioned, can follow a Task or reply chain, and can read and post anywhere
  (`resolveAgentTarget`, `listMentionOptions`, `mentionedAgentIds`,
  `ensureInlineReplyParticipants`). Only a channel's hearers are **ambient listeners**, hearing
  its top-level messages and inline replies without being addressed: a Project's home Agents,
  or in `#all` every active Agent.
- A Project's **hearers** are its non-retired home Agents, and no one else. They hear the
  channel and its inline replies, not its Tasks, and they are the ADR 0030 candidates. A Project
  with no home Agent delivers only @mentions, assignments and follows; nothing else hears
  it. Amended 2026-11-20 by Zach's decision that every Captain belongs to a real Project:
  generalists are retired, so no Agent hears a Project with no home Agent on its behalf
  ([projects.md](projects.md#generalists)).
- A Captain follows a Task by the follower rules in [tasks.md](tasks.md#followers-and-unread):
  authoring or being mentioned in its origin Message, posting in it, or following by hand. A crew
  Task's Captain does not follow it; it hears its crew through reports.
- An Agent follows a reply chain by the rules in [Inline reply attention](#inline-reply-attention).
- A Captain chat reaches its Captain always, inline replies included: chain follows decide
  delivery only in channels.
- Claim assignments, reminder and Trigger fires, pull request changes, and the other concrete
  kinds reach their recipient wherever their Chat is. Hearing narrows only ordinary `human`
  delivery.
- Posting in a Project does not make an Agent hear it. Moving an Agent's home changes delivery
  for messages planned after the move. Items already queued stay queued.
- There are no channel mutes. `agent_channel_mutes` and `haus channel mute` and `unmute` are
  deleted: a Project is the place an Agent answers first, and other Projects already reach it
  only by mention. Hearing in its Project is absolute: a Project's hearers hear every message in
  its channel. An Agent stops hearing a Task it follows by unfollowing it (`haus task unfollow`).

Across all Servers with the TypeSafe credential configured, [ADR 0030](../docs/adr/0030-semantic-channel-addressing.md)
permits semantic narrowing of unaddressed human top-level channel messages. Its eligible Agents in
a Project's channel are the Project's hearers. The final recipient set is committed with the
message; kept, uncertain, failed or stale judgments retain ordinary delivery. This does not change
explicit mention, reply, Task, or DM rules. Jev also sees any Agent the message @mentions from
outside the Project, but only hearers can be narrowed away. In a Project with one hearer, the
message is addressed to it as `sole` when the author is the channel's only human member. With more
human members, Jev judges whether the one Agent is the addressee, and recipients stay unchanged
either way. A Project with no home Agents delivers its unaddressed messages to no Agent.

ADR 0030 narrowing of top-level channel messages among several hearers is the one exception to
absolute home hearing.

Hearing lands with J3. Each row of the table, and a Project with no home Agent, has a delivery test in
`apps/server/test/agent-hearing.test.ts`, inline replies in
`apps/server/test/agent-reply-hearing.test.ts`, `#all` in
`apps/server/test/agent-all-hearing.test.ts`, and the migration has one for each step of
[projects.md](projects.md#migration-from-channels).

### Planning

A durable `message.created` is planned once by Server delivery
(`apps/server/src/agent-delivery/`):

- Ordinary delivery reaches the Agents that [hear](#hearing) the message. The author never
  receives their own message.
- Personal @mentions (rich reference or plain `@handle`) reach the named Agent in any Project. In
  a Task, a direct mention restores an explicit unfollow and the recipient's exact pending
  delivery carries that replay-safe restoration fact.
- Mention identity is resolved once when delivery is planned and persists independently from
  suppression. An ordinarily delivered mention still tells only the named Agent `you were mentioned`;
  other eligible Channel participants retain ambient visibility without that attention flag.
- A direct claim assignment to another Agent keeps the canonical claim message as ordinary work and
  adds one `claim_assignment` item to only the assignee's inbox. It is `mentioned=true` so it
  reaches the assignee outside its Project, and renders in Agent inbox envelopes the way a reminder fire does. The
  human's representation of that fact is the claim chip on the message.
- A pull request on a Task becoming ready for review or its checks finishing queues one
  `pull_request` item carrying `pullRequestChange` for the Task's agent, once per head commit
  ([Tasks](tasks.md)). It lands in the Task, so a plain send in that turn goes there.
- An Issue write queues its derived wakes ([Issue items](#issue-items)) in its own transaction.
  Each is `mentioned=true` and has no Chat, so the row holds its typed attention as JSON rather
  than an envelope. Reassigning, unassigning, or moving the Issue to `backlog`, `done` or `canceled` retires a queued `issue_assignment`; a run that
  already holds it keeps it, and a failed run forgets it on requeue (`retireStaleRequeuedItems`)
  unless the Issue is still `todo` or `in_progress` and assigned to the agent. A change an agent
  made spends the automation chain; one a person made resets it
  ([chain budget](github-triggers.md#automation-chain-budget)).
- A Drive push that closes with any `kept_both`, `kept_edit`, or `refused` outcome
  ([artifact-drive.md](artifact-drive.md#pushes)) queues one `drive_conflict` item for the Agent
  that pushed. It has no Chat, so the row holds its
  typed attention as JSON, as an Issue item's does. That attention is `driveConflict` in
  `packages/haus-api/src/agent-inbox.ts`: the push id, the writer (the Agent), and every listed file of the push, uncapped because conflicts are rare. Each file carries
  `path`, `outcome`, `copyPath` for `kept_both`, `currentRevisionId`, `currentAuthorHandle`, and
  `reason` (`same_lines`, `binary`, `base_gone`, `both_created`, `edit_over_delete`, or the refusal
  code). When
  nothing is live at the path, as after a refused create, `currentRevisionId` and
  `currentAuthorHandle` are explicit nulls. The item never invents a revision or an actor.
  `drive_conflict` joins `chatlessInboxSources`, and the start frame carries the item as
  `driveConflict`. An idle Agent gets it as the prompt of its own run. A push closes only after its
  turn settles, so a busy Agent gets it as its next run, with no notice. An Agent's push is
  Agent-authored traffic and spends the automation chain. At the ceiling the item stays queued and
  wakes the Agent once the chain resets, because the copies it names stay in Drive until someone
  merges them. The turn input formatter renders one line per file and the item's own guidance, so
  no standing prompt text teaches it:

  ```text
  [drive conflict · 4 files · your push after run_8f2…]
  agents/blippy/notes/launch.md · @ada changed the same lines · yours: agents/blippy/notes/launch.conflict-blippy.md
  haus/logo.png · binary, changed by @tiny · yours: haus/logo.conflict-blippy.png
  haus/old-plan.md · @ada edited it, so your delete did not happen
  agents/tiny/notes/x.md · refused, you cannot write there · yours: drive-refused/agents/tiny/notes/x.md
  Each original holds the current version and each copy holds yours. Merge what you still want into the original with ordinary file commands in drive/, then delete the copy.
  An edit always beats a delete. Delete the file again if you still mean to.
  A refused file is not in Drive: your version is in drive-refused/ in your working directory, and drive/ holds what Drive has.
  ```

  Each guidance line appears only when the item has that outcome. A `base_gone` file reads "the
  version you started from is gone", a `both_created` file reads "created it too", and an edit of
  the Agent's own that beat someone's delete reads "it was deleted, and your edit brought it back".
  A missing author handle reads "someone"
  (`packages/agent-prompt/src/inbox-drive-conflict-format.ts`).
- After planning, ordinary Chat work gives an idle Agent a notice turn and a busy Agent receives the
  same notice in its live turn. Concrete work — a pull request change, an automation fire, a
  claim assignment — is the typed exception: an idle recipient receives the item's own envelope as
  the prompt of a distinct turn; a busy recipient receives only the content-free notice at a safe
  boundary, then the still-queued item in the next turn. A concrete drain never mixes kinds, so each
  concrete item earns its own dedicated wake, and a human drain never shares a run with a fire, which
  is what keeps the sole-fire cause inference readable. Issue items are the chatless batch: the
  queued rows of one kind ride one chatless run, whose start frame carries them as
  `issueAssignments` or `issueEvents`, so ten assignments wake an idle agent once. That run resumes
  the main session, and the runner renders one line per Issue and the item's guidance. An automation
  fire's envelope prints `msg=-`, since a fire has no Chat message to address; its id rides the
  envelope's own `fire=` and `--cause` lines. Humans keep their own read/unread system; the inbox is
  agent-only state.
- **Human bodies ride the wake in two cases** ([ADR 0034](../docs/adr/0034-addressed-messages-ride-the-wake.md)).
  A human item is *addressed* when it is a DM, a personal @mention, a Jev routing that committed
  the message to exactly this Agent, or `sole`: the channel's only eligible Agent, messaged by the
  channel's only human member ([ADR 0030](../docs/adr/0030-semantic-channel-addressing.md));
  the reason is decided once at enqueue and stored on the row. The Server marks eligibility on the
  start frame — `drainItemIds` for any start, `warmDrainItemIds` for a start that resumes a live
  session — and the Computer picks the lane, because only it knows whether the harness session
  resumed. A resumed session drains every eligible human body; a cold start drains only the
  addressed ones and notices the rest in the same prompt. A busy Agent still receives only the
  content-free notice. Existing row and character budgets apply unchanged, and the Computer attests
  what it composed as exact run visibility before the model streams, so the freshness hold never
  treats the message the Agent is answering as news. The composed receipt leaves inbox rows
  offered; settlement attaches them and advances `seen`, and the turn summary is its fallback.
- **Every wake ends with the unread-elsewhere digest.** The frame carries per-chat counts of queued
  work no row of that frame represents: a chat with a notice row states its own pending count and is
  left out, while a drained item represents only itself, so same-chat work past the drain budget
  still surfaces as a count. Counts advance nothing and are never bodies.

## Inline reply attention

Channel and DM messages may reference a parent in the same chat. Server derives and persists
the root; the reply stays in the chat's sequence. `agent_message_follows` records Agent attention
by chat, root, and Agent, independently from the claim's single assignee.

Root authors and mentions, reply authors and mentions, and successful claimants join that
chain. Send and claim update follows in their existing transaction. Losing a claim adds no
subscription. Ordinary top-level messages follow [hearing](#hearing). An inline reply in a
channel reaches the Project's [hearers](#hearing), the chain's followers, and its direct
mentions, excluding the author. The hearers stay recipients however many Agents join, leave, or
retire from the chain, as home hearing is absolute.

Followed chains deliver in any Project, home or not. For an Agent that is not one of the
Project's hearers, unfollow suppresses ordinary chain delivery and withdraws its queued chain
items; an explicit follow, new post, successful claim, or direct mention restores it. A hearer's
unfollow is recorded and changes nothing for it: its queued items stay.
Unfollowing a chain never joined is a no-op. Claim completion preserves follows. Parent access,
Agent retirement, existing loop budgets, inbox queues, and exact visibility rules still apply.
Queued channel messages are not withdrawn when an Agent claims their request.

Message reads include bounded parent/root excerpts and identities. Content-free notices remain
content-free. Reading a reply creates no seen coverage for intervening channel messages.

## Visibility ledger (I3)

Transport debt is the exact queued set in `agent_inbox`; delivery never advances a scalar
high-water mark. Model visibility is recorded in `agent_inbox_exact_visibility` as exact message
identities tied to the active run. Concrete items use their own stable identity in the durable
delivery ledger and intentionally have no Chat cursor. Freshness treats an identity as visible when it settled in this
session generation or was served to the current run. A verified contiguous boundary in
`agent_inbox_cursors` is only an optional compaction/baseline; exact identities beyond it never
consume the gaps between them. Its `held_through_sequence` is the one exception, and only for
freshness: a hold records the newest message it showed, so earlier messages it omitted do not
hold the next send, while they stay queued and unseen. The shown messages' queued rows are served
to the active run, so delivery never brings them again. Outside a Task, freshness counts only
messages delivered to the Agent. Notices and wakes advance nothing, ever.

## Notice turns and system attention (I1)

Turns float on the session ([sessions.md](sessions.md)). Ordinary Chat work is
never pushed into a turn. Server sends full canonical envelopes to Computer,
which caches them locally and projects only target/count/id/sender metadata. A
cold session uses that notice as its first prompt; `Start.` is reserved for a
cold session with no pending delivery. The Agent chooses whether and when to
pull bodies.

Computer-composed turn input may also carry private workspace notices that are not inbox items,
such as a managed skill update notice. They wake no turn, have no identity in this ledger, and
never affect cause inference.

Each pending identity records the turn that successfully offered it. Settling
without a pull leaves the row pending and queryable but does not start another
turn for that unchanged set. A new identity changes the set and wakes once;
Restart, Start, or session reset explicitly offers pending work again. Chain
budget follows rows made model-visible, not notice-only turns.

Non-Chat system attention is a separate typed concrete lane. Pull request changes, reminder and
Trigger fires,
claim assignments, and Drive conflicts use that lane, settle against their own stable identities, and never enter Chat message
resolution or Chat cursor accounting. Each of those exists nowhere but its inbox row, so its
envelope rides the wake instead of waiting behind a pull the Agent may never make. The
Computer suppresses an already-consumed identity on accepted-run replay; a failed unsettled
new run explicitly reoffers it so a terminal result is model-visible at most once per item.

## Notices (I2)

Idle and busy agents receive only the content-free inbox notice (turn-shapes §4):
batched target rows with counts, first/latest short ids, latest sender, and
`· dm / · claim #N / · you were mentioned` tags — never bodies, from
one formatting owner. Rows are
deduped by exact offered identities and repeat only when the pending set
changes. Busy injection is acknowledged only after Computer durably caches the
envelopes and successfully injects the notice after a completed tool boundary.
If the runtime cannot accept mid-turn notices or the turn ends first, the notice
remains unacknowledged and is offered by the next turn in the same session.
Runtime acceptance must be acknowledged; writing to an adapter's local input
queue is insufficient. A notice advances no cursor.

Issue items have no target to list under, so the notice frame carries both kinds beside its rows
as one count, `issueItems: { ids, total }`, and a notice may carry only that. The agent reads one
line, `N Issue updates for you`, and the items themselves arrive in its next turn. The ack covers
those ids like any row, which stops the count repeating. The runner keeps the count in its pending
mirror and drops it when an Issue item run is accepted.

The notice carries its own handling guidance after the closing `]`, as Raft's inbox update does,
so the standing system prompt keeps only the collaboration principle (collaborate
asynchronously; choose when to read; a notice needs no immediate interruption). The guidance
states that the bodies are withheld to avoid flooding the Agent, not absent; that the notice is not
itself a request and is not acknowledged; how to pull (`haus message read --target <target>
--unread` for one conversation, `haus message check` for all of them, in Raft 26f77ef's wording);
and that deferral needs no visible reply and the messages remain queryable, to be read before the
Agent stops, as the prompt's Messaging section says. The unread-elsewhere digest closes by pointing at `haus inbox check`, which
lists every unread conversation with the command that opens it. With no concrete message and no notice,
the prompt's startup sequence stops the turn.

Computer owns one local visibility coordinator for the busy-notice
projection. Every path that makes a message visible to the model — an accepted
run inbox, a message pull, a history result, or freshness-hold context —
consumes those exact message identities there. Notice replacement, live
injection, and identity consumption share one serialized boundary, so a stale
notice cannot reintroduce work that the current run or a tool result already
showed. The Computer retains those identities for the session generation
because a notice is only a bounded pending window; session reset clears them.
This is runner-local projection state; Server exact pending and visibility rows remain canonical.

## Pulls

`haus message check` serves Computer-local pending message envelopes first and falls
through to Server when that local cache is empty or holds a pending Trigger or
Reminder fire, whose body only the Server serves. A single invocation
drains successive pages (up to 50 rounds) before reporting that more messages
remain. Exact local identities
are durably recorded for the active turn, best-effort attested immediately as
exact run visibility, and carried again in the turn summary so settlement remains
sound across Server outages. Computer removes only those exact identities from
its notice projection. Server advances `seen` only at settlement; a pull then
crash/no-output clears stale local visibility evidence and re-exposes the
canonical envelopes to the replayed turn. History, search, direct reads, and
freshness-hold results require a Server visibility receipt for any pending
identities before Computer returns the bodies.

## Unread conversations and read position

`haus inbox check` is the Agent's counterpart of the human Inbox, ported from Raft
1.21.2: it lists every conversation that [reaches](#hearing) the Agent and has
unread messages, newest activity first, from a durable per-chat Agent read position
on the Server (`GET /api/agent/inbox/conversations`). Each row prints the target, the
unread count, whether it mentions the Agent, and the latest sender, with an `open:`
line naming the `haus message read --target "<t>" --after <lastReadSeq>` command
that reads from the read position. Rows whose pending work has not yet been handed to
the Agent (`N new, not yet delivered`) come first.
The output pages with `More: haus inbox check --before <key>` and ends with exactly
one `Next:` line. `--view mentions` keeps only conversations that mention the Agent;
a Task outside its Project appears only while the Agent follows it, and a channel outside its
Project appears only while a message that reached the Agent there, a mention or a reply in a
chain it follows, is unread, and counts only those. A 503 `INBOX_UNAVAILABLE`
teaches a retry, and `haus message check` still drains. Listing advances nothing.

The read position advances when `haus message read --unread` returns messages, when a
history read returns a page that starts at or below it, when the Agent sends into the
chat, and when messages are made visible to the Agent contiguously from it (a wake
delivery or a `message check` drain). Browsing with `--after` past older unread does
not move it. `haus message read --target <t> --unread` reads from the read position
and moves it, cannot combine with `--before`, `--after`, or `--around`, and says
`More unread remain` when the Agent should run it again.

## Golden flow

For an ordinary Chat message, the required sequence is:

```text
Server queues canonical work
  -> Computer durably caches the full envelope
  -> Agent sees a content-free notice
  -> Agent chooses whether to pull
  -> pull returns exact bodies and records exact run visibility
  -> turn settlement advances seen for proven-visible identities
```

The boundaries matter: transport acceptance is not model visibility; a notice
is not a request; exact exposure is not settled consumption; and only settled `seen` removes ordinary
work from catch-up. An unpulled row remains pending without immediately waking
the Agent again. A pull followed by a crash replays from canonical Server state.

Creating an Agent produces no inbox item at all. `haus agent create` returns its receipt in the
same command, the announcement Message reaches humans as an ordinary Chat message naming the new
Agent by `@handle`, and the new Agent is configured without an empty bootstrap turn. Its first
turn starts when its creator sends the working brief.

## Regression guards

| Contract | Executable guard |
| --- | --- |
| Pending work is the first notice prompt; no `Start.` race or duplicate injection | `apps/runner/src/turn/turn-notices.test.ts` |
| Notices contain no bodies and exact envelopes retain target/message identity | `packages/agent-prompt/src/inbox-format.test.ts` |
| `haus inbox check` lists unread conversations from the durable read position, pending rows first, with one `Next:`; listing advances nothing | `packages/agent-cli/src/commands/agent-inbox.test.ts`, `apps/server/test/agent-inbox-check.test.ts` |
| Local-first pull, exact visibility receipts, history/read consumption, and Server fallback | `apps/runner/src/haus/haus-cli.test.ts` |
| Stale notices cannot resurrect identities already made visible | `apps/runner/src/turn/inbox-store.test.ts` |
| Accepted work and pull evidence survive reconnect or replay correctly | `apps/server/test/agent-delivery.test.ts` |
| Unpulled work is offered once; new identities wake again; subsets and targets settle independently | `apps/server/test/agent-delivery.test.ts` |
| Notices inject only at safe tool boundaries or remain durable for the next turn | `apps/runner/src/turn/turn-notices.test.ts`, `apps/server/test/agent-delivery.test.ts` |
| Creating an Agent creates no inbox item and no empty bootstrap turn for the new Agent | `apps/server/test/haus-agent-creation.test.ts` |
| The notice teaches Raft's `--unread` / `message check` pull plus non-request and read-before-you-stop semantics; the digest points at `haus inbox check`; the prompt teaches asynchronous collaboration and FYI silence without losing required capabilities | `packages/agent-prompt/src/inbox-format.test.ts`, `apps/runner/src/turn/turn-input.test.ts`, `packages/agent-prompt/src/managed-instructions.test.ts` |
| A live session drains human bodies; a cold start drains only addressed items and notices the rest once | `apps/runner/src/turn/turn-input.test.ts`, `apps/runner/src/turn/turn-notices.test.ts` |
| A composed drain records exact run visibility and consumes its own notice rows | `apps/runner/src/turn/turn-input.test.ts` |
| A drained wake message is exact-visible before settlement, and the freshness hold does not fire on it | `apps/server/test/agent-composed-drain-visibility.test.ts`, `apps/runner/src/turn/turn-input.test.ts` |
| Pre-join history never holds a send; a hold shows three, serves them to the active run once however deep the queued backlog, never walks back through what it omitted, and allows `--anyway` from the fourth hold | `apps/server/test/agent-send-hold.test.ts`, `apps/server/test/agent-send-hold-serving.test.ts` |
| A queued greeting never holds or stales a send and survives the seen advance; the first send into a channel the Agent just created is not held | `apps/server/test/agent-freshness-new-chats.test.ts` |
| Addressing is decided at enqueue and survives stale, uncertain or kept routing | `apps/server/test/message-routing-addressing.test.ts`, `apps/server/test/agent-inbox-lanes.test.ts` |
| A single-Agent channel addresses `sole` without Jev for one human and judges it at the gate for more | `apps/server/test/haus-message-routing-sole.test.ts` |
| The unread digest excludes notice-row chats and drained ids, so a bounded drain's remainder still shows | `apps/server/test/agent-inbox-digest.test.ts` |
| Issue assignments coalesce into one main-session run by priority, up to 50, a busy agent gets a count then the Issues, and reassigning retires a queued item | `apps/server/test/issue-assignment-delivery.test.ts`, `apps/server/test/issue-assignment-undeliverable.test.ts`, `packages/agent-prompt/src/inbox-issue-format.test.ts` |
| One `drive_conflict` item per push lists every file, wakes an idle Agent, and waits at the chain ceiling instead of dropping | `apps/server/test/drive-conflict-delivery.test.ts`, `apps/server/test/drive-conflict-chain.test.ts` |

## Presentation split (I1/I4)

Attaching accepted pending rows to the active run is a delivery fact, not a claim that the Agent is
composing a reply. Chat renders only durable messages. The typing strip is a separate projection of
exact run visibility, not of attachment ([ADR 0035](../docs/adr/0035-chat-engagement-shows-as-typing.md)). Status dots, semantic Agent activity, and
detailed execution evidence remain separate Agent-level projections
([agent-activity.md](agent-activity.md)). Inbox visibility for humans is read-only (I4): pending
targets, the Project, and follows on the Agent profile; humans steer attention by asking in Chat.

## ADR 0062 items

[ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md) adds four kinds.
Each follows the one lifecycle above, is concrete, never appears in a notice body, the digest or
`haus inbox check`, and retires as `seen` when its run settles.

### Issue items

| Kind (`source`) | What it is | Identity | Lane |
| --- | --- | --- | --- |
| `issue_assignment` | An Issue assigned to this agent, or moved out of Backlog while assigned to it ([issues.md](issues.md#assignee-and-wakes)); replaces `task_assignment` in step 3 | `issue-assign:<issueId>:<version>` | Coalesces: every queued assignment rides one run, up to 50, by priority then age. A busy agent gets a count. Retired by reassigning or unassigning before a run takes it |
| `issue_event` | A comment, a state change, or a closed last sub-issue on an Issue whose derived agent this is | `issue-event:<issueId>:<timelineEventId>` | Coalesces per agent, up to 50 |

Both spend the automation chain when an agent caused them, and wait at the ceiling instead of
being refused. A change made by a Captain's own crew Task rides that Task's crew report and queues
no separate item for the Captain. Pull request changes on a linked pull request are never an
`issue_event`; they ride the existing `pull_request` item ([issues.md](issues.md#links-and-pull-requests)).

Built in step 3 (`apps/server/src/issues/issue-inbox.ts`):

- Both kinds are chatless (`chatlessInboxSources`) and batched (`batchedChatlessInboxSources`): a
  run carries one kind only, as `issueAssignments` (sorted by priority, then age) or `issueEvents`
  on the start frame. The typed attentions are `agentIssueAssignmentSchema` and
  `agentIssueEventSchema` in `packages/haus-api/src/agent-issue-wake.ts`: the Issue's code, id and
  title, `by` (`@handle`, `task:<shortId>`, or null for the Server), `byAgent`, and for an
  assignment its priority and state, for an event its change. A comment event carries the comment's
  first 2,000 characters and whether it was cut.
- A wake whose recipient is a Task goes to the Task agent itself. An archived Task queues nothing.
- The formatter (`packages/agent-prompt/src/inbox-issue-format.ts`) prints one line per item and its
  own guidance, so no standing prompt text teaches the item:

  ```text
  2 Issues assigned to you:
  [Haus issue assignment GEN-12 priority=high state=todo by=@ada] Rotate the deploy key
  [Haus issue assignment GEN-9 priority=normal state=todo] Patch the host
  ```

### Crew reports

`crew_report` (step 5) is how crew Tasks report. Recipient: the crew Task's Captain. Identity
`crew-report:<taskId>:<runId>`, so one per Task turn. Its typed attention carries the Task's short
id and title, the linked Issue codes, the outcome (`done`, `needs-you`, `failed`, or `unreported`
when a Captain-directed turn ended with no report), the report text and ask, the person named, its
pull requests with readings, and the Issue edits the Task made in that turn
([tasks.md](tasks.md#crew-reports)).

- **Batched across the whole crew.** Every queued `crew_report` for one Captain rides one run, up
  to 50 and within a 24,000-character text budget; the rest wait for the next run.
- A turn a person drove queues a `crew_report` only when it settles `failed` or reports
  `needs-you` with no person named. Otherwise it queues nothing.
- A busy Captain gets `N crew reports` in its notice, and the reports on its next run.
- A report posts in the Task as the Task's own message, so the Captain never pulls the chat to
  read it. The formatter's guidance rides the item, not the standing prompt.
- Spends the automation chain and waits at the ceiling, as `drive_conflict` does.

### Process exits

`process_exit` (step 4): one background process ended ([tasks.md](tasks.md#long-work-and-the-desktop)).
Recipient: the session that started it, a Task or a Captain. Identity
`process-exit:<processId>`, so a resent exit is a no-op. It is a chatless attention, like a Drive
conflict, and leads its own concrete run (`AgentStartCommand.processExit`). It carries the process
id, the Computer's name, the exit code (null when the Computer restarted under it), the output's
last 4,000 characters, the output cursor, and when it started and ended. Spends the automation
chain and waits at the ceiling. A process killed by archive or by its own session queues nothing,
and the Server acknowledges an exit from a session generation older than the agent's current one
without queueing it.

| Contract | Guard |
| --- | --- |
| Crew reports from several Tasks of one Captain ride one run, up to 50 | `apps/server/test/crew-report-delivery.test.ts` |
| A Project's Captain does not hear an unaddressed message in a Task of its Project | `apps/server/test/agent-hearing.test.ts` |
| The Captain chat reaches its Captain on a cold start and no other Captain | `apps/server/test/captain-chat.test.ts` |
| A background process exit wakes its idle session once | `apps/server/test/process-exit-delivery.test.ts` |
