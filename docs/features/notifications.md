---
summary: Who a new message notifies and how — the one notification rule, desktop and web notifications, macOS background behavior, and iPhone pushes, badges and Focus.
read_when:
  - changing who a new message notifies on desktop, web, or iPhone
  - changing notification text, grouping, permission, or the Test notification row
  - changing the iPhone push, its badge, or its Focus behavior
---

# Notifications

One rule decides who a new message notifies, and it is independent of unread state
([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)). A human is notified about a message
they did not write when it is in a DM they belong to — every message — or, in a Channel or Task,
when it @mentions them or inline-replies to their message, or sits in a Task that started from
their message. `messageNotificationReason` in
`packages/haus-api/src/message-notification.ts` is that rule, over the facts `message.created`
carries; the Server and the App both call it. Reading a Chat clears its unread state but never
stops the next notification; only a message already read is not notified.

- **Desktop (Electron) and web** apply the rule to the `message.created` events their Chat event
  stream delivers, and use the platform `Notification` API while the window is hidden or
  unfocused. Only a message that passes is read for its text. The title names the author, plus
  the place outside a DM (`#product`, or a Task's key); the body is the message as one line.
  Clicking it focuses the window and opens the conversation.
  Notifications are tagged by Chat, so a newer one replaces the older, and each message notifies
  once. Only live events notify: a cold stream starts at the event head, and a reconnect's
  catch-up replay refreshes caches without notifying, so messages that arrived while the App was
  asleep or offline show as unread in the sidebar. A message whose Chat has since been read through it
  never notifies.
- With several tabs open on the same Server, one tab (elected through a Web Lock) notifies, so
  each message notifies once per browser. The Electron app and a browser each notify separately.
- Permission is requested only from the notifications toggle in Settings → Notifications, never on
  page load. Its Test notification row shows one on demand once the toggle is on.
  With the toggle off or permission denied, nothing is shown.
- **macOS** keeps the app running when its last window closes: closing hides the window, and
  Cmd+Q or the menu's Quit quits. Notifications therefore keep arriving with no window open.
- **iPhone** gets an APNs alert, even while Haus is closed, for every message the rule names: one
  push per human per message, to each device they registered, if they can still see the Chat. A
  push waits about 4 seconds and is skipped if the human has read the message by then anywhere —
  typically a focused App window that has the conversation open. The
  title is the author, plus ` in #channel` outside a DM; the body is a plain-text preview cut to
  180 characters; the badge is the human's unread Chats and followed Tasks across every Server. The app sets its icon from the same Server count
  (`chat.unreadChatCount`), so a badge never shrinks when the app opens. Pushes group by conversation and collapse by message id, and a
  tap opens the conversation. The human's own messages, Chats they cannot see, and
  archived Chats never push. The Server sends only when an APNs key is configured; see
  [iPhone Push](../operations/ios-push.md). A Task someone else assigned the human pushes too,
  titled `<assigner> assigned you SEC-12`, unless they read it within the same wait. Several
  assignments landing inside that wait are one push, `Zero assigned you 6 tasks`.
- **iPhone Focus**: a push tells iOS why it addresses the human. A DM breaks through a Focus when
  its sender is an allowed person; in a Channel or Task, only a mention of the human or a reply
  to their message does (for an allowed sender). Haus never marks pushes Time Sensitive.

Deferred until the operator provides credentials: browser Web Push while Haus is closed (a VAPID
key pair and a service worker). A closed browser tab learns about new messages only when opened.
