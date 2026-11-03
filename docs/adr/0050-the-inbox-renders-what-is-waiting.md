---
summary: Every Unread Chat and Thread is an open card rendering its newest waiting message (from one `chat.unreadPreviews` read) over the conversation's own composer, always there to type into; one card is selected, shown as a ring, and J/K/E/R/Return work the feed like a queue; seeing a card never reads it — Mark read, replying, or opening does, and the first two select the next card; the week's Agents ride a chip strip beside the greeting that flags a token spike, with the full ranked list behind "+N". Amends ADR 0038; amended 2026-11-01 (open cards replace the one-open-row triage list; the strip replaces the rail).
read_when:
  - changing how an Unread card shows its messages, `chat.unreadPreviews`, or replying from the Inbox
  - changing which Unread card is selected, the Inbox's keyboard keys, or the Inbox composers
  - changing whether or when seeing something in the Inbox marks it read
  - changing the Inbox's Agents strip or list, its ranking, or the token spike flag
  - changing the Inbox's layout, its feed cards, or their light and dark styling
---

# ADR 0050: The Inbox Renders What Is Waiting

## Status

Accepted 2026-10-29. Amends [ADR 0038](0038-inbox-is-unread-not-attention.md): its sections and
its clearing rule stand; how an Unread row shows its messages and where the week's Agents sit
change. The row set is still [ADR 0043](0043-threads-are-unread-on-their-own.md)'s.

Amended 2026-11-01: every Unread card is open. The one-line rows and the single open row are
gone. Each unread Chat and Thread is a card of its own: its source line, its newest waiting
message clamped with "Show more" and "N earlier", and its own composer, always there to type
into. Nothing expands or collapses. Exactly one card is still selected, now shown only as a ring
(`--feed-card-ring`), so J and K move the ring and never a card. Focus moving into a card — typing
in its composer, tabbing to its controls — selects it and leaves the cursor where the reader put
it. E, R, and Return act on the selected card, and Mark read or a reply selects the next. The
list paints only once `chat.unreadPreviews` has settled, and hovering the sidebar's Inbox row
prefetches it, so no card grows under the reader. The rail is gone at every width: the week's
Agents ride the strip on the greeting's line ("+N" opens the full ranked list, "N running" opens
Happening now), and the page is one column that scrolls as one. In dark mode a card sits one
quiet step off the page with a faint rim (`--feed-card`), because a card on `--surface` — the
composer field's own fill — swallowed the field inside it. Decision 1's collapsed rows and single
open row, and decisions 4 and 5's rail and its container-query switch, are historical. Decisions 2
and 3 stand: one read previews every card, and seeing a card never reads it.

## Context

Notifications send people to the Inbox all day, mostly for Thread replies, which are hard to find
anywhere else. An Unread row quoted one truncated line, so every visit meant opening each row to
read it and coming back. The Inbox wants to be a page you sit on and read from.

The **Active this week** strip did a real job — a runaway Agent's token burn is obvious there, and
so is who is busiest — but it fit four cards across, sat above the conversation, and still could
not show the whole team.

## Decision

1. **Unread is a triage list, and its open row renders what is waiting.** Unread is a list of
   one-line rows set straight on the page, newest activity first: the place's mark and name, the
   newest waiting message quoted with its author, the time, and the count. Exactly one row is
   open, lifted into the list's one card (surface and resting shadow, no gray fill, no outline
   inside an outline); switching rows folds the old body closed as the new one opens. It shows
   its source line (a Thread names the message it hangs off), only the
   newest counted message rendered as the transcript renders it — clamped to a few lines with
   "Show more" — and "N earlier", which first reveals the other waiting messages the preview
   carries in place and past those opens the conversation at its first unread message. Under it
   sits the conversation's own composer, the same `ChatComposer` the Chat or Thread view renders,
   with the same draft. Counted means the row's own unread rule: someone else's message past the
   reader's marker, and for a Thread one the reader follows or is mentioned in.

   The first row is open on arrival; pressing a collapsed row opens it in place. The open row's
   composer does not take focus on its own — a Chat's composer does, but here the row opens on
   load and as the reader moves, and a self-focusing editor would swallow the keys that move it.
   On the page or inside the list (never in a field), **J** and **K** move the open row, **E**
   marks it read, **R** puts the cursor in its composer, and **Return** opens its conversation.
   Mark read and a reply each open the next row, so the list is worked like a queue rather than
   read like a wall.
2. **One read previews every row.** `chat.unreadPreviews({ serverId })` returns each unread Chat's
   and Thread's newest counted messages and how many are older, filtered by the same predicates
   `chat.list`, `thread.listUnread`, and the badge use. The App never reads messages per row: a
   page of rows fanning out one transcript read each is the request burst that wedges a Server.
3. **Seeing is not reading.** A row in view, open or not, never moves a read marker. Mark read,
   replying from the row, or opening the conversation clears it, so a row never disappears while
   it is being read. ADR 0038's "viewing a Chat reads it" keeps meaning the Chat surface itself.
4. **The week's Agents become a rail.** Beside the feed, every Agent active this week is one ranked
   row: avatar, a bar sized against the busiest, its week's sparkline, and its seven-day token
   total. **Happening now** sits under it. An Agent whose day is far above its usual — today's
   tokens at least three times the median of its prior seven days, and at least five million —
   is flagged, so a runaway Agent stands out whatever its rank.
5. **A narrow pane folds the rail into a strip.** The switch follows the Inbox pane's own width
   (a container query), not the window's, because a second pane narrows the Inbox on a wide
   window. Below it, the Agents become a row of chips above Unread, the rest behind a "+N"
   popover holding the full list, and Happening now becomes a "N running" popover.

## Consequences

- The Inbox reads one more Server query and invalidates it on the events that already move
  unread state (`message.created`, `chat.onRead`, Thread follows, Chat deletion).
- A reply from the open row is a real send into the Chat or Thread; it lands in that conversation
  like any other message, and a draft started in either place waits in the other.
- `ChatComposer` takes `autoFocus` (default on) and a `ref` with `focus()`; the Inbox passes
  `autoFocus={false}`, which also stops a kept view's reveal from refocusing it.
- The first version rendered every row as its own card with its newest three messages. It read
  as a wall: every visit meant reading every card. The triage list kept the reading in the one
  open row and left the rest scannable.
- The triage list was replaced in turn (2026-11-01). Pressing a row to open it was one step too
  many, and the open row grew a beat after the page painted as its preview landed. Open cards keep
  the first version's directness without its wall: each shows only its newest message, clamped,
  and the selection ring keeps the queue keys. A reading pane beside the feed, a rail of compact
  rows, and a peek bubble over the selected row were each mocked and rejected, the bubble after a
  build: the page grew too many columns, or the selected row moved under the reader.
- Every card mounts a `ChatComposer`. Its only Server read (`chat.mentionOptions`) waits until
  "@" is typed, and drafts are local, so a feed of composers adds no request per card.
- The **Active this week** label and its cap of eight cards are gone; the full list behind the
  strip's "+N" holds every Agent with activity this week.
- A "recently read" list under Unread was considered and left out: it needs a read-history source
  the Server does not keep.
