---
summary: iPhone push (APNs) for message notifications — the device and payload contract, the Server sender, its environment, and the one-time Apple and 1Password setup.
read_when:
  - enabling, rotating, or debugging iPhone push notifications
  - changing `push.registerDevice`, `push.unregisterDevice`, or the push payload
  - changing how pushes behave under iPhone Focus
  - changing the App ID capabilities, entitlements, or provisioning profiles of the Haus iPhone app and its Notification Service extension
---

# iPhone Push

The Haus Server pushes an iPhone alert for every message that notifies a human under the shared
message notification rule ([Inbox](../features/inbox.md#notifications),
[ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)): every message from someone else in
their DMs, and in a Channel or Thread one that @mentions them, inline-replies to their message, or
sits in a Thread on their message. Reading a Chat never stops the next push, but a push waits a
short grace period and is skipped if you have already read that message anywhere.
Haus Server owns the device registrations and the APNs connection; the iPhone only registers.

## Contract

`packages/haus-api/src/push.ts` owns it.

- `push.registerDevice({ token, environment: 'sandbox' | 'production', bundleId })` — signed-in
  human only; `bundleId` must be on the `pushBundleIds` allowlist (`chat.haus.ios`), since it
  becomes the `apns-topic`; upserts by the hex device token (stored lowercase). A token registered by another
  human moves to the caller. Returns `{ ok: true }`.
- `push.unregisterDevice({ token })` — called when the Notifications switch turns off (retried until
  it succeeds) and, best effort with a 3-second limit, before sign-out; removes the token only if the
  caller holds it. Returns `{ ok: true }`. Sign-out then clears local push state, turns the switch
  off, and clears delivered notifications and the badge, so the next account opts in itself.
- Payload: `aps.alert.title` (author, plus ` in #channel` outside a DM), `aps.alert.body` (plain
  preview, mentions as display names, at most 180 characters), `aps.sound: "default"`,
  `aps.thread-id` = conversation Chat id, `aps.badge` = unread Chats across every Server, and the
  tap-routing keys `serverId`, `chatId`, `conversationChatId`, `threadAnchorMessageId` (null outside
  a Thread), `messageId`. For Communication Notifications (sender avatar banners) it also carries
  `aps.mutable-content: 1`, `sender` (`id`, `kind` `agent` | `human`, `name` cut to 80 characters,
  `avatarUrl` absolute on `HAUS_APP_ORIGIN` or null when the sender has none — avatar routes are
  public by opaque id), and `conversation` (`{ kind: "channel", name }` without `#`, or
  `{ kind: "dm", name: null }`). `reason` (`dm` | `mention` | `reply`) is why the message notifies
  the human (`messageNotificationReason`); the extension donates it as `INSendMessageIntentDonationMetadata`
  (`mentionsCurrentUser` for `mention`, `isReplyToCurrentUser` for `reply`, iOS defaults for `dm`
  or a push without it) so Focus lets mentions and replies to the human through. Pushes are never
  Time Sensitive. The alert title and body stay as the fallback when the Notification
  Service extension cannot fetch the avatar. A message whose author or Channel name cannot be
  resolved is not pushed. The worst-case payload stays under the 4 KB APNs limit
  (`push-payload.test.ts`). Headers: `apns-push-type: alert`, `apns-priority: 10`,
  `apns-collapse-id` = message id, `apns-topic` = the device's bundle id.

## Server behavior

`apps/server/src/push/` listens to post-commit `message.created` events. It applies
`messageNotificationReason` (`packages/haus-api/src/message-notification.ts`, the same rule the
App's desktop and web notifications use) to the humans the event names and the DM's members, then
keeps humans with a live membership, a device, and access to the Chat; an archived or deleted Chat
pushes nobody, and the author is never pushed. Each message waits `pushReadGraceMs` (4 seconds)
before its recipients are read, and a human whose read marker in the message's own Chat already
covers it (`chat_reads.sequence >= message.sequence`) is skipped: the App marks an open Chat read
as messages arrive in a visible, focused window, so a message read on the desktop does not also
buzz the phone. A Thread message checks the Thread's own marker, which the open Thread pane or the
Inbox's Mark read advances; reading the Channel alone does not. The wait sits in the in-memory push
queue and holds no send slot. Like the rest of the queue it is lost on restart, and shutdown waits
it out before sending. Sends run off the send path and never fail it, at most four messages at a
time (a backlog past 1,000, counting messages still waiting, drops new pushes). The badge is the human's
unread Chats across every Server they belong to — each Server's `chat.list` Chats with an
`unreadCount` above zero, counted in one query (`countUnreadChats`) built from the same
`listedChats` scope and `chatUnreadCount` expression as `chat.list` (`apps/server/src/chats/chat-unread.ts`).
The iPhone app badges its icon from the same count through `chat.unreadChatCount`.

APNs uses token auth: an ES256 JWT (`kid` = key id, `iss` = team id, `iat`) reused for 40 minutes
and re-minted early after `ExpiredProviderToken`, never within 20 minutes of the last mint.
`InvalidProviderToken` means the key or team id is wrong: it is logged once and push stays disabled
until restart. A malformed `APPLE_TEAM_ID` disables push at boot with a logged reason. Pushes go over
one HTTP/2 session per environment (`api.sandbox.push.apple.com` or `api.push.apple.com`, chosen by
the device), pinged every minute; a missed ping or a request that times out (10 s) destroys the
session so its in-flight pushes fail at once and the next push reconnects. Each push is sent once:
`410` or `400 BadDeviceToken` deletes the device; any other refusal, throttling, or 5xx is logged
and stored in `push_devices.last_error`, never retried.

## One-time setup

1. In Certificates, Identifiers & Profiles, enable **Push Notifications** and **Communication
   Notifications** on the App ID `chat.haus.ios`, and register the App ID
   `chat.haus.ios.NotificationService` for the Notification Service extension with no
   capabilities.
2. Create an APNs authentication key (Keys → **Apple Push Notifications service**). One key serves
   sandbox and production. Download the `.p8` once.
3. Store it in 1Password as `Apple Push - Haus` in both `Development` and `Production`, with fields
   `key_id` (the 10-character key id) and `private_key` (the full `.p8` PEM, newlines kept).
4. Keep two App Store provisioning profiles ([iOS TestFlight](ios-testflight.md)): regenerate
   **Haus CI App Store** (`chat.haus.ios`) after any capability change so it carries the push and
   communication entitlements, and keep **Haus CI App Store NotificationService**
   (`chat.haus.ios.NotificationService`) active for the extension. CI only downloads profiles.
5. Redeploy the Server. Startup logs `iPhone push enabled: APNs key <id>`; without the item it logs
   `iPhone push disabled: APNs key not configured`.

Rotation: create a new key, update both items, redeploy, then revoke the old key in Apple.

Development builds register with `environment: 'sandbox'`; TestFlight and App Store builds use
`production`.
