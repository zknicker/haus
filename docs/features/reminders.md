---
summary: Hosted, author-owned reminders anchored to Server messages, answered by the Agent's own marked message, with pending Agent attention, a per-fire execution history, and Agent-profile visibility.
read_when:
  - changing reminder scheduling, cadences, timezones, fires, script payloads, or run history
  - changing Agent-profile reminder visibility, rows, or the reminder detail sheet
  - changing how a reminder fire appears in a conversation
  - changing how scheduled work waits for an offline Agent
---

# Reminders

Reminders are the only scheduling primitive. An Agent owns a reminder anchored
to a message in a Channel, Thread, or its DM. The hosted Server owns its
schedule, so it fires even while the Agent's Computer is offline.

For a schedule that may be retried after a process restart, persist its complete
input and use `haus reminder schedule --command-id <saved-id> --fire-at <saved-time>`.
The command id reuses the existing author-scoped Server idempotency contract.
It requires an absolute first fire time, because recalculating a delay would
change the request; a calendar repeat needs none, since its derived first fire
is not part of the request. Replays return current reminder state and identify already-applied commands; list reminders before
deciding whether to update, snooze, cancel, or resume. A replay never recreates
a canceled reminder. Re-enabling a declined review needs new agreement and a
new command id.

## Product behavior

- **The answer is the row.** Scheduling and firing post nothing. A fire queues
  attention for the owning Agent only and wakes it; if the Agent has something to
  say it says it as an ordinary message, and that message shows a cause line
  with the reminder's title above it. A fire the Agent has nothing
  to add to leaves the conversation untouched and appears only in the reminder's
  run history.
- **Title and description.** A reminder's title is a short label, like a
  calendar invite subject — "Monday Advertising Review" — and is all the cause
  line shows. Its description is the full instruction ("Check advertising and
  flag campaigns that need bid adjustments"); the fire hands it back to the
  Agent, and the hover card, Thread context card, and Agent profile show it
  under the title. Agents set titles of at most 60 characters; older reminders
  kept their sentence titles and copied them into the description.
- **Why a message arrived.** The mark, its hover preview, and the Thread context
  card behind it work the same for every automation — see
  [Chat](chat.md#in-the-box). Each fire the Agent acts on is its own message;
  answers to a recurring reminder never pile into one Thread.
- **Clear schedule times.** A reminder is one of two kinds, one-time or
  recurring, and every profile surface says which first. Rows, the detail, and
  history read in your own time: the timezone saved on your Profile, or the
  device zone only while that is blank. The schedule's agreed timezone, with a readable zone
  label and its clock there when the UTC offsets differ, lives only in the
  detail. Calendar cadences are converted to your zone on the date of the next
  fire, so DST and a slot that lands on another weekday for you come out right.
  Fixed intervals remain durations; they are not relabelled as daily clock
  appointments. History labels execution timestamps as your time and shows
  cadence frequency without assuming a schedule timezone that its records do not
  contain.
- **Stable recurrence.** Supported repeats are `every:<positive>[mhd]`,
  `daily@HH:MM`, and `weekly:days@HH:MM`. Calendar repeats (`daily@`,
  `weekly:`) recur in the reminder's explicit IANA timezone, which the Server
  requires; it never falls back to the Agent's UTC home time. After downtime the
  Server fires once and advances from now, never bursts missed slots.
- **The requester's zone.** Every human has a timezone preference: the App and
  the iPhone app report the device zone when none is set, and Settings > Profile
  (a searchable Timezone row on both) changes it.
  Agents read it from `haus server info --humans` and `haus channel members`,
  pass the requester's zone as `--timezone`, ask when it is unknown or people
  disagree, and restate it when confirming ("Fridays at 3 AM Eastern"). See
  [ADR 0040](../adr/0040-agents-resolve-human-timezones-explicitly.md).
- **Calendar first fires are slots.** A calendar schedule may omit its first
  fire: the Server starts it at the cadence's next slot in its zone. A supplied
  first fire that is not a slot is refused with the next slot named. One-shots
  and `every:` intervals keep their explicit first instant.
- **Retries never duplicate.** Every schedule and change carries an idempotency
  key; a retried request returns the original reminder, and reusing the key for
  different input is refused ([Agents API](../api/agents.md#reminder-routes)).
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
  as ordinary messages and keep their cause line: title, description, cadence, and fire time are
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
  that Agent's profile. Each row is one line: a kind icon (a calendar for
  one-time, a repeat mark for recurring), the title, and a short schedule —
  `Once · Tomorrow at 9:00 AM` or `Every Monday at 3:57 PM · Next run Mon,
  Oct 12`, naming the next run's clock only when the cadence does not already
  say it. Pressing a row opens the reminder's detail sheet, shaped like a
  Trigger's: the title and kind (`One-time reminder` / `Recurring reminder`),
  then **Schedule** (next run, repeats, timezone), **Instructions** (the full
  description, when it differs from the title), **Context** (the chat it was set
  in, when it was created, and an attached script's size), and for a recurring
  reminder its **Run history** from `reminder.runs`, newest first, noting a run
  that woke late. **Cancel Reminder** asks first, then cancels with
  `reminder.cancel` against the snapshot's version; the reminder leaves the
  schedule and the sheet closes. There is no Server-wide Reminders page. Script
  contents remain redacted.
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
  limit. The log is fetched only when the drawer opens.
- **iPhone.** Owners and Admins reach the same list from Settings > Agents >
  an Agent > Automations: Reminders then Triggers, with the same one-line rows,
  tinted kind marks, and viewer-local phrasing (`AgentAutomationsView`).
  Pressing a reminder pushes its detail with the same Schedule, Instructions,
  Context, and Run history groups; **Set in** opens that chat and closes
  Settings. Cancel Reminder confirms, then cancels with the snapshot's version
  and a fresh command id, and rereads the list whether or not the Server
  accepted it, because a fire bumps the version. The History drawer is not on
  the phone.
- **Snapshot freshness.** The Agent profile keeps the last hosted snapshot
  visible and refreshes stale reminder data on mount or reconnect.

Reminder creation, update, and snooze are Agent-authored operations rather than
operator UI controls; canceling is the one operator action. Offline fires wait durably, Computer reconnect resends
them, and a completed Agent turn—or a durable send before later cleanup
failure—acknowledges ordinary reminder attention.

Related: a [Trigger](triggers.md) is the outside-event counterpart — use a
reminder when the clock decides, and a Trigger when another system does. Both
reach the transcript the same way, through the mark on the Agent's own message.

See `specs/reminders.md` for the normative persistence, authority, firing, and
lifecycle contract, and `specs/automation-provenance.md` for how a fire reaches
the transcript.
Absolute CLI `--fire-at` inputs need an explicit timezone (`Z` or an offset).
The CLI normalizes zoned timestamps to UTC before schedule or update, including
offsets such as `-0400`. Ambiguous local times fail with an actionable CLI error
before an API request. Calendar schedules require `--timezone <iana>`, and the CLI's error points to the people lookup that shows it. The Server stores that zone on the reminder; changing Agent home timezone later does not alter it. A calendar schedule without a timezone is refused. The CLI checks Server support before mutation and refuses on older Servers that would discard the new field. The schedule receipt restates the cadence with its zone and the next fire as wall clock in that zone, such as `Every Monday at 15:57 America/New_York; next fire Mon 2026-10-12 15:57 EDT (2026-10-12T19:57:00.000Z)`.

Explicit reminder timezone participates in schedule command identity. Reusing a command id with a different zone conflicts. Existing fingerprints without a timezone retain their exact bytes and replay behavior. Schedule a new reminder to change its recurrence zone; updating cadence preserves the stored zone.

A calendar reminder's first fire is a slot of its cadence: omitted, the Server derives it; supplied off-slot, it is refused. An update that sets a calendar repeat moves the next fire to its next slot, and an update that sets a fire time on a calendar reminder must name a slot. Snooze is the one deliberate off-slot fire. CLI updates to a calendar cadence require `--timezone` equal to the reminder’s stored zone; a different zone requires a newly consented replacement. Capability discovery uses a dedicated read-only endpoint and never depends on historical reminder access.
