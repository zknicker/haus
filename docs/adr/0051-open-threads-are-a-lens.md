---
status: proposed
summary: Proposed decision to track in-flight work through one per-human Open Threads lens rather than a Cloud Agents section; a Thread is the unit, the lens has no badge and expires its own rows so it is not the attention tier ADR 0038 removed, a Work panel on the full-page Thread replaces the card there, and Server-owned pull request readings kept live by GitHub webhooks supply the review data ADR 0041 was waiting for.
read_when:
  - deciding whether in-flight work belongs in the Inbox, a new section, or Open Threads
  - proposing an attention tier, a Done marker, or a badge on Open Threads
  - changing what the Work panel replaces, or where the Cloud Agent work card must appear
  - changing whether Haus stores pull request state
---

# ADR 0051: Open Threads Are a Lens

## Status

Proposed 2026-11-05. On acceptance this amends [ADR 0041](0041-cloud-agent-cards-mirror-cursor.md)
and [ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md), and qualifies
[ADR 0038](0038-inbox-is-unread-not-attention.md). [Open Threads](../../specs/open-threads.md) carries
the full contract.

## Context

Agents queue Threads and start Cloud Agent work faster than a human can track. The Inbox holds a
conversation only while it is unread. After that, a Thread is findable only by scrolling its parent
Chat, because Search skips Thread messages and Threads have no list of their own. Cloud Agent work
leaves Happening now when its Run settles, which is exactly when its pull request needs a human, and
Haus stops reading that pull request at the same moment.

Capy and Cursor list agent tasks in the sidebar, each opening a page with the conversation and its
pull request. Slack lists followed Threads on their own page. Haus can combine these because every
piece of Cloud Agent work already has a Thread.

## Decision

**A Thread is the unit.** One sidebar section, Open threads, lists the Threads still in motion for
one human, with or without Cloud Agent work. Work and pull requests are attributes of a row.

**It is a lens.** Its only stored fact is Close. Membership and status derive from follows, unread,
Messages, work, and pull request readings through one pure function.

**It is not an attention tier.** ADR 0038 deleted Needs you because a permanent row needing manual
Done became a chore. Open Threads avoids that by construction: no badge, no notification, rows expire
by themselves, and Close is optional. Its groups state who holds the Thread, **With you** and
**With agents**, and they are not "Needs you". The Inbox stays exactly as ADR 0038 and ADR 0050 define
it.

**The Work panel replaces the card only on the full-page Thread.** While the panel is open, a linking
Message there shows a one-line reference, so the page states each fact once. This narrows ADR 0044's
"every link renders the same live card". Every other surface keeps the card.

**The card stays a provider mirror.** The rollup status (`Ready for review`, `Checks failing`) exists
only on Open Threads rows. ADR 0041's job-state chip gains no Haus state.

**Haus keeps a live pull request reading.** ADR 0041 deferred "Needs review" until review data
existed, and the Cloud Agents spec said Haus stores no pull-request entity. A Server table now holds
one reading per pull request that work reported. GitHub webhooks mark it stale and a serial refresher
re-reads it with the installation token. It stays evidence: Haus never acts on a pull request here.

## Considered and rejected

- **A Cloud Agents sidebar section and Work page.** The literal request and direction B on the board.
  It leaves conversation-only Threads unfindable, adds a second list to reconcile with Threads, and
  splits one conversation across two places.
- **Keeping read items in the Inbox.** Turns an unread list back into an attention tier.
- **Promoting work to a Task.** The Cloud Agents spec rules this out, and a Task carries a lifecycle
  a human must drive.
- **Applying webhook payloads directly.** `check_suite` payloads cannot state a rollup and arrive out
  of order, so a webhook only marks the row and one read decides.
- **Clearing rows at the end of the viewer's day.** The Server holds no viewer timezone, so expiry
  uses fixed hours.

## Consequences

- Server gains two tables, `cloud_agent_pull_requests` and `thread_closures`.
- `CloudAgentWork` gains `pullRequest`, so a card finally reads Merged after its Run settled.
- Work an Agent started on its own appears for every member of its parent Chat until they unfollow or
  close the Thread. On a Server with many humans that may prove noisy; revisit with real use.
- A pull request in a repository no installation covers stays a Computer reading and ages out after
  seven days, reading `Last read <d>` rather than guessing.
- iPhone needs its own design pass.
