---
summary: Decision to make hosted, author-owned, message-anchored reminders the only scheduling primitive while Computers retain execution.
read_when:
  - changing reminder scheduling, cadences, fires, script payloads, or run history
  - changing how agents are woken for scheduled work, or adding any recurring-work surface
  - reading the history behind the cron/automations retirement
---

# ADR 0016: Reminders Are the Scheduling Primitive

## Status

Accepted (2026-07-22, WS5 of the Raft-alignment program; hosted ownership
clarified by PRD-141 on 2026-07-26). Replaces the cron automations product
deleted at the flip (ADR 0014). Its visible-receipt clauses are superseded by
ADR 0026: the reminder is still the scheduling primitive and everything else
below stands, but a fire no longer writes a Chat message, and provenance rides
the Agent's own reply instead. Amended by ADR 0040 (2026-10-08): calendar
cadences resolve in an explicit zone the Agent reads from the requester, not the
Agent's home timezone, and a calendar first fire is always a slot of its cadence.

## Decision

`haus reminder schedule/list/snooze/update/cancel/log` is the reminder
vocabulary. A reminder is author-owned, anchored to a message in a Channel or
Thread the author can access or the owning Agent's DM, and hosted Server-owned.
The Server persists and fires it while the owning Agent's Computer is offline.

A fire records the fire and queues a durable attention snapshot for only the
owning Agent. It writes nothing to the transcript (ADR 0026); the Agent's reply
carries the reminder as its cause. Recurring cadences (`every:*`, `daily@HH:MM`,
`weekly:days@HH:MM`) resolve in the Agent's home timezone (superseded by ADR
0040: calendar cadences name the requester's zone). Late schedules fire once and
advance from now.

An optional script is opaque delivery data. The hosted Server validates its
type and 16 KiB size, persists it, and includes it in the pending attention
snapshot, but never interprets or executes it. Execution belongs to the
Agent's Computer. Script fires follow the same attention contract as every
other fire, and bounded output reaches the Agent on the wake envelope rather
than as a Chat message.

## Consequences

- Cron agent-turn and system-event modes collapse into observable reminders;
  `cron_jobs` and `cron_runs` are absent from the fresh hosted schema.
- Server Owners and Admins can inspect each Agent's reminders from that Agent's
  profile. There is no Server-wide Reminders view; creation and editing remain
  Agent-authored.
- PostgreSQL commands and row versions make retries and mutation/fire races
  explicit. Durable events preserve a cursor-based integration contract.
- Pending reminder attention is a concrete unacknowledged fire snapshot, not a
  generic scheduler, outbox, delivery, or acknowledgment framework.
- The previous Runtime-owned quiet-script interpretation is superseded. No
  hosted process executes arbitrary payloads. The claim that no hosted fire is
  invisible no longer holds: under ADR 0026 a fire the Agent does not answer
  appears only in the reminder's run history.
