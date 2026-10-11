---
summary: A Thread's unread replies count on the Thread, never on its parent Channel or DM; the Inbox lists each unread Thread as its own row (`thread.listUnread`), the badge counts unread Chats plus unread Threads, and the anchor preview's "N new" uses the same follow-or-mention rule. Amends ADR 0013 and ADR 0038.
read_when:
  - changing what counts as unread for a Channel, DM, or Thread, or `chat.list`'s `unreadCount`
  - changing the Inbox's Thread rows, `thread.listUnread`, or Mark read on a Thread
  - changing the app icon or APNs badge count (`chat.unreadChatCount`)
  - changing the Thread preview's "N new" count (`ThreadSummary.unreadCount`)
---

# ADR 0043: Threads Are Unread on Their Own

## Status

Accepted 2026-10-11. Amends [ADR 0013](0013-threads-are-child-conversation-containers.md)
(followed-Thread unreads no longer fold into the parent's count) and
[ADR 0038](0038-inbox-is-unread-not-attention.md) (Unread rows and the badge now include Threads).
ADR 0038's core stands: the Inbox is unread, cleared by viewing or Mark read, and notifications
follow one shared rule.

## Context

A Channel or DM's `unreadCount` used to be its own unread messages plus the unread replies in
child Threads the viewer followed or was mentioned in. Reading the Channel moved only the
Channel's marker, so the Channel stayed lit until every followed Thread under it was opened too.
In a busy Channel that is forever: the badge stopped meaning "something new here" and the Inbox
row pointed at the wrong place, since the unread replies were not in the Channel at all.

Slack, which Haus users compare against, keeps the two apart: a Channel is unread for its own
messages, and followed Threads surface as their own items.

## Decision

1. **A Chat's `unreadCount` is its own messages.** `chat.list` counts messages from others past
   the viewer's marker in that Chat only. Thread replies live in the Thread's own Chat row and
   never count on the parent.
2. **A Thread is unread on its own.** A reply counts for a viewer when someone else wrote it, it
   is past the viewer's Thread read marker, and the viewer follows the Thread or the reply
   @mentions them. That rule lives once, in `apps/server/src/threads/thread-unread.ts`.
3. **The Inbox lists unread Threads as rows.** `thread.listUnread({ serverId })` returns one row
   per Thread with a counted reply whose parent `chat.list` lists (visible, undeleted,
   unarchived), newest activity first. Deleted Threads never appear. The row carries the Thread,
   parent, and anchor ids, the counted reply count, the first counted reply (where opening should
   land), the newest counted reply as a `ChatLastMessage`, and `lastMessageSequence` for Mark read.
4. **The badge counts both.** `chat.unreadChatCount` — the app icon and `aps.badge` — is unread
   `chat.list` rows plus `thread.listUnread` rows, summed over the viewer's Servers, built from the
   same predicates so it always equals what the Inbox shows.
5. **"N new" agrees.** `ThreadSummary.unreadCount` on the anchor preview applies rule 2, so an
   unfollowed Thread shows only the replies that mention the viewer.
6. **Mark read is `chat.markRead`.** A Thread row marks the Thread's own `chatId`. A Channel or DM
   row keeps `includeThreads: true`, which also reads every Thread under it, so that Chat's Thread
   rows leave with it. No new mutation or event.

## Consequences

- Reading a Channel clears it; its Threads stay in the Inbox until read on their own.
- Live updates reuse existing events: `chat.onMessageCreated` with a non-null `parentChatId`
  (a Thread reply), `chat.onRead` with a non-null `parentChatId` (a Thread read, reader only),
  `thread.onFollowUpdated`, and `chat.onLifecycle` (a parent archived, deleted, or hidden).
- The iPhone app reads `thread.listUnread` beside `chat.list` and lists the same Thread rows, so
  its Inbox dot and icon badge agree with what it shows.

## Considered and rejected

- **Keep the rollup and clear Threads when the Channel is read.** It marks Thread replies read
  that the viewer never saw.
- **Count only mentions on the parent.** Still lights the parent for messages that are elsewhere.
