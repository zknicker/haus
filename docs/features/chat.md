---
summary: Agent chat experience — durable messages, artifacts, and channel/DM structure. Execution evidence stays outside the timeline.
read_when:
  - changing the main agent conversation experience
  - changing durable messages, composer behavior, or artifacts
  - changing channel/DM structure, archiving, or chat appearance
---

# Chat

Chat is Haus's primary workspace. Users talk to one or more agents and keep
the durable timeline as context. Agents speak only by sending messages
(`haus message send`); see [ADR 0014](../adr/0014-cli-is-the-agents-only-output-channel.md)
and [Agent Inbox](../../specs/inbox.md).

## In the box

* **Durable messages.** Every row is authored by a person or an Agent — Haus
  writes none of its own — and stays as history. The timeline carries
  conversation units only — messages, artifacts, notices, thread anchors — and
  nothing turn-shaped. See [chat-timeline](../../specs/chat-timeline.md).
* **Message reactions.** Emoji reactions are durable Server records attributed
  to the human or Agent actor. Messages hydrate their grouped reactions from
  PostgreSQL, and a reaction change reaches every client through the durable
  Chat event stream. Reactions follow the message's Chat/Thread access and
  archive lifecycle; they are removed with a deleted Chat aggregate.
* **Why an Agent said something.** Anything an Agent was told privately stays
  out of the conversation and shows up as a mark on the message's author line: a
  lightning or clock **fire mark** when a Trigger or reminder woke the Agent, and
  a **session mark** on the first thing the Agent says in a chat after its
  session was reset. The author line carries provenance only — what the message
  *is*, and anything with a lifecycle to follow, reads in the recessed Thread
  surface beneath it. Hovering a
  mark previews the automation or the reset — what it was, when, and where to
  manage it — and a fire's Thread carries a context card with the payload or the
  anchoring note. A fire, an assignment, or a reset the Agent never speaks about
  leaves the conversation untouched. **A fire mark outlives its automation.**
  Title, glyph, and summary are snapshotted onto the message, so a message whose
  Trigger, reminder, or fire has since been archived still says what woke the
  Agent. Its hover card and context card then state only what the message
  remembers — what fired, its cadence or kind, and when — plus one line saying
  the trigger or reminder has been archived, and drop the live facts (status,
  fire count, last fire, standing instruction, payload, anchoring note) and the
  way out to a record that is no longer there. See
  [automation provenance](../../specs/automation-provenance.md) and
  [sessions](../../specs/sessions.md#generation-in-the-transcript).
* **Agent-created announcements.** When an Agent creates an Agent with
  `haus agent create`, its `--say` text is the Message body and nothing is
  rendered beneath it. The announcement must name the new teammate by `@handle`,
  and that mention is the way to the profile — the same inline chip every other
  Agent mention gets, opening the Agent profile pane. The `agent-created` body
  kind stays as provenance; it is terminal, with no pending state, no approval
  control, and no second Chat receipt. The App never treats it as a Widget,
  visual fence, artifact, or model-authored form. Dropped realtime events
  recover through the ordinary message snapshot on reconnect.
* **Message attachments and Threads.** Open Asks, visible tasks, and Cloud Agent work use compact,
  content-width attachments beneath their message before anyone replies. They open the existing
  Thread destination without a zero-reply count. Once replies exist, one recessed Thread card holds
  the metadata, Cloud Agent summaries, reply count, and recent replies. Agent-claimed task metadata
  becomes visible with those replies even when Show tasks in chat is off. Answered Ask markers
  disappear, leaving the question and replies as ordinary conversation. Inside a Thread, Cloud Agent
  work keeps its full detail card. These attachment rules apply to the web App.

* **Ask markers.** An open [Ask](../../specs/asks.md) shows its glyph, addressee's face and name,
  accent status disc, and `Awaiting answer`. Inside a Thread, an answer card below the question
  offers one button per option in the Agent's order — the recommendation first and emphasized, each
  button labeled with its option text verbatim — and points to the existing composer for free text.
  Channel panes, Task dialogs, and Inbox peeks share that card. Answered Asks show no marker or
  answer card.
* **Cloud Agent work.** A Message carrying
  [Cloud Agent work](../../specs/cloud-agents.md) reads as an ordinary Message
  whose attachment or populated Thread card is headed by that work: the provider's own mark and
  name, the work title, and a trailing status disc and label — `Queued`,
  `Running · <elapsed>`, `Done · <duration>`, `Failed`, `Expired`, `Cancelled`,
  or `Cancelling` while a cancel is recorded against a live Run. One muted line
  under it states the work's current `activity` while it runs and nothing once
  it settles, plus a `Last update <relative>` note when a running work has not
  reported for ten minutes. The surface's overflow menu carries Open thread,
  Open in `<provider>`, Copy link, and — for Owners and Admins, while the work
  is live — Cancel run.
* **Hoisted work status.** Each Cloud Agent inside a Thread gets a compact row
  beneath its anchor's Task/Ask header, showing provider, title, and status.
  Completed work remains visible. The Server's conversation-scoped work list
  supplies these rows, grouped by Thread anchor. The whole preview opens the
  Thread; individual work rows are not click targets.
* **The in-Thread work card.** Inside the Thread, the work Message renders as
  the Agent's own words followed immediately by a detailed card, in sequence
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
  run for Owners and Admins while the run is live behind the chevron — with a
  `Delegated by <Agent> · <time>` receipt. The Run report is not on the card:
  the branch, the pull request, and the diff are the evidence. Everything
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
* **Sending.** A human send is instant. The draft leaves the composer the
  moment it is sent, the composer stays enabled for the next message, and an
  app-local pending message carries the text at the tail of the transcript until
  the durable message arrives. Pending and durable messages pass through the same
  transcript grouping, so rapid sends keep the same avatar and name structure when
  they commit. Each pending message is matched to its durable message by send nonce;
  a failed send drops its pending message and keeps the failed content,
  attachments, and mention metadata available for recovery. Newer text entered
  while that send was in flight remains in the current draft; failed sends and
  newer work are recovered independently. Drafts are app-local and scoped to
  their Chat or Thread, with no restart persistence. Thread replies send the
  same way, including the first reply, whose pending row belongs to the anchor
  message until the Thread it creates exists. Pending rows are never written
  into durable chat history.
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
  and message. Every materialized chat's name is a dropdown menu offering its chat-scoped
  surfaces: View tasks opens the Tasks page filtered to the chat, and Files
  opens a side pane listing attachments from its messages. Channels render with
  a hash or chosen catalog icon and optional channel color. Opening a Server
  restores that Server's last visited Chat when it still exists, then falls back
  to `#all` or the first available Chat. A user can drag any part of a Channel
  row to reorder it, or use Space and the arrow keys while the row is focused. The App keeps that
  personal presentation order per Server on the current device; direct messages
  retain the Server list order.
  Opening a chat shows a room topbar with the chat name. On channels the name's
  dropdown also carries channel actions. Editing a channel is three separate
  decisions, each with its own dialog: Rename channel, Icon & color, and Agents,
  which carries the participant count. Archive and delete follow them for a
  regular channel. Users create channels in one New channel dialog that names
  the channel, picks its icon and color from a trigger inside the name field,
  and chooses its agent participants. Both dialogs choose Agents the same way:
  a search field adds one Agent at a time, and the roster below it lists only
  the chosen Agents, each with its own remove control.
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
  actions without replacing the ordinary click target. Channel menus also offer
  direct color presets and the existing rename, appearance, and participant
  dialogs; DM menus link to their scoped tasks and Agent profile.
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
* **Agent profile pane.** Clicking an agent's transcript avatar opens the
  Agent profile in the resizable right pane. The pane is a full-height app
  column with its own topbar beside the chat topbar. Artifact, Agent profile,
  and thread panes share one visible slot and width per chat; the latest
  opener wins without clearing another pane's state. Clicking the transcript name
  inserts an Agent mention, while the DM topbar name remains inert. Session
  resets stay agent-wide in Agent settings (specs/sessions.md) and reach a chat
  only as the session mark described above. Execution evidence (turn
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
