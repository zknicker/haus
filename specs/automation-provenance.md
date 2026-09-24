# Automation provenance

An automation fire — a Trigger fire (`specs/triggers.md`) or a reminder fire
(`specs/reminders.md`) — writes nothing to the Chat transcript. The owning
Agent's own message is the transcript row, and it carries which fire provoked it
(ADR 0026). This document owns the contract both automations share: how a message
acquires a cause, what a cause says, and how the App renders it.

## Sending with a cause

An Agent that speaks because a fire woke it sends with
`haus message send --cause <fireId>`, on every send mode. The fire id is the
one the wake envelope's final `reply with:` line printed. It never appears in the
envelope header's `msg=` slot, which is `-` for a fire: a fire has no Chat
message to read, thread on, or name as `--message-id`.

`cause` is optional on the send route (`POST /api/agent/messages/send`); a
send without it is an ordinary message. When present the Server validates, before
committing anything, that:

1. the fire exists in this Server;
2. its automation is owned by the sending Agent; and
3. for a Trigger fire, the Trigger itself still exists.

A failure is `INVALID_ARG` naming which of those was not true. On success the
`message_causes` row is written in the same transaction as the message, so a
message is never durable without the provenance it claimed.

Fire ids are self-describing: a Trigger fire id and a reminder fire id carry
different opaque prefixes, so `--cause` resolves the kind from the id rather than
from a second flag.

One fire, one message. Each fire an Agent acts on produces its own message. A
long-lived automation fires many times with different context, and those answers
never share a Thread; an Agent does not reply into an earlier fire's Thread to
answer a later fire.

## Explicit and inferred attribution

Every cause records how it was attributed: `attribution` is `'explicit'` when the
Agent sent `--cause`, and `'inferred'` when the Server worked it out. An explicit
cause always wins.

The Server infers a cause only when the fire was the only thing that woke the
run — the sole-fire rule is stated normatively in
[inbox.md](inbox.md#cause-inference-adr-0026), because it reads the sending run's
served inbox set — and writes nothing in every other case. An Agent that answers
two fires in one run, or answers a fire in the same run it read a human's message,
attributes its messages itself or they carry no mark. The App renders both
attributions identically; `attribution` exists so provenance data can be audited
for how much of it Haus was told versus how much it guessed.

## The cause on a message

Every message the Server hands a client carries an optional `cause`
(`packages/haus-api/src/chat.ts`), populated from `message_causes` alongside
the message itself so a client renders provenance without a second read:

| Field | Meaning |
| --- | --- |
| `kind` | `trigger` or `reminder` |
| `automationId` | The Trigger or reminder the fire belongs to |
| `ownerAgentId` | The Agent that owned the automation when it fired; the App's "Manage in Automations" link |
| `fireId` | The fire this message answers |
| `firedAt` | When that fire happened |
| `title` | The automation's title as it read then |
| `summary` | The reminder's cadence string, or the Trigger's kind label, as it read then |
| `attribution` | `explicit` when the Agent sent `--cause`, `inferred` when the Server derived it |
| `live` | The automation as it stands now, or null once it or the fire is archived |

`live`, when present, carries `status` (`armed`/`disabled`, or the reminder's
state), `lastFiredAt`, `fireCount`, and `instruction`, a bounded snippet of the
Trigger's instruction or the reminder's script.

**The mark outlives the automation.** Every field above `live` is snapshotted
onto `message_causes` when the cause is recorded, and the automation and fire ids
are kept with no foreign key behind them, so deleting a Trigger or reminder, or
sweeping a fire past its retention window, archives the mark rather than removing
it. The message keeps saying what woke the Agent; `live` reads null, and the App
says the automation has been archived instead of offering the live rows and the
way into Automations. Only deleting the message deletes the cause.

`message_causes` holds one row per caused message: the `kind`, the automation and
fire ids for that kind, the `attribution`, and the snapshot — `title`, `summary`,
`fired_at`, `owner_agent_id`, and `anchor_chat_id`. A message has at most one
cause.

During the rollback window for Server 1.13.0, migration 0033 fills omitted snapshot fields on
insert from the matching Server's live automation and fire. Complete snapshots bypass this
bridge unchanged; unresolved fires fail rather than inventing provenance. Remove the bridge
in a later migration only after every supported rollback target writes snapshots itself.

Clients that do not know the field ignore it; the iPhone app decodes it as
optional and a missing or unknown shape never fails a message page.

## Thread context

`automation.fireContext({ serverId, messageId })` returns the fire context for
one caused message. It is authorized by access to that message — anyone who can
read the message can read why it was sent — and answers `NOT_FOUND` only when the
message has no cause at all. The operator-only `trigger.runs` is unchanged and
stays operator-only.

It returns the cause fields above plus, by kind:

- **Trigger** — the `payload` bounded to 8,192 characters, `payloadBytes`,
  `contentType`, `firedAt`, and the fire's ordinal among that Trigger's fires.
- **Reminder** — `repeat`, `nextFireAt`, `anchorMessageId`, and `anchorExcerpt`,
  a bounded excerpt of the anchoring message.

An archived cause still answers. `anchorChatId` and `firedAt` come from the
snapshot, `cause.live`, `fireOrdinal`, and `fireTotal` are null, and every
kind-specific field above is null, because the fire row that held it is gone.

## Surfaces

**Header mark.** A message with a cause shows a small mark in its header,
between the author name and the timestamp: a lightning glyph and the Trigger's
title in the Trigger color, or a clock glyph and the reminder's title in the
reminder color. Those colors are theme tokens, and the mark is the only thing a
fire adds to the transcript. A message can also carry the session mark
([sessions.md](sessions.md#generation-in-the-transcript)); when it carries both,
the fire mark comes first.

**Hover card.** Hovering the mark opens a mouse-following card previewing that
automation, in the shared hover-card anatomy: the glyph, the title, and the
Trigger's kind as its `·` clause (reminder cadence sits below the title); then one fact line —
`Armed · Last fired 4m ago · 12 fires` for a Trigger, status and last fire for a
reminder, `Archived · Fired 4m ago` once the record is gone — then the
`instruction` snippet, clipped to two lines, which is the Trigger's instruction
or the reminder's script. It is a preview, not a control: it carries no link.
Managing the automation starts from the Thread context card or the owning
Agent's Automations tab. The reminder's anchor note is not here; it belongs to
the Thread context card, where there is room to quote it.

**Thread context card.** Opening a caused message as a Thread renders a context
card above the anchored message, from `automation.fireContext`: the glyph, the
title, and a status chip on the first line; then the automation's line —
`Webhook · Fired 4m ago · fire 12 of 12` for a Trigger, `Every Monday at 09:00 ·
Next Mon 9:00 AM` for a reminder. Its foot carries an expandable, code-styled,
bounded payload block labelled with the byte count and content type for a
Trigger, or the anchoring note for a reminder — `Anchored on: “<excerpt>”`,
the only surface that quotes the message a reminder was set from — and the same
**Manage in Automations** link. The card renders nothing until the read
resolves; it never flashes an empty state.

## What stays invisible

A fire the Agent does not answer produces no transcript row at all. That is the
point: the transcript holds what was said, and the automation's fire history on
the Agent's Automations tab holds every fire, answered or not. Silence in a Chat
means the Agent had nothing to say, never that nothing fired.

Nothing an automation does is a hidden Chat message, because Haus has none: the
transcript is human conversation, every row is authored by a human or an Agent,
and every human who can read the Chat can read all of it (ADR 0026). The fire's
own record is the `trigger_fires` or `reminder_fires` row and the owning Agent's
inbox item, neither of which is a message. The receipt rows earlier versions
wrote — schedule, fire, script output, and Trigger creation — were deleted by
migration along with `system_author` itself and the `*_receipt_message_id`
columns they were reachable through.
