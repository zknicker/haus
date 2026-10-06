---
summary: Agent chat experience — durable messages, artifacts, and channel/DM structure. Execution evidence stays outside the timeline.
read_when:
  - changing the main agent conversation experience
  - changing durable messages, composer behavior, or artifacts
  - changing the typing strip above the composer
  - changing channel/DM structure, archiving, or chat appearance
---

# Chat

Chat is Haus's primary workspace. Users talk to one or more agents and keep
the durable timeline as context. Agents speak only by sending messages
(`haus message send`); see [ADR 0014](../adr/0014-cli-is-the-agents-only-output-channel.md)
and [Agent Inbox](../../specs/inbox.md).

## In the box

* **Inline replies.** Reply references a message while keeping the response in the channel or DM.
  The composer shows the selected parent and a cancel action; the sent reference opens that parent
  in history. A reply that directly follows its author's own reply to the same parent drops the
  repeated reference, so an acknowledgment and its follow-up read as one answer; it is still a
  reply everywhere else. Reply in thread remains a separate choice. Agent attention follows the
  reply chain: the request's claimant receives follow-ups even when the human replies to their own request.
  Task completion preserves that attention. Ordinary channel messages and human unread counts
  retain their existing behavior. See [Agent Inbox](../../specs/inbox.md#inline-reply-attention).

* **Durable messages.** Every row is authored by a person or an Agent — Haus
  writes none of its own — and stays as history. The timeline carries
  conversation units only — messages, artifacts, notices, thread anchors — and
  nothing turn-shaped. See [chat-timeline](../../specs/chat-timeline.md).
* **Message reactions.** Emoji reactions are durable Server records attributed
  to the human or Agent actor. Messages hydrate their grouped reactions from
  PostgreSQL, and a reaction change reaches every client through the durable
  Chat event stream. Reactions follow the message's Chat/Thread access and
  archive lifecycle; they are removed with a deleted Chat aggregate. Humans
  react with any emoji text. An Agent acknowledges a human message that needs no
  reply (thanks, an ack, a sign-off) with one reaction instead of a filler
  message, choosing an emoji that fits the message's tone in its own voice. The
  Agent API accepts an Agent add only when it is exactly one emoji grapheme
  (flags, skin tones, and ZWJ sequences count as one; `normalizeReactionEmoji`
  in `packages/haus-api`), stores it fully qualified so `❤` and `❤️` group
  together, and still removes an older reaction that is not one emoji.
  Grouped reactions list in the order each emoji first arrived.
* **Sticker reactions.** The web app draws reactions as die-cut emoji stickers
  on a compact row under the message body, left-aligned with its text and never
  covering it: one sticker per reactor per emoji (two people's 👍 are two
  stickers), in the Server's order, 19px apart on one baseline so repeated
  emoji stay separate shapes, each leaning exactly 8° opposite its neighbour, and a "+N" chip past four. Hovering or focusing fans the pile and names each sticker's
  reactor; pressing a sticker toggles your own reaction with that emoji. A
  reaction that arrives live — a realtime `message.reaction.updated`, or your
  own add, which shows at once as an app-local pending sticker — stamps in with
  a landing burst on the new reactor's sticker only; history and reloads render
  at rest. That freshness is app-local state
  (`hooks/servers/fresh-reactions.ts`) and never touches durable chat data.
* **Why an Agent said something.** Anything an Agent was told privately stays
  out of the conversation. When a Trigger or reminder woke the Agent, its answer
  carries a **cause line** above the author line, shaped like an inline reply's
  parent line: a small lightning or clock avatar in the automation's color, then
  its title. Hovering previews the automation; pressing opens the owning Agent's
  Automations tab. When the answer is also an inline reply, the cause line
  replaces the reply line. A fire's Thread carries a context card with the payload
  or the anchoring note instead of the line. A fire or an assignment the Agent
  never speaks about leaves the conversation untouched. **A cause line outlives
  its automation.** Title, glyph, and summary are snapshotted onto the message,
  so a message whose Trigger, reminder, or fire has since been archived still
  says what woke the Agent; its hover card and context card then state only what
  the message remembers and drop the live facts and the way into Automations. See
  [automation provenance](../../specs/automation-provenance.md).
* **New Agent introductions.** Creation posts nothing. The creating Agent introduces
  the returned identity through ordinary `haus message send`, usually in `#all`.
  Its `@handle` mention opens the profile and its session stamp follows ordinary send.
  Historical `agent-created` Message bodies remain readable as provenance.
* **Message attachments and Threads.** Visible tasks use a compact, content-width attachment
  beneath their message before anyone replies. It opens the existing Thread destination without a
  zero-reply count. Once replies exist, one recessed Thread card holds the task metadata, hoisted
  Cloud Agent rows, reply count, and recent replies. Agent-claimed task metadata stays hidden when
  Show tasks in chat is off, including on cards with replies. Cloud Agent work is not an attachment:
  it renders as its full work card (below). These attachment rules apply to the web App.

* **Questions to a person.** An Agent asks a human by @mentioning them in an ordinary Message
  ([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)); the mention chip is the only
  transcript mark, and the question notifies them ([Inbox](inbox.md#notifications)).
  There is no question card, option buttons, or answered state.
* **Cloud Agent work.** A Message carrying
  [Cloud Agent work](../../specs/cloud-agents.md) reads as an ordinary Message followed by one
  work card — the same card in the Chat transcript and inside the Thread (below). The card is
  content-sized up to the in-chat card measure, never full transcript width, and carries every
  action inline; there is no detached overflow menu. The card has no Thread button: before any
  reply the Message's ordinary hover thread action opens the Thread, and once replies exist the
  ordinary Thread preview beneath the card is the way in and does not repeat the work's header.
* **Hoisted work status.** Each Cloud Agent inside a Thread gets a compact row
  beneath its anchor's Task header, showing provider, title, and status.
  Completed work remains visible. The Server's conversation-scoped work list
  supplies these rows, grouped by Thread anchor. The whole preview opens the
  Thread; individual work rows are not click targets.
* **The work card.** In the Chat and inside the Thread, the work Message renders as
  the Agent's own words followed immediately by the work card, in sequence
  right where the Agent handed the work off. The card is presentation of the
  same work through later prompts and status updates; it never moves to the end
  of the conversation. There is no pinned cloud section or carousel. It shows the
  Server-owned record, never a Chat row, and nothing on it is named after any
  one provider: the provider's own mark, the title with a status chip, the
  repository, a branch row carrying the branch the run wrote and `PR #<n>` when
  it opened one, a diff row of `<n> files changed` with additions in success and
  deletions in danger once the branch carries a pull-request snapshot, and one
  split button — **View PR** when there is a pull request and **Open in
  `<provider>`** until then, with Open in `<provider>`, Copy link, and Cancel
  run for Owners and Admins while the run is live behind the chevron. The
  Message's author line above the card says who delegated it and when, so the
  card carries no receipt. While the work runs, an activity row
  states its current `activity`, plus a `Last update <relative>` note when it
  has not reported for ten minutes; settled work drops the row. The Run report
  is not on the card: the branch, the pull request, and the diff are the
  evidence. Everything
  updates in place from `cloud-agent-work.updated`; the work never writes a
  second Message.
* **Hosted attachments.** Humans and Agents can attach files to hosted Server
  messages. The App streams human-selected bytes directly to that Server, and
  Agents upload through their scoped Server credential. The Server publishes
  the ready attachment and message atomically. The App renders authenticated
  compact image previews that open into a full image viewer. Download lives in
  the viewer and the image context menu. Attachments follow the message text; other files retain
  their filename/type/size card. A Thread reply stages its attachments in the
  parent Chat, because a first reply has no Thread yet; the Server accepts a
  parent-staged attachment on a Thread reply and re-homes it to the Thread the
  reply lands in.
  Attachment bytes never ride message-list payloads.
  Hosted attachments are not Chat artifacts.
* **Sending.** A human send is instant, and it looks sent. The draft leaves the
  composer the moment it is sent, the composer stays enabled for the next message,
  and an app-local pending message carries the text at the tail of the transcript
  until the durable message arrives. The pending row renders at full weight,
  through the same surface, grouping, and header the durable message will use, and
  wears no pending treatment of any kind — no dimming, no notice. It shares the
  durable message's transcript identity through the send nonce, so confirmation
  replaces the row's content without remounting it or moving anything on screen;
  the row carries the Server's own creation time as soon as the receipt names it.
  The only thing confirmation adds is the hover action island, which cannot anchor
  a reaction or a copy target until the message is durable.
  A failed send drops its pending message and keeps the failed content,
  attachments, and mention metadata available for recovery. Newer text entered
  while that send was in flight remains in the current draft; failed sends and
  newer work are recovered independently. Drafts are app-local and scoped to
  their Chat or Thread, with no restart persistence. Thread replies send the
  same way, including the first reply, whose pending row belongs to the anchor
  message until the Thread it creates exists. Pending rows are never written
  into durable chat history.
* **Typing.** A strip above the composer of every channel, DM, and Thread shows
  the Agents answering it as up to three 16px avatars and a three-dot pulse
  that respects reduced motion, aligned with transcript message text. It has no
  visible words; screen readers hear "Juniper is typing", "Juniper and Cove are
  typing", then "Juniper, Cove, and 1 other are typing".
  An Agent types while its accepted turn has read a human message here that is
  newer than its last answer, whatever the message says: no judgment
  that a message wants no reply hides work the Agent is doing. The Agent's
  final reply, sent with `haus message send --done`, clears it at once;
  acknowledgments and progress posts without `--done` keep it typing. Otherwise
  it clears when the turn ends, so a turn that reads a Chat and stays silent, or
  forgets `--done`, types until it settles. The strip's
  height is always reserved, so the composer never moves. Reloads and
  reconnects recover it from `chat.engagements`
  ([ADR 0035](../adr/0035-chat-engagement-shows-as-typing.md)).
  When an Agent appears in the strip, 🤔 launches from the dots once for that
  engagement; the run's own thinking activity adds no second one, and a later
  engagement, even by the same Agent, launches its own.
  Each time the engaging run starts a kind of work, a face launches from the
  dots on a short arc over the transcript and fades: reading files
  🧐, searching the web 🤓, browsing 🫣, editing files 😤, running a command 🫡,
  using a tool 🙂‍↕️, and any failure 😵‍💫. Haus bookkeeping — the Agent's own
  `haus` CLI calls and message checks — launches nothing. A `--done` reply into
  this Chat keeps that Agent's dots until the reply shows in the transcript (at
  most two seconds) and launches 😊 with it; a turn that read this Chat and
  settled without writing here launches 👀. Other kinds launch nothing, activity
  from the Agent's runs elsewhere never launches here, and at most one face
  launches per 350ms; extras are dropped. Reply, read, and failure faces skip
  that throttle but still start at least 200ms after another face, and the same
  face twice within 350ms shows once. Faces launch only while the Chat is in
  view: a face that arrives while the page is hidden is dropped, hiding the
  page clears faces in flight, and a face whose animation cannot start within
  half a second (a blurred, occluded window) is dropped rather than replayed on
  return. Reduced motion fades
  the face in place. Reasoning text never enters Activity
  ([ADR 0023](../adr/0023-agent-work-projects-as-activity-and-chat-engagement.md)).
  When the engaging run finishes a reasoning block, starts a real tool action
  (a command, a file, a web search, a tool; never `haus` bookkeeping), or finishes a command,
  search, page, or tool, a short phrase such as "Comparing the last three Bun releases", or a
  finding such as "The 72-hour pass costs €62", may appear in a glass bubble over that Agent's
  avatar. It wobbles in, holds five to seven and a half seconds depending on its length (about
  six for eight words), and leaves. Bubbles follow the work, not a clock: a request's first
  shows as soon as one is phrased; after that a new part of the work or a finding shows as
  it happens, at least 15 seconds after the last bubble (10 for a finding); and when the same
  work runs on with nothing new, a "Still …" line ("Still digging through the Bun changelog")
  shows once the strip has been quiet for 28 seconds, so a long turn never goes silent for much
  more than half a minute. A one-minute weather lookup shows two or three; a two-minute research
  turn about one per step. A message steered into a running turn starts its own count. The App
  also keeps bubbles at least five seconds apart (a sooner thought waits, the newest replacing
  one still waiting) unless it is that engagement's first; faces fly above it, and the
  engagement ending clears it. The same line again while its bubble is up keeps that bubble and
  restarts its hold, up to twelve seconds in all.
  Hovering the strip's avatars or dots with a mouse or pen brings back the
  engagement's latest bubble at any point, holds a live bubble past its own
  hold, shows a newer thought if one arrives meanwhile, and lets the bubble
  leave shortly after the pointer does. Hover never delays the next bubble,
  shows nothing before the engagement's first thought, never recalls a line
  from an ended engagement, and adds no tab stop; the rest of the strip stays
  click-through so it never blocks the composer.
  The phrase is the Server's Gemini 3.5 Flash-Lite rephrasing of a Codex title,
  a reasoning excerpt, or a scrubbed action description, in the terms of the
  message the Agent is answering ("Planning data retrieval" for a weather
  question reads "Checking the weather in NYC"), or of what a finished action
  returned; without Gemini it is the title or a local condensation, and an
  action shows nothing. Agent housekeeping — reading its memory or notes, checking its
  inbox, claiming tasks, deciding whether to reply, drafting its own reply —
  shows no bubble; reading or searching what the request is about (the
  checklist, the thread, the CI logs) is work and shows. A phrase reads like a
  thinking summary: plain words about what the work is about, never how it is
  done (no CLI, API, JSON, markdown, jq, or tags unless the person used the
  word), an -ing verb or a result the Agent found, no filler opener ("Next,",
  "OK,"; "Still" only on a still line), never "now", and the work rather than errors. It speaks in the
  Agent's own voice and never restates the request or says what the person wants
  or asked. A finding is said in plain words, never quoted from the output, and only when the output
  shows it; what a tool returned is scrubbed on the Computer (no credentials, environment
  values, emails, or paths), never sent for file reads, edits, secret stores, or Haus
  bookkeeping, and never stored. After a request's first line, choosing or testing the Agent's
  own tools shows nothing, and a line that repeats one already shown, or rewords an earlier
  "Still" line, is dropped.
  Thoughts are never stored or recovered
  ([ADR 0036](../adr/0036-agent-thoughts-surface-as-condensed-phrases.md)).
* **Composer overlay.** In channels, DMs, and Threads the composer floats over
  the transcript, which scrolls behind it and blurs out into the page background
  under a progressive edge blur. The transcript's end
  clearance, the bottom edge blur, and the jump-to-latest button follow the
  composer's measured height (including the typing row and an open reply bar),
  so the last message rests just above it.
* **Stopped Agent DM.** A DM with a stopped Agent keeps its composer, with a quiet
  line above it saying the Agent won't see new messages until it's started again;
  Owners and Admins get **Start** beside it. A paused Agent's DM shows nothing,
  because sending a message is what lifts the pause.
* **Scroll position.** Sending from the composer brings the conversation to the
  bottom, even when the human was reading older messages. Incoming Agent messages
  follow the bottom only when the reader was already following it. That choice
  survives backgrounding Haus and visiting Settings: returning catches up to the
  latest message for a reader at the bottom, or preserves their place in history.
* **Changed files.** A turn that creates, modifies, or deletes workspace files
  shows a "Changed N files" chip under the agent's reply, and the full
  per-file diff view. Selecting text in a diff or workspace file preview
  offers "Quote in chat", inserting the quoted lines plus a `haus://`
  source link into the composer — the universal review gesture.
* **Artifacts.** Code, images, files, diffs, documents, and charts render as
  durable outputs attached to messages.
* **Receipts.** Message creation is acknowledged by id. Sends return no
  turns — delivery to agents is planner-owned (see
  [Agent Inbox](../../specs/inbox.md)).
* **Channels and DMs.** Channels and materialized direct messages are durable
  Chat rooms. The sidebar also projects every active Agent as an implicit
  pairwise DM for the signed-in human, even before a Chat row exists. Opening
  that row is App-local and shows an empty DM without persisting a Server Chat;
  the App may still keep a transient in-memory draft scoped to that Agent.
  Agent DMs share the same header dropdown and right-click menus before and
  after the first message, including on the selected sidebar row. The sidebar
  row keeps its Agent identity as the Chat materializes, preserving an open menu. View agent
  profile works immediately; chat-scoped Tasks and Files remain disabled until
  the Chat exists. Opening these menus or the profile does not create a Chat. The
  first human send, Agent `dm:@<human-handle>` send, or Server activity that needs a
  durable message atomically materializes the canonical human-stint↔Agent Chat
  and message. Every materialized chat's actions menu offers its chat-scoped
  surfaces: View tasks opens the Tasks page filtered to the chat, and Files
  opens a side pane (a Files page on desktop) listing attachments from its messages. Channels render with
  a hash or chosen catalog icon and optional channel color. Opening a Server
  restores that Server's last visited Chat when it still exists, then falls back
  to `#all` or the first available Chat. A user can drag any part of a Channel
  row to reorder it, or use Space and the arrow keys while the row is focused. The App keeps that
  personal presentation order per Server on the current device; direct messages
  retain the Server list order.
  On the web, opening a chat shows a room topbar with the chat name and a "…"
  actions menu at its end. On desktop the chat's tab names it, so the page has
  no topbar band; the chat's actions live in the context menu of its sidebar row
  and of its tab (in one Channel or DM submenu). Every chat menu — the web
  "…", a sidebar row, a desktop tab's submenu — lists the same actions in the
  same order; a sidebar row adds Open first (and, on desktop, Open in new tab, the same
  open as Command-clicking the row), and Files appears there only on desktop, where
  Files opens as a page. Editing a channel is three separate
  decisions, each with its own dialog: Rename channel, Icon & color, and Agents,
  which carries the participant count. Archive and delete follow them for a
  regular channel. Users create channels in one New channel dialog that names
  the channel, picks its icon and color from a trigger inside the name field,
  and chooses its agent participants. Both dialogs choose Agents the same way:
  a search field adds one Agent at a time, and the roster below it lists only
  the chosen Agents, each with its own remove control. Adding the last available
  Agent closes the dropdown and disables the field. Removing an Agent enables
  the field again. A search with no matches shows an empty result while other
  Agents remain available.
  Archive channel is an Owner/Admin action for a regular channel. It hides the
  channel from the active sidebar without deleting history. Settings carries an
  Archived chats entry that opens the archived channel view (`/s/:slug/archived`), where
  a channel can be reopened or restored. An open archived channel shows an
  Archived badge and a restore bar in place of the composer. Its history,
  search results, deep link, and child Threads remain readable, but new
  messages, tasks, reactions, attachments, and reminder output
  in the aggregate are rejected. Archive cancels undrained
  Agent inbox work for the aggregate; already accepted turns cannot send back
  after the transition. Restore permits new work without replaying canceled
  envelopes.
  Delete channel is a separate irreversible Owner/Admin action guarded by the
  exact channel name. It removes the regular channel, child Threads, messages,
  tasks, reads, reactions, reminders, delivery rows, search state, attachment
  metadata, and attachment bytes. `#all`, DMs, and Threads have no independent
  archive/delete action. New workspaces
  start with no user channels. Each active Agent has one implicit sidebar DM
  per human Server member and Agents address those pairs by the human's Server
  handle. Pair DMs are not user-deleteable. Retiring the Agent removes its
  implicit row from active navigation. Any materialized durable
  Chat remains canonical history. Deleted Agents and departed humans stay visible
  on authored transcript messages with muted identity and a `DELETED` badge.
  There is no separate pinned-chat state.
  Right-clicking a sidebar chat or its topbar name exposes the same contextual
  actions without replacing the ordinary click target. Channel menus offer the
  rename, Icon & color, and participant dialogs (color is chosen only in Icon &
  color); DM menus link to their scoped tasks and Agent profile.
* **Message and Thread context.** Right-clicking a durable message offers copy,
  reply-in-Thread, and quick reactions. Agent messages additionally open Turn
  Details. A Thread header offers View in chat, Copy reference, and Follow/Stop
  following through both its name dropdown and its context menu. iOS carries the
  same Follow/Stop following action on the Thread screen's navigation bar.
* **Chat appearance and instructions.** Haus chats can carry durable channel
  color and trusted chat-specific agent instructions.
* **Offline catch-up.** Haus Server keeps chat history while the App is
  closed; the app reloads messages and their reactions from durable rows and
  refetches on reconnect.
* **Attention.** Agents join channels, follow threads, and mute channels
  themselves. A Channel mute suppresses that Channel's ordinary delivery while
  followed Threads keep delivering independently; a personal @mention pierces
  a Channel mute without unmuting it and restores an explicitly unfollowed Thread. Humans steer agent attention
  by asking in chat, not by muting on the agent's behalf — see
  [Agent Inbox](../../specs/inbox.md).
* **Agent profile.** Hovering an Agent's transcript avatar or chip shows its
  hover card; clicking opens the Agent's profile (a tab on desktop, the profile
  page on web) — see [ADR 0038](../adr/0038-destinations-open-as-tabs.md).
  The chat's right pane holds only artifact, files, and thread panes, which
  share one visible slot and width per chat; the latest opener wins without
  clearing another pane's state. Desktop renders no chat side pane: every
  Thread opener (reply counts, Thread cards, Reply in thread, Inbox and
  notification links, `?thread=` and `?task=` links) opens the Thread page as
  a link, in split mode in the other pane — see
  [Desktop tabs](browser-tabs.md#where-things-open). Clicking the transcript name
  inserts an Agent mention, while the DM topbar name remains inert. Session
  resets stay agent-wide in Agent settings (specs/sessions.md) and draw nothing
  in a chat. Execution evidence (turn
  status and Activity History) lives on the profile. An Agent message's Turn Details drawer may
  show its Server summary and, for Owners/Admins with an online Computer, relay the detailed local
  execution journal — see [Agent Activity](../../specs/agent-activity.md).
* **Stop.** Stop is agent-scoped, not chat-scoped: it interrupts the agent's
  current turn and clears its queued backlog wherever it is running.
* **Dismissal.** Failed-turn banners can be dismissed with a hover X. The
  dismissal soft-deletes the durable Server row — sequence slots
  and history records are retained, and the result syncs to every client.

## Timeline inputs

The timeline combines three inputs:

| Input | Owner | Role |
| --- | --- | --- |
| Durable messages | Haus Server | Canonical timeline rows |
| Artifacts | Haus Server | Rich renderable outputs |
| Optimistic local rows | Haus App | One-frame accepted-message handoff |

Rendering rules:

* key user and assistant rows by durable message id
* key artifacts by artifact id
* reconcile optimistic rows by durable message id
* recover reloads from Server messages and artifacts

## App Data Flow

The app reads chat list and detail data separately. `chat.list` is the
lightweight ordered list contract for Haus sidebars, overviews, and chat
pickers. Agent pages use `agent.chats.list` when they need the combined Haus
and external runtime chat inventory.
`chat.get` is the focused detail read for a materialized chat. Timeline rows come
from `chat.log.list` — durable messages and artifacts, paged by message
sequence. When a user opens a Chat from the sidebar, the route renders that
selected `chat.list` record immediately while `chat.get` loads, so the Chat
surface never drops out between selections.

Every `chat.list` record carries `lastMessage`: the newest top-level message in
that chat as `authorDisplayName`, raw markdown `content`, and `createdAt`, or
null when the chat holds no message or its author no longer resolves to a name.
Thread replies live in the thread's own chat, so they never become the parent
chat's last message, and the author name resolves exactly as a message author
does in the chat timeline. The app already invalidates `chat.list` on
`message.created`, so the line refreshes with the timeline.

`chat.messages` returns chronological Message rows in a bounded window. With no
selector it returns the newest window; `beforeSequence` and `afterSequence` are
exclusive cursors for older and newer windows, and `aroundMessageId` returns a
centered window containing that Message. `nextBeforeSequence` and
`nextAfterSequence` are nullable, direction-specific cursors computed against
the active Chat and inline-reply filter, so callers can traverse either way
without gaps or duplicates.

## Chat Appearance

Channel icon and color are durable Haus chat metadata on the `Chat` record
(`icon`, `color`; both null on DMs and threads). `icon` names one entry from the
curated hugeicons catalog generated by
`apps/website/scripts/generate-channel-icon-catalog.ts` (about 1,600 solid
glyphs, one per icon family, chrome and brand families excluded); null renders
the default hash. That generator also reads
`apps/website/scripts/emoji-icon-map.ts`, the curated emoji table that keeps an
icon for every standard emoji concept a person might search for: it force-keeps
the icons named there past the family rules and folds each row's emoji
characters and search terms into that entry's keywords, so both "waving hand"
and a pasted 👋 find the glyph. That table is the place to add coverage, not the
catalog. `color` is a preset id from
`apps/website/src/components/chats/channel-color-options.ts`, which derives the
light and dark glyph and box tints; null renders a neutral translucent
foreground wash resolved in the theme layer, so the box stays visible on the
sidebar's own hover and current fills. Both are set from the appearance picker
inside the New channel dialog's name field, or from an existing channel's Icon &
color dialog. Both show the same control: one toolbar row that searches the
catalog, opens the color presets, and resets to the hash, with the icon grid
under it. The grid previews the channel rather than listing ink: every glyph
carries the color the channel would take, resolved on `channel-icon-swatches` in
the theme layer, and falls back to a muted foreground while no color is chosen.
It renders one screen of rows at a time — at full size the catalog cost the
dialog over a second of blocked main thread on open, and a few hundred
milliseconds on every keystroke and selection. They change only the channel glyph box in the sidebar, topbar, command
menu, rich-reference chips, and the Agent profile's chat list, and never affect membership, message
ordering, or archive behavior. The App loads the icon catalog as a lazy chunk and
shows the hash until it arrives. The iPhone app renders the same glyph and tint
from a bundled copy of that catalog's geometry — in its sidebar, chat header,
chat details, search results, and archived list — and shows the hash while that
resource loads or when the stored name is unknown. It has no appearance editor.
Haus chats can also carry trusted system
prompt text that Haus passes through Computer prompt composition for that
chat.

An offline Computer does not make Chat history unavailable. Pending work remains Server-owned until
the assigned Computer can receive it. The App may show optimistic local rows while a send is in
flight, but it never patches those rows into canonical history before acknowledgement.

## Contract

The deeper product contract lives in [Chats](../../specs/chats.md).
