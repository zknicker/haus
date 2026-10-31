---
summary: Unread becomes a triage list — one-line rows, exactly one open, which renders its newest waiting message (from one `chat.unreadPreviews` read) and the conversation's own composer; J/K/E/R/Return work it like a queue; seeing a row never reads it — Mark read, replying, or opening does, and the first two open the next row; the week's Agents move from a four-card strip to a ranked rail beside the feed (a chip strip when the pane is narrow) that flags a token spike. Amends ADR 0038.
read_when:
  - changing how an Unread row shows its messages, `chat.unreadPreviews`, or replying from the Inbox
  - changing which Unread row is open, the Inbox's keyboard keys, or the Inbox composer
  - changing whether or when seeing something in the Inbox marks it read
  - changing the Inbox's Agents rail or strip, its ranking, or the token spike flag
  - changing the Inbox's two-column layout or its narrow-pane switch
---

# ADR 0050: The Inbox Renders What Is Waiting

## Status

Accepted 2026-10-29. Amends [ADR 0038](0038-inbox-is-unread-not-attention.md): its sections and
its clearing rule stand; how an Unread row shows its messages and where the week's Agents sit
change. The row set is still [ADR 0043](0043-threads-are-unread-on-their-own.md)'s.

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
  as a wall: every visit meant reading every card. The triage list keeps the reading in the one
  open row and leaves the rest scannable.
- The **Active this week** label and its cap of eight cards are gone; the rail lists every Agent
  with activity this week.
- A "recently read" list under Unread was considered and left out: it needs a read-history source
  the Server does not keep.
