---
summary: Dreams on the Agent profile — the nightly heartbeat's summary, follow-ups, and memory changes in a dream row and sheet, plus the Heartbeat rows and hover lines that show daytime check-ins.
read_when:
  - changing the Dreams section, dream rows, or the dream sheet on the Agent profile
  - changing how a dream or a heartbeat appears in the Activity log or the agent hover card
  - changing the dream row headline, the follow-ups list, or how the App reads a dream's patch
  - changing the heartbeat rows, the "Checking in" or "Last night" lines, or the folding of quiet heartbeats
---

# Dreams

An Agent's nightly heartbeat is a dream: a private pass in which it reflects on the day,
consolidates its memory, follows up promises it dropped, and writes a short summary
([heartbeat spec](../../specs/heartbeat.md)). Daytime heartbeats run too, but they leave no
dream; they show as badged Heartbeat rows in the Activity log. Every member who can view the Agent can
see its dreams. They record what the Agent now remembers, not execution evidence, so they are
not admin-only.

A dream runs at most once a night, and only when the Agent took part in something since its last
dream: it posted, was mentioned or addressed, or filed a heartbeat report. Its Computer asks for
it once per local night, inside the 03:00–05:00 window. A busy Agent still dreams that night: the
dream waits for its current turn to finish, then runs. A dream still queued four hours after it was
requested is retired, not run.

## On the profile

The hub shows a **Dreams** section with the latest four nights and a **See all** button that
opens the Dreams drill-down, which lists every dream the Server keeps (the newest 60). The hub
shows no Dreams section until the Agent has dreamed, and nothing while the read is pending; there
are no skeletons.

Each row leads with the first line of the Agent's summary. A dream with no summary keeps the
file-level headline (`Updated memory · added a note`). Either way the row shows the night, the
files touched, and the line counts. A dream is a quiet row that does not open only when it changed
no files and also has no summary, no follow-ups, and no truncation; any one of those makes it
open.

Pressing a row opens the dream in the right-side sheet the Reminder and Trigger sheets use. The
sheet shows, in order:

1. **What I learned**: the whole summary, in the Agent's own words. Absent when the run wrote none.
2. **Follow-ups**: the reminders the run scheduled, each with who it is for, where it is anchored,
   and when it fires. Absent when the run scheduled none.
3. **Memory changes**: the section-level headline, derived in the App from the patch (the `##`
   sections of `MEMORY.md` the patch touched and how, such as `Rewrote Active Context · +1
   preference · added 2 notes`), then each file's diff through the App's one diff renderer. A
   binary or oversized file says why it shows no diff.

The Computer holds at most 8 MiB of memory text per snapshot; past that, files are compared by
digest only and show no diff. A memory of more than 2,000 files is not compared at all: the dream
is recorded as `truncated` and reads "Too many memory files to compare".

## In the Activity log

Dream and heartbeat runs are ordinary turn rows, with a soft badge after the title (**Dream** in
the dream violet, **Heartbeat** in the default tone) and one muted, single-line outcome line under
it.

- **Dreamed**: the nightly run's turn row, **Dreaming** while it runs. The outcome line is the first
  line of what the Agent learned, else `Tidied memory (+a −r)`, else `No memory changes`. Once it
  settles, the row carries a **See memory changes** action where a Chat turn shows its Chat button,
  and it opens the same sheet. The row still expands to the turn's trace.
- **Checked in**: a daytime heartbeat, **Checking in** while it runs. The outcome line is the
  report's first sentence plus `Posted in #shop` or `Read, not posted`, or `Nothing to report`
  (the title is muted too), or `Paused for a new message` when the Server stopped it for an
  addressed message. Repeated quiet heartbeats fold into one row on the profile and hover card.
- **Heartbeat report**: the main-session turn that handles a heartbeat's report. It carries the
  badge and reads like any other turn.
- A failed or interrupted run shows its usual failure text as the outcome line.

## On the agent hover card

- **Checking in** appears while a heartbeat runs.
- **Last night** shows the first line of the newest dream's summary, muted, when that dream
  finished within the last 36 hours. It shows nothing when there is no summary or the dream is
  older.

## Ownership

| Fact | Owner |
| --- | --- |
| Memory snapshot, diff, caps | Computer, `apps/computer/src/harness/dream-record.ts`, `dream-diff.ts` |
| Stored record and retention | Server, `agent_dreams`, `apps/server/src/server-agents/record-agent-dream.ts` |
| Summary and follow-ups | Server, `agent_dream_summaries` (`apps/server/src/heartbeat/dream-summary.ts`), follow-ups derived at read in `apps/server/src/heartbeat/dream-enrichment.ts` |
| Reads | `agent.dreams`, `agent.dream` ([Agents API](../api/agents.md)) |
| Headline, patch parsing | App, `apps/website/src/features/members/agent-profile/dream-model.ts` |
| Summary first line, follow-up times | App, `apps/website/src/features/members/agent-profile/dream-summary-model.ts` |
| Dream and heartbeat facts on a turn's trigger | Server, `apps/server/src/server-agents/agent-turn-trigger.ts` and `agent-turn-trigger-outcomes.ts` |
| Badges, outcome lines | App, `apps/website/src/features/members/agent-profile/agent-run-mark.ts` |
| Heartbeat and dream titles, folding | App, `apps/website/src/features/members/agent-profile/agent-turn-row-model.ts` |
| "Last night" hover line | App, `apps/website/src/features/members/agent-hover-activity-model.ts` |
| Freshness | A settled run invalidates the Agent's dream reads (`hooks/agents/agent-history-cache.ts`) |
