# Reminders

Reminders are the only scheduling primitive (D4 in
`specs/raft-alignment/README.md`; the cron/automations product is retired). A
reminder is an author-owned, persistent, observable, snoozable, updatable, and
cancelable wake anchored to a message in a Channel, Thread, or the owning
Agent's DM.

A fire writes nothing to the Chat transcript. The owning Agent's own message is
the transcript row, and it carries the fire as its cause (ADR 0026,
`specs/automation-provenance.md`). A reminder writes no Chat message at any
point in its life — not at schedule, not at fire, not when a script produces
output — because Haus has no Chat message a human cannot read, and none of
those is one a human asked for.

## Hosted model

- The Haus Server stores reminders, idempotent commands, fire logs, message
  provenance, durable change events, and pending Agent attention in PostgreSQL.
  Every relationship carries `server_id`; composite foreign keys keep the Agent,
  anchor Chat, anchor message, caused message, fire, and attention in one Server.
  No table carries a receipt message column: `schedule_receipt_message_id` on
  `reminders`, `receipt_message_id` on `reminder_fires` and
  `reminder_agent_attention` were dropped with the receipts they named, and
  `chat_messages.system_author` went with them entirely (ADR 0026).
- The narrow hosted `agents` and `channel_agent_participants` rows provide only
  reminder authorship and Chat authorization. Agent creation,
  configuration, Computer assignment, execution, and transport are separate
  work.
- Each `reminder_agent_attention` row is one durable, unacknowledged fire
  snapshot keyed to the fire itself, never to a message. Ordinary attention is
  removed after a turn that saw that fire completes, or after the turn durably
  sends output before failing during cleanup. Script attention is removed only after the assigned
  Computer returns that fire's idempotent execution result.
- Fresh schema only. Existing Runtime reminder history is not imported or
  adopted, and there is no compatibility path.

## Title and description

- `title` is a short label, like a calendar invite subject ("Monday Advertising
  Review"): it is what a human reads on the cause line. A write that sets it
  requires one line of at most `REMINDER_TITLE_MAX_CHARS` (60) characters and
  refuses anything longer with an error that names the format and points to
  `--description`. Stored titles may still be up to 300 characters, because
  titles written before the split were whole sentences.
- `description` is optional: what to do when it fires, in full, at most
  `REMINDER_DESCRIPTION_MAX_CHARS` (300) characters. Migration 0060 copied every
  existing title into its description. An update may change the title and the
  description together; `--description none` clears it.
- `script` is separate: a command the Computer runs at fire time, never prose.

## Schedules and authority

- Repeat grammar is exactly `every:<positive>[mhd]`, `daily@HH:MM`, or
  `weekly:<comma-separated days>@HH:MM`. Snooze grammar is
  `<positive>[mhd]`. Wall-clock cadences use an explicit reminder timezone when supplied, otherwise the author's home timezone,
  including DST.
- A delayed Server fires one overdue logical slot, then recurring schedules
  advance from the current time. Missed slots never burst.
- An active Agent may schedule, list, inspect logs, snooze, update, or cancel
  only its own reminders and only while it can access the anchor. Owner and
  Admin operators may list all Server reminders, inspect fire logs, and
  cancel. Ordinary Members and cross-Server callers cannot.
- Losing anchor access or retiring an Agent cancels each still-scheduled
  reminder when the scheduler next considers it due. That cancellation removes
  the reminder's unacknowledged attention snapshots; historical fire rows
  remain.
- Commands carry an idempotency key and expected version. A repeated identical
  command returns its original result; reused input conflicts. PostgreSQL row
  locks serialize mutation/fire races. Every reminder write locks its Server
  row before reminder, Chat, message, or event rows so hosted writes share one
  deadlock-free order.

## Fire semantics

The single-node hosted scheduler checks every 15 seconds and once immediately
at startup. A logical fire is unique by reminder and scheduled time. In one
transaction it:

1. records the fire;
2. queues the owning Agent's attention snapshot;
3. enqueues the Agent's pending work carrying the wake envelope;
4. advances or completes the reminder; and
5. appends the `reminder.changed` event.

Nothing is written to the anchored Chat, so a fire appends no `message.created`.
This transaction happens while the Agent's Computer may be offline. Every fire,
including a script reminder, records itself and queues attention.

The envelope the Agent pulls names the reminder by title, then carries its
description indented on the next lines (omitted when absent or identical to the
title, so the Agent always receives the full instruction), then the fire and
the next occurrence, and ends with the line
`reply with: haus message send --cause <fireId>`. Bounded script output rides
that same envelope.

An optional script is opaque UTF-8 delivery data limited to 16,384 bytes.
The Server stores and snapshots it but never interprets or executes it. When the
assigned Computer is online, the Server sends a typed command containing the
attention and fire ids. When it is offline, the attention stays durable and is
resent on reconnect.

The Computer executes the script once in the owning Agent's workspace with that
Agent's isolated `HOME`, a 60-second timeout, and bounded stdout/stderr. A
restart-durable result marker makes redelivery idempotent. An empty successful
result is recorded without waking the model. Output, timeout, or non-zero exit
wakes the owning Agent with that output bounded into the wake envelope; no Chat
message is written. The fire log stores the bounded output, exit code, and
timeout state.

## Provenance

A fire is invisible until the Agent answers it. When it does, it sends with
`haus message send --cause <fireId>` and the Server records that message's
provenance. `specs/automation-provenance.md` owns that contract; the
reminder-specific facts are:

- The `cause` a reminder-caused message carries reports `kind` `reminder`, the
  reminder id and fire id, and the snapshot taken when the fire was answered:
  the title and description, its cadence string as the summary, the fire time, and the owning
  Agent. Its `live` half — state, last fired time, fire count, script snippet —
  is null once the reminder or that fire has been swept, and the mark reads
  archived rather than disappearing.
- `automation.fireContext` adds, for a reminder, `repeat`, `nextFireAt`,
  `anchorMessageId`, and a bounded excerpt of the anchoring message, which is
  what the Thread context card shows in place of a Trigger's payload block.
- Each fire the Agent acts on is its own message. Answers to different fires of
  one recurring reminder never share a Thread.

## Surfaces and lifecycle

- An Agent profile shows that Agent's reminders to Owners and Admins through a
  focused `reminder.list` read. There is no Server-wide Reminders route. Script
  contents stay redacted. Because a fire writes nothing to a Chat, that run
  history is the only place every fire is observable, including the ones the
  Agent had nothing to say about.
- History is the log of executions, read by `reminder.history` under the same
  authorization: one entry per fire, newest first, so a recurring reminder
  appears once per wake. Each entry carries the reminder's current title and
  cadence, the fire's scheduled slot and fired time, the script outcome when
  that fire ran a script, and the Agent's answering message with its Chat when
  one exists. A fire records for itself whether it ran a script, so a later
  script edit never relabels it, and a fire answered more than once stays one
  entry naming its earliest answer.
- Reminder history expires after `REMINDER_HISTORY_RETENTION_DAYS`. A fire is
  deleted that long after `fired_at` whatever its reminder is doing, and a
  `fired` one-shot or a `canceled` reminder is deleted that long after it
  settled, taking the rest of its record with it.
- Agent reminder verbs are exposed through the Computer-injected `haus`
  CLI. Computer reconnect recovery, local script execution, and attention
  acknowledgment are part of the end-to-end contract.
- Scheduler health reports only `healthy`, `degraded`, or `stopped` plus safe
  timestamps. Errors are redacted. One malformed reminder degrades the tick but
  does not block other due reminders. Shutdown stops new ticks and waits for an
  in-flight transaction.

Agent schedule refusals distinguish `IDEMPOTENCY_KEY_REUSED` (same command id, different canonical input; list and reconcile before saving a new revision id) from `REMINDER_FIRE_TIME_PASSED` (no prior matching command and the requested first fire is past; list first, then save a future time with a new id). Replay returns current reminder state and `replayed: true`; it does not reinstall canceled work.

Explicit reminder timezone participates in schedule command identity. Reusing a command id with a different zone conflicts. Existing fingerprints without a timezone retain their exact bytes and replay behavior. Schedule a new reminder to change its recurrence zone; updating cadence preserves the stored zone.

The explicit first fire is independent of the repeat cadence; an off-slot first fire is permitted for an intentional initial check. Confirm its timing separately. CLI updates to a calendar cadence require `--timezone` equal to the reminder’s stored zone; a different zone requires a newly consented replacement. Capability discovery uses a dedicated read-only endpoint and never depends on historical reminder access.

The CLI reports `REMINDER_RECEIPT_UNCONFIRMED` when a mutation receipt omits or contradicts the expected timezone. The mutation may already have landed: inspect the returned reminder id and reconcile or cancel before retrying; do not create a second reminder blindly.
