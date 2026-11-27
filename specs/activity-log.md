# Activity Log

The activity log is Haus's append-only, structured event log for runtime activity.

It is both an audit surface and a Memory source. It exists separately from Memory so Haus can
preserve a queryable record of what happened across the system without forcing every event to
become durable brain state.

The activity log is also separate from session transcripts. Messages and transcripts already exist
in session and chat history. The activity log records the higher-signal operational events around
that history.

## Relationship To Memory

The distinction between the systems should stay explicit.

- `activity log` is the timestamped event record of what happened.
- `working memory` is the synthesized recent understanding built from the activity log.
- Memory stores durable Markdown knowledge.
- Agents own Memory maintenance behavior.

The activity log remains queryable even after its contents have been synthesized into working
memory. It is not consumed and discarded when a synthesis is produced.

## Event Model

The activity log should be append-only and scoped by day.

Every activity event should preserve:

- a stable event identity
- an event type
- a timestamp
- a calendar day for efficient day-scoped grouping
- the owning agent and any relevant workspace, chat, session, task, or job context
- the observed participant when one exists
- the relevant maintenance run identity when one exists
- a one-line summary
- optional detail
- an importance level so recent synthesis can prioritize under token pressure

Activity events should not be rewritten in place as the truth changes. Corrections, reversals, and
later context should appear as new events.

## Event Categories

Haus should record at least these categories of events:

- `session`: session starts, session resumes, important session conclusions
- `worker`: worker or long-running task spawn, completion, cancellation, or failure
- `job`: cron and scheduled task execution
- `delivery`: important cross-session or cross-agent deliveries
- `capture`: persistence capture queued, retried, failed, or completed
- `memory`: Memory knowledge captured, promoted, demoted, superseded, corrected, or forgotten
- `decision`: important choices that shape future behavior
- `error`: tool failures, worker failures, cancellations, and other operational failures
- `model`: model, provider, or permission-mode changes that affect the active environment
- `system`: startup, config changes, maintenance runs, and other system-level events

The exact event taxonomy may expand, but it should stay structured and explicit.

## What Does Not Belong In The Activity Log

The activity log should not duplicate ordinary user messages or ordinary assistant replies.

- Message content already belongs in chat and session history.
- The activity log should capture the meaningful events around that history rather than mirror it.
- Only conversation-derived moments that rise to the level of an important decision, error,
  transition, or memory-worthy operational event should become activity events.

This keeps the activity log readable and keeps working-memory synthesis focused on signal rather
than chatter.

## Event Creation

Most activity events should be recorded programmatically at the point they happen.

- Task lifecycle changes should emit events directly.
- Cron and scheduled-job outcomes should emit events directly.
- Memory-save and memory-lifecycle actions should emit events directly.
- Delivery and system transitions should emit events directly.
- Model or provider changes should emit events directly.
- Error paths should emit events directly.

Haus should record these events as fire-and-forget side effects so live interaction paths do not
block on audit logging.

### Decisions

Haus should capture decisions through three paths:

- programmatic decisions that are already explicit in runtime state, such as model changes,
  permission-mode changes, or task-state changes
- the periodic persistence pass identifying important decisions from recent conversation and work
  output
- explicit user or agent actions that record a decision directly

This keeps decisions first-class without depending on a branch-only architecture.

## Lifecycle

The activity log should remain queryable over time while also supporting working-memory synthesis.

- Raw activity events should accumulate within the current day.
- Intraday syntheses may be derived from those events, but the raw events should remain queryable.
- At day rollover, the prior day should gain a daily summary derived from its recent syntheses.
- Raw events older than roughly 30 days may be pruned once they are well covered by synthesized
  recent-history layers.
- Daily summaries should be retained much longer than raw events because they are compact and remain
  useful for historical understanding.

The activity log is append-only, but it is not unbounded at the raw-event level.

## Query And Product Surfaces

The activity log should be queryable as its own product surface.

- It should power homepage and dashboard activity views.
- It should be inspectable as an audit log of system behavior.
- It should power recent-activity lines in participant context.
- It should power the activity map in memory context.
- It should provide the source material for working-memory synthesis.
- It should support signal-based persistence triggers such as event density.

This means the activity log is not just a hidden implementation detail for memory. It is also a
first-class operational history surface.

## Constraints

- The activity log must not be treated as Memory durable knowledge.
- The activity log must not duplicate ordinary transcripts.
- The activity log must be append-only and inspectable.
- Activity recording must not make live session handling slow or fragile.
- The activity log must remain useful both as an audit trail and as the source for recent
  synthesized working memory.
