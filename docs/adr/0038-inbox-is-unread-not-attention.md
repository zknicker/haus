---
summary: The human Inbox is an unread list (Unread + Happening now) cleared by viewing in focus or Mark read; Needs you, its Done marker, and `inbox.needsYou`/`inbox.markDone` are deleted; notifications follow one shared rule (every DM message, and Channel/Thread mentions, replies, and Threads on your message) owned by `@haus/api` and applied by iPhone push and desktop/web alike.
read_when:
  - changing the Inbox's sections, what counts as unread, or Mark read
  - changing who a new message notifies on iPhone, desktop, or web, or the APNs badge
  - changing `message.created`'s notification facts or `messageNotificationReason`
  - considering an attention tier, a Done marker, or "unanswered" logic above unread
---

# ADR 0038: The Inbox Is Unread, Not Attention

## Status

Accepted 2026-10-01. Supersedes the **Needs you** and **Done** parts of
[ADR 0037](0037-humans-are-addressed-by-mention.md) and its push-on-Needs-you rule. ADR 0037's
core stands: a human is addressed by @mention, inline reply, a Thread on their message, or their
DM; Asks stay deleted; tasks stay Agent-only.

## Context

ADR 0037 gave the Inbox a **Needs you** tier above unread: one row per Chat holding addressing the
viewer had not answered or marked Done, backed by a `chat_reads.done_sequence` marker and an
"answered" query. Push, desktop and web notifications, and the sidebar badge all keyed off that
query. In practice it counted every Agent DM message, reading a DM did not clear it, and a chatty
Agent kept a row permanently present — Done became a chore rather than a release valve. Two
meanings of "waiting" (unread and Needs you) also had to be explained and kept apart in every
client.

Raft, which Haus tracks, has no attention tier. Verified from source: its inbox is the viewer's
unread conversations (plus a personal-mentions badge), cleared by viewing while the window is
focused or by an explicit mark-read; push fires on ordinary messages to the person and is skipped
when they are already looking at that conversation.

## Decision

**The Inbox is unread.** Its sections are **Unread** and **Happening now** under the existing
header and **Active this week** strip. Unread is every Channel and DM whose `chat.list`
`unreadCount` — its own messages from others above the viewer's read marker, plus the Thread
replies it rolls up — is above zero, newest activity first, one row per Chat. There is no
attention tier, Done marker, or "unanswered" logic.

**Clearing is reading.** Viewing a Chat marks it read only while the window is visible and
focused (`useAppForegrounded`). **Mark read** on an Unread row calls the existing
`chat.markRead({ serverId, chatId, sequence: lastMessageSequence, includeThreads: true })`;
`includeThreads` also reads every Thread under the Chat through its newest message so the row
actually leaves. There is no parallel endpoint.

**Notifications are one rule, decoupled from the Inbox.** A new message notifies a human who did
not write it when it is in a DM they belong to (directly or in a Thread on it) — every message —
or, in a Channel or Thread, when it @mentions them, inline-replies to their message, or sits in a
Thread anchored on their message. `messageNotificationReason` in
`packages/haus-api/src/message-notification.ts` is the rule; `message.created` carries every fact
it reads (`authorUserId`, `conversationKind`, `mentionedUserIds`, `replyToAuthorUserId`,
`threadAnchorAuthorUserId`). iPhone push on the Server and desktop/web notifications in the App
both call it, so they cannot drift. Reading a Chat never suppresses the next notification (a
push for a message already read is skipped; see Consequences); the
App's own suppression (window visible and focused, Settings toggle, permission, one tab per Server
by Web Lock, nothing from before load or from a reconnect's catch-up replay, nothing already read)
stays.

**The badge is unread Chats.** The sidebar Inbox badge and the APNs badge both count Chats with
an `unreadCount` above zero — the App per Server, APNs and the iPhone icon across every Server the
human belongs to. The Server's count (`countUnreadChats`, exposed as `chat.unreadChatCount`) is one
query sharing `chat.list`'s scope and unread expression, so it always equals `chat.list`'s unread rows.

**The old path is deleted.** `inbox.needsYou`, `inbox.markDone`, the `inbox` router,
`packages/haus-api/src/needs-you.ts`, `apps/server/src/needs-you/`, and the App's Needs you
components and hooks go. Migration `0054_drop_chat_reads_done_sequence` drops
`chat_reads.done_sequence`.

## Consequences

- One meaning of waiting: unread. Every client reads it from `chat.list`, so the Inbox, the
  sidebar badge, the iPhone icon badge, and the APNs badge agree.
- A DM from an Agent notifies every time, as in Raft; opening the DM clears it from the Inbox
  without muting the next message.
- A Channel @mention the viewer read but did not answer no longer stays pinned; the notification
  and the mention chip are its whole presentation.
- The onboarding Channel is not in `chat.list` until setup completes, so a mention there notifies
  but does not appear under Unread until then.
- An iPhone push waits a short grace period (`pushReadGraceMs`, 4 seconds) and is skipped when
  the human's read marker already covers the message, so a message read in a focused App window
  does not also buzz the phone. This is Raft's "already looking" skip built on read state, with no
  presence tracking; it only reaches clients that mark read as messages arrive.
- The web notification switch moved to a new storage key, so a device that had it on must turn it
  on again once.
