---
summary: The human Inbox page — a sidebar lens over the day, the week's most active Agents, the DMs and @mentions that need you (with Done and desktop notifications), live Agent work, and unread conversation.
read_when:
  - changing the Inbox page, its sections, empty states, or realtime invalidation
  - adding a record that should ask a human to act or should stay observable between turns
  - changing Needs you rows, Done, or desktop/web/iPhone notifications for them
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
and one muted line, `Tokens · 7d`, naming what the figure counts. An Agent that is mid-turn spends that line on its current activity,
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

**Needs you** — conversations addressed to this human that they have not answered
([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)). An Agent asks a person by
@mentioning them, inline-replying to their message, answering in a Thread on it, or writing in
their DM; there is no separate
question record. A row is one
Chat — a DM, a Channel, or a Thread — holding at least one addressing message:

- **DM** (`reason: 'dm'`) — a message from someone else in a DM the viewer belongs to. Every
  unanswered Agent DM message counts, as in Raft.
- **Mention** (`reason: 'mention'`) — a Channel or Thread message whose content carries a
  `user://<viewerId>` mention ([Rich References](../../specs/mentions.md)).
- **Reply** (`reason: 'reply'`) — a Channel message that inline-replies to a message the viewer
  wrote ([ADR 0029](../adr/0029-inline-replies-preserve-conversation.md)), or any message from
  someone else in a Thread anchored on one (a Thread row). It reads like a mention, under its
  Channel's name. When a message both mentions and replies to the viewer, it is a
  mention; a row carries the reason of its newest addressing message.

The row carries the newest addressing message — its author, a plain-text preview, and its time —
plus how many addressing messages it stands for. It **clears** when the viewer replies where the
addresser will see it (the same Thread, the same DM, an inline reply in the same exchange, or a
later message in the same Channel that @mentions the author — a reply that reaches the author), or
presses **Done**. Done records the sequence it covered; newer addressing activity in that Chat
brings the row back, the same `throughActivitySeq` rule Raft's Inbox uses. Done also advances the
viewer's read marker to that sequence.

A Chat that has a Needs you row is left out of **Conversations**, so one conversation is never
listed twice.

Stalled claims are not here. A claim an Agent took and stopped short of finishing belongs to the
Tasks page, in its **Stopped before finishing** group after **Needs your review**
([Tasks](tasks.md)). Tasks are Agent work; when an Agent needs a person on one, it @mentions them
in the task Thread, and that mention is the Needs you row.

A failed Server onboarding appears on the owner's setup screen. Until setup completes,
owners remain in setup and members and Admins remain on the waiting page, outside the Inbox.

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
- Agents currently in a turn, from the current Agent activity projection
  ([Agent Activity](../../specs/agent-activity.md)), each stating its current activity and total
  elapsed time for the turn, such as `Editing files · 3m 12s elapsed`. The clock ticks every second
  from the Server's recorded turn start and survives step changes, reloads, and reconnects.
  Safe tool display names appear when available; unknown tools stay `Using a tool`.
  If the turn start is unavailable, the row shows activity without a timer.

This is where background work that outlives an Agent turn stays observable.

## Row anatomy

Every row in every list is one `ItemCard`, one line tall, and reads left to right in the email-inbox
grammar:

- A 32px leading mark: the Agent's own avatar, a Channel's icon box, or a Cloud Agent provider
  glyph. It sits beside `ItemCard.Content`, not in `ItemCard.Icon`: an avatar is already a mark with
  its own ground, and that slot exists to give a bare glyph one.
- The **title**, which keeps its own width rather than shrinking, and truncates only past 40% of the
  line so one long title cannot take the preview's width with it.
- The **preview**, muted, filling whatever the title leaves and truncating first: the addressing
  message, a Chat's waiting line, the Chat and Agent behind a Cloud Agent work.
- The **trailing cluster**, which never wraps or shrinks: where the row came from and how it stands
  — a mention reads `#onboarding-owner · 2m`, a DM its time, a Chat its time and unread count. A
  Needs you row adds one **Done** action at the trailing edge; no other row carries a control.

A Needs you row leads with the addressing author's face, so every row in the section shares one
identity grammar. The row is composed from `ItemCard`'s own parts in
[`inbox-row.tsx`](../../apps/website/src/features/servers/inbox/inbox-row.tsx), and carries no height
of its own: the card's padding around a 32px mark is the band, which measures 54.5px at the app's
spacing scale. The theme layer holds exactly two Inbox rules — the section header's inset, and the
description's stacked-line offset, which comes off because the description sits beside the title
here rather than under it. The 40px band the list this replaced pinned, and the rules that undid the
component's spacing to fit it, are gone.

Pressing anywhere on a row opens it. The card itself is the press target — `ItemCard`'s own
Pressable composition, rendered as a `button` with `PressableFeedback.Highlight` inside it, the same
shape the week cards in the strip use. It takes the tab stop, carries the row's title as its
accessible name, and shows an inset `:focus-visible` ring. Done is the one row action; it sits
beside the press target rather than inside it, so no interactive element nests in another.

## Current stub

The page is live at `/s/:slug/inbox`. A Needs you row opens its conversation: a DM or Channel row
opens that Chat at `/s/<slug>/chats/<conversationChatId>`, and a Thread row opens its conversation
with the Thread beside it at `/s/<slug>/chats/<conversationChatId>?thread=<anchorId>`. The reply
goes through the ordinary composer, and replying there clears the row. A Cloud Agent work row
peeks its conversation at `?work=<messageId>` — the same Thread timeline the Chat opens, work card
and all; an Agent row in **Happening now** opens that Agent's page.

The rows come from `inbox.needsYou({ serverId })`, and Done is
`inbox.markDone({ serverId, chatId, throughSequence })` with the row's `chatId` and
`latest.sequence` (`packages/haus-api/src/needs-you.ts`). Done removes the row optimistically and
reconciles on the refetch.

One source has no Server list procedure yet and is absent until it does: followed Threads
(**Conversations**).

## Notifications

A new or newer Needs you row notifies the viewer while Haus is in the background:

- **Desktop (Electron) and web** use the platform `Notification` API when the window is hidden
  or unfocused. The title names the author and the Chat; the body is the row's preview. Clicking
  it focuses the window and opens the conversation. A row notifies once per `latest.messageId`;
  Done and replies never notify.
- With several tabs open on the same Server, one tab (elected through a Web Lock) notifies, so
  each message notifies once per browser. The Electron app and a browser each notify separately.
- Permission is requested only from the notifications toggle in Settings, never on page load.
  With the toggle off or permission denied, nothing is shown.
- **macOS** keeps the app running when its last window closes: closing hides the window, and
  Cmd+Q or the menu's Quit quits. Notifications therefore keep arriving with no window open.

- **iPhone** gets an APNs alert, even while Haus is closed, for every message that newly tops one
  of the human's Needs you rows: one push per addressed human per message, to each device they
  registered. The title is the author, plus ` in #channel` outside a DM; the body is the row's
  plain-text preview cut to 180 characters; the badge is the human's Needs you row count across
  every Server. Pushes group by conversation and collapse by message id, and a tap opens the
  conversation (or Thread). The human's own messages, Chats they cannot see, archived Chats, and
  exchanges already answered or marked Done never push. The Server sends only when an APNs key is
  configured; see [iPhone Push](../operations/ios-push.md).
- **iPhone Focus**: a push tells iOS why it addresses the human. A DM breaks through a Focus when
  its sender is an allowed person; in a Channel or Thread, only a mention of the human or a reply
  to their message does (for an allowed sender). Haus never marks pushes Time Sensitive.

Deferred until the operator provides credentials: browser Web Push while Haus is closed (a VAPID
key pair and a service worker). A closed browser tab learns about Needs you rows only when opened.

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
- The page updates from the durable events the underlying records already emit —
  `message.created`, `chat.read`, `cloud-agent-work.updated`, and Agent activity and lifecycle —
  through the existing invalidations; Needs you refetches on `message.created` and `chat.read`.
  The Inbox adds no event of its own. The strip's token figure is
  the exception that needs none: it rides the usage snapshot's own freshness, the same one every
  other usage surface reads, while the live step on a card still comes from Agent activity.
- The Inbox owns no read state of its own. Unread counts and the Done marker both live in
  `chat_reads`; running work comes from the work records. Opening the Inbox marks nothing read.
- The Inbox adds no store, no cache, and no page-local lifecycle beyond Done's optimistic removal. Authorization is the ordinary
  Server membership and Chat access of each projected record.
- iOS mirrors this page, and the sections and their ordering above are the contract it mirrors:
  the same header, the same **Active this week** strip, and the same three lists in the same order,
  reading the same Server records through Store-owned snapshots
  ([Haus for iPhone](../internals/ios.md)). **Happening now** is where Cloud Agent work gets its
  first iPhone presentation. One row differs, because the phone has nowhere else to send it: an
  Agent row in **Happening now** opens that Agent's DM rather than a profile page, which the phone
  reaches from a Chat instead. The iPhone Inbox is also the cold-start
  landing screen there, which the App has no counterpart for.
