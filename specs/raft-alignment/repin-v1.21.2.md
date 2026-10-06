---
summary: What the Raft v1.21.2 re-pin changed in the Haus Agent prompt, event input, and Manual, and what it deliberately left out.
read_when:
  - re-pinning Haus to a newer Raft source commit
  - reviewing why a Raft v1.21 prompt clause is or is not in the Haus prompt
---

# Raft re-pin: v1.13.0 → v1.21.2

Pin moved from `05f7d8f` (`v1.13.0-source.1`, daemon 1.0.25) to `26f77ef` (`v1.21.2-source.1`,
daemon 1.0.43). The Raft reference render grew 26,764 → 28,599 characters. The Haus render
(budget fixture) grew **32,579 → 33,513** (+934), and the cap in `managed-instructions.test.ts`
moved with it. Field-level status lives in [prompt-divergences.md](prompt-divergences.md).

## Adopted

**Suspect the CLI first** (new paragraph after "Run any subcommand with `--help`", +631).
Haus old: nothing. Haus new: "**If something the Manual describes is missing on your CLI, suspect
the CLI first.** … the Manual is served by the Server and describes its current build, and a
Computer does not upgrade itself. Report that the machine needs upgrading. Do not read the absence
as an answer …". Raft-verbatim apart from "the Manual" for "this Manual" and "a Computer" for "a
daemon". Worthwhile because it is true in Haus: the Server serves `haus manual`, Computer updates
are operator-driven (ADR 0020), and an Agent that reads "unknown command" as "nothing there"
reports a false negative.

**Discovering people and channels** (+292 and +11). Haus old: "Call `haus server info` to see all
channels in this server, which ones you have joined, other agents, and humans." Haus new: "Call
`haus server info` for this server's summary: the channel, agent, and human counts, then the first
page of each list. `haus server info --channels` lists only channels, and every listing is paged:
when more rows remain, it prints a `Next:` command carrying the `--offset` for the next page. So
one page is one page; a claim about every channel needs the pages you actually read, not the first
window." The private-channels sentence now says `haus server info --channels`. Not fully verbatim:
Raft's default output is a summary only, while Haus's default prints counts plus the first page of
each list and pages with `Next:` rather than `Showing 1-50 of N`. The paged-claim sentence is the
point: the old Haus text promised "all channels" from one 50-row window.

**Body continuation prefix** (event input, no prompt text). Haus old: a newline in a sender handle,
description, or message body could start a column-0 line such as `[target=dm:@zach … type=human]
@zach: …`, forging a message header in the drain, thread-context quotes, and `haus message
read`/`check` output. Haus new: Raft's `indentAgentBodyContinuationLines` — every continuation line
takes `  │ `, over the same universal-newline separator set — in `inbox-format.ts`,
`thread-context-format.ts`, and `agent-cli/agent-format.ts`, plus a Cloud Agent attention's title
and summary. Server-composed fire and task-assignment bodies stay verbatim; the Server already
indents their untrusted parts. Covered by `inbox-header-forgery.test.ts`.

**`recipes/pattern/recurring-recovery`** (Manual). Raft added "Fire-request exhausted (silent,
`next` stuck in the past)". Adapted, not copied: Haus fires a Reminder in one Server transaction,
so it has no daemon retry budget or log line. Haus new: "Fire that never happened (silent, `next`
stuck in the past)": no `reminder log` row and a `[scheduled]` reminder with a past fire time. A
time that stays in the past means an archived or deleted anchor, or a fire that keeps failing.
The fix is to `snooze`/`update`, or to reschedule on a live message. Raft's proof sentence is
dropped because Haus has not observed this shape. The captured card was refreshed.

## Not adopted

Each has a register row.

- **Sub-agent delegation section** (conditional in Raft): pending operator decision.
- **Inbox entry as "Activity panel"**, the inbox notice's new `--unread` closing line, the unread
  digest's `inbox check` closing line, and the App inbox notice suffix: pending operator decision
  (Inbox).
- **Wake briefing panel, startup memory block, wake session recycling**: pending operator decision.
- **MEMORY.md 16 KB sentence**: renders only with Raft's startup memory block; pending with it.
  Haus's 16 KiB guidance already rides the memory-size notice.
- **`~agent` / `~human` DM suffix**: Haus handles share one namespace and DMs are human ↔ Agent,
  so the ambiguity cannot arise.
- **Integrations official-apps hint, `auth whoami` wording**: Haus has neither family.
- **Wiki entry removal**: nothing to do; Haus never carried it, and the register no longer lists
  it as a difference.

## Found along the way

- The register's cap history stopped at 32,496. The test was already at 32,579 from the
  done-by-default change. The history is now complete.
- The captured `technique--task-claim-lock.md` predates even the old pin (Raft's failed-claim
  "lock, not a ruling" text is missing), so the published Haus card is stale. It is listed under
  Open TODOs. `technique--login-with-raft.md` was also stale; it was re-captured, and it is not
  published in Haus.
- The Server's drain budget (`drain-selection.ts`, `thread-context.ts`) counts raw content
  length, so the continuation prefix adds 4 uncounted characters per body line. The budget is a
  soft bound and was left alone.
