---
summary: Instants stay UTC and each viewer sees their own zone; every human has a timezone preference that Agents read from people lookup and pass explicitly when scheduling a calendar reminder, whose first fire is always a slot of its cadence. Amends ADR 0016.
read_when:
  - changing how a human's timezone is captured, stored, edited, or shown to Agents
  - changing reminder timezone resolution, first-fire derivation, or off-slot rules
  - proposing a Server-wide default zone, a per-message zone, or inferring a requester's zone
  - changing people lookup output (`haus server info --humans`, `haus channel members`)
---

# ADR 0040: Agents Resolve Human Timezones Explicitly

## Status

Accepted 2026-10-08. Amends [ADR 0016](0016-reminders-are-the-scheduling-primitive.md): calendar
cadences no longer resolve in the Agent's home timezone, and a calendar reminder's first fire is
no longer independent of its cadence.

## Context

This was Haus's third timezone bug. An Agent scheduled `weekly:mon@15:57` with timezone `UTC` and
a first fire of Monday 19:57 UTC. The human, in US Eastern, meant 3:57 PM Eastern. The first fire
was right; every later fire snapped to 15:57 UTC, 11:57 AM Eastern. Two gaps let it through:

- Haus stored no human timezone. Agents run on UTC home time and had nothing to pass for
  `--timezone` except UTC.
- The Server accepted `fireAt` and `repeat` independently and only checked that some future slot
  existed, so a correct first instant hid a wrong cadence zone.

## Decision

1. **Instants are UTC.** Every stored instant is UTC; each viewer sees times in their own zone.
2. **Each human has a timezone preference** (`users.timezone`, a canonical IANA name; offsets are
   refused). The App reports the device zone on sign-in, which fills it only while it is blank.
   Afterwards it changes only when the human edits it in Settings > Profile; Haus never prompts
   when the device zone differs.
3. **Agents stay on UTC home time.** There is no Server-wide default zone, no per-message zone,
   and no change to the composed system prompt.
4. **The Agent resolves the zone at scheduling time.** People lookup (`haus server info --humans`,
   `haus channel members`) shows each human's timezone. The Agent passes the requester's zone as
   `--timezone`, asks when the zone is unknown or people in the conversation disagree, and states
   the zone back when confirming ("Fridays at 3 AM Eastern"). The guidance lives at the point of
   use: the reminder command's help, its missing-timezone error, and the Manual's reminder topic.
5. **A calendar first fire is a slot.** For `daily@` and `weekly:` the Server requires an explicit
   timezone, derives the first fire from the cadence when `fireAt` is omitted, and refuses a
   supplied `fireAt` that is not a slot. An update that sets a calendar repeat moves the next fire
   to its next slot; an update that sets a fire time on a calendar reminder must name a slot.
   Snooze stays the one deliberate off-slot fire. One-shots and `every:` intervals keep their
   explicit instant.
6. **Receipts restate the agreement.** The CLI receipt prints the cadence with its zone and the
   next fire as wall clock in that zone, for example `Every Monday at 15:57 America/New_York; next
   fire Mon 2026-10-12 15:57 EDT (2026-10-12T19:57:00.000Z)`.

### Storage

Every reminder's next fire is stored as a UTC instant. A calendar repeat also stores its
wall-clock rule and IANA zone, because a fixed UTC time drifts an hour against local clocks across
DST: 3:57 PM Eastern is 19:57 UTC in summer and 20:57 UTC in winter. Each fire recomputes the next
instant from the rule in its zone. On a one-shot or `every:` reminder the stored zone is
display-only.

## Considered and rejected

- **Server infers the requester's zone.** Inference silently reinterprets times and misattributes
  requesters: the message that triggers a schedule is often not from the person the reminder is
  for, and a Thread or Channel mixes zones. An explicit lookup keeps the choice visible to the
  Agent and the human.
- **A zone on every message or inbox item.** Noise on every turn for a fact needed only when a
  wall-clock time is agreed.
- **Raft's model.** Raft stores user zones but never exposes them to Agents. Haus diverges and
  exposes them in people lookup, because the Agent is the one that must pick the zone.

## Consequences

- Off-slot calendar first fires, permitted under ADR 0016, are now refused with an error that
  names the next slot. A calendar schedule without a timezone is refused rather than defaulting to
  the Agent's home zone, so an older CLI that omits it fails loudly instead of scheduling in UTC.
- A calendar schedule's derived first fire is not part of its command fingerprint, so a retry
  with the same command id replays without a saved `--fire-at`.
- Humans whose App has never reported a zone show `timezone: unknown` in lookup; the Agent asks.
  The iPhone app reports its device zone the same way, skipping a zone the
  Server would refuse.
