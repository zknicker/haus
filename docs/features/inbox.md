---
summary: The human Inbox page — a sidebar lens over the day, the week's most active Agents, Asks, live Agent work, and unread conversation.
read_when:
  - changing the Inbox page, its sections, empty states, or realtime invalidation
  - adding a record that should ask a human to act or should stay observable between turns
  - deciding where background work that outlives an Agent turn becomes visible to humans
---

# Inbox

The Inbox is a Haus App page in the sidebar. Its row is the sidebar's anchor — first in the
Inbox/Search/Tasks menu. What it wears there follows the surface: on the web the Haus ghost mark
leads the titlebar strip above — named "Haus", so it does not repeat this row's name one tab stop
earlier — and the row takes the inbox glyph at the same measure Search and Tasks do; on the macOS desktop the traffic lights lead that strip, so the mark stays on this row.
The row badges the **Needs you** total in the same count chip the Channel and DM rows wear for
unread messages, and shows nothing when nothing needs you. It shows one human what they need to know
right now.

The Inbox is a lens, not a store. It owns no state of its own, creates no records, and duplicates no
lifecycle. Every row projects an existing Server record and links to that record's canonical place —
a Chat, a Thread, or an Agent profile.

The agent-side concept with a similar name is the [Agent inbox](../../specs/inbox.md), the durable
delivery ledger that wakes Agents. Say "Agent inbox" wherever the two could be confused.

## Layout

The page opens on a header with no card: the greeting that names the reader, set at the same
page-title step every settings page opens with, and the weekday and date beneath it. Under that sits the **Active this week** strip, and under that three full-width sections stacked in reading order —
**Needs you**, **Conversations**, **Happening now** — in the page column's own rhythm.

The page fills the shell band the way Settings does: every band's trail leads with a **Haus**
crumb linking back to the Inbox, and the Inbox band reads **Haus › Inbox** with the current page as
the trailing crumb. With the band saying where you are, the column is stock on every surface: the
greeting opens the page at the ordinary top inset, under the band, rather than rising into it.

They stack rather than split because a row is one line tall. Three-line rows made each section a
tall narrow thing, and two columns were how a 1152px page held them; a one-line row makes a section
a wide shallow one, and every part of that row — the title, the preview it leaves room for, and the
trailing meta — wants width. Splitting the page took width from all three at once.

All four sections share one composition, `ItemCardGroup`'s own: a transparent group whose
`ItemCardGroup.Header` carries the label at the page column's left edge, and whose body is what the
label names. Three of them put a bordered group of `ItemCard` rows there, divided by `Separator`;
the strip puts its cards there instead, because cards already carry their own edges. All four labels
are therefore the same type at the same edge
([`inbox-section.tsx`](../../apps/website/src/features/servers/inbox/inbox-section.tsx)).

The title used to sit inside the bordered box with a borderless divided list nested under it — a
hybrid that drew a rule between every pair of rows but none under the heading they belonged to, and
that needed CSS to undo the nested list's own spacing. Label outside, box below is HeroUI's own
usage grammar and the one the strip already had.

## Sections

**Active this week** is the one section whose body is not a box: a horizontally scrolling row of
Agent cards under the shared label. Each card is one Agent — its 32px avatar and name on the header
line, at the mark size and gap every row below it leads with, then the **processed tokens it burned
over the last seven days** as the figure, that week's daily token totals as a sparkline beside it,
and one muted line, `Tokens · 7d`, naming what the figure counts. An Agent that is mid-turn spends that line on the step it is on and its elapsed time,
in accent. Pressing a card opens that Agent's DM, or its profile when it has no DM yet.

The metric is tokens rather than turns. A turn is the execution runtime's own bookkeeping, and ten
cheap turns read the same in a count as one long one; processed tokens are what the Agent actually
spent. They also already have a read: the Server-wide usage snapshot behind `useUsage`, sliced per
Agent by `summarizeAgentTokenUsage` — the same summarizer the Agent profile's usage tile uses. The
App keeps no turn-history read of its own.

The strip is not a roster. A Server can hold thirty-five Agents, and a card for every one of them is
a wall to scan rather than a thing to read. It carries only Agents that processed tokens in the
window or are in a turn now, working Agents first, then the busiest week, then the name, capped at
eight. When none qualify it says **No Agent activity this week**; while the usage read is unsettled
it shows nothing at all, because a partly-loaded set would rank Agents against zeroes and reorder
under the reader.

The remaining three sections share one grammar: the label above, and below it one bordered group
holding that section's rows with a separator between each pair. A quiet section says so in one muted
row inside that same box, so it keeps the section's shape rather than changing it to say so.

**Needs you** — work waiting on this human, as one list over two records:

- Open [Asks](../../specs/asks.md) addressed to me. The row states the Ask; the Ask's options are
  offered in the Thread the row peeks, where the whole Ask is readable.
- Claims an Agent took and stopped short of finishing.

They share a list rather than a card. As two lists in one group, the seam between them was the only
place in the section without a divider, and the reader could see the join.

A failed Server onboarding appears on the owner's setup screen. Until setup completes,
owners remain in setup and members and Admins remain on the waiting page, outside the Inbox.

Tasks are not here. Task tiers made a task the Agent's own ledger, the Tasks page already leads with
its **Needs your review** group, and an [Ask](../../specs/asks.md) is the record that addresses a
person — so `in_review` rows in the Inbox only made the section long enough that the Asks stopped
being the point.

**Conversations** — unread Chats, newest activity first: the Chat's identity and name, the last
message beside it, and the time and unread count trailing. The quoted line is flattened by the same
helper every other quoting surface uses, so a reference reads as `#product` and a visual reads as its
title. A Chat holding no message yet says so instead.

The author prefix is dropped when the row's own title already answers it. In a DM the peer Agent
speaks unattributed — `Tiny: Finished the audit` inside Tiny's own DM stated the name twice — and
only the viewer's own line is marked, as `You:`. A Channel keeps every name, because there the
author is the fact the reader is scanning for. `ChatLastMessage` carries no author id, so the match
is by display name; it is a presentation choice inside one row and never identity, and the worst a
collision does is drop or add a prefix.

**Happening now** — work running right now, whether or not this human started it, also as one list:

- [Cloud Agent work](../../specs/cloud-agents.md) queued or running anywhere on the Server I can
  see, led by its provider glyph: the title, the Chat and Agent it came from as its preview, and its
  status disc with the elapsed time trailing — `Running · 25m`.
- Agents currently in a turn, from the same data as the Agent activity strip
  ([Agent Activity](../../specs/agent-activity.md)), each stating its current step and how long it
  has been on it — `Editing files · 3m`. The snapshot carries one event per Agent, so that span is
  time in the current step; the run's own start is not part of this projection.

This is where background work that outlives an Agent turn stays observable.

## Row anatomy

Every row in every list is one `ItemCard`, one line tall, and reads left to right in the email-inbox
grammar:

- A 32px leading mark: the Agent's own avatar, a Channel's icon box, or a Cloud Agent provider
  glyph. It sits beside `ItemCard.Content`, not in `ItemCard.Icon`: an avatar is already a mark with
  its own ground, and that slot exists to give a bare glyph one.
- The **title**, which keeps its own width rather than shrinking, and truncates only past 40% of the
  line so one long title cannot take the preview's width with it.
- The **preview**, muted, filling whatever the title leaves and truncating first: an Ask's summary,
  a Chat's waiting line, the Chat and Agent behind a Cloud Agent work.
- The **trailing cluster**, which never wraps or shrinks: where the row came from and how it stands
  — an Ask reads `Ask · #onboarding-owner`, a stalled claim `#all · Task #3`, a Chat its time and
  unread count. No row carries a control, so every row in the column ends on the same right edge
  and every one of them is exactly one line tall.

An Ask leads with the asking Agent's face, not a question glyph, so every row in the section shares
one identity grammar. The row is composed from `ItemCard`'s own parts in
[`inbox-row.tsx`](../../apps/website/src/features/servers/inbox/inbox-row.tsx), and carries no height
of its own: the card's padding around a 32px mark is the band, which measures 54.5px at the app's
spacing scale. The theme layer holds exactly two Inbox rules — the section header's inset, and the
description's stacked-line offset, which comes off because the description sits beside the title
here rather than under it. The 40px band the list this replaced pinned, and the rules that undid the
component's spacing to fit it, are gone.

Pressing anywhere on a row opens it. The card itself is the press target — `ItemCard`'s own
Pressable composition, rendered as a `button` with `PressableFeedback.Highlight` inside it, the same
shape the week cards in the strip use. It takes the tab stop, carries the row's title as its
accessible name, and shows an inset `:focus-visible` ring. Nothing nests inside it: a row that acts
would need the target underneath and the control lifted above, and no row acts.

## Current stub

The page is live at `/s/:slug/inbox`. An Ask row peeks its Thread over the Inbox at
`?ask=<messageId>`, showing that Thread's shared answer card under the Ask itself, with the options
in the Agent's own order, the first emphasized and every label carried verbatim — the one-press form
of the reply a person would otherwise type, and the only place an Ask can be answered without
typing. Pressing one sends exactly its text; one press spends the row. An Ask with no options is an open question and
shows only the composer. The options ride the same open-Ask read the section does, so an Ask
answered elsewhere takes them, the peek, and the row with it; a Cloud Agent work row peeks its conversation at `?work=<messageId>` — the same
Thread timeline the Chat opens, work card and all; a stalled claim opens the task on the Tasks page;
an Agent row in **Happening now** opens that Agent's page.

A **stalled claim** row is where a person learns that an Agent took work and dropped it, because
[Chat hides an Agent's own claims by default](tasks.md). It is composed from the same `task.list`
read the section already makes — a task with `origin` `claimed`, status `in_progress`, tier
`tracked`, and `live` false, meaning its run settled without answering and no reply is coming — and
reads as the Agent's avatar, `Blippy stopped before finishing`, what was asked as its preview, and
the Chat and task number trailing.

One source has no Server list procedure yet and is absent until it does: followed Threads
(**Conversations**).

## Rules

- A settled, empty section draws a **slot**: inside the same frame its rows would share, one
  dashed outline exactly one row tall, carrying the short fact in muted text (`Nothing needs you.`,
  `Nothing running.`). The week strip has no frame, so its slot rides the card track bare and the
  still week keeps the filled week's frameless shape. It is the outline of the row that is missing, so it says where the next one
  lands as well as that none is there. It is deliberately not a filled block — a filled block that
  moves is a skeleton, and a skeleton promises a load that is already finished. Its slow breath
  (a quarter of opacity over 4.5s) is off under `prefers-reduced-motion`.
- Rows **animate in place**. A row arrives on a fade and a few pixels of upward settle, leaves on a
  fade as its neighbours close the gap, and slides when the list reorders under it, on one calm
  spring with no bounce. Because the slot is exactly one row tall and shares the rows' frame, the
  first arrival takes the slot's box without the section changing height. The week strip animates
  its cards the same way, with its slot and its cards inside one presence so the last card leaving
  and the slot arriving are the same exchange. Under `prefers-reduced-motion` every one of these is an instant swap.
- A section stays blank while its reads settle. An unsettled query is not an empty collection, so
  nothing is claimed — and nothing flashes — on the way there. This holds for the header, which
  waits for the name it greets, and for the week strip, which waits for the usage snapshot rather
  than ranking against zeroes.
- The page updates from the durable events the underlying records already emit — `ask.updated`,
  `task.updated`, `cloud-agent-work.updated`, Agent activity and lifecycle, and `message.created` —
  through the existing invalidations. The Inbox adds no event of its own. The strip's token figure is
  the exception that needs none: it rides the usage snapshot's own freshness, the same one every
  other usage surface reads, while the live step on a card still comes from Agent activity.
- The Inbox owns no read state. Unread counts come from `chat_reads`; open and answered come from
  the Ask, Task, and work records. Opening the Inbox marks nothing read.
- The Inbox adds no store, no cache, and no page-local lifecycle. Authorization is the ordinary
  Server membership and Chat access of each projected record.
- iOS mirrors this page, and the sections and their ordering above are the contract it mirrors:
  the same header, the same **Active this week** strip, and the same three lists in the same order,
  reading the same Server records through Store-owned snapshots
  ([Haus for iPhone](../internals/ios.md)). **Happening now** is where Cloud Agent work gets its
  first iPhone presentation. A stalled claim deep-links to its own task on both surfaces: the App
  through `?task=`, the phone through a focused Task list that scrolls to the row and widens the
  background lens when it has to. One row differs, because the phone has nowhere else to send it: an
  Agent row in **Happening now** opens that Agent's DM rather than a profile page, which the phone
  reaches from a Chat instead. The iPhone Inbox is also the cold-start
  landing screen there, which the App has no counterpart for.
