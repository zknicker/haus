---
summary: An Agent's accepted run shows as typing in every Chat whose human messages it has read and not yet answered, derived from durable visibility and announced as volatile events.
read_when:
  - changing the typing strip above the Chat composer, or which runs count as engaging a Chat
  - changing chat.engagement events, the chat.engagements read, or chat.onEngagement
  - changing exact visibility receipts or the lifecycle facts that end engagement
  - considering suppressing typing for messages judged not to want a reply (removed 2026-09-25)
  - reconsidering where live Agent work is presented to humans
---

# ADR 0035: Chat engagement shows as typing

## Status

Accepted 2026-09-23. Supersedes ADR 0023's "no typing indicator" decision and its
sidebar-strip projection of Agent activity. The rest of ADR 0023 stands: the Server
activity journal and the Computer-local execution journal remain separate products.
Amended 2026-09-25: reply suppression is removed, and with it the `expects_reply` Jev
question it had added to ADR 0030.

## Context

ADR 0023 refused typing for three reasons: no trustworthy Chat target for a floating
turn, inbox engagement starts too early, and a run keeps typing through work that is not
composition. Its answer was a sidebar strip of per-Agent activity labels, which told a
human that an Agent was busy but never which conversation it was busy with.

The delivery model has since gained the facts typing needs. Exact visibility receipts
name the messages a run has actually been shown: the composed receipt (ADR 0034) lands
before the model streams, and mid-turn pulls and held sends record what they reveal.
`addressed_reason` makes the aim of each inbox row queryable, and a committed Agent
message is a precise, Chat-scoped end signal. The Chat target is therefore no longer a
guess, and the end is exact. "Too early" and "lingering" remain partly true; this ADR
accepts them as the cost of never showing silence while an Agent is answering.

## Decision

**Engagement.** Agent A's run R engages Chat C while R is accepted and unsettled
(`agent_delivery.active_run_id = R`, `accepted_at` set) and R holds exact visibility
(`agent_inbox_exact_visibility.served_run_id = R`) of at least one message in C that is:

- newer than A's latest message in C, by Chat sequence;
- human-authored — Agent-authored messages, including other Agents', never engage.

This applies in every Chat kind: channel, DM, and Thread. It deliberately over-messages
rather than narrowing to mentions or addressed rows. Engagement is derived only from
durable state, so the `chat.engagements({ serverId, chatId })` read reproduces it on load,
reload, reconnect, and a resent start frame. A receipt repeated by the same run keeps its
first `served_at`, so `startedAt` is stable.

**Events.** Two volatile facts, never persisted or replayed:

- `chat.engagement.started` `{ serverId, chatId, agentId, runId, emittedAt }`, announced
  after the write that grants exact visibility commits: the composed receipt at turn
  start, a mid-turn pull or pull receipt, or a held `haus message send` whose freshness
  hold showed the run news. Deduplicated per run in-process.
- `chat.engagement.ended` with `reason: 'sent' | 'settled' | 'interrupted'`, riding the
  lifecycle facts. A committed Agent message into C ends C at once, without waiting for
  settlement. Terminal turn proof ends every Chat R engaged — `settled` for a completed
  turn, `interrupted` for failed, interrupted, or stopped. The ended set is read from the
  run's durable visibility, so a restarted Server still ends engagements a reader
  recovered. A late start for a run already observed settled is dropped.

`chat.onEngagement({ serverId, chatId })` delivers both, checking Chat access at start
and on every delivery, the same shape as `chat.onComposition`. One App hook owns the read
and the subscription, patches the cached read from events, and invalidates it when the
subscription starts or restarts. There is no polling and no timer.

**No suppression.** Engagement is all or nothing: no judgment of the message's content
keeps a run that has read it from engaging. An earlier revision asked Jev whether each
judged channel message called for a reply and let a value at or below 0.2 suppress
engagement. In use, a greeting like "Hello everyone! GM" in #all was judged not to want a
reply while the Agents it woke still worked on it for 25–75 seconds with no visible sign,
which read as a broken app. Visible work that ends in silence is honest; invisible work is
not. The question, the `agent_inbox.expects_reply` column, and the audit field were
removed (migration `0049_drop_expects_reply`).

**Presentation.** A typing strip above the composer of the open Chat or Thread shows the
engaged Agents as avatars and a three-dot pulse, with no visible verb: engagement spans
the whole turn, tool work included, so a written "is typing" overclaims. The names
("Juniper is typing", "Juniper and Cove are typing", "Juniper, Cove, and 1 other are
typing") remain for assistive technology. The row's height is always reserved, so it never shifts the
composer. When the engaging run (matched by Agent and `runId`) commits a `started` activity of
a mapped kind, or any `failed` one, a face launches from the dots and fades over the
transcript: 🤔 thinking, 🧐 reading files, 🤓 searching the web, 🫣 browsing, 😤 editing files,
🫡 running a command, 🙂‍↕️ using a tool, 😯 checking messages, 😵‍💫 failure, and 😊 when the
engagement ends as `sent`. Launches ride the App's existing `agent.onActivity` and
`chat.onEngagement` streams, are throttled to one per 350ms (reply and failure faces exempt,
extras dropped), fade in place under reduced motion, and are never cached. Reasoning stays out of Activity per ADR 0023;
[ADR 0036](0036-agent-thoughts-surface-as-condensed-phrases.md) adds a volatile thought bubble
whose phrase the Server condenses from a bounded reasoning excerpt. The sidebar activity strip is removed; the Inbox's "happening now" rows,
Activity History, and status dots remain the Agent-level views of work.

## Consequences

A wake that reads several Chats types in all of them until it answers each or settles,
including Chats it decides to stay silent in. Silence clears only at settlement, so a run
that never answers shows typing for its whole turn.

FYI messages and greetings engage like any other human message, in every Chat kind, so a
run that reads one types until it answers or settles.

`chat.engagement.ended` is delivered live while `message.created` refreshes after the
Chat lane's 150ms batch, so the strip can clear a beat before the reply renders.

Engagement state is volatile; its truth is the durable read. A missed event costs at most
a stale strip until the next subscription restart or reconnect invalidation.

## Rejected alternatives

**Typing only for mentions or addressed rows.** Precise, but an Agent answering ambient
channel traffic would look silent while it composes. Over-messaging was preferred to a
false quiet.

**First model token or first streamed `message send` argument.** Still untargeted or late
for the reasons ADR 0023 gave, and not observable uniformly across Harness adapters.

**Suppressing typing for messages judged not to want a reply.** Shipped first, then
removed: the Agent still did the work, so hiding it made the App look stalled. Fewer false
"typing" moments are not worth any unexplained silence while an Agent is busy.

**Keeping the sidebar strip alongside typing.** Two live projections of the same run in
the same shell. The Inbox already carries the Server-wide view.

**A Computer-side typing command.** A model-taught round trip for a fact the Server
already holds in its visibility ledger.

**Server-side timers or timeouts.** Clearing typing on a clock guesses at work the Server
can observe exactly; the send and terminal turn proof already end every engagement.
