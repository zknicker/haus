---
summary: An Agent's accepted run shows as typing in every Chat whose human messages it has read and not yet answered, derived from durable visibility and announced as volatile events.
read_when:
  - changing the typing strip above the Chat composer, or which runs count as engaging a Chat
  - changing chat.engagement events, the chat.engagements read, or chat.onEngagement
  - changing exact visibility receipts, the lifecycle facts that end engagement, or reply suppression
  - reconsidering where live Agent work is presented to humans
---

# ADR 0034: Chat engagement shows as typing

## Status

Accepted 2026-09-23. Supersedes ADR 0023's "no typing indicator" decision and its
sidebar-strip projection of Agent activity. The rest of ADR 0023 stands: the Server
activity journal and the Computer-local execution journal remain separate products.
Amends ADR 0030 with one extra Jev question (see that ADR's reply-expectation section).

## Context

ADR 0023 refused typing for three reasons: no trustworthy Chat target for a floating
turn, inbox engagement starts too early, and a run keeps typing through work that is not
composition. Its answer was a sidebar strip of per-Agent activity labels, which told a
human that an Agent was busy but never which conversation it was busy with.

The delivery model has since gained the facts typing needs. Exact visibility receipts
name the messages a run has actually been shown: the composed receipt (ADR 0033) lands
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
- human-authored — Agent-authored messages, including other Agents', never engage;
- not suppressed — A's inbox row for it has `expects_reply` null or above 0.2.

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

**Suppression.** The Jev request that already judges the audience of an eligible
unaddressed channel message also asks whether it calls for a reply (ADR 0030). The answer
is stored on each inbox row as `expects_reply` and used only here: at or below 0.2 the
message does not engage. Null — no judgment ran, or it was stale, failed, timed out, or
malformed — engages.

**Presentation.** A typing strip above the composer of the open Chat or Thread names the
engaged Agents: "Juniper is typing…", "Juniper and Cove are typing…", "Juniper, Cove, and
1 other are typing…". The row's height is always reserved, so it never shifts the
composer. The sidebar activity strip is removed; the Inbox's "happening now" rows,
Activity History, and status dots remain the Agent-level views of work.

## Consequences

A wake that reads several Chats types in all of them until it answers each or settles,
including Chats it decides to stay silent in. Silence clears only at settlement, so a run
that never answers shows typing for its whole turn.

FYI messages in a channel with one eligible Agent and one human member are never judged
(they are addressed as `sole`), so they always engage, as do DMs, mentions, replies, and
Thread messages. A single-Agent channel with two or more human members is judged, so its
FYI messages can be suppressed.
A judgment that times out or fails under the 1.5-second deadline also engages;
suppression trims only a low reply expectation that was actually recorded.

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

**Keeping the sidebar strip alongside typing.** Two live projections of the same run in
the same shell. The Inbox already carries the Server-wide view.

**A Computer-side typing command.** A model-taught round trip for a fact the Server
already holds in its visibility ledger.

**Server-side timers or timeouts.** Clearing typing on a clock guesses at work the Server
can observe exactly; the send and terminal turn proof already end every engagement.
