---
status: proposed
summary: Proposed product follow-ups to the Captain prompt v2. A Captain gets a needs-you flag and a digest so a person sees what waits on them without reading every turn; crew Tasks hear more of their pull request (review comments, conflicts, merges) and the Server gives a readiness verdict a Captain can read instead of judging green checks by hand; and a Captain's session has no repo checkout, so the crew building is enforced in code rather than prose. Proposed 2026-11-27.
read_when:
  - adding a needs-you flag, a Captain digest, or the Captain panel's Needs you section
  - adding pull request events for Tasks (review comments, conflicts, merges) or a readiness verdict
  - changing which tools a Captain session has, such as `haus repo checkout`
  - changing the Captain prompt's crew, readiness, or quiet-wake text
---

# ADR 0063: Captains Hear What Needs Them and Never Build

## Status

Proposed 2026-11-27. Nothing here is built.

## Context

Prompt v2 took Capy's proposal for the Captain prompt as description: the Captain runs a lane,
thinks while its crew builds, checks crew work before calling it ready, and most wakes change
nothing a person needs to know. Three of those ideas are only as strong as the words, and each has
a product shape that would carry it better (`write-agent-text`: what must not happen belongs in
code).

## Decision

1. **Needs you.** A Captain can raise a needs-you flag in its Captain chat with one line naming
   what the person must do. The flag rings its owner and stays up until a person answers. The
   Captain panel's Needs you section lists the raised flags, and a short digest (Needs you, New,
   In progress) is rewritten when the crew's state changes. The prompt then describes the flag,
   and quiet wakes stop being a judgment call about whether to post.
2. **Pull request events and a readiness verdict.** A Task's attached pull request also wakes it
   on a review comment, a merge conflict, and a merge, beside today's ready-for-review and check
   changes. Check results batch, so a failure arrives at once and passes arrive once every check
   has finished. The Server computes one readiness verdict (head sha, every check finished and
   green, no open review findings, mergeable against its base) that `haus task show` and the crew
   finish line carry, possibly as a `haus pr show <url>`. "Ready" becomes a fact the Captain reads,
   not a checklist it applies.
3. **No repo checkout for Captains.** A Captain session gets no `haus repo checkout`, and only
   read-only sub-agents. Code reaches a repo only through a Task. "You think, and your crew
   builds" then holds by construction.

## Consequences

- The Captain prompt can shrink again: the readiness sentence names the verdict, and the
  quiet-wake bullet names the flag.
- Each change needs its own eval: a routine wake raises no flag, a decision raises exactly one,
  and a Captain asked to fix code it cannot check out starts a Task.
- The merge itself stays a person's act; who may merge, and on what head, is policy for the
  Server's or Project's AGENTS.md, not this ADR.
