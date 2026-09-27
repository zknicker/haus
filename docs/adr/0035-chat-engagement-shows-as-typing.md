---
summary: An Agent's accepted run shows as typing in every Chat whose human messages it has read and not yet answered, derived from durable visibility and announced as volatile events.
read_when:
  - changing the typing strip above the Chat composer, or which runs count as engaging a Chat
  - changing chat.engagement events, the chat.engagements read, or chat.onEngagement
  - changing exact visibility receipts or the lifecycle facts that end engagement
  - changing `haus message send --done` or which sends end engagement
  - considering suppressing typing for messages judged not to want a reply (removed 2026-09-25)
  - reconsidering where live Agent work is presented to humans
---

# ADR 0035: Chat engagement shows as typing

## Status

Accepted 2026-09-23. Supersedes ADR 0023's "no typing indicator" decision and its
sidebar-strip projection of Agent activity. The rest of ADR 0023 stands: the Server
activity journal and the Computer-local execution journal remain separate products.
Amended 2026-09-25: reply suppression is removed, and with it the `expects_reply` Jev
question it had added to ADR 0030. Amended again 2026-09-25: only a `--done` send ends
engagement early; interim posts leave the Chat typing until that send or turn end.

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

- newer than A's latest answer in C, by Chat sequence: any message A wrote in another run,
  or R's own `--done` send (`chat_messages.completes_reply`). R's interim posts answer nothing;
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
- `chat.engagement.ended` with `reason: 'sent' | 'settled' | 'interrupted'`. A committed
  `haus message send --done` into C ends C at once (`sent`), without waiting for
  settlement; a send without `--done` ends nothing, and `--done` into C never ends another
  Chat. Terminal turn proof ends every Chat R engaged — `settled` for a completed
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
🫡 running a command, 🙂‍↕️ using a tool, and 😵‍💫 failure. A shell call that only runs the `haus`
CLI (message checks and sends, task claims, profile reads) is Agent bookkeeping and opens no
activity, so it launches nothing, and checking messages launches nothing either. When the
engagement ends as `sent`, which only a `--done` send does, the App keeps that Agent's dots until
the reply (a message from that Agent and run committed within two seconds before the end) is in
the Chat's cached transcript, at most two seconds, and launches 😊 as the hold releases. When it
ends as `settled` and the run wrote nothing in this Chat, 👀 launches ("read it, nothing to add");
`interrupted` launches nothing beyond any failure face. Launches ride the App's existing
`agent.onActivity`, `chat.onEngagement`, and transcript cache, are throttled to one per 350ms with
extras dropped, fade in place under reduced motion, and are never cached. Reply, read, and failure
faces skip the throttle but wait out a 200ms gap so no two faces start together, and the same face
twice within 350ms is dropped. Reasoning stays out of Activity per ADR 0023;
[ADR 0036](0036-agent-thoughts-surface-as-condensed-phrases.md) adds a volatile thought bubble
whose phrase the Server condenses from a bounded reasoning excerpt. The sidebar activity strip is removed; the Inbox's "happening now" rows,
Activity History, and status dots remain the Agent-level views of work.

**Ending on `--done`.** The first revision ended C on any committed Agent message into C.
Agents routinely post "Yep — checking now" and keep working, so the strip cleared on the
acknowledgment and the real answer arrived after a long stretch of invisible work — the
failure this ADR exists to prevent. Under ADR 0014 a post is a tool call in the middle of a
turn, not the turn's final reply, so no post can imply the Agent is done. The Agent says so:
`haus message send --done` marks the message that completes its reply in that Chat, and the
Server stores the mark on the message so the durable read agrees with the live events. The
flag fails safe: an Agent that forgets it, an older CLI that cannot send it, or an older
Server that refuses it leaves the Chat typing until turn end, never silent while it works.
The Computer's `haus.agent.turn` span records `haus.turn.sent_chats` and
`haus.turn.done_chats` (Chats whose last send in the turn carried `--done`), so how often
Agents finish with the flag is measurable without a table.

## Consequences

A wake that reads several Chats types in all of them until it finishes each with `--done` or
settles,
including Chats it decides to stay silent in. Silence clears only at settlement, so a run
that never answers shows typing for its whole turn.

FYI messages and greetings engage like any other human message, in every Chat kind, so a
run that reads one types until it answers with `--done` or settles. A run that answers
without `--done` and then does tidy-up work keeps typing through that work.

`chat.engagement.ended` is delivered live while `message.created` refreshes after the
Chat lane's 150ms batch; the App's reply hold covers that gap so the strip never empties before the reply renders.

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
can observe exactly; the `--done` send and terminal turn proof already end every engagement.

**Ending on any send.** The first revision. An acknowledgment cleared the strip while the
Agent kept working, so the answer arrived with no visible work behind it.

**`--continuing` on interim posts.** The inverse flag. Forgetting it on an acknowledgment
clears typing early, so it fails toward invisible work, the one failure this ADR refuses.

**Explicit start and done commands.** Extra round trips on every reply, and a forgotten
start or a done sent before the answer is the worst failure mode: typing that is missing or
contradicts the transcript. Visibility already gives the start exactly; only the end needed
the Agent's word.
