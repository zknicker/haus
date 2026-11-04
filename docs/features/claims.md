---
summary: Hosted chat-first claims (renamed from tasks by ADR 0051) — Agent work as canonical messages with Server-owned lifecycle metadata, Agent-only assignees, inline conversation, optional Threads, and the Agent profile's Stopped before finishing section.
read_when:
  - changing claim promotion, claiming, assignment, statuses, priorities, or labels
  - changing hosted claim authorization, events, or Thread work surfaces
  - changing the claim Thread, the Agent profile's stalled claims, or the managed `haus claim` CLI contract
---

# Claims

> [ADR 0051](../adr/0051-tasks-are-boards-and-claims-are-the-lock.md) renamed these records from
> tasks to claims; a board-based Tasks product is coming and will own the word *task*.

A claim is a canonical hosted Chat message promoted with claim metadata. The message body is the
claim title verbatim, conversation continues inline or in a chosen child Thread, and board/list
views are lenses over the same message. Haus does not keep a
second claim conversation or content store.

Claims are Agent work. Only an Agent ever holds a claim; a person never claims or is assigned one.
When an Agent needs a person on a claim, it @mentions them in an inline reply where the request
arrived (or in the Thread if the request arrived inside one), and that mention notifies them ([Inbox](inbox.md#notifications))
([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)).

Claims never own Threads. A message gets a claim, a message gets a Thread, and they meet only
because they share the anchor message ([ADR 0015](../adr/0015-tasks-are-promoted-messages.md)).

## Lifecycle

- A human can atomically create a message as a claim or idempotently promote an existing top-level
  Channel or DM message.
- An Agent claims a message before doing any tool-using work on it. Claiming a message nobody had
  promoted promotes it, with `origin` `claimed` — distinct from a human's `converted` (Convert to
  Task) and `composed` (created as a claim). A claim is a concurrency lock, so it fails closed
  against a claim someone else holds. An Agent's `haus claim create --assignee @itself` is a claim
  on a fresh message and is `claimed` too; `composed` and `converted` always mean a person made it.
- A request that arrives inside a Thread is claimed there: the Thread message becomes the claim, its
  work surface is the Thread it already sits in, and its number comes from the Thread's parent
  Channel or DM, so `Claim #N` stays unique in that conversation. Only Agents claim Thread
  messages; people create and convert claims on top-level messages, and `haus claim create` makes
  top-level messages only.
- Heartbeat runs cannot claim messages; they claim leads ([heartbeat spec](../../specs/heartbeat.md)).
- The Agent sets its own finished work `done`. It uses `in_review` only when the requester asked to
  sign off or a human decision is still pending, and says in the conversation what to check. The
  composed Agent prompt under `apps/computer/src/harness/` carries this rule and its tests.
- Each parent Chat allocates monotonic claim numbers while its Chat row is locked.
- Status is `todo`, `in_progress`, `in_review`, `done`, or reversible `closed`.
- Every claim reads as one of two **tiers**, inferred from evidence rather than declared. A
  **background** claim is an Agent's own claim — `origin` `claimed`, status `in_progress` or
  `done`, never sent to review, and not left unfinished by its claiming run.
  Everything else is **tracked**. A status outside `in_progress`/`done`, or an open claim
  after settlement, makes work tracked. Inline and Thread replies do not affect this choice.
  The durable tracked stamp keeps the tier from flickering back.
- Explicit claim updates complete work. A message never completes a claim by implication. Every
  claim left open at settlement remains `in_progress` and becomes tracked, including when the
  run completed normally, failed, was interrupted, or was stopped. Same-turn work can be set
  directly to `done` without passing through review.
- A successful claim subscribes its Agent to the request's inline replies. That includes human
  replies to the original human message and persists after completion. A later request can have
  its own claim on its reply message; each claim still has one assignee.
- A claim also reports `live`: true while its assignee Agent's in-flight run holds that claim's
  message or Thread. Liveness is derived from the delivery ledger at read time; a run beginning
  and a run settling both emit `claim.updated`, so nothing polls for it.
- Priority is `none`, `urgent`, `high`, `medium`, or `low`.
- Labels come from one small Server task-label catalog. Members can create labels; Owners and
  Admins can rename, recolor, or delete them.
- Claiming is one concurrency lock among Agents. The first valid claim owns the message and
  advances its version; competing claims at the same version fail without double ownership.
  Humans do not claim.
- Status and assignment are member-level. Anyone who can write in the claim's Chat — human or
  Agent — can change its status or reserve it for any active Agent participant of that Chat,
  including over another Agent's hold. A person is never an assignee. Agents move status along a transition table (see
  [specs/claims.md](../../specs/claims.md#authority-and-concurrency)); people in the App set any
  status. Assigning an Agent wakes it with an assignment in its own inbox; assignment reserves and
  never claims, so the assignee still claims the message before starting.
  Only the current assignee can release.
- Assignment and status are independent: reserving a claim never moves it along the lifecycle.
  Reassigning releases the previous claim, so the new assignee claims before starting.
- Done and closed claims cannot be claimed, released, or assigned.
- Server closes an `in_review` claim that has gone quiet for 7 days — no new message in its inline chain or Thread
  and no change to the claim itself. The close runs through the ordinary update path, so it bumps
  the version and emits `claim.updated` like any other status change. Nothing records that Server
  rather than a person closed it: the claim carries no actor or reason for a status change, and a
  human reopens it through the same update path.

Creating or promoting a claim updates the canonical message projection and emits claim events. It
adds no state-change line to the parent Chat. When an Agent directly assigns a newly created claim
to another Agent, the assignment goes to that Agent's inbox as work, not as a message: nothing is
written to the conversation, so there is nothing for the App to filter out of the transcript or the
unread count. A person sees the assignment as the claim mark on the message — one of the marks
[Chat](chat.md#in-the-box) covers. The canonical claim message remains the only claim record.

Every lifecycle mutation after creation carries `expectedVersion`. Stale assignment or metadata
writes fail and the Server UI waits for Server state rather than inventing durable optimistic claim
records.

## Work surface and authorization

Promotion does not create the Thread. The deterministic hosted child Thread anchored to the
canonical message materializes when someone first replies in it, under the same
`cht_thr_<anchor>` id it always had. Until then the claim still reports that `threadChatId`, the
deep link still opens, and the Thread reads as what it is: no replies, nothing unread, nothing
followed. Deliberately following such a Thread materializes it; nothing else does, and the
claimant's follow is attached the moment the Thread appears. Claim inspection shows the canonical
request and its inline conversation alongside a distinct Thread section. Reading the inline
conversation uses the parent Chat's reply-chain filter and does not create a Thread.
The Thread has no independent membership: Server membership and parent-Chat participation remain
the sole access authority.

Agents continue each request in the Chat or Thread where it was asked, from acknowledgment to
result, following the human's lead as the conversation develops. This conversation guidance applies
across turns independently of claiming and claim status. A human-named delivery target always wins,
and `here` means the human instruction message's target. Delegated Cloud Agent implementation and
revisions live in the work Thread; the coordinating Agent keeps the requester informed and returns
a concise outcome and link in their conversation.

Claim lists, eligible assignees, messages with claim projections, claim events, and Thread reads all
apply the same hosted Server and parent-Chat authorization. Revoked members and humans who lose
parent-Chat access cannot continue reading or mutating the claim.
Retiring an Agent releases its claims and assignments. Reinvitation
or reactivation does not restore those links or access to claim Threads from the former membership
stint.

## Server UI and realtime

Claims have no page in the App: *Tasks* in the nav is the board product ([Tasks](tasks.md)). A claim
surfaces in its Chat, and `?claim=<messageId>` on a Chat opens it. Opening a claim opens its Thread:
the chat-owned side pane on the web, a Thread page on desktop. A claim Thread is
titled by its claim (`Claim #4`) in both hosts and shows the current status, assignee, creator, and
parent Chat beneath its anchor message; the anchor's own claim mark is suppressed there, so no fact
appears twice on one screen. Status and assignee are editable there by any member who can write in the
parent Chat; the assignment picker lists the Chat's Agents only.

The Agent profile lists that Agent's stalled claims under **Stopped before finishing**: `claimed`
claims still `in_progress`, stamped tracked because their run settled without answering, and not
`live`. Each row opens the claim's Thread, and the section is absent when there are none.

`claim.list` excludes background-tier claims by default and reports how many it hid, so an Agent's
own bookkeeping never crowds a surface a person reads.
`includeBackground` widens it to everything. The Tasks topbar spends that count on one quiet
control — `N background` — which carries the widening as `?background=on`; it disappears entirely
on a Server that has no background claims. In the widened lens those rows and cards wear a muted
`background` word rather than a chip, because a background claim is an ordinary claim seen from a
lens the reader opened, not a claim with a special status. Finished background claims still sit
outside the resting `active` view, so widening the tier does not also widen the lifecycle.

Concrete durable events (`message.created` for a newly composed claim, `claim.created`, `claim.updated`, and
`taskLabel.updated`) notify the Haus App. The hosted realtime hook owns exact claim-list, label-catalog,
and affected-message invalidation; cursor catch-up applies the same invalidations after reconnect.

In Chat, a claim's identity is a **claim chip** in the header of the recessed Thread surface beneath
the message: the claim number owns the left edge, only the status disc carries lifecycle color, and
the assignee appears by avatar and display name, and the reply count trails it. Cloud Agent work
on the same message renders as its own full work card above that surface, not as a second chip in
its header ([Cloud Agents](../../specs/cloud-agents.md#messages-and-cards)). The message's author line carries only its author and time; an automation's cause line above it
explains how the message came to be said
([ADR 0026](../adr/0026-automation-provenance-rides-the-agents-message.md)).

The chip is a label in one button into the Thread. Before replies exist, visible claims use a
content-width attachment with no reply count. Once replies exist, the Thread card carries the claim
metadata and reply previews together. Cloud Agent work delegated inside the Thread appears in that
same card as compact informational rows.

**Chat hides Agent claim metadata by default.** A claim with `origin` `claimed` shows no claim
label unless the reader enables Show claims in chat, even when its Thread has replies. With the
setting on, a Thread claim's chip sits on its message inside that Thread; it has no Thread of its
own, so it carries no reply count, and opening it opens the Thread it is in. The Thread
card still shows its reply count and previews and opens normally. Human-created claims (`composed`
or `converted`) remain visible because a person made them deliberately. Tier remains a Board and
List concern. The opened Thread still shows the full claim metadata above its anchor.

The **Show claims in chat** preference (Settings → Preferences → Chat) turns the claims back on, and
with it every claim reads the way a human-made one does. It is off by default and per device, stored
in `localStorage` under `haus.chat.showClaims`. The command palette carries the same switch as one
entry that reads as what pressing it does — `Show claims in chat` while they are hidden, `Hide claims
in chat` while they are showing.

The native iPhone app carries both lenses and reads the same way on the Chat lens: the per-device
**Show claims in chat** preference decides whether an empty `claimed` claim states itself, and a
populated Thread always states its claim, so a hidden claim whose Thread has replies shows
`Claim #N · status` on its ingress card. The Tasks list carries the same `N background` widening
([iOS internals](../internals/ios.md)).

A claim nobody finished is the one case a person needs told, and it is told on the Agent profile
rather than in Chat: it appears under **Stopped before finishing**.

Opening the claim's Thread states it in full in the metadata panel above the anchor, so the anchor
drops its own chip there.

There is no claim calendar, due date, or `scheduledFor` field. Scheduling belongs to reminders, not
claims.

## Managed CLI boundary

The managed `haus claim` (claim), `haus claim list|create|release|assign|unassign|update`
commands use the Computer's loopback runner authority and the hosted Server claim
API. `haus claim` means "I am starting" and advances `todo` to `in_progress`;
`assign --assignee @agent` and `unassign` only move ownership and never status; the assignee
must be an Agent member of the claim's Chat, and a human handle is refused as not assignable.
Both take an optional `--expected-revision` (the `rev=` in `claim list`) so a
stale view loses instead of overwriting. `claim list`
shows unfinished work by default (`--status all` widens it, `--mine` narrows it
to the Agent's own claims) and says how many rows its 50-row cap left out.
`haus claim` claims every requested message in one transaction and prints one row
per claim — claimed, already yours, or refused — with each granted claim's thread
address as a reference; it fails only when nothing was granted. A claim only
conflicts with the current holder. A refused row that lost to a standing claim
carries a structured `claimConflict` the CLI renders: who holds the lock, when that was observed, that it blocks
starting conflicting implementation or change work, and an illustrative list of
what it does not block. It is a concurrency lock, not a ruling on who owns the
lane; correcting a misroute happens in the original Thread. See
[Agents API](../api/agents.md#claim-routes). Agent
identity comes only from the scoped runner credential. A human-composed claim
enters the same durable inbox and wake path as its canonical Chat message;
structured claim metadata rides the drain, read, check, and search projections.
An unassigned claim remains `todo` until an Agent deliberately claims it.
An Agent-created peer assignment follows the claim Thread for the assignee and enters the same
durable delivery path as direct attention. It wakes only that Agent; it does not unmute the
Channel or wake unrelated muted members. Claim creation carries an idempotency nonce so retries
cannot create duplicate claim messages: a retry replays the original claims, and reusing the nonce
for a different request is refused ([Agents API](../api/agents.md#claim-routes)).

## Coordination handoffs

When a user gives an explicit cutoff for independent claim lanes, the coordinating Agent works to
that cutoff instead of waiting indefinitely for every assignee. It delivers the useful result
available so far, identifies which inputs arrived and which remain pending, and treats silence as
unknown. A missing reply is not approval, negative evidence, or completed work.

## Deliberate exclusions

Also excluded: claim scheduling, attachments, deletion, dependencies, epics, generic
workflow machinery, and generic taxonomy infrastructure.

The focused conversation preserves each message’s original location. Channel replies stay in the
channel; the composer posts in the Thread. Opening the view does not create a Thread, subscribe
participants, or count channel replies as Thread messages. There is no separate inline-replies
section. Thread views use the same combined conversation as claim inspection.
