---
summary: The human Inbox page — a sidebar lens over the day, every unread Chat and Thread as an open card (its newest waiting message, the conversation's own composer, Mark read) with one selected for the J/K/E/R/Return keys, the week's Agents as a strip of token chips with a spike flag, and live Agent work — plus the one rule for desktop, web, and iPhone message notifications.
read_when:
  - changing the Inbox page, its sections, empty states, Mark read, or realtime invalidation
  - changing the Unread feed, its cards, their composers, the selection, or the keyboard keys
  - changing what counts as unread, the sidebar Inbox badge, or the iPhone badge
  - changing who a new message notifies on desktop, web, or iPhone
  - deciding where background work that outlives an Agent turn becomes visible to humans
---

# Inbox

The Inbox is a Haus App page in the sidebar. Its row is the sidebar's anchor — first in the
Inbox/Search/Tasks menu. What it wears there follows the surface: on the web the Haus ghost mark
leads the titlebar strip above — named "Haus", so it does not repeat this row's name one tab stop
earlier — and the row takes the inbox glyph at the same measure Search and Tasks do; on the macOS desktop the traffic lights lead that strip, so the mark stays on this row.
The row badges how many Chats are **Unread** in the same count chip the Channel and DM rows wear
for unread messages, and shows nothing when nothing is unread. It shows one human what they need to
know right now ([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)).

The Inbox is a lens, not a store. It owns no state of its own, creates no records, and duplicates no
lifecycle. Every row projects an existing Server record and links to that record's canonical place —
a Chat, a Thread, or an Agent profile.

The agent-side concept with a similar name is the [Agent inbox](../../specs/inbox.md), the durable
delivery ledger that wakes Agents. Say "Agent inbox" wherever the two could be confused.

## Layout

The page opens on a header with no card: the greeting that names the reader, set at the same
page-title step every settings page opens with, and the weekday and date beneath it. The greeting
follows the reader's clock in three buckets (morning before noon, afternoon before 6 pm, evening
after) and reads "Good morning, Zach" by default. A color theme may bring its own line pools
per bucket (`ColorThemeDefinition.greetings` in `lib/color-themes.ts`); Halloween's are a
haunted-house host's welcomes. A pool line is picked by hashing the local date and bucket, so it
holds through the bucket and across reloads and changes day to day; `{name}` becomes the first
name (`inbox-greeting.ts`). The costume is in the words alone: the header adds no mark, since the
sidebar's Inbox row already wears the theme's mascot. Under the header sits **Unread**, the feed
([ADR 0050](../adr/0050-the-inbox-renders-what-is-waiting.md)).

The page is one column that scrolls as one, at every pane width (`inbox-layout.ts`). The week's
Agent activity is a **strip** on the greeting's line, at its trailing edge; when the pane is too
narrow for both, it wraps under the greeting. It draws nothing until its reads settle, and the
greeting sets the line's height, so its arrival moves nothing below it. One owner
(`InboxActiveAgents`) reads the Agent and Happening now data. A 19rem rail of **Agents** over
**Happening now** used to stand beside the feed; with the sidebar it gave the page one column too
many, and it is gone at every width
([ADR 0050](../adr/0050-the-inbox-renders-what-is-waiting.md)).

The page runs up under the band (`PageBand overlay`): the band paints over the page and the
page's frame rises behind it, so scrolled content is cut off at the shell's top edge — the window
top on the web, the shell card's border on desktop — rather than at the band's bottom. The
column's top inset adds the band's height, so nothing moves at rest. The frame carries the
transcript's own top edge band (`.transcript-edge-blur`), solid through the band's top third and
ramping out exactly where content starts at rest, so the trail stays legible over whatever slides
under it and the band covers nothing while the page sits at its top.

The page fills the shell band the way Settings does: every band's trail leads with a **Haus**
crumb linking back to the Inbox, and the Inbox band reads **Haus › Inbox** with the current page as
the trailing crumb. With the band saying where you are, the greeting opens the page at the ordinary
top inset below the band on every surface, rather than rising into it; only scrolled content
travels up under the band.

All sections share one composition, `ItemCardGroup`'s own: a transparent group whose
`ItemCardGroup.Header` carries the label at the page column's left edge, and whose body is what the
label names. Every label is therefore the same type at the same edge
([`inbox-section.tsx`](../../apps/website/src/features/servers/inbox/inbox-section.tsx)).

The title used to sit inside the bordered box with a borderless divided list nested under it — a
hybrid that drew a rule between every pair of rows but none under the heading they belonged to, and
that needed CSS to undo the nested list's own spacing. Label outside, box below is HeroUI's own
usage grammar and the one the strip already had.

## Sections

**Agents** — the full list behind the strip's `+N` — ranks every Agent that processed tokens in
the last seven days or is in a turn now:
spiking first, then working, then the busiest week, then the name, with no cap. Each row is the
Agent's avatar and name, its seven-day processed tokens (`Tokens · 7d` trails the label), a meter
sized against the busiest Agent, and that week's daily totals as a sparkline; a working Agent adds
its current activity in accent. Pressing a row opens the Agent's DM, or its profile when it has no
DM yet. Tokens, not turns: processed tokens are what an Agent actually spent, and they already have
a read — the Server-wide usage snapshot behind `useUsage`, sliced per Agent by
`summarizeAgentTokenUsage`. While that read is unsettled the list shows nothing, because a
partly-loaded set would rank Agents against zeroes and reorder under the reader.

The list is the Inbox's runaway meter. An Agent **spikes** when today's tokens reach five million and
at least three times the median of its prior seven days (`agentSpike` in `active-agents.ts`; days
before its first use that week are left out of the median, and an Agent with no prior use spikes
on the floor alone, labeled `Unusual`). A spiking row takes the warning ground and a warning chip
such as `3.1× usual`, and ranks first.

The **strip** is one compact line straight on the page, in no box of its own. A muted
`Tokens · 7d` says what the numbers count, then the top five Agents follow as chips: a bare face
(no presence dot) and the seven-day total, a spiking one in soft warning with an up arrow. Ranking
puts a runaway first, so a spiking chip is never the one folded away. A `+N` button opens the full
Agents list in a popover; with five or fewer Agents the chips are the whole list and there is no
`+N`. A `N running` button at the strip's end opens Happening now in a popover, and is absent when
nothing runs. The strip used to sit in a grey `secondary` card, a third material between the page
and the cards that the spiking chip's warning tint clashed with, and its numbers carried no label.

Every section shares one grammar: the label above, and the rows below it. Agents and Happening now
hold theirs in one bordered group with a separator between each pair, inside their popovers;
Unread sets its cards on the page (below). A quiet section says so in one muted row-shaped slot, so it keeps the section's shape
rather than changing it to say so.

**Unread** — every Channel, DM, and Thread with something the viewer has not read, newest
activity first, one row each. A Channel or DM row is `chat.list`'s `unreadCount` above zero: its
own messages from others above the viewer's read marker. A Thread is unread on its own, never
through its parent ([ADR 0043](../adr/0043-threads-are-unread-on-their-own.md)): a Thread row is a
`thread.listUnread` row, a Thread with replies from others above the viewer's Thread marker that
the viewer follows or that mention them. There is no attention tier above it — no "unanswered" state and no Done marker
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). An Agent asks a person by @mention,
inline reply, a Thread on their message, or their DM
([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)); that question is unread here like
any other message, and it notifies them (see [Notifications](#notifications)).

Unread is a **feed of open cards** ([ADR 0050](../adr/0050-the-inbox-renders-what-is-waiting.md)):
every unread Chat and Thread is a card of its own, set straight on the page in a transparent stock
`ItemCardGroup` a few pixels apart, with no box around them and no dividers, so each card is one
outline rather than an outline inside another. Nothing expands or collapses. A card takes the
theme layer's feed-card fill and edge (`--feed-card`, `--feed-card-shadow`, keyed as
`.inbox-unread-row`): in light mode `--surface` with the resting `--surface-shadow`; in dark mode
one quiet step off the page (`--background-secondary`) with a faint rim, because a dark card on
`--surface` — the composer field's own fill — swallowed the field inside it. A grey
`--surface-secondary` fill read wrong on the light shell. Each card reads, top to bottom:

- Its **source line**: the place's mark and name (the one control that opens the conversation; a
  Chat opens scrolled to the card's message and flashes it), a
  muted note (`DM`, or the message a Thread hangs off, `on Beacon: Thursday Christmas check…`),
  then the time, **Mark read**, and the count.
- Only the **newest waiting message**, rendered exactly as the transcript renders it
  (`TranscriptEntryView`, agent avatars and all), read-only. A long one is clamped inside a
  clipping box that fades where it cuts, with **Show more** under it; the transcript's own
  rendering is never restyled to clamp it. **N earlier** above it first reveals the other waiting
  messages the preview carries, in place; once those show, the older counted messages open the
  conversation at the oldest of them, with the older ones just above.
- The conversation's own **composer**, always there to type into: the stock `ChatComposer` in the
  Chat view's `primary` shell with the conversation's draft key (an Agent DM keys by its Agent, a
  Thread by its anchor), so a draft started here waits there and the other way round. A Thread
  card's says `Add a reply…` and is addressed as the Thread view's (`Message Thread — #all`). An
  archived Channel or a retired Agent's DM shows none, as the Chat does. Every card mounts one;
  its only Server read (`chat.mentionOptions`) waits until "@" is typed, and drafts are local, so
  a feed of composers adds no request per card.

**Exactly one card is selected**, marked by a ring (`--feed-card-ring`, keyed as
`.inbox-unread-selected`) that eases from card to card; selecting never moves a card. The first
card is selected on arrival. Focus moving into a card — typing in its composer, tabbing to its
controls — selects it and leaves the cursor where the reader put it. The selection stays on its
card while newer activity reorders the list around it, and when that card leaves — read here or
anywhere else — the card that slid into its place is selected. **Mark read** and a **reply** each
read the card and select the next one (the one above, when it was last), so the list is worked
from the top down like a queue.

The composers do not take focus on their own (`autoFocus={false}`, which also keeps a kept tab's
reveal from refocusing them). A Chat's composer is where that view's keys go, but here every card
mounts one on load, and a self-focusing editor would steal the cursor from the page and swallow
the keys that move the selection.

**Keys** (`use-unread-triage-keys.ts`) answer only while focus is on the page itself or inside the
list — never in a composer or any other field, never in a dialog, never with a modifier held,
and only while the Inbox is the view on screen: **J** and **K** move the selection down and up,
**E** marks the selected card read and selects the next, **R** puts the cursor in its composer, and
**Return** opens its conversation (Return on a focused button is that button's own press). The
section's label carries the hint `J / K move · E mark read · R reply` at its trailing edge, hidden
on a touch pointer. A move made from inside the list carries focus onto the newly selected card's
name, so the keyboard stays in the queue; one made from the page leaves focus where it is.

**Opening a card** (its name, Return, or **N earlier** past the preview) goes to the conversation in
the Inbox's own tab, on desktop as on the web; Command-, Shift-, and middle-click still open a new
tab ([ADR 0046](../adr/0046-the-sidebar-goes-pages-open-to-the-right.md)). A Chat opens scrolled to
the card's message and flashes it. Back returns to the Inbox with the selection where it was — on
the card that took the read card's place — scrolled into view.

The messages come from one read, `chat.unreadPreviews({ serverId })`
(`packages/haus-api/src/chat-unread-preview.ts`): each unread Chat's and Thread's newest counted
messages, oldest first, how many are older, and a Thread's anchor, filtered by the same predicates
as `chat.list`, `thread.listUnread`, and the badge. A card never reads messages of its own; a page
of cards each reading a transcript is the request burst that wedges a Server. The feed paints
nothing until the preview has settled as well as its rows, so the cards and their messages land in
one frame instead of each card growing a beat later; hovering the sidebar's Inbox row prefetches
the read. A card the settled preview does not name yet (it arrived a moment before the refetch
that will) quotes the fallback line below.

That fallback line is flattened by the same helper every other quoting surface uses,
so a reference reads as `#product` and a visual reads as its title. A Chat holding no message yet
says so instead.

The author prefix is dropped when the card's own title already answers it. In a DM the peer Agent
speaks unattributed — `Tiny: Finished the audit` inside Tiny's own DM stated the name twice — and
only the viewer's own line is marked, as `You:`. A Channel keeps every name, because there the
author is the fact the reader is scanning for. `ChatLastMessage` carries no author id, so the match
is by display name; it is a presentation choice inside one card and never identity, and the worst
a collision does is drop or add a prefix.

A card **clears** when the viewer reads the Chat — opening it while Haus is visible and focused —
presses **Mark read** (or **E**), or replies from the card. Seeing a card in the Inbox never reads
it, so a card never leaves while it is being read. A reply reads the Chat or Thread as its send starts;
a failed send keeps its draft in that conversation's composer. Mark read on a Channel or DM row reads the Chat through its newest
message and every Thread under it, so that Chat's Thread rows clear too; Mark read on a Thread row
reads that Thread. Newer activity brings a row back.

Stalled claims are not here. A claim an Agent took and stopped short of finishing belongs to the
Tasks page, in its **Stopped before finishing** group after **Needs your review**
([Tasks](tasks.md)).

A failed Server onboarding appears on the owner's setup screen. Until setup completes,
owners remain in setup and members and Admins remain on the waiting page, outside the Inbox.

**Happening now** — work running right now, whether or not this human started it, also as one list:

- [Cloud Agent work](../../specs/cloud-agents.md) queued, running, or waiting on an answer
  (`Needs input`) anywhere on the Server I can see, led by its cloud agent key (a terminal badged with its provider's logo): the title, the Chat and Agent it came from as its preview, and its
  status disc with the elapsed time trailing — `Running · 25m`.
- Agents currently in a turn, from the current Agent activity projection
  ([Agent Activity](../../specs/agent-activity.md)), each stating its current activity and total
  elapsed time for the turn, such as `Editing files · 3m 12s elapsed`. The clock ticks every second
  from the Server's recorded turn start and survives step changes, reloads, and reconnects.
  Safe tool display names appear when available; unknown tools stay `Using a tool`.
  If the turn start is unavailable, the row shows activity without a timer.

This is where background work that outlives an Agent turn stays observable.

## Unread card anatomy

Every Unread card is an `article` named for its place, holding its source line, its message, and
its composer ([`unread-triage-row.tsx`](../../apps/website/src/features/servers/inbox/unread-triage-row.tsx)).
The source line is one line in `ItemCard`'s own grammar
([`unread-row-header.tsx`](../../apps/website/src/features/servers/inbox/unread-row-header.tsx))
and reads left to right:

- A 24px **mark**, the sidebar's own: the DM peer's avatar (initials once the Agent is gone) or the
  Channel's icon box. A Thread card wears its parent's.
- The **name** (`#product`, `Tiny`, `Thread in #product`) in a fixed 10rem column, truncating
  inside it, so a feed of cards lines its notes up. It is the one control that opens the
  conversation: a text button, underlined on hover the way a transcript author's name is, with a
  `:focus-visible` ring, named for the place (`all`, `Thread in #all`).
- The **note** as `ItemCard.Description`, muted, filling what the name leaves and truncating first.
- The **trailing cluster**, which never wraps or shrinks: the time, Mark read, and the unread count
  at the right edge.

The theme layer holds one rule under `item-card--inbox-line`: the description sits beside the
title rather than under it, so it sheds the stacked-line offset and takes the title's size. The
row group's existing reset clears each row's own surface; `.inbox-unread-row` gives each card its
ground back, and `.inbox-unread-selected` adds the ring.

Rows in the Agents and Happening now lists stack a title over a subline instead, because a popover
is narrow; each is a pressable `ItemCard` with a 32px mark (`inbox-list-row.tsx`). A Cloud Agent
work row's trailing status disc is 16px, the app's icon size.

## Current stub

The page is live at `/s/:slug/inbox`. An Unread Chat row opens its Chat at
`/s/<slug>/chats/<chatId>`. An Unread Thread row is titled by its parent (`#channel`, or
`DM`), quotes the newest counted reply (never the viewer's own) as
`<author> replied in thread: …`, and opens the Thread itself — its page on desktop, its Chat
with `?thread=<anchorMessageId>` on the web — landing on the first unread reply, as every Thread
open does while the Thread is unread. A reply already in view from the Thread's start stays put
with the anchor; one below the fold scrolls up to sit clear of the top fade, with the reply
before it in view. A Cloud Agent work row opens its `location`: the launch work Thread
when the viewer can read it (peeked at `?work=<workId>`, the same Thread timeline the Chat
opens, work card and all), otherwise the newest linking Message the viewer can see, in its Thread
when it has one; an Agent row in **Happening now** opens
that Agent's page.

Chat rows come from `chat.list({ serverId })` and Thread rows from
`thread.listUnread({ serverId })` (`packages/haus-api/src/thread-unread.ts`). Mark read on a Chat
row is `chat.markRead({ serverId, chatId, sequence: lastMessageSequence, includeThreads: true })`
(`packages/haus-api/src/chat-read.ts`); on a Thread row it is the same procedure with the Thread's
`threadChatId` and `lastMessageSequence`, without `includeThreads` — what an open transcript or
Thread sends. It zeroes the Chat's count in the cached `chat.list` and drops the Thread rows it
reads from the cached `thread.listUnread` at once, and reconciles on the refetch
([`use-mark-chat-read.ts`](../../apps/website/src/hooks/servers/use-mark-chat-read.ts)). Viewing
a Chat or Thread through its newest message clears its row the same way
([`chat-read-cache.ts`](../../apps/website/src/hooks/servers/chat-read-cache.ts)). The sidebar's
Inbox badge counts the same rows
([`unread-rows.ts`](../../apps/website/src/features/servers/inbox/unread-rows.ts)).

## Notifications

One rule decides who a new message notifies, and it is independent of the Inbox
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). A human is notified about a message
they did not write when it is in a DM they belong to (directly or in a Thread on it) — every
message — or, in a Channel or Thread, when it @mentions them, inline-replies to their message, or
sits in a Thread anchored on their message. `messageNotificationReason` in
`packages/haus-api/src/message-notification.ts` is that rule, over the facts `message.created`
carries; the Server and the App both call it. Reading a Chat clears it from the Inbox but never
stops the next notification; only a message already read is not notified.

- **Desktop (Electron) and web** apply the rule to the `message.created` events their Chat event
  stream delivers, and use the platform `Notification` API while the window is hidden or
  unfocused. Only a message that passes is read for its text. The title names the author, plus
  the place outside a DM (`#product`, `#product › thread`, `DM › thread`); the body is the
  message as one line. Clicking it focuses the window and opens the conversation (or Thread).
  Notifications are tagged by Chat, so a newer one replaces the older, and each message notifies
  once. Only live events notify: a cold stream starts at the event head, and a reconnect's
  catch-up replay refreshes caches without notifying, so messages that arrived while the App was
  asleep or offline are the Inbox's to show. A message whose Chat has since been read through it
  never notifies.
- With several tabs open on the same Server, one tab (elected through a Web Lock) notifies, so
  each message notifies once per browser. The Electron app and a browser each notify separately.
- Permission is requested only from the notifications toggle in Settings, never on page load.
  With the toggle off or permission denied, nothing is shown.
- **macOS** keeps the app running when its last window closes: closing hides the window, and
  Cmd+Q or the menu's Quit quits. Notifications therefore keep arriving with no window open.
- **iPhone** gets an APNs alert, even while Haus is closed, for every message the rule names: one
  push per human per message, to each device they registered, if they can still see the Chat. A
  push waits about 4 seconds and is skipped if the human has read the message by then anywhere —
  typically a focused App window that has the Chat (or the Thread) open. The
  title is the author, plus ` in #channel` outside a DM; the body is a plain-text preview cut to
  180 characters; the badge is the human's unread Chats plus unread Threads across every Server —
  the same count the sidebar badge shows per Server, summed. The app sets its icon from the same Server count
  (`chat.unreadChatCount`), so a badge never shrinks when the app opens. Pushes group by conversation and collapse by message id, and a
  tap opens the conversation (or Thread). The human's own messages, Chats they cannot see, and
  archived Chats never push. The Server sends only when an APNs key is configured; see
  [iPhone Push](../operations/ios-push.md).
- **iPhone Focus**: a push tells iOS why it addresses the human. A DM breaks through a Focus when
  its sender is an allowed person; in a Channel or Thread, only a mention of the human or a reply
  to their message does (for an allowed sender). Haus never marks pushes Time Sensitive.

Deferred until the operator provides credentials: browser Web Push while Haus is closed (a VAPID
key pair and a service worker). A closed browser tab learns about new messages only when opened.

## Rules

- A settled, empty section draws a **slot**: inside the same frame its rows would share, one
  dashed outline exactly one row tall, carrying the short fact in muted text (`All caught up.`,
  `Nothing running.`). It is the outline of the row that is missing, so it says where the next one
  lands as well as that none is there. It is deliberately not a filled block — a filled block that
  moves is a skeleton, and a skeleton promises a load that is already finished. Its slow breath
  (a quarter of opacity over 4.5s) is off under `prefers-reduced-motion`.
- Rows **animate in place**. A row arrives on a fade and a few pixels of upward settle, leaves on a
  fade as its neighbours close the gap, and slides when the list reorders under it, on one calm
  spring with no bounce. Because the slot is exactly one row tall and shares the rows' frame, the
  first arrival takes the slot's box without the section changing height. Selecting a different
  Unread card is not a reorder: only the ring moves, as fast as J and K press. Under
  `prefers-reduced-motion` every one of these is an instant swap.
- A section stays blank while its reads settle. An unsettled query is not an empty collection, so
  nothing is claimed — and nothing flashes — on the way there. The header reserves its greeting
  line while the name resolves, with the known date underneath. The week strip waits for the
  usage snapshot rather than ranking against zeroes. Page chrome and section labels load with
  the Server shell; the section bodies can arrive independently of navigation.
- The page updates from the durable events the underlying records already emit —
  `message.created`, `chat.read`, `cloud-agent-work.updated`, and Agent activity and lifecycle —
  through the existing invalidations; Unread is `chat.list`, refetched on `message.created` and
  `chat.read`. The Inbox adds no event of its own. The strip's token figure is
  the exception that needs none: it rides the usage snapshot's own freshness, the same one every
  other usage surface reads, while the live step on a card still comes from Agent activity.
- The Inbox owns no read state of its own. Unread counts live in `chat_reads`; running work comes
  from the work records. Opening the Inbox marks nothing read.
- The Inbox adds no store, no cache, and no page-local lifecycle beyond Mark read's optimistic
  removal. Authorization is the ordinary
  Server membership and Chat access of each projected record.
- iOS mirrors this page's sections and their order: the same header, the week's Agents, and the
  same two lists in the same order. It still shows the Agents as the older **Active this week**
  strip and Unread as one-line rows; the open cards, their composers and keys, and the token-chip
  strip of [ADR 0050](../adr/0050-the-inbox-renders-what-is-waiting.md) are App-only for now. It reads
  the same Server records through Store-owned snapshots
  ([Haus for iPhone](../internals/ios.md)). **Happening now** is where Cloud Agent work gets its
  first iPhone presentation. One row differs, because the phone has nowhere else to send it: an
  Agent row in **Happening now** opens that Agent's DM rather than a profile page, which the phone
  reaches from a Chat instead. The iPhone Inbox is also the cold-start
  landing screen there, which the App has no counterpart for.
