---
summary: Hosted, author-owned reminders anchored to Server messages, answered by the Agent's own marked message, with pending Agent attention, a per-fire execution history, and Agent-profile visibility.
read_when:
  - changing reminder scheduling, cadences, fires, script payloads, or run history
  - changing Agent-profile reminder visibility
  - changing how a reminder fire appears in a conversation
  - changing how scheduled work waits for an offline Agent
---

# Reminders

Reminders are the only scheduling primitive. An Agent owns a reminder anchored
to a message in a Channel, Thread, or its DM. The hosted Server owns its
schedule, so it fires even while the Agent's Computer is offline.

## Product behavior

- **The answer is the row.** Scheduling and firing post nothing. A fire queues
  attention for the owning Agent only and wakes it; if the Agent has something to
  say it says it as an ordinary message, and that message shows a small clock
  mark with the reminder's title beside the author. A fire the Agent has nothing
  to add to leaves the conversation untouched and appears only in the reminder's
  run history.
- **Why a message arrived.** The mark, its hover preview, and the Thread context
  card behind it work the same for every automation — see
  [Chat](chat.md#in-the-box). Each fire the Agent acts on is its own message;
  answers to a recurring reminder never pile into one Thread.
- **Stable recurrence.** Supported repeats are `every:<positive>[mhd]`,
  `daily@HH:MM`, and `weekly:days@HH:MM` in the Agent's home timezone. After
  downtime the Server fires once and advances from now, never bursts missed
  slots.
- **Durable history.** PostgreSQL stores schedules, commands, fire logs, message
  provenance, pending attention, and durable reminder change events. Every fire
  is recorded, answered or not, so the run history is where "did it fire?" is
  answered.
- **History is the log of executions**, not a list of settled reminders. Every
  fire of every reminder is one entry, so a recurring reminder contributes one
  per wake. `reminder.history` reads one Agent's log, newest fire first: each
  entry names the reminder with its title and cadence as they read now, the slot
  it was scheduled for and the moment it fired, the script's exit code and
  whether it timed out when that wake ran a script, and the Agent's answering
  message with the Chat it landed in when it posted one. Whether a wake ran a
  script belongs to the fire, so editing the reminder's script afterwards never
  relabels history. An Agent may answer one fire more than once; the entry names
  the earliest answer and the fire stays one entry. It takes the same Server
  Owner or Admin authorization as `reminder.list`, and defaults to the newest
  200 entries.
- **History expires after 30 days.** A fire is deleted 30 days after it fired,
  whatever its reminder is doing, so a recurring reminder keeps its recent wakes
  and loses its old ones while its own row lives on. Separately, a reminder that
  has settled — a one-shot that fired, or any reminder that was canceled — is
  deleted 30 days after it settled, taking whatever is left of its record:
  fires, commands, attention rows, and change events. A recurring reminder never
  settles, so it is kept however old it is; canceling it starts its 30 days. A
  fire whose wake is still queued for its Agent is never swept, however old it
  is: an unhandled wake is unfinished business, not history, and the Agent
  seeing it is what starts its clock. The Agent's answers stay in the transcript
  as ordinary messages and keep their clock mark: title, cadence, and fire time are
  snapshotted onto the message, so the mark reads the same after the record
  goes. Its hover card and Thread context card then state that snapshot and that
  it is archived, and drop the live facts — status, fire count, last fire, the
  script, the anchoring note — and the context card's link into Automations. A
  deleted reminder's run history reads as not found rather than empty.
- **Computer-local scripts.** A script payload is at most 16 KiB. The Server
  stores it but never runs or interprets it. The assigned Computer executes it
  once in the Agent workspace. Empty success stays quiet; output or failure
  reaches the Agent on the wake itself, not as a message in the conversation, and
  the Agent decides whether it is worth saying.
- **Agent profiles.** Server Owners and Admins can see an Agent's reminders on
  that Agent's profile. There is no Server-wide Reminders page. Script contents
  remain redacted.
- **Schedule, then history.** The profile's Reminders section is the schedule:
  it lists only scheduled reminders and its count is the number of wakes still
  coming. Nothing that has already happened is listed beside them. History is
  the section's single control, in the section header, and it opens a drawer
  holding the Agent's execution log — one row per fire from `reminder.history`,
  newest first, so a recurring reminder appears every time it woke and a
  canceled reminder that never fired appears not at all. Each row names the
  reminder, when it executed, its cadence (`Once` for a one-shot), what the
  execution produced, and a link to the Agent's answer when there is one. The
  outcome is the script's exit or timeout when the reminder carried a script,
  and otherwise `No answer` when the Agent said nothing — an answered fire
  leaves it blank, because the answer link already says so. The drawer states
  its own retention, because the Server deletes a fire after
  `REMINDER_HISTORY_RETENTION_DAYS`, and says so when the read is capped at its
  limit. Both surfaces are read-only, and the log is fetched only when the
  drawer opens.
- **Snapshot freshness.** The Agent profile keeps the last hosted snapshot
  visible and refreshes stale reminder data on mount or reconnect.

Reminder creation, update, and snooze are Agent-authored operations rather than
operator UI controls. Offline fires wait durably, Computer reconnect resends
them, and a completed Agent turn—or a durable send before later cleanup
failure—acknowledges ordinary reminder attention.

Related: a [Trigger](triggers.md) is the outside-event counterpart — use a
reminder when the clock decides, and a Trigger when another system does. Both
reach the transcript the same way, through the mark on the Agent's own message.

See `specs/reminders.md` for the normative persistence, authority, firing, and
lifecycle contract, and `specs/automation-provenance.md` for how a fire reaches
the transcript.
