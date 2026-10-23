---
summary: The human Inbox page — a sidebar lens over the day, the week's most active Agents, every unread Chat (with Mark read), and live Agent work — plus the one rule for desktop, web, and iPhone message notifications.
read_when:
  - changing the Inbox page, its sections, empty states, Mark read, or realtime invalidation
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
sidebar's Inbox row already wears the theme's mascot. Under that sits the **Active this week** strip, and under that two full-width sections stacked in reading order —
**Unread**, **Happening now** — in the page column's own rhythm.

The page fills the shell band the way Settings does: every band's trail leads with a **Haus**
crumb linking back to the Inbox, and the Inbox band reads **Haus › Inbox** with the current page as
the trailing crumb. With the band saying where you are, the column is stock on every surface: the
greeting opens the page at the ordinary top inset, under the band, rather than rising into it.

They stack rather than split because a row is one line tall. Three-line rows made each section a
tall narrow thing, and two columns were how a 1152px page held them; a one-line row makes a section
a wide shallow one, and every part of that row — the title, the preview it leaves room for, and the
trailing meta — wants width. Splitting the page took width from all three at once.

All three sections share one composition, `ItemCardGroup`'s own: a transparent group whose
`ItemCardGroup.Header` carries the label at the page column's left edge, and whose body is what the
label names. Two of them put a bordered group of `ItemCard` rows there, divided by `Separator`;
the strip puts its cards there instead, because cards already carry their own edges. All three labels
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

The remaining two sections share one grammar: the label above, and below it one bordered group
holding that section's rows with a separator between each pair. A quiet section says so in one muted
row inside that same box, so it keeps the section's shape rather than changing it to say so.

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

A row carries the Chat's identity and name, the last message beside it, and the time and unread
count trailing. The quoted line is flattened by the same helper every other quoting surface uses,
so a reference reads as `#product` and a visual reads as its title. A Chat holding no message yet
says so instead.

The author prefix is dropped when the row's own title already answers it. In a DM the peer Agent
speaks unattributed — `Tiny: Finished the audit` inside Tiny's own DM stated the name twice — and
only the viewer's own line is marked, as `You:`. A Channel keeps every name, because there the
author is the fact the reader is scanning for. `ChatLastMessage` carries no author id, so the match
is by display name; it is a presentation choice inside one row and never identity, and the worst a
collision does is drop or add a prefix.

A row **clears** when the viewer reads the Chat — opening it while Haus is visible and focused —
or presses **Mark read**. Mark read on a Channel or DM row reads the Chat through its newest
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

## Row anatomy

Every row in every list is one `ItemCard`, one line tall, and reads left to right in the email-inbox
grammar:

- A 32px leading mark: the Agent's own avatar, a Channel's icon box, or a Cloud Agent provider
  glyph. It sits beside `ItemCard.Content`, not in `ItemCard.Icon`: an avatar is already a mark with
  its own ground, and that slot exists to give a bare glyph one.
- The **title**, which keeps its own width rather than shrinking, and truncates only past 40% of the
  line so one long title cannot take the preview's width with it.
- The **preview**, muted, filling whatever the title leaves and truncating first: a Chat's waiting
  line, the Chat and Agent behind a Cloud Agent work.
- The **trailing cluster**, which never wraps or shrinks: how the row stands — a Chat its time and
  unread count, a run its status. An Unread row adds one **Mark read** action at the trailing
  edge; no other row carries a control.

The row is composed from `ItemCard`'s own parts in
[`inbox-row.tsx`](../../apps/website/src/features/servers/inbox/inbox-row.tsx), and carries no height
of its own: the card's padding around a 32px mark is the band, which measures 54.5px at the app's
spacing scale. The theme layer holds exactly two Inbox rules — the section header's inset, and the
description's stacked-line offset, which comes off because the description sits beside the title
here rather than under it. The 40px band the list this replaced pinned, and the rules that undid the
component's spacing to fit it, are gone.

Pressing anywhere on a row opens it. The card itself is the press target — `ItemCard`'s own
Pressable composition, rendered as a `button` with `PressableFeedback.Highlight` inside it, the same
shape the week cards in the strip use. It takes the tab stop, carries the row's title as its
accessible name, and shows an inset `:focus-visible` ring. Mark read is the one row action; it sits
beside the press target rather than inside it, so no interactive element nests in another.

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
- iOS mirrors this page, and the sections and their ordering above are the contract it mirrors:
  the same header, the same **Active this week** strip, and the same two lists in the same order,
  reading the same Server records through Store-owned snapshots
  ([Haus for iPhone](../internals/ios.md)). **Happening now** is where Cloud Agent work gets its
  first iPhone presentation. One row differs, because the phone has nowhere else to send it: an
  Agent row in **Happening now** opens that Agent's DM rather than a profile page, which the phone
  reaches from a Chat instead. The iPhone Inbox is also the cold-start
  landing screen there, which the App has no counterpart for.
