---
summary: Proposed decision that Haus App persists an allowlisted slice of Server reads to IndexedDB per user, paints it on cold launch, reconciles as a reconnect from a persisted chat event cursor, and wipes it on sign-out; App storage stays cache, never authoritative.
read_when:
  - changing whether or how the App keeps Server data on disk between launches
  - changing what App data remains on a device after sign-out or account switch
  - reviewing specs/app-persisted-query-cache.md
---

# ADR 0042: App Cache Persists To Disk Per User

## Status

Proposed 2026-10-09. Not built. Contract: [App Persisted Query Cache](../../specs/app-persisted-query-cache.md).

## Context

Haus App is sync-first, yet a cold launch renders nothing until the Server answers, while every
window after the first starts warm from its opener's in-memory cache. The App's storage has so far
held cache, settings, and local presentation, with Server data only in memory. Keeping Server data
on disk changes what a device retains after a session, so it is a decision, not just an
optimization.

## Decision

- The App persists only allowlisted Server reads (Server, membership, Agent list, Chat list, and
  the newest transcript page of recently shown Chats) to IndexedDB on the App origin, in one
  database per Clerk user. Volatile state, secrets, execution evidence, and attachment bytes are
  never persisted.
- A launch with a restored cache is treated as a reconnect: entries paint at once, then the
  existing reconnect recovery runs, with the Chat event stream walking from the persisted cursor.
- Sign-out, a different user, or Clerk loading signed out deletes the cache. Mismatched contracts
  drop entries rather than migrating them.
- The persisted cache is never authoritative and never written back to the Server.

## Consequences

- Cold launch paints from the last known data before the network answers, and launch requests do
  not grow.
- A device keeps up to a bounded, week-old slice of a signed-in user's Chats at rest, protected by
  the OS account (encryption beyond that is an open question in the spec).
- Each new persisted read must declare its recovery class, and a listener change can demote one.
