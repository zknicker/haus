---
summary: Hosted chat-first claims (renamed from tasks by ADR 0051) — the hidden Agent-only lock on a message, with Server-owned lifecycle metadata, Agent-only assignees, inline conversation, the claim chip, and the Captain panel's Needs you group.
read_when:
  - changing claim promotion, claiming, assignment, or statuses
  - changing hosted claim authorization, events, or the claim chip in Chat
  - changing the Agent profile's stalled claims or the managed `haus claim` CLI contract
---

# Claims

A claim is a canonical hosted Chat message promoted with claim metadata: the hidden, Agent-only
lock on that message. [ADR 0051](../adr/0051-tasks-are-boards-and-claims-are-the-lock.md) renamed
these records from tasks to claims so [Tasks](tasks.md) could own the word. A Task does not mark
ownership; the claim does ([ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md)). The
message body is the claim title verbatim, and conversation continues inline in its Channel or DM.
Haus keeps no second claim conversation or content store.

Claims are Agent work. Only an Agent ever holds a claim; a person never claims or is assigned one.
When an Agent needs a person on a claim, it @mentions them in an inline reply where the request
arrived, and that mention notifies them ([Notifications](notifications.md),
[ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)).

## Lifecycle

- The App has no way to create or promote a claim ([ADR 0051](../adr/0051-tasks-are-boards-and-claims-are-the-lock.md)
  decision 9). The Server keeps `claim.create` and `claim.promote` for test and evaluation
  fixtures.
- An Agent claims a message before doing any tool-using work on it. Claiming a message nobody had
  promoted promotes it, with `origin` `claimed` — distinct from `converted` (`claim.promote`) and
  `composed` (created as a claim for someone else). A claim is a concurrency lock, so it fails closed
  against a claim someone else holds. An Agent's `haus claim create --assignee @itself` is a claim
  on a fresh message and is `claimed` too; the same command unassigned or for a peer is `composed`.
- The Agent sets its own finished work `done`. It uses `in_review` only when the requester asked to
  sign off or a human decision is still pending, and says in the conversation what to check. The
  composed Agent prompt under `apps/computer/src/harness/` carries this rule and its tests.
- Each Chat allocates monotonic claim numbers while its Chat row is locked.
- Status is `todo`, `in_progress`, `in_review`, `done`, or reversible `closed`.
- Every claim reads as one of two **tiers**, inferred from evidence rather than declared. A
  **background** claim is an Agent's own claim — `origin` `claimed`, status `in_progress` or
  `done`, never sent to review, and not left unfinished by its claiming run. Everything else is
  **tracked**. A status outside `in_progress`/`done`, or an open claim after settlement, makes work
  tracked. Inline replies do not affect this choice. The durable tracked stamp keeps the tier from
  flickering back.
- Explicit claim updates complete work. A message never completes a claim by implication. Every
  claim left open at settlement remains `in_progress` and becomes tracked, including when the
  run completed normally, failed, was interrupted, or was stopped. Same-turn work can be set
  directly to `done` without passing through review.
- A successful claim subscribes its Agent to the request's inline replies. That includes human
  replies to the original human message and persists after completion. A later request can have
  its own claim on its reply message; each claim still has one assignee.
- A claim also reports `live`: true while its assignee Agent's in-flight run holds that claim's
  message. Liveness is derived from the delivery ledger at read time; a run beginning and a run
  settling both emit `claim.updated`, so nothing polls for it.
- A claim has no priority or labels. Those belong to Tasks.
- Claiming is one concurrency lock among Agents. The first valid claim owns the message and
  advances its version; competing claims at the same version fail without double ownership.
- Status and assignment are member-level. Anyone who can write in the claim's Chat — human or
  Agent — can change its status or reserve it for any active Agent participant of that Chat,
  including over another Agent's hold. A person is never an assignee. Agents move status along a
  transition table (see [specs/claims.md](../../specs/claims.md#authority-and-concurrency)); people
  in the App set any status. Assigning an Agent wakes it with an assignment in its own inbox;
  assignment reserves and never claims, so the assignee still claims the message before starting.
  Only the current assignee can release.
- Assignment and status are independent: reserving a claim never moves it along the lifecycle.
  Reassigning releases the previous claim, so the new assignee claims before starting.
- Done and closed claims cannot be claimed, released, or assigned.
- Server closes an `in_review` claim whose row has not changed for 7 days. The close runs through
  the ordinary update path, so it bumps the version and emits `claim.updated` like any other status
  change; a human reopens it through the same path.

Creating or promoting a claim updates the canonical message projection and emits claim events. It
adds no state-change line to the Chat. When an Agent directly assigns a newly created claim to
another Agent, the assignment goes to that Agent's inbox as work, not as a message. A person sees
the assignment as the claim chip on the message ([Chat](chat.md#in-the-box)).

Every lifecycle mutation after creation carries `expectedVersion`. Stale assignment or metadata
writes fail and the App waits for Server state rather than inventing optimistic claim records.

## Authorization

Claim lists, eligible assignees, messages with claim projections, and claim events apply the same
hosted Server and Chat authorization. Revoked members and humans who lose Chat access cannot
continue reading or mutating the claim. Retiring an Agent releases its claims and assignments;
reinvitation or reactivation does not restore them.

Agents continue each request in the Chat where it was asked, from acknowledgment to result. Work
that will outlast a reply goes into a Task started from the request
([Tasks](tasks.md#where-a-task-comes-from)).

## In the App

Claims have no page. A claim surfaces as a **claim chip** on its message in the Channel or DM: the
claim number, a monochrome status disc that draws itself in when the status changes, and the assignee by avatar and name
(`features/claims/message-claim-chip.tsx`). The message's author line carries only its author and
time. Status and assignee are editable by any member who can write in the Chat; the assignment
picker lists the Chat's Agents only. An old `?claim=<messageId>` address reveals that message in
its Chat (`features/servers/retired-routes.ts`).

**Chat hides Agent claim metadata by default.** A claim with `origin` `claimed` shows no chip
unless the reader turns on **Show claims in chat** (Settings → Preferences → Chat, per device,
`localStorage` key `haus.chat.showClaims`; the command palette carries the same switch).
`composed` and `converted` claims stay visible because someone made them for others to see. The
iPhone app reads the same per-device preference ([iOS internals](../internals/ios.md)).

The Captain panel lists that Captain's stalled claims under **Needs you**, after the Issues waiting
on a person, each as "Dropped …": `claimed` claims still `in_progress`, stamped tracked because
their run settled without answering, and not `live`. Each row reveals the claim's message, its
`···` releases the claim, and the section is absent when there is nothing in it.

`claim.list` excludes background-tier claims by default and reports how many it hid;
`includeBackground` widens it to everything. Concrete events (`message.created` for a newly
composed claim, `claim.created`, `claim.updated`) notify the App, whose realtime hook owns exact
claim-list and message invalidation.

## Managed CLI boundary

The managed `haus claim` (claim), `haus claim list|create|release|assign|unassign|update`
commands use the Computer's loopback runner authority and the hosted Server claim API.
`haus claim` means "I am starting" and advances `todo` to `in_progress`;
`assign --assignee @agent` and `unassign` only move ownership and never status; the assignee
may be any active Agent on the Server, and in a DM only that DM's Agent; a human handle is refused
as not assignable.
Both take an optional `--expected-revision` (the `rev=` in `claim list`) so a stale view loses
instead of overwriting. `claim list` shows unfinished work by default (`--status all` widens it,
`--mine` narrows it to the Agent's own claims) and says how many rows its 50-row cap left out.
`haus claim` claims every requested message in one transaction and prints one row per claim —
claimed, already yours, or refused — with each granted claim's inline reply command; it fails only
when nothing was granted. A claim only conflicts with the current holder. A refused row that lost
to a standing claim carries a structured `claimConflict` the CLI renders: who holds the lock, when
that was observed, that it blocks starting conflicting implementation or change work, and an
illustrative list of what it does not block. It is a concurrency lock, not a ruling on who owns
the lane. See [Agents API](../api/agents.md#claim-routes). Agent identity comes only from the
scoped runner credential. A human-composed claim enters the same durable inbox and wake path as
its canonical Chat message. An Agent-created peer assignment wakes only that Agent; it does not
unmute the Channel or wake unrelated muted members. Claim creation carries an idempotency nonce,
so a retry replays the original claims and reusing the nonce for a different request is refused.

## Coordination handoffs

When a user gives an explicit cutoff for independent claim lanes, the coordinating Agent works to
that cutoff instead of waiting indefinitely for every assignee. It delivers the useful result
available so far, identifies which inputs arrived and which remain pending, and treats silence as
unknown. A missing reply is not approval, negative evidence, or completed work.

## Deliberate exclusions

Claim priority, labels, scheduling, due dates, attachments, deletion, dependencies, epics, generic
workflow machinery, and generic taxonomy infrastructure.
