---
summary: Decision that the Chat transcript is human conversation only, that the agent inbox is the single agent-only lane, and that every agent-only fact a human needs reaches them as a mark on the content it explains.
read_when:
  - adding any delivery only an Agent should see, or proposing a Server-authored Chat message
  - changing what a Reminder, Trigger, task assignment, or session reset writes to a Chat
  - changing agent inbox item kinds, their identities, or their delivery lifecycle
  - changing message provenance, the header marks, their hover cards, or the Thread context card
---

# ADR 0026: The Transcript Is Conversation; the Agent Inbox Is the Agent's Lane

## Status

Accepted 2026-09-03 as the automation-receipt decision, widened 2026-09-04 to
the transcript and inbox contract below. The file name records the narrower
decision this one grew out of.

Supersedes the visible-receipt clauses of ADR 0016: the reminder remains the
scheduling primitive and everything else in that decision stands, but a fire no
longer appends a system message. Amends ADR 0027 the same way for Trigger fires
and removes the Trigger creation receipt. Amends ADR 0015: the direct task
assignment receipt is no longer a Chat message. Amends ADR 0011: a session
rotation is a durable record and a stamp on the Agent's messages, not a receipt
posted into the Agent's DMs.

## Decision

**The transcript is human conversation.** Every `chat_messages` row has a human
author or an Agent author, and every human who can read the Chat can read every
row in it. There is no audience column, no visibility column, no Server-authored
row, and no per-value filter that hides a message from the transcript, from
search, from the Chat list, or from unread counts. `system_author` is gone —
column, CHECK, wire enum, and decoders — because a message a person cannot see,
or that no participant said, is not a message.

**The agent inbox is the only agent-only lane, and it is named that.** The table
is `agent_inbox` and its rows are inbox items; `agent_delivery` keeps its own
name for per-Agent run state. Four item kinds ride it — ordinary Chat
deliveries, task assignments, reminder fires, and Trigger fires — plus Cove's
one-shot bootstrap. Every item has a stable identity
(the message id for ordinary Chat work, a non-message identity for everything
else), carries its rendered envelope as content, and moves through one
queued → accepted → served → seen lifecycle. A kind that skips that
lifecycle replays on every wake, so there are no exceptions to it.
[specs/inbox.md](../../specs/inbox.md) is the normative contract.

**Humans see each agent-only fact through a representation on the content it
explains**, not through a log line in the conversation:

- A **task assignment** shows as the task chip on the canonical task message and
  in the task's Thread. The inbox item is the Agent's copy of the same fact.
- An **automation fire** shows as a fire mark in the header of the Agent's
  answer — a lightning glyph and the Trigger's title in yellow, a clock glyph
  and the reminder's title in rosy red — with a hover card previewing the
  automation and a context card above the anchored message in its Thread. The
  Agent attributes its answer explicitly with `haus message send --cause
  <fireId>`; when it does not, the Server infers the cause only when that fire
  was the sole thing offered to the run that sent the message and the message
  landed in the fire's anchor Chat. The stored attribution says which happened.
- A **session reset** shows as a session mark in blue on the Agent's first
  message in a Chat after the reset, derived from the `session_generation`
  stamped on every Agent message, with a hover card naming when and why the
  session rotated; the Activity tab holds the full record.

A fire, an assignment, or a reset that never produces a message is invisible in
Chat by design; the Automations tab, the task, and the Activity tab are where
those questions are asked and answered.

## What Raft actually does

The earlier version of this ADR recorded a deliberate divergence from Raft,
which it said posts reminder receipts into the conversation. That was wrong on
the facts.

Raft's message wire types a sender four ways — `human`, `agent`, `system`,
`third_party_app` — and carries no audience or visibility field at all. The
durable `type=system` rows observed in agent history are authored by `@System`:
task created, task converted, task assigned, channel made live, channel
archived. Raft's human UI does not render the assignment row as a line; it
projects the assignment as the task chip on the message, so the agent-readable
assignment row and the human's chip are Raft's two representations of one fact.
Raft's other agent-only lane is not a hidden message but a typed per-agent app
inbox: a reminder fire reaches the agent as a transient `msg=-` system notice
that writes no Chat row, and overdue recovery rides inbox items
(`system.reminder`, `due`) that the agent acknowledges, against a registry of
item kinds. The one sentence in Raft's system prompt claiming an anchored
reminder's fire receipt is visible in that surface is not corroborated by any
observed transcript or by the product UI sweep in
`specs/raft-alignment/raft-ux-notes.md`, which looked for those rows and found
none; we read it as prompt text, not as shipped behavior.

So Raft draws nearly the line Haus now draws: durable chat rows are
human-readable, and agent-only work rides a typed inbox. The one exception is
the assignment row, which Raft stores as a message its UI skips; Haus stores
that item as an inbox item instead, so no reader has to filter and the
invariant holds without exceptions. Haus's real addition over Raft is
`--cause`. Raft's fire answers carry no machine-readable provenance; a Haus
Agent's answer names the exact fire it answers, which is what the header mark,
the hover card, and the Thread context card all read from.

## Consequences

- Marks are the transcript's only agent-only vocabulary, and they are per
  message, not per row: the fire mark and the session mark can both sit in one
  header, and a message with neither is an ordinary message.
- A fire the Agent does not answer, an assignment the Agent never speaks about,
  and a reset before an Agent's next message leave the transcript untouched.
  Silence means nothing was said, not that nothing happened.
- The transcript no longer proves an automation ran. Fire history is the record;
  the message is the outcome.
- Proposing a new Server-authored Chat message is proposing a new author for the
  conversation, which the schema now refuses.
- `message_causes` is the provenance table: one row per caused message, naming
  the kind, the automation, the fire, whether the attribution was `explicit` or
  `inferred`, and the snapshot the mark keeps — title, summary, fire time,
  owning Agent, and anchor Chat. A message keeps at most one cause.
- **A provenance mark outlives its automation.** The snapshot is taken from the
  live records when the cause is recorded, and the automation and fire ids carry
  no foreign key, so deleting a Trigger or Reminder, or sweeping a fire, archives
  the mark instead of removing it: the message still says what woke the Agent,
  and only the live half of the mark — status, counters, standing instruction,
  payload, anchoring note, and the way into Automations — goes. Clients read that
  as `cause.live = null`, and `automation.fireContext` answers from the snapshot
  with null counters rather than `NOT_FOUND`. Only deleting the message deletes
  the cause.
- `--cause` is validated, not trusted: the fire must exist in this Server and
  belong to an automation the sending Agent owns, or the send is refused.
  Inference is deliberately narrow, so an unattributed answer is normal and a
  wrong attribution is not.
- `session_generation` on an Agent message is durable execution lineage in the
  transcript. It changes only when the Agent's session rotates, so the App
  derives the mark from the messages it already has and reads the rotation
  record only to fill the hover card.
- Inbox items with no backing Chat message — automation fires, task
  assignments — share the message-backed lifecycle. They ride the
  concrete lane: the item's envelope is the prompt the wake carries rather than a
  body behind a discretionary pull, because an unpulled fire leaves the answer it
  provoked with no provable cause. A delivered item
  must reach `seen` or the Agent replays it on every wake, and deleting the
  automation behind a queued fire retires that item.
- The Agent's prompt loses the claim that a reminder receipt is visible in the
  anchored surface. That is a real capability removal: an Agent can no longer
  point a person at a receipt, and must say what happened itself.
- A `message.created` Chat event no longer accompanies a fire, an assignment, or
  a session rotation, because no message is written. `reminder.changed` still
  marks scheduling, update, snooze, cancel, and fire, and `task.updated` still
  marks assignment.
- Deleting the legacy `reminder`, `trigger`, `task`, and `session` rows removes
  Chat history a database already held. They were fire, creation, and lifecycle
  log lines; the task rows were never visible to a human in the first place.
