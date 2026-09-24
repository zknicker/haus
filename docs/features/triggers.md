---
summary: Agent-owned webhook Triggers — secret-authenticated inbound wakes anchored to a Chat, created from the Agent profile's Automations tab or by the Agent itself, answered by the Agent's own marked message, with bounded payloads and retained Agent-wide fire history.
read_when:
  - changing Trigger creation, secrets, firing, payload bounds, or fire history
  - changing the Automations tab's Trigger walkthrough, detail view, or controls
  - changing how a Trigger fire appears in a conversation
  - deciding whether new work is a Reminder (time) or a Trigger (outside event)
---

# Triggers

A Trigger is a private URL that wakes one Agent when an outside system POSTs to
it. One Agent owns it, it is anchored to a conversation, and the hosted Server
fires it even while that Agent's Computer is offline.

Triggers answer outside events. Reminders answer the clock. A Trigger has no
schedule and no recurrence; anything time-based is a
[reminder](reminders.md).

## Creating one from the App

Server Owners and Admins create Triggers on an Agent's profile, under
**Automations**. **New trigger** opens a short walkthrough:

1. **Name** the Trigger. This is the title everyone sees on the row and on the
   mark beside every message the Agent sends because of it.
2. **Instruction** — what the Agent should do each time it fires. Optional, but
   it is the only standing direction the Agent has when a fire arrives.
3. **Trigger type** — choose it in the select; **Webhook**, an outside system
   POSTing to a private URL, is the only type today.

The Trigger is anchored to your DM with that Agent, so that is where it answers
its fires. Creating it says nothing in that DM — the Trigger appears on the
Automations tab, which is where you arm it, read its history, and rotate its
secret.

The drawer stays open as that Trigger's detail and shows the **webhook card**
once at the top: the URL, the bearer secret, and a ready-made `curl` line, each
with a copy button. The secret appears here and nowhere else — Haus stores
only a hash. Losing it means rotating, not recovering it.

## Managing one

Opening a Trigger from the Automations tab shows its detail:

- **Active** arms or disables it. A disabled Trigger refuses every POST and keeps
  its history.
- **Name** and **Instruction** are editable in place.
- **When to run** shows the kind and, for a webhook, the URL with a copy button
  and **Rotate secret**. Rotating reveals a new secret once in the same card and
  kills the old one immediately.
- **Send test fire** fires the Trigger for real: same wake, same rate limit, no
  secret needed. It is how you check the wiring before handing the URL out.
- **Fire history** lists what has arrived, newest first, with the time, payload
  size, and idempotency key.
- **History** opens the Agent-wide fire log. It includes fires from every
  Trigger, links to an Agent answer when one exists, and labels a retained fire
  whose Trigger was removed. It remains the history path after a Trigger's
  detail disappears.
- **Delete** removes the Trigger from active use immediately, retires queued
  wakes, and retains its recent fire history for 30 days. Messages the Agent
  already sent stay in their conversation and keep their lightning mark — the
  Trigger's title and kind are snapshotted onto the message — but their hover
  card and context card lose everything that was read live.

Each row shows who created it — a person's handle, or the owning Agent.

## Product behavior

- **Two authors, one Trigger.** People create and manage Triggers from the
  Automations tab; an Agent creates and manages its own with `haus trigger
  create` when someone asks for an outside event — a webhook, a CI run, an alert,
  a form, a sensor — to reach it. An Agent-created Trigger anchors on the message
  where it was asked for, so that is where it answers its fires. Either way the
  owning Agent is the one woken, and both can manage the same Trigger.
- **Secret shown once.** Creating or rotating a Trigger returns its bearer secret
  exactly once, along with the URL and a ready-made `curl` line. Haus stores
  only a hash, so a lost secret is replaced by rotating, never recovered.
- **The answer is the row.** A fire posts nothing. It wakes the owning Agent
  with the payload as a `type=trigger` message, marked and indented as untrusted
  data — a Trigger can inform an Agent, it cannot command one. If the Agent has
  something to say, it says it as an ordinary message, and that message shows a
  small lightning mark with the Trigger's name beside the author. If it has
  nothing to say, nothing appears in the conversation and the fire is recorded in
  the Trigger's history. Silence means the Agent had nothing to add, not that
  nothing fired.
- **One fire, one message.** A busy Trigger produces one message per fire it
  acts on, each with its own Thread. Answers to different fires never pile into
  one conversation.
- **Where the payload went.** Opening the message's Thread shows the context
  card, whose expandable block holds the payload itself with its size and content
  type. The mark and its hover preview work the same for every automation — see
  [Chat](chat.md#in-the-box).
- **An archived Trigger keeps its mark.** Once the Trigger or the fire itself is
  gone — removed and later swept after 30 days, or a fire swept after 30 days —
  the mark still names what woke the Agent, and both provenance surfaces state
  the snapshot (title, kind, fire time) and that it is archived — the hover card
  as `Archived · Fired 4m ago`, the context card as "This trigger has been archived."
  A removed fire remains in the Agent-wide History drawer until retention ends;
  the active detail and live management link do not pretend it still exists.
- **Bounded input.** A body is at most 64 KiB of storable text — valid UTF-8 with
  no NUL byte — under any content type, and may be empty. Anything else answers
  `415`. The Server stores the body verbatim and never interprets, filters, or
  templates it. Each Trigger accepts 10 fires per 10 seconds and 60 per hour;
  beyond that it answers `429`.
- **Repeat-safe callers.** A sender may pass `Idempotency-Key` of up to 200
  characters; a repeat of the same key returns the original fire instead of
  waking the Agent again. A longer key is refused with `400` rather than ignored,
  so a caller never believes it is deduplicating when it is not.
- **Durable delivery.** A fire is queued as durable Agent work, so a Trigger that
  fires while the Computer is offline is delivered on reconnect.
- **Kill switch.** An Agent can disable, enable, rotate, or delete its own
  Triggers, and an Owner or Admin can do the same from the Automations tab. A
  disabled Trigger stops answering immediately and keeps everything it recorded;
  deletion stops it permanently while its recent history remains bounded and
  readable.
- **Self-healing status.** A fire whose owning Agent is retired or whose anchor
  is no longer writable is refused and disables the Trigger on the spot.
- **History.** Every fire is recorded, answered or not. The Agent profile's
  History drawer lists retained fires across all Triggers, and `haus trigger
  log` returns the full payload for a still-addressable Trigger's fire.

## Who can do what

- **Server Owners and Admins** hold the whole lifecycle for every Agent's
  Triggers: create, edit, arm and disable, rotate, test fire, read history, and
  delete. History includes retained fires from removed Triggers.
- **Members** do not see Triggers on an Agent profile and cannot change one. In
  a conversation they are in, they see the Agent's messages with the Trigger's
  mark, its hover preview, and the Thread context card — reading why a message
  was sent needs only access to the message.
- **Agents** create and manage only their own Triggers, whoever created them, and
  are the ones woken when one fires.

Webhook is the only kind Haus ships. Provider-specific verification, payload
filtering, and Computer-executed scripts are not part of it.

See `specs/triggers.md` for the normative persistence, route, firing, and secret
contract, `specs/automation-provenance.md` for how a fire reaches the transcript,
and [Triggers API](../api/triggers.md) for the wire surface.
