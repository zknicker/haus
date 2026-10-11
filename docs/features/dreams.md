---
summary: Dreams on the Agent profile — when an Agent dreamed and what each nightly memory pass changed in MEMORY.md and notes/, shown as a list and a diff sheet.
read_when:
  - changing the Dreams section, dream rows, or the dream sheet on the Agent profile
  - changing how a dream turn appears or opens in the Activity log
  - changing the dream headline wording or how the App reads a dream's patch
---

# Dreams

An Agent dreams overnight: a private turn in which it consolidates its own memory
([workspace spec](../../specs/workspace.md#dreaming)). Every member who can view the Agent can see
when it dreamed and what changed. Dreams are a record of what the Agent now remembers, not
execution evidence, so they are not admin-only.

## On the profile

The hub shows a **Dreams** section with the latest four nights and a **See all** button that
opens the Dreams drill-down, which lists every dream the Server keeps (the newest 60). The hub
shows no Dreams section until the Agent has dreamed, and nothing while the read is pending; there
are no skeletons. Each row shows the night, a file-level headline (`Updated memory · added a
note`), the files touched, and the line counts. A dream that changed nothing is a quiet row that
does not open.

Pressing a row opens the dream in the right-side sheet the Reminder and Trigger sheets use. The
sheet's heading is the section-level headline, derived in the App from the patch: the `##`
sections of `MEMORY.md` the patch touched and how (`Rewrote Active Context · +1 preference ·
added 2 notes`). Below it, each file's diff renders through the App's one diff renderer; a binary
or oversized file says why it shows no diff.

The Computer holds at most 8 MiB of memory text per snapshot; past that, files are compared by
digest only and show no diff. A memory of more than 2,000 files is not compared at all: the dream
is recorded as `truncated` and reads "Too many memory files to compare".

## In the Activity log

The dream turn is an ordinary turn row titled **Dreaming**. Once it settles, the row carries a
**See memory changes** action where a Chat turn shows its Chat button, and it opens the same
sheet. The row still expands to the turn's trace.

## Ownership

| Fact | Owner |
| --- | --- |
| Memory snapshot, diff, caps | Computer, `apps/computer/src/harness/dream-record.ts`, `dream-diff.ts` |
| Stored record and retention | Server, `agent_dreams`, `apps/server/src/server-agents/record-agent-dream.ts` |
| Reads | `agent.dreams`, `agent.dream` ([Agents API](../api/agents.md)) |
| Headline, patch parsing | App, `apps/website/src/features/members/agent-profile/dream-model.ts` |
| Freshness | A settled run invalidates the Agent's dream reads (`hooks/agents/agent-history-cache.ts`) |
