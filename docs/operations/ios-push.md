---
summary: iPhone push (APNs) for Needs you — the device and payload contract, the Server sender, its environment, and the one-time Apple and 1Password setup.
read_when:
  - enabling, rotating, or debugging iPhone push notifications
  - changing `push.registerDevice`, `push.unregisterDevice`, or the push payload
  - changing the App ID capabilities, entitlements, or provisioning profile of the Haus iPhone target
---

# iPhone Push

The Haus Server pushes an iPhone alert for every message that newly tops a human's Needs you row
([Inbox](../features/inbox.md#notifications), [ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)).
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
  `aps.thread-id` = conversation Chat id, `aps.badge` = Needs you rows across every Server, and the
  tap-routing keys `serverId`, `chatId`, `conversationChatId`, `threadAnchorMessageId` (null outside
  a Thread), `messageId`. Headers: `apns-push-type: alert`, `apns-priority: 10`,
  `apns-collapse-id` = message id, `apns-topic` = the device's bundle id.

## Server behavior

`apps/server/src/push/` listens to post-commit `message.created` events. It narrows candidates from
the event's addressing ids and the DM's members, keeps humans with a live membership and a device,
and pushes each whose Needs you row for that Chat now ends at the message, so every Needs you rule
(own messages, access, archive, Done, answered) applies once. Sends run off the send path and never
fail it, at most four messages at a time (a backlog past 1,000 drops new pushes). The badge is this
Server's Needs you rows plus one count statement over the human's other Servers, built from the same
query as the list.

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

1. In Certificates, Identifiers & Profiles, enable **Push Notifications** on the App ID
   `chat.haus.ios`.
2. Create an APNs authentication key (Keys → **Apple Push Notifications service**). One key serves
   sandbox and production. Download the `.p8` once.
3. Store it in 1Password as `Apple Push - Haus` in both `Development` and `Production`, with fields
   `key_id` (the 10-character key id) and `private_key` (the full `.p8` PEM, newlines kept).
4. Regenerate the **Haus CI App Store** provisioning profile so it carries the push entitlement
   ([iOS TestFlight](ios-testflight.md)); CI only downloads profiles.
5. Redeploy the Server. Startup logs `iPhone push enabled: APNs key <id>`; without the item it logs
   `iPhone push disabled: APNs key not configured`.

Rotation: create a new key, update both items, redeploy, then revoke the old key in Apple.

Development builds register with `environment: 'sandbox'`; TestFlight and App Store builds use
`production`.
