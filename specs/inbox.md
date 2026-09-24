---
summary: Agent inbox — the `agent_inbox` item kinds and their one lifecycle, exact delivery planning, model-visibility accounting, notice turns, local-first pulls, and cause inference on send. Supersedes steering.md and addressing.md.
read_when:
  - adding an agent inbox item kind, or changing an item's identity or lifecycle
  - changing which agents wake for a chat message, mute/follow semantics, or mention piercing
  - changing exact model visibility, freshness catch-up, or pull acknowledgement
  - changing mid-turn notices, drain batching, or chain limits
  - changing how the Server infers which fire caused an Agent's message
  - changing Agent status surfaces derived from inbox delivery, including chat engagement (typing)
---

# Agent Inbox

The Agent inbox is agent-only delivery state; the human Inbox page is
[docs/features/inbox.md](../docs/features/inbox.md).

The agent inbox is the only lane that carries work no human sees, and `agent_inbox`
is the table that holds it (ADR 0026). Everything an Agent is given to act on is an
inbox item: a delivery planner queues items per attention rules, notice turns preserve
Agent pull discretion, and exact visibility plus a verified contiguous boundary are the
only truth about what an agent has seen. Decisions I1–I4 in
[raft-alignment/README.md](raft-alignment/README.md); wire surface in
[haus-cli.md](haus-cli.md).

## Item kinds and lifecycle

Every row is one item with a stable identity that is never a message id except for
ordinary Chat work, the rendered envelope as its content, and the recipient Agent.

| Kind (`source`) | What it is | Identity | Lane |
| --- | --- | --- | --- |
| `human` | An ordinary Chat delivery of a durable message | The message id | Notice; concrete when addressed on a cold start, or on any wake of a live session |
| `cloud_agent_work` | One settled Cloud Agent Run's terminal attention for the Agent that delegated it | The Run id | Concrete |
| `task_assignment` | A direct task assignment to this Agent | The assignment identity | Concrete |
| `reminder` | One reminder fire | The fire id | Concrete |
| `trigger` | One Trigger fire | The fire id | Concrete |
| `onboarding` | Cove's one-shot bootstrap instruction | Its own bootstrap identity | Concrete |

Only ordinary Chat work is backed by a `chat_messages` row; the rest exist solely
here, because a fact only an Agent needs is never written to a transcript humans read
(ADR 0026). A human learns each of those facts from a representation on the content it
explains — the task chip, the fire mark, the session mark — described in
[automation-provenance.md](automation-provenance.md) and
[sessions.md](sessions.md).

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
2. the send's target Chat is that fire's anchor Chat — a Thread target resolves to its
   parent Chat first.

Then `message_causes` records that fire with `attribution = 'inferred'`. A run offered a
fire alongside anything else — another fire, a Chat message, an attention — infers
nothing, because the Agent had more than one reason to speak. Inference is deliberately
narrow: an unattributed answer is an ordinary message, which is a better outcome than a
mark that names the wrong cause.

## Delivery planning (I1)

Across all Servers with the TypeSafe credential configured, [ADR 0030](../docs/adr/0030-semantic-channel-addressing.md)
permits semantic narrowing of unaddressed human top-level channel messages. The final
recipient set is committed with the message; uncertain, failed or stale judgments retain
ordinary delivery. This does not change explicit mention, reply, Thread or DM rules. In a
channel with one eligible Agent, the message is addressed to it as `sole` when the author is
the channel's only human member. With more human members, Jev judges whether the one Agent is
the addressee, and recipients stay unchanged either way.

A durable `message.created` is planned once by Server delivery
(`apps/server/src/agent-delivery/`):

- Ordinary delivery reaches joined channels, followed threads, and DMs.
  The author never receives their own message.
- A channel mute (`agent_channel_mutes`, agent-owned via `haus channel
  mute`) suppresses ordinary delivery from that channel itself. Followed
  threads keep delivering independently, so the Agent unfollows a specific
  thread to stop its ordinary delivery.
- Personal @mentions (rich reference or plain `@handle`) bypass Channel mutes without unmuting the
  Channel. In a Thread, a direct mention restores an explicit unfollow and the recipient's exact
  pending delivery carries that replay-safe restoration fact.
- Mention identity is resolved once when delivery is planned and persists independently from
  suppression. An ordinarily delivered mention still tells only the named Agent `you were mentioned`;
  other eligible Channel participants retain ambient visibility without that attention flag.
- A direct task assignment to another Agent keeps the canonical task message as ordinary work and
  adds one `task_assignment` item to only the assignee's inbox. It is `mentioned=true` so it stays
  actionable through a mute, and renders in Agent inbox envelopes the way a reminder fire does. The
  human's representation of that fact is the task chip on the message.
- A settled Cloud Agent Run creates one terminal attention for only the Agent that delegated it,
  keyed by the Run id and carrying the work's title, repository, provider URL, and the Run's status,
  summary, error code, and reported branches ([Cloud Agents](cloud-agents.md)). It settles like the
  other concrete kinds; the result the human sees is whatever ordinary Message the woken Agent
  decides to post.
- After planning, ordinary Chat work gives an idle Agent a notice turn and a busy Agent receives the
  same notice in its live turn. Concrete work — a settled Cloud Agent Run, an automation fire, a
  task assignment — is the typed exception: an idle recipient receives the item's own envelope as
  the prompt of a distinct turn; a busy recipient receives only the content-free notice at a safe
  boundary, then the still-queued item in the next turn. A concrete drain never mixes kinds, so each
  concrete item earns its own dedicated wake, and a human drain never shares a run with a fire, which
  is what keeps the sole-fire cause inference readable. An automation
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
- **Reply expectation rides beside the addressed reason.** When ADR 0030's Jev judgment runs for a
  message, its `expects_reply` Noul (0–1) is stored on every inbox row the message produces;
  otherwise the column is null. It never affects recipients, drain lanes, or the Agent's prompt.
  Its one reader is chat engagement, where a value at or below 0.2 keeps that message from
  showing the Agent as typing ([ADR 0034](../docs/adr/0034-chat-engagement-shows-as-typing.md)).
- **A Thread mention arrives with its Thread when the Agent cannot see it.** When a drainable
  human item is the first in its Thread to @mention this Agent, and the Agent has no model-visible
  context for that Thread this session (no verified boundary, no settled exact visibility), the
  Server attaches a `threadContext` package: parent and Thread targets, the parent message, and
  up to ten replies before the mention, within 4,000 quoted characters and marked `truncated` when
  earlier replies are left out. The drain budget counts the package's size whether or not it is
  omitted, so resends rebuild the same sets. The Computer renders it once per Thread target in
  cold and warm drains, never in a content-free notice, and attests the quoted messages it
  showed whole as exact run visibility (Raft's `thread_join_context`).
- **Every wake ends with the unread-elsewhere digest.** The frame carries per-chat counts of queued
  work no row of that frame represents: a chat with a notice row states its own pending count and is
  left out, while a drained item represents only itself, so same-chat work past the drain budget
  still surfaces as a count. Counts advance nothing and are never bodies.

## Inline reply attention

Channel and DM messages may reference a parent in the same chat. Server derives and persists
the root; the reply stays in the chat's sequence. `agent_message_follows` records Agent attention
by chat, root, and Agent, independently from the task's single assignee.

Root authors and mentions, reply authors and mentions, and successful claimants join that
chain. Send and claim update follows in their existing transaction. Losing a claim adds no
subscription. Ordinary top-level messages retain channel delivery; inline replies reach eligible
followers and direct mentions, excluding the author. Before any Agent has participated, human
inline replies use ordinary channel delivery. An empty chain after unfollow does not broadcast.

Followed chains deliver independently of channel mute. Unfollow suppresses ordinary chain
delivery; an explicit follow, new post, successful claim, or direct mention restores it.
Unfollowing a chain never joined is a no-op. Task completion preserves follows. Parent access,
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
consume the gaps between them. Notices and wakes advance nothing, ever.

## Notice turns and system attention (I1)

Turns float on the session ([sessions.md](sessions.md)). Ordinary Chat work is
never pushed into a turn. Server sends full canonical envelopes to Computer,
which caches them locally and projects only target/count/id/sender metadata. A
cold session uses that notice as its first prompt; `Start.` is reserved for a
cold session with no pending delivery. The Agent chooses whether and when to
pull bodies.

Each pending identity records the turn that successfully offered it. Settling
without a pull leaves the row pending and queryable but does not start another
turn for that unchanged set. A new identity changes the set and wakes once;
Restart, Start, or session reset explicitly offers pending work again. Chain
budget follows rows made model-visible, not notice-only turns.

Non-Chat system attention is a separate typed concrete lane. Cove's one-shot
bootstrap instruction, a settled Cloud Agent Run's terminal attention, reminder and Trigger fires,
and task assignments use that lane, settle against their own stable identities, and never enter Chat message
resolution or Chat cursor accounting. Each of those exists nowhere but its inbox row, so its
envelope rides the wake instead of waiting behind a pull the Agent may never make. The
Computer suppresses an already-consumed identity on accepted-run replay; a failed unsettled
new run explicitly reoffers it so a terminal result is model-visible at most once per item.

## Notices (I2)

Idle and busy agents receive only the content-free inbox notice (turn-shapes §4):
batched target rows with counts, first/latest short ids, latest sender, and
`· thread / · dm / · task #N / · ask <status> to=@handle /
· you were mentioned` tags — never bodies. The Ask tag reads the same status and
addressee as the `[ask status=… to=@handle]` envelope suffix and the drain
envelope's compressed `ask=<status>[:@handle]` marker (haus-cli.md §4), from
one formatting owner. Rows are
deduped by exact offered identities and repeat only when the pending set
changes. Busy injection is acknowledged only after Computer durably caches the
envelopes and successfully injects the notice after a completed tool boundary.
If the runtime cannot accept mid-turn notices or the turn ends first, the notice
remains unacknowledged and is offered by the next turn in the same session.
Runtime acceptance must be acknowledged; writing to an adapter's local input
queue is insufficient. A notice advances no cursor.

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
identities before Computer returns the bodies. `haus inbox check` lists
pending target rows without draining or advancing anything. Its rows are the busy
notice's rows: the Server peek derives the task, Ask, Cloud Agent result, and mention
facts from the same envelopes the notice uses, and the notice and the CLI print a
target through one formatter (`apps/computer/src/inbox-target-row.ts`), as Raft prints
both with one row formatter.

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
| Pending work is the first notice prompt; no `Start.` race or duplicate injection | `apps/computer/src/harness/executor.test.ts` |
| Notices contain no bodies and exact envelopes retain target/message identity | `apps/computer/src/inbox-format.test.ts` |
| `haus inbox check` rows match the notice's rows and tags, and the peek advances nothing | `apps/computer/src/agent-cli/commands/agent-inbox.test.ts`, `apps/server/test/agent-inbox-check.test.ts` |
| Local-first pull, exact visibility receipts, history/read consumption, and Server fallback | `apps/computer/src/proxy.test.ts` |
| Stale notices cannot resurrect identities already made visible | `apps/computer/src/inbox-store.test.ts` |
| Accepted work and pull evidence survive reconnect or replay correctly | `apps/computer/src/delivery.test.ts`, `apps/server/test/agent-delivery.test.ts` |
| Unpulled work is offered once; new identities wake again; subsets and targets settle independently | `apps/server/test/agent-delivery.test.ts` |
| Notices inject only at safe tool boundaries or remain durable for the next turn | `apps/computer/src/harness/executor.test.ts`, `apps/server/test/agent-delivery.test.ts` |
| Creating an Agent creates no inbox item and no empty bootstrap turn for the new Agent | `apps/server/test/haus-agent-creation.test.ts` |
| Agent instructions teach notice, pull, silence, and deferral semantics without losing required capabilities | `apps/computer/src/harness/managed-instructions.test.ts` |
| A live session drains human bodies; a cold start drains only addressed items and notices the rest once | `apps/computer/src/harness/turn-prompt.test.ts`, `apps/computer/src/harness/executor.test.ts` |
| A composed drain records exact run visibility and consumes its own notice rows | `apps/computer/src/harness/turn-prompt.test.ts` |
| A drained wake message is exact-visible before settlement, and the freshness hold does not fire on it | `apps/server/test/agent-composed-drain-visibility.test.ts`, `apps/computer/src/harness/composed-drain-receipt.test.ts` |
| Addressing is decided at enqueue and survives stale or uncertain routing | `apps/server/test/message-routing-addressing.test.ts`, `apps/server/test/agent-inbox-lanes.test.ts` |
| A single-Agent channel addresses `sole` without Jev for one human and judges it at the gate for more | `apps/server/test/haus-message-routing-sole.test.ts` |
| A Thread mention without visible context carries a bounded, budgeted package rendered once per Thread | `apps/server/test/agent-thread-context.test.ts`, `apps/computer/src/thread-context-format.test.ts` |
| The unread digest excludes notice-row chats and drained ids, so a bounded drain's remainder still shows | `apps/server/test/agent-inbox-digest.test.ts` |

## Presentation split (I1/I4)

Attaching accepted pending rows to the active run is a delivery fact, not a claim that the Agent is
composing a reply. Chat renders only durable messages. The typing strip is a separate projection of
exact run visibility, not of attachment ([ADR 0034](../docs/adr/0034-chat-engagement-shows-as-typing.md)). Status dots, semantic Agent activity, and
detailed execution evidence remain separate Agent-level projections
([agent-activity.md](agent-activity.md)). Inbox visibility for humans is read-only (I4): pending
targets, mutes, and follows on the Agent profile; humans steer attention by asking in Chat.
