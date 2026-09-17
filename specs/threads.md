# Threads

Raft-aligned thread model (T1/T2/T3/U5 in `specs/raft-alignment/README.md`). A thread is a
sub-conversation anchored on one channel or DM message. Inline replies stay in the parent
conversation; choosing **Reply in thread** creates or continues a separate child conversation.
[ADR 0029](../docs/adr/0029-inline-replies-preserve-conversation.md) separates the two actions.

## Model (T1)

- A thread is a **child conversation container**: a `chats` row with `kind: 'thread'`, its own id
  and per-chat `sequence` space, `anchor_message_id` (the parent-chat message it hangs off), and
  `parent_chat_id`. Never a column on messages.
- Thread chat id is deterministic: `cht_thr_<anchor message id without the msg_ prefix>`. One
  thread per anchor by construction; creation is idempotent. Hosted message ids are opaque, but
  the child Thread id deliberately remains derived because its identity is this normative
  one-anchor contract.
- Canonical `msg_<32 hex>` anchors use their first 8 hex characters. Existing non-canonical
  anchors use their exact full id so the target stays resolvable. Target grammar (D2, shared with
  the WS1 CLI): `#channel:<anchor-ref>` and `dm:@name:<anchor-ref>`.
- First send to a thread target auto-creates the thread. No nesting: a thread chat cannot anchor another thread
  (anchors must live in a `channel`, `dm`, or `task` chat). Thread messages cannot become tasks.
- Threads have **no membership of their own**. Access derives from the parent chat's
  participants; thread-chat participant rows are incidental author upserts, never authoritative.
- Display names are derived at read time from the parent (channel name / DM peer) + anchor
  reference. Never stored — renames propagate by construction.

## Follows

`thread_follows(thread_chat_id, participant_id, followed, created_at)` — one attention-state row
per participant, humans and agents identically. Explicit unfollows persist as `followed = 0` until
the participant posts, follows explicitly, or is directly mentioned in the Thread. A direct mention
restores ordinary delivery because the newer address supersedes the earlier unfollow.

- Auto-follow: the anchor message's author on thread creation; any author on posting into the
  thread (posting always re-follows, including after an unfollow).
- @mentioning a parent-chat participant inside a thread message follows them to the thread.
- A direct mention uses the existing rich-reference syntax. The hosted human slice recognizes
  `user://` references only; local Agent delivery may recognize `agent://` when that delivery
  work lands. Bare mention-looking text is inert. A first mention follows; after an explicit
  unfollow, a direct mention restores the follow.
- Unfollow stops attention only — reading and replying stay possible (membership is the
  parent's). Humans toggle follow in the thread pane header; agents get `thread unfollow` (WS1).
- Followed-thread unreads roll into the parent chat's `unread_count` (rail badge). A restored
  follow makes the unread Thread backlog visible again. No separate thread list surface
  in v1.

## Immutability (T2)

No message edit or delete paths, no tombstones, nothing anticipating redaction. Corrections are
new messages, either inline or in a thread. The internal `updateStreamingMessage` in-flight mutation (pre-delivery
streaming) is not an edit path and stays. Chat-level `clear` remains a chat reset, unrelated to
per-message redaction.

## Read/unread

Thread chats reuse `chat_reads` unchanged: a foregrounded thread pane marks visible replies read;
the parent anchor is not part of the child Thread sequence. The anchor's preview block shows an
inline unread qualifier ("3 replies · 2 new") computed from the viewer's thread read receipt. The
parent chat's `unread_count` includes followed-thread unreads for the reader.

## Surfaces (T3/U5)

- Threads open in the chat's **right side pane** (same slot as the artifact panel; one pane
  visible at a time, most recent wins, both reopenable; resizable, shared width).
- Pane anatomy: header (`Thread — #channel` / `Thread — @name`, full target with shortid as the
  copyable handle, follow toggle, "View in channel", close), the anchor message rendered at top,
  a "Beginning of replies / N replies" divider ("No replies yet" when empty), replies as normal
  messages, thread composer.
- The anchor message shows a highlight outline in the parent transcript while its pane is open,
  and a **thread preview block** underneath that opens the pane: a header ("3 replies · 2 new")
  over the newest replies, oldest first, each with the author's avatar, name, one-line content,
  and relative time. `ThreadSummary.recentReplies` carries those rows; an anchor whose
  Thread has no replies shows nothing, since "Reply in thread" already lives in the hover
  actions. A message carrying a task or a Thread never merges into a neighbouring row, so its
  block stays attached to its own prose.
- "View in channel" closes the pane, scrolls the parent transcript to the anchor, and flashes a
  brief highlight.
- Message hover cluster: Reply, Reply in thread, Add Reaction, Save Message (placeholder). Right-click
  menu: Open Thread, Copy Markdown, Unfollow Thread (when followed), and quick reactions.
- At narrow widths the pane collapses to a full-pane takeover with a back-chevron (Raft's
  responsive model). DMs thread identically to channels.

## Flow

- Human thread reply: `chat.send` carries the parent Chat id plus
  `thread: { anchorMessageId }`; the owner of canonical chat state atomically ensures the child
  Thread and writes the message in its independent sequence domain. Hosted Server Threads use
  PostgreSQL and parent-derived human authorization. Local execution chat uses Runtime and the
  parent Chat's Agent addressing rules. Threads never enter a sidebar Chat list.
- Agent turns triggered in a thread run with the thread chat as their chat context; the per-turn
  prompt identifies the thread (parent + anchor excerpt) instead of the retired `Reply context:`
  section. Agent replies land in the thread like any chat.
- A `message.created` in a thread invalidates the thread's log, the parent's log (pill counts),
  and the chat list (unread rollup).
- Reactions are durable rows on the reacted Message, grouped by emoji and attributed to their
  human or Agent actor. A reaction uses the Message's parent-derived Chat access and archive gate,
  and appends `message.reaction.updated` without changing read state or unread counts.
